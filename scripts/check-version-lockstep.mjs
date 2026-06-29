// ─────────────────────────────────────────────────────────────────────
// check-version-lockstep — guard de pré-publish.
//
// Garante que a versão publicada e a constante exportada nunca divirjam:
//   projects/svg-engine/package.json  .version
//   projects/svg-engine/src/public-api.ts  SVG_ENGINE_VERSION
//
// Por quê: a JSDoc da constante exige lockstep com o package.json, mas o
// `standard-version` (`.versionrc.json` → bumpFiles) só bumpa o
// package.json — a constante é editada à mão e já ficou defasada 2×. Este
// guard FALHA (exit 1) o empacotamento/publicação quando há divergência,
// transformando um drift silencioso em erro barulhento.
//
// Roda em ambos os caminhos de release:
//   - manual: primeiro passo de `dist:prepare` (antes do build → fail-fast)
//   - CI: step "Check version lockstep" no `.github/workflows/release.yml`
//
// Cross-platform (Node puro), sem dependências.
// ─────────────────────────────────────────────────────────────────────
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkgPath = join(root, 'projects', 'svg-engine', 'package.json');
const apiPath = join(root, 'projects', 'svg-engine', 'src', 'public-api.ts');

let pkgVersion;
try {
  pkgVersion = JSON.parse(readFileSync(pkgPath, 'utf8')).version;
} catch (err) {
  console.error(`check-version-lockstep: não consegui ler ${pkgPath}: ${err.message}`);
  process.exit(1);
}

const apiSrc = readFileSync(apiPath, 'utf8');
const match = apiSrc.match(/SVG_ENGINE_VERSION\s*=\s*['"]([^'"]+)['"]/);

if (!match) {
  console.error(
    `check-version-lockstep: não encontrei "export const SVG_ENGINE_VERSION = '…'" em ${apiPath}`,
  );
  process.exit(1);
}

const constVersion = match[1];

if (pkgVersion !== constVersion) {
  console.error(
    'check-version-lockstep: VERSÃO FORA DE LOCKSTEP ❌\n' +
      `  package.json .version       = ${pkgVersion}\n` +
      `  SVG_ENGINE_VERSION (código)  = ${constVersion}\n` +
      `Sincronize os dois antes de empacotar/publicar:\n` +
      `  edite projects/svg-engine/src/public-api.ts para '${pkgVersion}'.`,
  );
  process.exit(1);
}

console.log(
  `check-version-lockstep: OK — package.json e SVG_ENGINE_VERSION em ${pkgVersion}`,
);
