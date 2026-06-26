// Minifica os bundles FESM da lib (dist/svg-engine/fesm2022/*.mjs) para a
// DISTRIBUIÇÃO: remove comentários/whitespace/dead-code local e encurta nomes
// LOCAIS. Mantém o formato ESM e os nomes EXPORTADOS intactos — então o
// tree-shaking + a minificação final do app consumidor continuam funcionando
// (a lib declara `sideEffects: false`).
//
// Por que aqui e não no ng-packagr: o Angular Package Format publica FESM
// NÃO-minificado de propósito (o consumidor minifica). Como queremos um
// artefato enxuto também ao consumir direto do dist / npm, minificamos no
// fluxo de pack/publish (depois do strip de sourcemaps). O `build:lib` comum
// permanece legível para debug local.
//
// Não fazemos OFUSCAÇÃO: a lib é Apache-2.0 (fonte público), e ofuscar quebra
// tree-shaking/debug e tende a INCHAR o bundle (control-flow flattening). A
// minificação já remove comentários e nomes locais — o que importa aqui.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let esbuild;
try {
  esbuild = await import('esbuild');
} catch {
  console.error('minify-fesm: esbuild não encontrado (vem com @angular/build). Rode "npm ci".');
  process.exit(1);
}

const fesmDir = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '..',
  'dist',
  'svg-engine',
  'fesm2022',
);

try {
  statSync(fesmDir);
} catch {
  console.error(`minify-fesm: "${fesmDir}" não existe. Rode "npm run build:lib" antes.`);
  process.exit(1);
}

let before = 0;
let after = 0;
for (const file of readdirSync(fesmDir).filter((f) => f.endsWith('.mjs'))) {
  const full = join(fesmDir, file);
  const src = readFileSync(full, 'utf8');
  const out = await esbuild.transform(src, {
    minify: true,
    format: 'esm',
    legalComments: 'none',
    target: 'es2022',
  });
  before += Buffer.byteLength(src);
  writeFileSync(full, out.code);
  after += Buffer.byteLength(out.code);
}

const kb = (n) => (n / 1024).toFixed(0);
console.log(
  `minify-fesm: FESM ${kb(before)} KB → ${kb(after)} KB (-${(100 - (after / before) * 100).toFixed(0)}%)`,
);
