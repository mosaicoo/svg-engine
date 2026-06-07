# Third-Party Notices

SVGEngine redistribui ou depende dos artefatos de terceiros abaixo. Todos têm
licenças **permissivas** (sem copyleft) — apenas atribuição é exigida. Nenhum
deles obriga a abertura do código do SVGEngine.

Este arquivo cobre as dependências **não óbvias** (machine-learning / voz local).
As dependências de runtime Angular/Material seguem suas próprias licenças
(declaradas em `package.json`).

---

## Reconhecimento de voz local (D-046 voz híbrida)

O entry point opt-in `svg-engine/ai/nlu-voice-wasm` roda o Whisper 100% no
navegador (sem rede externa em runtime). Ele depende das bibliotecas e do modelo
abaixo.

### transformers.js — `@huggingface/transformers`

- Licença: **Apache License 2.0**
- Copyright: Hugging Face
- https://github.com/huggingface/transformers.js
- Uso: pipeline de `automatic-speech-recognition` (carregado via `import()` lazy).

### onnxruntime-web

- Licença: **MIT License**
- Copyright (c) Microsoft Corporation
- https://github.com/microsoft/onnxruntime
- Uso: runtime WASM do ONNX. **Não** é dependência direta do SVGEngine — vem
  embutido no `@huggingface/transformers`; os binários `.wasm` são copiados para
  os assets do app (ver `angular.json` → `/assets/ml/ort/`).

### Modelo Whisper base (vendorado via submódulo)

Os pesos do modelo são vendorados no repositório separado
**`mosaicoo/svgengine-ml-assets`**, consumido como git **submodule** em
`assets/ml/whisper`. Atribuição completa + `CHECKSUMS.txt` (SHA-256) lá.

- **Modelo original**: OpenAI Whisper — **MIT License** — Copyright (c) 2022 OpenAI
  - https://github.com/openai/whisper
- **Conversão ONNX redistribuída**: `Xenova/whisper-base` — **Apache License 2.0**
  - https://huggingface.co/Xenova/whisper-base
  - Os arquivos sob `whisper-base/` são os pesos ONNX int8-quantizados
    (encoder/decoder) + tokenizer/config, vendorados verbatim.

> Uso **local não requer API key**. Nenhuma requisição sai para `huggingface.co`
> ou qualquer serviço de terceiros em runtime (config `allowRemoteModels=false`
>
> - `localModelPath`/`wasmPaths` apontando para a própria origem).

---

## Reconhecimento de voz nativo (Web Speech API)

A engine de voz padrão (`svg-engine/ai/nlu-ui` → `VoiceRecognitionService`) usa a
**Web Speech API** nativa do navegador. Não há redistribuição de software de
terceiros — o reconhecimento é provido pelo próprio browser (e pode delegar a
serviços em nuvem do vendor, fora do controle do SVGEngine). É justamente essa
dependência de nuvem que motivou a adição da engine Whisper local acima.
