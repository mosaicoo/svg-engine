import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VOICE_WHISPER_PROVIDER } from 'svg-engine/ai/nlu';
import { VoiceEngineService } from './voice-engine.service';
import { VoiceRecognitionService } from './voice-recognition.service';

/**
 * **VoiceEngineService specs** — orquestrador de engine selecionável.
 *
 * Mocka os dois providers (Web Speech + Whisper) para exercitar a
 * lógica determinística: engines disponíveis, troca de engine,
 * delegação do `listen()` e o fallback do modo `'auto'`.
 */

function makeProvider(supported: boolean) {
  return {
    isSupported: signal(supported),
    listening: signal(false),
    lastError: signal<string | null>(null),
    listen: vi.fn<(lang?: string, options?: { readonly timeoutMs?: number }) => Promise<string>>(
      async () => '',
    ),
    stop: vi.fn<() => void>(),
  };
}
type MockProvider = ReturnType<typeof makeProvider>;

function configure(web: MockProvider, whisper: MockProvider | null): VoiceEngineService {
  TestBed.configureTestingModule({
    providers: [
      { provide: VoiceRecognitionService, useValue: web as unknown as VoiceRecognitionService },
      { provide: VOICE_WHISPER_PROVIDER, useValue: whisper },
    ],
  });
  return TestBed.inject(VoiceEngineService);
}

describe('VoiceEngineService', () => {
  beforeEach(() => {
    // setEngine persiste no localStorage — limpa p/ isolamento entre testes.
    try {
      localStorage.clear();
    } catch {
      /* jsdom sempre tem localStorage; guard defensivo */
    }
    TestBed.resetTestingModule();
  });

  it('engine default é web-speech', () => {
    const svc = configure(makeProvider(true), null);
    expect(svc.engine()).toBe('web-speech');
  });

  it('sem Whisper: só web-speech disponível, sem auto', () => {
    const svc = configure(makeProvider(true), null);
    expect(svc.availableEngines()).toEqual(['web-speech']);
    expect(svc.whisperAvailable()).toBe(false);
  });

  it('com Whisper: web-speech + whisper + auto', () => {
    const svc = configure(makeProvider(true), makeProvider(true));
    expect(svc.availableEngines()).toEqual(['web-speech', 'whisper', 'auto']);
    expect(svc.whisperAvailable()).toBe(true);
  });

  it('setEngine ignora engine não disponível', () => {
    const svc = configure(makeProvider(true), null);
    svc.setEngine('whisper'); // não registrado
    expect(svc.engine()).toBe('web-speech');
  });

  it('engine=whisper delega listen() ao Whisper', async () => {
    const web = makeProvider(true);
    const whisper = makeProvider(true);
    whisper.listen.mockResolvedValue('círculo azul');
    const svc = configure(web, whisper);
    svc.setEngine('whisper');
    await expect(svc.listen('pt-BR')).resolves.toBe('círculo azul');
    expect(whisper.listen).toHaveBeenCalledOnce();
    expect(web.listen).not.toHaveBeenCalled();
  });

  it('auto: cai para Whisper quando Web Speech falha', async () => {
    const web = makeProvider(true);
    web.listen.mockImplementation(async () => {
      web.lastError.set('network');
      throw new Error('network');
    });
    const whisper = makeProvider(true);
    whisper.listen.mockResolvedValue('retângulo');
    const svc = configure(web, whisper);
    svc.setEngine('auto');
    await expect(svc.listen('pt-BR')).resolves.toBe('retângulo');
    expect(web.listen).toHaveBeenCalledOnce();
    expect(whisper.listen).toHaveBeenCalledOnce();
    // Sucesso do fallback → orquestrador NÃO propaga o erro network.
    expect(svc.lastError()).toBeNull();
  });

  it('listen propaga erro do provider para lastError', async () => {
    const web = makeProvider(true);
    web.listen.mockImplementation(async () => {
      web.lastError.set('not-allowed');
      throw new Error('not-allowed');
    });
    const svc = configure(web, null);
    await expect(svc.listen('pt-BR')).rejects.toThrow();
    expect(svc.lastError()).toBe('not-allowed');
  });

  it('stop() encerra ambos os providers', () => {
    const web = makeProvider(true);
    const whisper = makeProvider(true);
    const svc = configure(web, whisper);
    svc.stop();
    expect(web.stop).toHaveBeenCalledOnce();
    expect(whisper.stop).toHaveBeenCalledOnce();
  });

  it('modelLoading reflete o provider Whisper quando presente', () => {
    const web = makeProvider(true);
    const whisper = makeProvider(true);
    const loading = signal(false);
    (whisper as { modelLoading?: typeof loading }).modelLoading = loading;
    const svc = configure(web, whisper);
    expect(svc.modelLoading()).toBe(false);
    loading.set(true);
    expect(svc.modelLoading()).toBe(true);
  });

  it('persiste a engine e restaura em nova instância (localStorage)', () => {
    const svc1 = configure(makeProvider(true), makeProvider(true));
    svc1.setEngine('whisper');
    TestBed.resetTestingModule();
    const svc2 = configure(makeProvider(true), makeProvider(true));
    expect(svc2.engine()).toBe('whisper');
  });

  it('sem preferência salva + Whisper presente → default "auto"', () => {
    const svc = configure(makeProvider(true), makeProvider(true));
    expect(svc.engine()).toBe('auto');
  });
});
