# 07 — Backend .NET (Futuro / Opcional)

> O SVGEngine **não tem backend** na versão inicial. Este documento
> existe para registrar **quando** e **como** um backend .NET 10 LTS
> seria introduzido, evitando decisões apressadas.

---

## Critérios de gatilho

Um backend só será introduzido quando **pelo menos uma** das condições
abaixo for verdadeira:

1. Necessidade de **persistência server-side** (documentos salvos por
   usuário, multi-device).
2. **Colaboração em tempo real** (CRDT/OT, presence).
3. **Exportação pesada** que não pode rodar no cliente
   (rasterização em alta resolução, PDF complexo).
4. Necessidade de **autenticação/autorização** centralizada.
5. **Integração com sistemas Mosaicoo** que exigem proxy/gateway.

Enquanto nenhuma dessas condições estiver presente, o editor permanece
**100% client-side** — o que simplifica deploy, custo e privacidade.

## Quando acontecer — diretrizes

- **Stack**: .NET 10 LTS, ASP.NET Core minimal API ou MVC conforme escala.
- **Estrutura**:
  ```
  SVGEngine/
  └── src-backend/
      └── SvgEngine.Api/
          ├── Endpoints/
          ├── Domain/
          ├── Persistence/
          └── Program.cs
  ```
  > Mantém o backend isolado da workspace Angular para clareza de
  > deploy e build independentes.
- **Contrato**: OpenAPI gerado; tipos TypeScript do frontend gerados
  a partir do contrato (não escritos à mão).
- **Auth**: ASP.NET Core Identity ou OIDC (a definir).
- **Persistência**: a decidir (PostgreSQL é a escolha padrão Mosaicoo,
  a confirmar quando o gatilho for ativado).
- **Segurança**:
  - SVGs nunca são executados/renderizados no servidor sem sandbox.
  - Sanitização obrigatória antes de armazenamento.
  - Limites de tamanho e taxa por usuário.

## Não-objetivos atuais

- Não há plano de SSR/Universal para o editor.
- Não há plano de exportação PDF server-side (cliente cobre via
  bibliotecas browser).
- Não há plano de colaboração multi-usuário na fase 1–6.

---

> **Status atual**: Sem backend. Próxima revisão deste documento
> quando algum gatilho for ativado.
