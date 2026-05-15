# 03 — Restrições do Projeto

> Documento canônico das restrições operacionais e de leitura aplicadas ao
> projeto **SVGEngine**. Toda nova restrição deve ser adicionada aqui e
> refletida em `.claude/settings.local.json` quando se aplicar ao agente.

---

## 1. Escopo físico

- O projeto vive **exclusivamente** em `C:\Projetos\ClaudeCode\SVGEngine`.
- O agente de IA não deve ler, indexar ou modificar nada fora desse diretório.

## 2. Diretórios e arquivos bloqueados para leitura automática

Configurados em `.claude/settings.json` via `permissions.deny` (compartilhado/commitado;
overrides pessoais ficam em `.claude/settings.local.json`, gitignored):

| Categoria               | Padrões                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------- |
| Dependências            | `node_modules/**`                                                                     |
| Build / artefatos       | `dist/**`, `build/**`, `out/**`, `.angular/**`, `bin/**`, `obj/**`                    |
| Cache / temporários     | `.cache/**`, `tmp/**`, `logs/**`, `*.log`                                             |
| Cobertura               | `coverage/**`                                                                         |
| IDE / VCS               | `.vscode/**`, `.git/**`                                                               |
| Variáveis de ambiente   | `.env`, `.env.*`                                                                      |
| Configurações sensíveis | `appsettings.Development.json`, `appsettings.Production.json`, etc.                   |
| Certificados / chaves   | `*.pfx`, `*.pem`, `*.key`, `*.crt`, `*.cer`, `id_rsa`, `*.token`                      |
| Lockfiles               | `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`                                    |
| Assets gráficos / 3D    | `*.svg`, `*.obj`, `*.gltf`, `*.glb`, `*.fbx`, `*.stl`                                 |
| Imagens / fontes        | `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.webp`, `*.ico`, `*.woff(2)`, `*.ttf`, `*.otf` |
| Compactados / binários  | `*.zip`, `*.7z`, `*.rar`, `*.tar`, `*.gz`, `*.dll`, `*.exe`, `*.pdb`                  |

> **Exceção**: arquivos SVG/3D só podem ser lidos quando o usuário solicitar
> explicitamente e o motivo for justificado antes da leitura.

## 3. Operações destrutivas bloqueadas

- `rm -rf <qualquer caminho>`
- `git push --force`
- `git reset --hard`

## 4. Diretrizes de segurança

- Nunca registrar, copiar ou imprimir conteúdo de senhas, tokens, chaves
  privadas, connection strings ou dados pessoais sensíveis.
- Ao detectar um arquivo potencialmente sensível, apenas comunicar a
  existência e recomendar proteção, **sem** ler o conteúdo.

## 5. Diretrizes de execução

- Antes de qualquer alteração relevante: explicar, listar arquivos
  impactados e justificar.
- Mudanças pequenas, rastreáveis e reversíveis sempre que possível.
- Não remover código sem entender sua função.
- Não atualizar dependências sem analisar impacto.
- Não instalar bibliotecas sem justificativa técnica registrada em
  `04-decisoes-tecnicas.md`.

## 6. Documentação obrigatória

- Toda decisão técnica relevante → `04-decisoes-tecnicas.md`.
- Toda mudança estrutural → `02-arquitetura.md` + `08-historico-de-alteracoes.md`.
- Toda nova feature → atualizar o documento de feature correspondente.

## 7. Anti-alucinação

- Proibido afirmar sem verificar.
- Em caso de dúvida: ler código, consultar a documentação oficial ou
  perguntar ao usuário.
