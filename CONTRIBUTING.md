# Contributing to SVGEngine

Thanks for taking the time to contribute. This guide covers how to set the
project up, the checks your change must pass, and how pull requests are
reviewed.

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE), the same license that covers this project.

## Code of conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting problems

- **Bugs and feature requests:** open an [issue](https://github.com/mosaicoo/svg-engine/issues/new/choose).
- **Security vulnerabilities:** do **not** open an issue — follow
  [SECURITY.md](SECURITY.md).

A good bug report includes the version of `@mosaicoo/svg-engine`, your Angular
version, and a minimal reproduction (an SVG document or a short snippet).

## Requirements

- **Node.js 22** (the version the CI runs).
- **npm** (the repository ships a `package-lock.json`; use `npm ci`).

## Getting started

```bash
git clone https://github.com/mosaicoo/svg-engine.git
cd svg-engine
npm ci
```

Run the playground application:

```bash
npm start
```

The `start` and `build` scripts are preceded by `assemble:ml`, which assembles
the local speech-recognition model used by the optional
`svg-engine/ai/nlu-voice-wasm` entry point. It runs automatically.

### The speech-model submodule

The repository declares a git submodule at `assets/ml/whisper` that holds the
speech-recognition model weights. **That submodule is private, and you do not
need it.**

Clone normally — without `--recurse-submodules`, which is the default:

```bash
git clone https://github.com/mosaicoo/svg-engine.git
```

Everything builds, every test passes, and the whole editor works. The only
consequence is that `assemble:ml` prints a notice and skips: the local speech
model is not assembled, so voice input is unavailable in your development
build. The continuous integration pipeline runs the same way, without the
submodule.

Using `--recurse-submodules` will fail with an authentication error. That is
expected.

## Repository layout

The workspace holds three Angular projects:

| Project      | Purpose                                       |
| ------------ | --------------------------------------------- |
| `svg-engine` | The published library (`projects/svg-engine`) |
| `playground` | Demo and manual-testing application           |
| `svg-studio` | Full editor application                       |

The library is a single npm package exposing nine entry points
(`core`, `render`, `io`, `optimize`, `edit`, `ui`, `ai/nlu`, `ai/nlu-ui`,
`ai/nlu-voice-wasm`).

## Building and testing

> **Build the library before running the tests.** The specs import the package
> through its public entry points (`@mosaicoo/svg-engine/core`, …), and those
> paths resolve to `dist/svg-engine/`. Without a build, the test run fails with
> `TS2307: Cannot find module`.

```bash
npm run build:lib   # required before test:lib
npm run test:lib    # unit tests (Vitest)
npm run lint        # ESLint across all three projects
npm run e2e         # end-to-end tests (Playwright)
```

All of these must pass before a pull request can be merged.

### Changing the public API

The public surface of every entry point is guarded by a snapshot. If your change
intentionally adds, removes, or renames an export, regenerate it and review the
diff:

```bash
UPDATE_API_SNAPSHOT=1 npm run test:lib
```

Commit the updated snapshot together with your change and explain the API change
in the pull request. Additions are fine in a `0.x` release; removals and renames
are breaking and need to be called out.

## Commit messages

The project follows [Conventional Commits](https://www.conventionalcommits.org).
The changelog and the version bump are generated from the commit history, so the
format matters:

```
<type>(<optional scope>): <short description>
```

Types in use: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`,
`chore`, `style`, `revert`. Only `feat`, `fix`, `perf`, `refactor`, `docs` and
`revert` appear in the changelog.

- `feat:` triggers a minor bump, `fix:` a patch bump.
- Breaking changes: add `!` after the type and a `BREAKING CHANGE:` footer.
- Write the description in English so the generated changelog is readable by
  everyone.

Examples:

```
feat(io): preserve authored element ids through an import/export round-trip
fix(render): stop composed filters from painting the shape black
```

A pre-commit hook runs ESLint and Prettier on staged files.

## Pull requests

1. Create a branch from `main`.
2. Make your change, including tests for new behaviour and fixes.
3. Run lint, build and the test suites locally.
4. Open the pull request and fill in the template.
5. Keep the pull request focused — one logical change per PR reviews faster.

Pull requests are squash-merged; the pull-request title becomes the commit
message, so it should follow the Conventional Commits format above.

Maintainers may ask for changes. Once the checks pass and the review is
approved, a maintainer merges the pull request.

## Versioning

The package follows [Semantic Versioning](https://semver.org).

### What the version number covers

The public API is what each entry point exports. Every one of those exports is
recorded in a snapshot test, so a change to that surface is always visible in
review and never accidental.

Anything not exported from an entry point is internal. It may change in any
release, even when a type makes it reachable.

### While the version is `0.x`

Breaking changes ship as a minor bump (`0.2.0` to `0.3.0`) and are called out
in the changelog. Patch releases never change the public API. The full
major/minor/patch guarantees begin at `1.0.0`.

### Deprecation

An export scheduled for removal is marked `@deprecated` in the same release
that introduces its replacement, and the message names that replacement. It is
removed no earlier than the following minor release.

## Releases

Releases are cut by maintainers only:

1. `npm run release` (or `release:patch` / `release:minor`) — standard-version
   derives the version from the commit history, updates `CHANGELOG.md` and the
   `SVG_ENGINE_VERSION` constant, then commits and tags.
2. `git push --follow-tags`.
3. The tag triggers the release workflow, which checks the version lockstep,
   lints, builds, tests and packs before publishing to npm through Trusted
   Publishing (OIDC), and then opens the GitHub Release from the changelog.

Publication waits for a maintainer's approval, and no long-lived npm token
exists. Contributors never need credentials.
