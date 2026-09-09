## Summary

<!-- What does this pull request change, and why? One or two paragraphs. -->

## Type of change

<!-- Mark all that apply with an "x". -->

- [ ] Bug fix (a non-breaking change that fixes an issue)
- [ ] Feature (a non-breaking change that adds functionality)
- [ ] Breaking change (a fix or feature that changes existing behaviour or API)
- [ ] Performance
- [ ] Refactor (no behaviour change)
- [ ] Documentation
- [ ] Build, CI or tooling

## Motivation

<!-- What problem does this solve? Link the issue if there is one. -->

Closes #

## Impact

<!--
Which entry points does this touch (core / render / io / optimize / edit / ui /
ai)? Does it change rendered output, the exported SVG, or the public API?
-->

## Breaking changes

<!--
Describe any change to a public export, a method signature or existing
behaviour, and how consumers should migrate. Write "None" if there are none.
-->

None

## Tests

<!-- Which tests did you add or update, and what did you run locally? -->

- [ ] `npm run build:lib` (required before running the tests)
- [ ] `npm run test:lib`
- [ ] `npm run lint`
- [ ] `npm run e2e` (when the change affects the editor UI)

## Documentation

<!-- Which documentation did you update? Write "Not applicable" if none. -->

## Checklist

- [ ] The pull-request title follows [Conventional Commits](https://www.conventionalcommits.org)
- [ ] New behaviour and bug fixes are covered by tests
- [ ] The public API snapshot was regenerated if exports changed
      (`UPDATE_API_SNAPSHOT=1 npm run test:lib`) and the diff is intentional
- [ ] No credentials, tokens or personal data are included
- [ ] I agree to license my contribution under the Apache License 2.0
