import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoElementSource } from '../src/engine/decode/videoElementSource';
import type { Asset } from '../src/types/project';

vi.mock('../src/engine/storage/opfs', () => ({
  getObjectUrl: vi.fn(async () => 'blob:fake'),
}));

/** Elemento <video> falso, com os campos e métodos que a fonte usa. */
interface FakeVideo {
  muted: boolean;
  playsInline: boolean;
  preload: string;
  src: string;
  currentTime: number;
  playbackRate: number;
  paused: boolean;
  readyState: number;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

/** Cria um <video> falso já pronto para desenhar (readyState 4), pausado. */
function makeFakeVideo(): FakeVideo {
  const video: FakeVideo = {
    muted: false,
    playsInline: false,
    preload: '',
    src: '',
    currentTime: 0,
    playbackRate: 1,
    paused: true,
    readyState: 4,
    play: vi.fn(),
    pause: vi.fn(),
    load: vi.fn(),
    removeAttribute: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  video.play.mockImplementation(() => {
    video.paused = false;
    return Promise.resolve();
  });
  video.pause.mockImplementation(() => {
    video.paused = true;
  });
  return video;
}

/** Cria um asset de vídeo de teste. */
function makeAsset(id: string): Asset {
  return {
    id,
    kind: 'video',
    name: `${id}.webm`,
    mimeType: 'video/webm',
    opfsPath: `media/${id}.webm`,
    sizeBytes: 10,
    thumbnails: [],
    createdAt: 0,
  };
}

describe('createVideoElementSource (reprodução)', () => {
  let created: FakeVideo[];
  let nowMs: number;

  beforeEach(() => {
    created = [];
    nowMs = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    vi.spyOn(document, 'createElement').mockImplementation(() => {
      const video = makeFakeVideo();
      created.push(video);
      return video as unknown as HTMLElement;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('não toca depois do await se a reprodução foi pausada no meio', async () => {
    const source = createVideoElementSource();
    const pending = source.playSync(makeAsset('a'), 0, 1);
    source.pauseAll();
    await pending;
    expect(created[0]?.play).not.toHaveBeenCalled();
  });

  it('toca o elemento quando a reprodução continua', async () => {
    const source = createVideoElementSource();
    await source.playSync(makeAsset('a'), 0, 1);
    expect(created[0]?.play).toHaveBeenCalledTimes(1);
  });

  it('pausa o elemento que não foi pedido há mais de 300 ms', async () => {
    const source = createVideoElementSource();
    const a = makeAsset('a');
    const b = makeAsset('b');
    nowMs = 0;
    await source.playSync(a, 0, 1);
    nowMs = 100;
    await source.playSync(b, 0, 1);
    expect(created[0]?.pause).not.toHaveBeenCalled();
    nowMs = 500;
    await source.playSync(b, 0, 1);
    expect(created[0]?.pause).toHaveBeenCalledTimes(1);
    expect(created[1]?.pause).not.toHaveBeenCalled();
  });

  it('aplica a velocidade pedida ao elemento', async () => {
    const source = createVideoElementSource();
    await source.playSync(makeAsset('a'), 0, 2);
    expect(created[0]?.playbackRate).toBe(2);
    expect(created[0]?.play).toHaveBeenCalledTimes(1);
  });

  it('não toca nativamente com velocidade fora do intervalo e faz seek', async () => {
    const source = createVideoElementSource();
    await source.playSync(makeAsset('a'), 1000, 0);
    expect(created[0]?.play).not.toHaveBeenCalled();
    expect(created[0]?.pause).toHaveBeenCalled();
    expect(created[0]?.currentTime).toBe(1);
  });

  it('close pausa, remove o src e esquece o elemento', async () => {
    const source = createVideoElementSource();
    const asset = makeAsset('a');
    await source.playSync(asset, 0, 1);
    source.close('a');
    expect(created[0]?.pause).toHaveBeenCalled();
    expect(created[0]?.removeAttribute).toHaveBeenCalledWith('src');
    expect(created[0]?.load).toHaveBeenCalled();
    await source.playSync(asset, 0, 1);
    expect(created).toHaveLength(2);
  });
});
