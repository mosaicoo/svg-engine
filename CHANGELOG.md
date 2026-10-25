# Changelog

All notable changes to **svg-engine** (Angular SVG editor library) are documented here.

This file is **auto-generated** from [Conventional Commits](https://www.conventionalcommits.org) by [standard-version](https://github.com/conventional-changelog/standard-version). Manual edits will be overwritten on next release.

The versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0](https://github.com/mosaicoo/svg-engine/compare/v0.2.0...v0.3.0) (2026-10-25)

### ⚠ BREAKING CHANGES

- **angular:** peerDependencies de @angular/{core,common,material,cdk}
  agora exigem ^22.0.0 e o Node mínimo é 22.22.3 ou 24.15.0. Aplicações em
  Angular 21 devem instalar `@mosaicoo/svg-engine@angular-21` (0.2.x).

Co-Authored-By: Marcelo Cavalcanti <marcelo.cavalcanti@mosaicoo.tech>

### Features

- **angular:** suporte a Angular 22 e Angular Material 22 ([c53b15b](https://github.com/mosaicoo/svg-engine/commit/c53b15b9ebe40da252448c9ec96601a45484e9a6))

### Refactor

- **plugins:** remove internal markers from user-facing plugin names ([0289825](https://github.com/mosaicoo/svg-engine/commit/0289825c664197869291494dc83c9202fdb0237f))

### Documentation

- **01:** rewrite the overview to describe the library, not its making ([5b7f134](https://github.com/mosaicoo/svg-engine/commit/5b7f1343972db356d9820059e659325b3c691a6e))
- **09:** rewrite the public API document as a guide, not an inventory ([0903b69](https://github.com/mosaicoo/svg-engine/commit/0903b69290c25d8043fcf80a5c026b38ffbc54a9))
- add a versioning policy and self-host the package banner ([29bbe26](https://github.com/mosaicoo/svg-engine/commit/29bbe2641bf6da28594289842683722fe2f50092))
- **D-150:** registra o upgrade para Angular 22 e as duas linhas de suporte ([d286bd4](https://github.com/mosaicoo/svg-engine/commit/d286bd49b767728bac4700b23d6aa3ddc5763e66))
- drop the plugin-platform and roadmap documents ([8f6745f](https://github.com/mosaicoo/svg-engine/commit/8f6745fe5548910562af91fcbcb6066a6e11641c))
- **readme:** describe the docs split accurately ([25cd120](https://github.com/mosaicoo/svg-engine/commit/25cd120863b7462cf421e5a75e15dfb04ab2ab0b))
- remove maintainer working material from the repository ([226183e](https://github.com/mosaicoo/svg-engine/commit/226183e9f3db5f05265c4a984a89394cef175e2d))
- **security:** documenta as advisories conhecidas sem correção upstream ([608f2c6](https://github.com/mosaicoo/svg-engine/commit/608f2c61dfe02d288a0fd122cd338e1593aa74bc))
- separate maintainer working material into docs/internal ([a5d922c](https://github.com/mosaicoo/svg-engine/commit/a5d922c54ddde0faea47cdc12750ccfe83cec597))

## [0.2.0](https://github.com/mosaicoo/svg-engine/compare/v0.1.2...v0.2.0) (2026-07-08)

### Features

- **effects:** D-118 Fase A — modelo paramétrico + 19 builtins paramétricos ([27bcda3](https://github.com/mosaicoo/svg-engine/commit/27bcda3d84efaf64f66237bd4d7735874306818b))
- **effects:** D-118 Fase B — encoding stateless de instância + registry + defs ([4560bb3](https://github.com/mosaicoo/svg-engine/commit/4560bb35e78eb8338c2be5ef27147b1f7d0c8cfd))
- **effects:** D-144 Fase C — painel com parâmetros editáveis + presets ([e2189fd](https://github.com/mosaicoo/svg-engine/commit/e2189fd21abde730ab125948d84069ed4d800d77))
- **effects:** D-146 — UX acordeão + mute por efeito no painel ([d425e4a](https://github.com/mosaicoo/svg-engine/commit/d425e4a70166565186b944be080b7f97d98c40aa))
- **shell-pro:** D-148 — right rail redimensionável + ids de efeito mais curtos ([ba70575](https://github.com/mosaicoo/svg-engine/commit/ba705758ae15c0d1975f80c0426ff0798eb8212a))

### Bug Fixes

- **effects:** D-145 — filtro composto/paramétrico não renderiza mais a forma preta ([13eaea7](https://github.com/mosaicoo/svg-engine/commit/13eaea7973bd6d12b95f2afef3cedc8f6a6290f5))
- preserva id autoral no round-trip import->export + campo Element ID (D-149) ([07ecd79](https://github.com/mosaicoo/svg-engine/commit/07ecd79cca95000b1515c3c688ea3083d9f892cb))
- **shell-pro:** D-147 — alarga o right rail 280 → 360px (painéis menos apertados) ([54e8e0e](https://github.com/mosaicoo/svg-engine/commit/54e8e0e9d7e6cc4fda4d361b1e43f56e9a84a85a))

### Documentation

- **04:** D-147 — registra a decisão da largura do right rail (cross-ref do 08) ([e14fb75](https://github.com/mosaicoo/svg-engine/commit/e14fb75ab4f13372c823b9eed6cf743f6bb26913))
