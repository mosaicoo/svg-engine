/**
 * **D-093 Fase 8 — biblioteca de ícones vetoriais (self-contained).**
 *
 * Substitui o "ícone" placeholder (círculo de acento) do card gerado por
 * LLM por **glyphs vetoriais reais**. Cada ícone é desenhado
 * **parametricamente** numa grade de 24 unidades centrada na origem
 * (coords em `[-12, 12]`) e escalado/posicionado para a caixa pedida —
 * sem dados de path opacos (cada coordenada é verificável) e **sem
 * dependência de fonte de ícones externa** (renderiza igual no editor e
 * no SVG exportado, ao contrário de Material Icons via ligadura).
 *
 * Os ícones são **traçados** (line icons): o handler aplica a cor como
 * `stroke` (fill `none`). Conjunto curado e focado em KPI/dashboards;
 * ampliar adicionando um drawer + aliases.
 *
 * Uso pelo {@link builtinNluPlugin}: `create-shape` com `shape:'icon'` +
 * slot `icon` (nome PT/EN). Nome desconhecido → o handler cai no `circle`.
 */

/** Desenha o `d` de um ícone centrado em `(cx, cy)`, cabendo numa caixa `size`. */
export type IconDraw = (cx: number, cy: number, size: number) => string;

/** Arredonda para 2 casas (evita ruído de ponto-flutuante no `d`). */
function r2(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

/**
 * Drawers canônicos. Convenção interna: `k = size / 24`; `X(x)/Y(y)`
 * mapeiam coords de design (`[-12,12]`) para absolutas. Traçados abertos
 * (sem `Z`) salvo onde o contorno fechado faz sentido (circle/user).
 */
export const BUILTIN_ICON_DRAWERS: Readonly<Record<string, IconDraw>> = Object.freeze({
  // Linha de tendência ascendente + ponta de seta (KPI ↑).
  'trending-up': (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    return `M${X(-9)} ${Y(5)} L${X(-3)} ${Y(-1)} L${X(1)} ${Y(3)} L${X(9)} ${Y(-6)} M${X(4)} ${Y(-6)} L${X(9)} ${Y(-6)} L${X(9)} ${Y(-1)}`;
  },
  // Linha de tendência descendente + ponta de seta (KPI ↓).
  'trending-down': (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    return `M${X(-9)} ${Y(-5)} L${X(-3)} ${Y(1)} L${X(1)} ${Y(-3)} L${X(9)} ${Y(6)} M${X(4)} ${Y(6)} L${X(9)} ${Y(6)} L${X(9)} ${Y(1)}`;
  },
  // Gráfico de barras (3 barras sobre a baseline).
  'bar-chart': (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    return `M${X(-9)} ${Y(9)} H${X(9)} M${X(-6)} ${Y(9)} V${Y(1)} M${X(0)} ${Y(9)} V${Y(-5)} M${X(6)} ${Y(9)} V${Y(-2)}`;
  },
  // Check / confirmação.
  check: (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    return `M${X(-7)} ${Y(0)} L${X(-2)} ${Y(5)} L${X(8)} ${Y(-6)}`;
  },
  // X / fechar.
  close: (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    return `M${X(-6)} ${Y(-6)} L${X(6)} ${Y(6)} M${X(6)} ${Y(-6)} L${X(-6)} ${Y(6)}`;
  },
  // Mais.
  plus: (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    return `M${X(0)} ${Y(-7)} V${Y(7)} M${X(-7)} ${Y(0)} H${X(7)}`;
  },
  // Menos.
  minus: (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    return `M${X(-7)} ${Y(0)} H${X(7)}`;
  },
  // Seta para cima.
  'arrow-up': (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    return `M${X(0)} ${Y(8)} V${Y(-8)} M${X(-6)} ${Y(-2)} L${X(0)} ${Y(-8)} L${X(6)} ${Y(-2)}`;
  },
  // Seta para baixo.
  'arrow-down': (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    return `M${X(0)} ${Y(-8)} V${Y(8)} M${X(-6)} ${Y(2)} L${X(0)} ${Y(8)} L${X(6)} ${Y(2)}`;
  },
  // Seta para a direita.
  'arrow-right': (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    return `M${X(-8)} ${Y(0)} H${X(8)} M${X(2)} ${Y(-6)} L${X(8)} ${Y(0)} L${X(2)} ${Y(6)}`;
  },
  // Círculo (contorno fechado via dois arcos).
  circle: (cx, cy, s) => {
    const k = s / 24;
    const rr = r2(9 * k);
    return `M${r2(cx)} ${r2(cy - 9 * k)} A${rr} ${rr} 0 1 0 ${r2(cx)} ${r2(cy + 9 * k)} A${rr} ${rr} 0 1 0 ${r2(cx)} ${r2(cy - 9 * k)} Z`;
  },
  // Usuário / pessoa (cabeça + ombros).
  user: (cx, cy, s) => {
    const k = s / 24;
    const X = (x: number) => r2(cx + x * k);
    const Y = (y: number) => r2(cy + y * k);
    const hr = r2(4 * k); // raio da cabeça (centro em y=-5)
    const head = `M${X(0)} ${Y(-9)} A${hr} ${hr} 0 1 0 ${X(0)} ${Y(-1)} A${hr} ${hr} 0 1 0 ${X(0)} ${Y(-9)} Z`;
    const body = `M${X(-8)} ${Y(9)} A${r2(9 * k)} ${r2(8 * k)} 0 0 1 ${X(8)} ${Y(9)}`;
    return `${head} ${body}`;
  },
});

/**
 * Aliases PT/EN/semânticos → nome canônico. Deaccentuados/lowercase
 * (forma normalizada por {@link resolveIconName}).
 */
export const ICON_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  // trending-up
  tendencia: 'trending-up',
  alta: 'trending-up',
  crescimento: 'trending-up',
  subida: 'trending-up',
  growth: 'trending-up',
  up: 'trending-up',
  // trending-down
  queda: 'trending-down',
  baixa: 'trending-down',
  declinio: 'trending-down',
  down: 'trending-down',
  // bar-chart
  grafico: 'bar-chart',
  graficos: 'bar-chart',
  chart: 'bar-chart',
  barras: 'bar-chart',
  bars: 'bar-chart',
  graph: 'bar-chart',
  dashboard: 'bar-chart',
  // check
  ok: 'check',
  certo: 'check',
  confirmar: 'check',
  sucesso: 'check',
  success: 'check',
  done: 'check',
  ativo: 'check',
  // close
  x: 'close',
  fechar: 'close',
  erro: 'close',
  error: 'close',
  cancelar: 'close',
  cancel: 'close',
  // plus / minus
  mais: 'plus',
  adicionar: 'plus',
  add: 'plus',
  menos: 'minus',
  remover: 'minus',
  remove: 'minus',
  // arrows
  'seta-cima': 'arrow-up',
  'seta-baixo': 'arrow-down',
  'seta-direita': 'arrow-right',
  // circle
  circulo: 'circle',
  ponto: 'circle',
  bolinha: 'circle',
  dot: 'circle',
  // user
  usuario: 'user',
  pessoa: 'user',
  perfil: 'user',
  cliente: 'user',
  person: 'user',
  account: 'user',
});

/** Nomes canônicos disponíveis (para catálogo/UX). */
export const ICON_NAMES: readonly string[] = Object.freeze(Object.keys(BUILTIN_ICON_DRAWERS));

/** Combining diacritical marks (U+0300–U+036F) — removidos após NFD. */
const DIACRITICS_RE = new RegExp('[\\u0300-\\u036f]', 'g');

/** Normaliza: lowercase, trim, sem acento. */
function normalizeIconKey(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFD').replace(DIACRITICS_RE, '');
}

/**
 * Resolve um nome (canônico ou alias PT/EN) para o nome canônico, ou
 * `null` se desconhecido. Pure/determinística (testável offline).
 */
export function resolveIconName(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const key = normalizeIconKey(raw);
  if (Object.prototype.hasOwnProperty.call(BUILTIN_ICON_DRAWERS, key)) return key;
  return ICON_ALIASES[key] ?? null;
}

/**
 * Retorna o `d` do ícone `name` centrado em `(cx, cy)` cabendo em `size`,
 * ou `null` quando o nome não resolve.
 */
export function drawIcon(
  name: string | undefined,
  cx: number,
  cy: number,
  size: number,
): string | null {
  const canonical = resolveIconName(name);
  if (canonical === null) return null;
  return BUILTIN_ICON_DRAWERS[canonical](cx, cy, size);
}
