// ─────────────────────────────────────────────────────────────────────
// strip-sourcemaps — sanitiza o build da lib antes de empacotar/publicar.
//
// Faz duas coisas:
//   1) Remove os sourcemaps (*.map) recursivamente. O Angular Package
//      Format (ng-packagr) emite `fesm2022/*.mjs.map` (e `*.d.ts.map`)
//      cujo `sourcesContent` EMBUTE o código-fonte `.ts` original. Como o
//      pacote publicado deve conter apenas o COMPILADO (`.mjs`) + os tipos
//      (`.d.ts`), apagamos os `.map` aqui (ng-packagr não tem flag oficial
//      para suprimi-los).
//   2) Remove dos `.js/.mjs` a linha-comentário `//# sourceMappingURL=…`
//      que ficaria pendurada apontando para um `.map` que acabou de ser
//      apagado, e FALHA (exit 1) se sobrar qualquer `sourceMappingURL=`.
//
// IMPORTANTE (lição NPM-FIX / D-117): o FESM é publicado em *partial
// compilation* (`ɵɵngDeclare…`) e o Angular Linker do consumidor detecta o
// que processar pelo `ɵ` (U+0275) LITERAL. Por isso aqui NÃO minificamos
// nem ofuscamos — só removemos linhas de comentário; o resto do arquivo
// fica byte-idêntico (round-trip UTF-8 preserva o `ɵ`, sem escapar para
// `ɵ`). Minificar quebraria o Linker → runtime cai em JIT e falha.
//
// Os `.map` continuam existindo nos builds locais comuns (`npm run
// build:lib`); este script só roda no fluxo de pack/publish (`pack:lib` /
// `publish:lib` / `dist:prepare` / workflow Release). Cross-platform (Node
// puro). Apenas a LIB é empacotada — os apps (playground, svg-studio)
// nunca são publicados.
// ─────────────────────────────────────────────────────────────────────
import { readdirSync, statSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist', 'svg-engine');

let removedMaps = 0;
let cleanedFiles = 0;
const violations = [];

/** Apaga `*.map` e remove refs `sourceMappingURL` pendentes, recursivamente. */
function sanitizeDist(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      sanitizeDist(full);
      continue;
    }

    if (entry.endsWith('.map')) {
      unlinkSync(full);
      removedMaps++;
      continue;
    }

    if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      const original = readFileSync(full, 'utf8');

      const cleaned = original
        // `//# sourceMappingURL=…` — remove a linha inteira (inclui a quebra)
        .replace(/^[^\S\n]*\/\/# sourceMappingURL=.*\r?\n?/gm, '')
        // `/*# sourceMappingURL=… */` — defensivo (estilo CSS)
        .replace(/^\s*\/\*# sourceMappingURL=.*?\*\/\s*$/gm, '');

      if (cleaned !== original) {
        writeFileSync(full, cleaned, 'utf8');
        cleanedFiles++;
      }

      if (cleaned.includes('sourceMappingURL=')) {
        violations.push(full);
      }
    }
  }
}

try {
  statSync(distDir);
} catch {
  console.error(
    `strip-sourcemaps: "${distDir}" não existe. Rode "npm run build:lib" antes.`,
  );
  process.exit(1);
}

sanitizeDist(distDir);

if (violations.length > 0) {
  console.error('strip-sourcemaps: ainda existem referências sourceMappingURL:');
  for (const file of violations) {
    console.error(`- ${file}`);
  }
  process.exit(1);
}

console.log(
  `strip-sourcemaps: removidos ${removedMaps} arquivo(s) .map e limpos ${cleanedFiles} arquivo(s) .js/.mjs`,
);
