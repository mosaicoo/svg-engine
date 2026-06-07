import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WHISPER_VOICE_CONFIG,
  provideWhisperVoice,
  WHISPER_VOICE_CONFIG,
} from './whisper-voice.config';
import { WhisperVoiceService } from './whisper-voice.service';

/**
 * **Whisper voice specs** — entry point `svg-engine/ai/nlu-voice-wasm`.
 *
 * Cobre o que é determinístico sem browser/microfone:
 * - merge de config (`provideWhisperVoice` sobre defaults) + token default;
 * - contrato do provider em jsdom (sem `getUserMedia` → `not-supported`).
 *
 * **Por que NÃO testamos a transcrição aqui**: depende de `getUserMedia`
 * + `MediaRecorder` + `AudioContext` + carregamento do modelo ONNX —
 * tudo indisponível em jsdom. Essa validação é manual no browser
 * (mesmo critério da spec do `VoiceRecognitionService`).
 */
describe('WhisperVoiceConfig', () => {
  it('token default resolve para DEFAULT_WHISPER_VOICE_CONFIG', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(WHISPER_VOICE_CONFIG)).toEqual(DEFAULT_WHISPER_VOICE_CONFIG);
  });

  it('provideWhisperVoice faz merge do patch parcial sobre os defaults', () => {
    TestBed.configureTestingModule({
      providers: [provideWhisperVoice({ modelBasePath: '/custom/whisper', defaultLanguage: 'es' })],
    });
    const cfg = TestBed.inject(WHISPER_VOICE_CONFIG);
    expect(cfg.modelBasePath).toBe('/custom/whisper');
    expect(cfg.defaultLanguage).toBe('es');
    // Campos não informados mantêm o default.
    expect(cfg.modelId).toBe(DEFAULT_WHISPER_VOICE_CONFIG.modelId);
    expect(cfg.dtype).toBe('q8');
    expect(cfg.wasmBasePath).toBe(DEFAULT_WHISPER_VOICE_CONFIG.wasmBasePath);
  });

  it('defaults apontam para assets locais (sem URL externa)', () => {
    expect(DEFAULT_WHISPER_VOICE_CONFIG.modelBasePath.startsWith('/')).toBe(true);
    expect(DEFAULT_WHISPER_VOICE_CONFIG.wasmBasePath.startsWith('/')).toBe(true);
    expect(DEFAULT_WHISPER_VOICE_CONFIG.modelId).toBe('whisper-small');
    expect(DEFAULT_WHISPER_VOICE_CONFIG.numThreads).toBe(1);
  });
});

describe('WhisperVoiceService', () => {
  it('isSupported() é false em jsdom (sem getUserMedia)', () => {
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(WhisperVoiceService);
    expect(svc.isSupported()).toBe(false);
  });

  it('listen() rejeita e marca lastError = "not-supported" quando sem mic', async () => {
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(WhisperVoiceService);
    await expect(svc.listen('pt')).rejects.toThrow();
    expect(svc.lastError()).toBe('not-supported');
    expect(svc.listening()).toBe(false);
  });

  it('stop() é no-op seguro quando nada está ativo', () => {
    TestBed.configureTestingModule({});
    const svc = TestBed.inject(WhisperVoiceService);
    expect(() => svc.stop()).not.toThrow();
  });
});
