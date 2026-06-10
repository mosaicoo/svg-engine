/**
 * **Guard-rail da superfície pública (publish-prep).**
 *
 * Trava o conjunto de **nomes exportados** por cada entry point de
 * `svg-engine/*` contra um _golden file_ versionado
 * (`public-api.snapshot.json`). Qualquer adição/remoção na superfície
 * pública (incl. re-exposição acidental de plumbing interno ou remoção
 * de um símbolo anunciado) quebra este teste — forçando a mudança a ser
 * **deliberada e revisada**.
 *
 * Motivação concreta: durante a Categoria A do publish-prep, 6 helpers
 * **documentados** em `docs/09-api-publica.md` foram un-exportados por
 * engano e só pegos por revisão manual. Este teste teria pego sozinho.
 *
 * **Como atualizar (mudança intencional)**:
 * ```
 * UPDATE_API_SNAPSHOT=1 npm run test:lib
 * ```
 * Isso regenera o snapshot; revise o diff, atualize `docs/09-api-publica.md`
 * se a mudança altera o contrato, e faça commit do `.json` junto.
 *
 * **O que captura**: nomes (valores + tipos/interfaces) exportados pelo
 * barrel `public-api.ts`, resolvendo `export *`/`export {…} from`
 * recursivamente. Não compara assinaturas de tipo — só o conjunto de
 * nomes (que é o que blinda contra add/remove acidental).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const ROOT = path.resolve(process.cwd(), 'projects/svg-engine');
const SNAPSHOT = path.join(ROOT, 'api-surface', 'public-api.snapshot.json');

/** entry point público → caminho do barrel relativo a `projects/svg-engine`. */
const ENTRY_POINTS: Record<string, string> = {
  'svg-engine/core': 'core/src/public-api.ts',
  'svg-engine/render': 'render/src/public-api.ts',
  'svg-engine/io': 'io/src/public-api.ts',
  'svg-engine/optimize': 'optimize/src/public-api.ts',
  'svg-engine/edit': 'edit/src/public-api.ts',
  'svg-engine/ui': 'ui/src/public-api.ts',
  'svg-engine/ai/nlu': 'ai/nlu/src/public-api.ts',
  'svg-engine/ai/nlu-ui': 'ai/nlu-ui/src/public-api.ts',
  'svg-engine/ai/nlu-voice-wasm': 'ai/nlu-voice-wasm/src/public-api.ts',
};

/** Resolve `export * from './x'` para um arquivo .ts real no disco. */
function resolveModule(fromFile: string, spec: string): string | null {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    `${base}.d.ts`,
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/**
 * Coleta recursivamente o conjunto de nomes exportados por `filePath`,
 * seguindo `export *` para os arquivos de origem. `export {A, B}` (com ou
 * sem `from`) já traz os nomes explicitamente — não precisa recursão.
 */
function collectExports(filePath: string, visited: Set<string>): Set<string> {
  const names = new Set<string>();
  if (visited.has(filePath)) return names;
  visited.add(filePath);

  const src = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
  );

  src.forEachChild((node) => {
    // export ... from / export { ... } / export * [as ns]
    if (ts.isExportDeclaration(node)) {
      const clause = node.exportClause;
      if (!clause) {
        // `export * from './x'` — sem cláusula → recursão
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const target = resolveModule(filePath, node.moduleSpecifier.text);
          if (!target) {
            throw new Error(
              `Guard-rail: não resolveu \`export *\` de "${node.moduleSpecifier.text}" em ${filePath}`,
            );
          }
          for (const n of collectExports(target, visited)) names.add(n);
        }
        return;
      }
      if (ts.isNamespaceExport(clause)) {
        // `export * as ns from './x'`
        names.add(clause.name.text);
        return;
      }
      // `export { A, B as C, type D } [from './x']`
      for (const el of clause.elements) names.add(el.name.text);
      return;
    }

    if (!hasExportModifier(node)) return;

    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.add(decl.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isEnumDeclaration(node) ||
        ts.isModuleDeclaration(node)) &&
      node.name &&
      ts.isIdentifier(node.name)
    ) {
      names.add(node.name.text);
    }
  });

  return names;
}

function surfaceOf(entryRelPath: string): string[] {
  const abs = path.join(ROOT, entryRelPath);
  if (!fs.existsSync(abs)) {
    throw new Error(
      `Guard-rail: public-api.ts não encontrado em ${abs}. ` +
        `Rode os testes a partir da raiz do repositório.`,
    );
  }
  return [...collectExports(abs, new Set())].sort((a, b) => a.localeCompare(b));
}

// Superfície atual, computada uma vez.
const current: Record<string, string[]> = {};
for (const [name, rel] of Object.entries(ENTRY_POINTS)) current[name] = surfaceOf(rel);

// Modo update: reescreve o golden ANTES do describe lê-lo.
if (process.env['UPDATE_API_SNAPSHOT']) {
  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  fs.writeFileSync(SNAPSHOT, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}

function readGolden(): Record<string, string[]> {
  if (!fs.existsSync(SNAPSHOT)) return {};
  return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as Record<string, string[]>;
}

describe('API surface guard-rail (publish-prep)', () => {
  const golden = readGolden();

  it('cobre todos os 9 entry points', () => {
    expect(Object.keys(ENTRY_POINTS).sort()).toEqual(Object.keys(current).sort());
  });

  for (const name of Object.keys(ENTRY_POINTS)) {
    it(`${name} casa com a superfície pública versionada`, () => {
      const cur = current[name];
      const exp = golden[name] ?? [];
      const added = cur.filter((n) => !exp.includes(n));
      const removed = exp.filter((n) => !cur.includes(n));
      if (added.length || removed.length) {
        throw new Error(
          `Superfície pública de ${name} mudou:\n` +
            (added.length ? `  + adicionados: ${added.join(', ')}\n` : '') +
            (removed.length ? `  - removidos:   ${removed.join(', ')}\n` : '') +
            `\nSe for intencional, regenere o snapshot:\n` +
            `  UPDATE_API_SNAPSHOT=1 npm run test:lib\n` +
            `e revise/commite api-surface/public-api.snapshot.json ` +
            `(+ docs/09-api-publica.md se o contrato mudou).`,
        );
      }
      expect(cur).toEqual(exp);
    });
  }
});
