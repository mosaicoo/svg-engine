You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Use signals for state management
- Implement lazy loading for feature routes
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead
- Use `NgOptimizedImage` for all static images.
  - `NgOptimizedImage` does not work for inline base64 images.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## Dev workflow (CRITICAL — pitfall encountered 2026-05-16)

`tsconfig.json` resolves `svg-engine/{core,render,edit,ui}` imports to
**`./dist/svg-engine/...`** — the **built** library, NOT the source.
This means: editing source files in `projects/svg-engine/**/*.ts` does
NOT affect what `ng serve playground` bundles. The dev server reads the
last-built `dist/`.

**To see your library changes in the running playground**:

1. Rebuild the library: `npx ng build svg-engine`
   (or run `npx ng build svg-engine --watch` in a separate terminal
   so it rebuilds automatically on source edits)
2. The running `ng serve playground` watches `dist/` and HMRs the
   playground when the build completes
3. In the browser, hard-refresh (Ctrl+Shift+R) to bypass stale module
   chunks

**Validation checklist before claiming a library fix is live**:

- Build summary shows `Built svg-engine/...` for the changed entry
- `grep <new-symbol> dist/svg-engine/fesm2022/svg-engine-<entry>.mjs`
  finds the new code
- (Optional) `curl http://localhost:4200/chunk-XXXX.js | grep <new-symbol>`
  confirms the bundle served by Vite contains it

**Symptom of forgetting this step**: source has the fix, tests pass,
but the running playground behaves as if the fix isn't there. Wasted
hours debugging code that's not running.

Spec/unit tests (`npx ng test`) compile the source directly via
TypeScript paths to `dist/` — but the test runner ALSO needs an up-to-
date `dist/` for the same reason. If you change a library file and
don't rebuild, tests might run against stale `.d.ts` types too. Safer
default: `ng build svg-engine` before running `ng test` after any
library edit.
