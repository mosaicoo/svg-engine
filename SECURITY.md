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

## Handling untrusted SVG

The importer sanitizes incoming documents — it strips `<script>` elements,
`on*` event-handler attributes, and `javascript:` URLs. Even so, if your
application imports SVG from untrusted sources, serve and render it under a
Content Security Policy appropriate to your threat model.
