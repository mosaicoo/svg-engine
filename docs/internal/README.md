# Internal documentation

This directory holds maintainer working material. It is written in Portuguese,
it documents how the project has been built rather than how the library is
used, and it is kept under version control because the decision log and the
change history are worth preserving — not because it is meant to be read by
people integrating SVGEngine.

| File                            | What it is                                                |
| ------------------------------- | --------------------------------------------------------- |
| `03-restricoes.md`              | Operational constraints for automated contributors        |
| `04-decisoes-tecnicas.md`       | The decision log — see below                              |
| `05-roadmap.md`                 | Planned work, describing things that do not exist yet     |
| `07-backend-dotnet.md`          | Notes on an optional backend, outside the library's scope |
| `08-historico-de-alteracoes.md` | Detailed change history                                   |
| `11-auditoria-pendencias.md`    | Internal audit and open items                             |

## About the `D-nnn` references in the source

Comments throughout the source refer to decisions as `D-042`, `D-149` and so
on. Those identifiers index `04-decisoes-tecnicas.md`, where each one records
why a given approach was chosen and what was rejected.

You do not need them to read the code: every such comment states its point in
full, and the identifier is only a pointer to the longer rationale.

## Looking for actual documentation?

- **Using the library:** https://mosaicoo.github.io/svgengine-site — English,
  Portuguese and Spanish.
- **Contributing:** [`CONTRIBUTING.md`](../../CONTRIBUTING.md).
- **The public API:** [`../09-api-publica.md`](../09-api-publica.md).
