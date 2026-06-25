// ─────────────────────────────────────────────────────────────────────
// strip-sourcemaps — remove os sourcemaps (*.map) do build da lib antes
// de empacotar/publicar.
//
// Por quê: o Angular Package Format (ng-packagr) emite `fesm2022/*.mjs.map`
// cujo `sourcesContent` EMBUTE o código-fonte `.ts` original (com
// comentários). Como o pacote publicado deve conter apenas o código
// COMPILADO (`.mjs`) + os tipos (`.d.ts`), removemos os `.map` aqui. O
// ng-packagr não tem flag oficial para suprimi-los, então fazemos o strip
// pós-build. Os `.map` continuam existindo nos builds locais comuns
// (`npm run build:lib`); este script só roda no fluxo de pack/publish
// (`pack:lib` / `publish:lib` / workflow Release).
//
// Cross-platform (Node puro). Apenas a LIB é empacotada — os apps
// (playground, svg-studio) nunca são publicados.
// ─────────────────────────────────────────────────────────────────────
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist', 'svg-engine');

let removed = 0;

/** Apaga recursivamente todos os arquivos `*.map` sob `dir`. */
function stripMaps(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      stripMaps(full);
    } else if (entry.endsWith('.map')) {
      unlinkSync(full);
      removed++;
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

stripMaps(distDir);
console.log(`strip-sourcemaps: removidos ${removed} arquivo(s) .map de dist/svg-engine`);
