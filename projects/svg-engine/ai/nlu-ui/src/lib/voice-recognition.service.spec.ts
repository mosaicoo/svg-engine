import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { VoiceRecognitionService } from './voice-recognition.service';

/**
 * **Voice recognition specs** — D-046 review-10.
 *
 * Foco no fix C2 (timeout watchdog) — valida API contract:
 * - `DEFAULT_LISTEN_TIMEOUT_MS` exposto e é 30000.
 * - `listen()` rejeita imediatamente quando Web Speech API indisponível
 *   (jsdom não tem nativo, então é o caminho default em test env).
 *
 * **Por que NÃO testamos o timer watchdog aqui**: requereria mockar
 * `window.SpeechRecognition` global, o que jsdom resiste. O timeout
 * code path é coberto pela inspeção visual + verificação manual no
 * browser. Spec do timer real fica como follow-up (Karma + browser
 * env, fora do scope vitest).
 */

describe('VoiceRecognitionService (D-046 review-10)', () => {
  it('expõe DEFAULT_LISTEN_TIMEOUT_MS como constante pública = 30000', () => {
    expect(VoiceRecognitionService.DEFAULT_LISTEN_TIMEOUT_MS).toBe(30000);
  });

  it('isSupported retorna false em jsdom (sem Web Speech API nativo)', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(VoiceRecognitionService);
    expect(service.isSupported()).toBe(false);
  });

  it('listen() rejeita imediatamente quando API não suportada', async () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(VoiceRecognitionService);
    await expect(service.listen()).rejects.toThrow(/not supported/);
  });

  it('stop() é no-op seguro quando nada está ativo', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(VoiceRecognitionService);
    expect(() => service.stop()).not.toThrow();
    expect(service.listening()).toBe(false);
  });

  it('lastError() é null inicialmente', () => {
    TestBed.configureTestingModule({});
    const service = TestBed.inject(VoiceRecognitionService);
    expect(service.lastError()).toBeNull();
  });
});
