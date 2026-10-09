import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mixProjectAudio } from '../src/engine/audio/offlineMix';
import { createProject } from '../src/engine/project/createProject';
import { downmixToMono, prepareSpeechAudio } from '../src/engine/captions/speechAudio';

vi.mock('../src/engine/audio/offlineMix', () => ({
  mixProjectAudio: vi.fn(),
}));

describe('downmixToMono', () => {
  it('faz a média dos canais', () => {
    const mono = downmixToMono([Float32Array.of(1, 0.5), Float32Array.of(0, -0.5)]);
    expect(Array.from(mono)).toEqual([0.5, 0]);
  });

  it('copia um canal único sem alterar os valores', () => {
    const mono = downmixToMono([Float32Array.of(0.25, -0.75)]);
    expect(Array.from(mono)).toEqual([0.25, -0.75]);
  });

  it('usa o tamanho do menor canal', () => {
    const mono = downmixToMono([Float32Array.of(1, 1, 1), Float32Array.of(1)]);
    expect(Array.from(mono)).toEqual([1]);
  });

  it('devolve vazio quando não há canais', () => {
    expect(downmixToMono([]).length).toBe(0);
  });
});

describe('prepareSpeechAudio', () => {
  beforeEach(() => {
    vi.mocked(mixProjectAudio).mockReset();
  });

  it('mixa em 16 kHz e devolve o canal mono', async () => {
    const project = createProject('Teste');
    vi.mocked(mixProjectAudio).mockResolvedValueOnce({
      sampleRate: 16000,
      channels: [Float32Array.of(1, 0), Float32Array.of(0, 0)],
    });
    const signal = new AbortController().signal;
    const audio = await prepareSpeechAudio(project, { startMs: 1000, endMs: 3000 }, signal);
    expect(mixProjectAudio).toHaveBeenCalledWith(project, 1000, 3000, { sampleRate: 16000, signal });
    expect(Array.from(audio ?? [])).toEqual([0.5, 0]);
  });

  it('devolve null quando o intervalo não tem áudio', async () => {
    vi.mocked(mixProjectAudio).mockResolvedValueOnce(null);
    const audio = await prepareSpeechAudio(createProject('Vazio'), { startMs: 0, endMs: 1000 });
    expect(audio).toBeNull();
  });
});
