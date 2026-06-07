/**
 * Persistência leve das **preferências de voz** do usuário (engine +
 * idioma) no `localStorage`. Tolerante: SSR (sem `localStorage`), modo
 * privado e quota cheia caem em no-op silencioso.
 */
const KEY_PREFIX = 'svge.voice.';

/** Lê uma preferência de voz; `null` se ausente/indisponível. */
export function readVoicePref(name: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(KEY_PREFIX + name);
  } catch {
    return null;
  }
}

/** Grava uma preferência de voz (no-op se `localStorage` indisponível). */
export function writeVoicePref(name: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(KEY_PREFIX + name, value);
  } catch {
    /* private mode / quota — ignora */
  }
}
