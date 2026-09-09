# Security Policy

## Supported versions

SVGEngine is distributed as `@mosaicoo/svg-engine` on npm. While the project is
in the `0.x` series, security fixes are applied to the **latest published
version only**.

| Version      | Supported |
| ------------ | --------- |
| Latest `0.x` | ✅        |
| Older `0.x`  | ❌        |

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report vulnerabilities privately through GitHub:

1. Go to the [Security tab](https://github.com/mosaicoo/svg-engine/security) of
   this repository.
2. Choose **Report a vulnerability**.
3. Describe the problem, the affected version, and the steps to reproduce it.

This opens a private advisory visible only to you and the maintainers.

### What to include

- Affected version of `@mosaicoo/svg-engine` and the entry point involved.
- Angular version and browser/runtime.
- A minimal reproduction (an SVG document or a short code snippet).
- Impact: what an attacker can achieve.

## Response

- **Acknowledgement:** within 5 business days.
- **Assessment and severity:** within 10 business days.
- **Fix:** released as a new patch version, with a GitHub Security Advisory
  crediting the reporter unless anonymity is requested.

Please allow the maintainers a reasonable period to publish a fix before any
public disclosure.

## Scope

In scope — anything that lets untrusted input compromise a host application:

- Script execution or DOM injection through imported SVG content
  (`svg-engine/io` importer and the sanitizer it applies).
- Escaping of the sandboxing applied to untrusted documents.
- Prototype pollution or code injection through the plugin API.
- Vulnerabilities in the published package contents.

Out of scope:

- Vulnerabilities in Angular, the browser, or other peer dependencies — report
  those upstream.
- Issues that require a malicious host application: the library runs with the
  privileges of the page that embeds it and cannot defend against it.
- Denial of service caused by intentionally pathological documents (very large
  path data, deeply nested groups). These are handled as performance issues.

## Known advisories

Some advisories reported by `npm audit` have no upstream fix at the time of
writing. They are listed here so they are not mistaken for an oversight.

All of them come from a single chain: the **optional** peer dependency
`@huggingface/transformers`, which is required only by the
`@mosaicoo/svg-engine/ai/nlu-voice-wasm` entry point (local speech
recognition).

| Package                     | Severity | Reached through             |
| --------------------------- | -------- | --------------------------- |
| `@huggingface/transformers` | High     | Optional peer dependency    |
| `onnxruntime-node`          | High     | `@huggingface/transformers` |
| `sharp`                     | High     | `@huggingface/transformers` |
| `adm-zip`                   | High     | `onnxruntime-node`          |

What this means for you:

- **If you do not use `ai/nlu-voice-wasm`, you are not affected.**
  `@huggingface/transformers` is declared optional in
  `peerDependenciesMeta`, so npm does not install it — or anything below it —
  unless you ask for it.
- **None of these ship inside the package.** The only runtime dependencies of
  `@mosaicoo/svg-engine` are `polygon-clipping` and `tslib`.
- `onnxruntime-node`, `sharp` and `adm-zip` are the **Node-side** half of
  `@huggingface/transformers`. The browser speech path runs on WebAssembly and
  does not load them, so for a browser application the exposure is limited to
  the build environment.

These advisories are re-evaluated before every release. If you need the voice
entry point in a security-sensitive environment, pin and audit the
`@huggingface/transformers` chain yourself, or use the text-only
`ai/nlu` entry point, which has no such dependencies.

## Handling untrusted SVG

The importer sanitizes incoming documents — it strips `<script>` elements,
`on*` event-handler attributes, and `javascript:` URLs. Even so, if your
application imports SVG from untrusted sources, serve and render it under a
Content Security Policy appropriate to your threat model.
