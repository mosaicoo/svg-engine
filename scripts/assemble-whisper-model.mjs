/* eslint-disable */
/**
 * Remonta o decoder do Whisper a partir das partes versionadas no submódulo
 * `assets/ml/whisper` (D-046 voz local).
 *
 * O `decoder_model_merged_quantized.onnx` (~149 MB) ultrapassa o limite de
 * 100 MB por arquivo do GitHub, então é commitado em partes `.part00`/`.part01`
 * (< 100 MB) — SEM Git LFS. Este script concatena as partes de volta no
 * arquivo `.onnx` (gitignorado no submódulo) que o `angular.json` serve.
 *
 * Idempotente: pula se o arquivo montado já existir com o tamanho correto.
 * Tolerante: se o submódulo/partes não estiverem presentes (ex.: clone sem
 * `--recurse-submodules`, ou quem não usa voz), apenas avisa e sai com 0.
 *
 * Roda automaticamente via `prestart`/`postinstall` (ver package.json) e
 * pode ser chamado manualmente: `npm run assemble:ml`.
 */
import { existsSync, readdirSync, statSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const onnxDir = join(root, 'assets', 'ml', 'whisper', 'whisper-small', 'onnx');
const targetName = 'decoder_model_merged_quantized.onnx';
const target = join(onnxDir, targetName);

function main() {
  if (!existsSync(onnxDir)) {
    console.warn(
      `[assemble-ml] ${onnxDir} ausente — submódulo do modelo não inicializado. ` +
        `Pulando. Rode: git submodule update --init --recursive`,
    );
    return;
  }

  const parts = readdirSync(onnxDir)
    .filter((f) => f.startsWith(`${targetName}.part`))
    .sort();

  if (parts.length === 0) {
    console.warn(`[assemble-ml] sem partes "${targetName}.part*" em ${onnxDir}. Pulando.`);
    return;
  }

  const expectedSize = parts.reduce((sum, p) => sum + statSync(join(onnxDir, p)).size, 0);

  if (existsSync(target) && statSync(target).size === expectedSize) {
    console.log(`[assemble-ml] ${targetName} já montado (${expectedSize} bytes). OK.`);
    return;
  }

  writeFileSync(target, Buffer.alloc(0));
  for (const p of parts) {
    appendFileSync(target, readFileSync(join(onnxDir, p)));
  }
  console.log(
    `[assemble-ml] montado ${targetName} a partir de ${parts.length} parte(s) — ${expectedSize} bytes.`,
  );
}

main();
