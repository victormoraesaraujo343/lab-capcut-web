import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelRecording,
  narrationFileName,
  placeRecordingClip,
  startRecording,
  stopRecording,
} from "@/stores/recordingCommands";
import { useRecordingStore } from "@/stores/recordingStore";
import { useProjectStore } from "@/stores/projectStore";
import { usePlaybackStore } from "@/stores/playbackStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createProject, createTrack } from "@/engine/project/createProject";
import type { Asset, Track } from "@/types";
import { createClipFromAsset } from "@/engine/timeline/clipFactory";

/** Gravador falso: guarda as instâncias e entrega um blob ao parar. */
class FakeMediaRecorder {
  static isTypeSupported = vi.fn((type: string) => type === "audio/webm;codecs=opus");
  static instances: FakeMediaRecorder[] = [];
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["audio"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

const trackStop = vi.fn();
const stream = { getTracks: () => [{ stop: trackStop }] } as unknown as MediaStream;
const getUserMedia = vi.fn(async () => stream);
const importFiles = vi.fn(async (files: File[]) => {
  const project = useProjectStore.getState().project;
  if (project === null || files.length === 0) return;
  const asset = makeAsset("asset-narracao");
  useProjectStore.setState({ project: { ...project, assets: [...project.assets, asset] } });
});

/** Asset de áudio de teste, com os campos mínimos. */
function makeAsset(id: string): Asset {
  return {
    id,
    kind: "audio",
    name: "Narração.webm",
    mimeType: "audio/webm",
    opfsPath: `media/${id}.webm`,
    sizeBytes: 1000,
    thumbnails: [],
    createdAt: Date.now(),
  };
}

/** Abre um projeto de teste com as trilhas dadas e zera a gravação. */
function openProject(tracks: Track[]): void {
  const project = createProject("Teste");
  useProjectStore.setState({ project: { ...project, tracks, assets: [] }, importFiles });
  useTimelineStore.getState().resetHistory();
  useTimelineStore.getState().clearSelection();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  usePlaybackStore.setState({ currentTimeMs: 0, isPlaying: false });
});

afterEach(() => {
  cancelRecording();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "mediaDevices");
  useProjectStore.setState({ project: null });
  useRecordingStore.setState({ status: "idle", countdown: 0, startMs: 0, elapsedMs: 0, errorCode: undefined });
});

describe("recordingCommands", () => {
  it("faz a contagem 3-2-1 e grava a partir do cursor com a prévia tocando", async () => {
    openProject([createTrack("audio", "Áudio 1")]);
    usePlaybackStore.setState({ currentTimeMs: 1500 });

    await startRecording();
    expect(useRecordingStore.getState()).toMatchObject({ status: "countdown", countdown: 3 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(useRecordingStore.getState().countdown).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);

    expect(useRecordingStore.getState()).toMatchObject({ status: "recording", startMs: 1500 });
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(useRecordingStore.getState().elapsedMs).toBe(2000);
  });

  it("ao parar, importa o arquivo e põe o clipe numa trilha livre no início gravado", async () => {
    const audioTrack = createTrack("audio", "Áudio 1");
    openProject([audioTrack]);
    usePlaybackStore.setState({ currentTimeMs: 1000 });

    await startRecording();
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(4000);
    await stopRecording();

    expect(importFiles).toHaveBeenCalledTimes(1);
    const file = importFiles.mock.calls[0]?.[0][0];
    expect(file?.name).toMatch(/^Narração \d{4}-\d{2}-\d{2} \d{2}h\d{2}\.webm$/);
    expect(trackStop).toHaveBeenCalled();

    const project = useProjectStore.getState().project;
    const track = project?.tracks.find((tr) => tr.id === audioTrack.id);
    expect(project?.tracks).toHaveLength(1);
    expect(track?.clips).toHaveLength(1);
    expect(track?.clips[0]).toMatchObject({ assetId: "asset-narracao", startMs: 1000, durationMs: 4000 });
    expect(useTimelineStore.getState().selectedClipIds).toEqual([track?.clips[0]?.id]);
    expect(useRecordingStore.getState().status).toBe("idle");
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it("cria uma trilha nova quando as de áudio estão ocupadas no trecho", async () => {
    const busyTrack = createTrack("audio", "Áudio 1");
    const busyClip = { ...createClipFromAsset(makeAsset("ocupa"), busyTrack.id, 0), durationMs: 5000 };
    openProject([{ ...busyTrack, clips: [busyClip] }]);
    usePlaybackStore.setState({ currentTimeMs: 1000 });

    await startRecording();
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(2000);
    await stopRecording();

    const tracks = useProjectStore.getState().project?.tracks ?? [];
    expect(tracks).toHaveLength(2);
    expect(tracks[0]?.clips).toHaveLength(1);
    expect(tracks[1]?.kind).toBe("audio");
    expect(tracks[1]?.clips[0]).toMatchObject({ startMs: 1000, durationMs: 2000 });
  });

  it("cancelar não importa nada e libera o microfone", async () => {
    openProject([createTrack("audio", "Áudio 1")]);

    await startRecording();
    await vi.advanceTimersByTimeAsync(3000);
    cancelRecording();

    expect(importFiles).not.toHaveBeenCalled();
    expect(trackStop).toHaveBeenCalled();
    expect(useRecordingStore.getState().status).toBe("idle");
  });

  it("cancelar enquanto pede o microfone descarta o stream que chegar depois", async () => {
    openProject([createTrack("audio", "Áudio 1")]);
    let deliver: (value: MediaStream) => void = () => undefined;
    getUserMedia.mockImplementationOnce(
      () => new Promise<MediaStream>((resolve) => { deliver = resolve; }),
    );

    const pending = startRecording();
    expect(useRecordingStore.getState().status).toBe("requesting");
    cancelRecording();
    expect(useRecordingStore.getState().status).toBe("idle");

    deliver(stream);
    await pending;
    await vi.advanceTimersByTimeAsync(5000);

    expect(trackStop).toHaveBeenCalled();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(useRecordingStore.getState().status).toBe("idle");
  });

  it("com o cursor no fim do projeto, a gravação começa no fim e não volta para 0", async () => {
    openProject([createTrack("audio", "Áudio 1")]);
    const project = useProjectStore.getState().project;
    if (project !== null) useProjectStore.setState({ project: { ...project, durationMs: 5000 } });
    // Imita o player: dar play no fim da timeline volta para 0.
    const unsubscribe = usePlaybackStore.subscribe((state, prev) => {
      if (state.isPlaying && !prev.isPlaying && state.currentTimeMs >= 5000) {
        usePlaybackStore.setState({ currentTimeMs: 0 });
      }
    });
    usePlaybackStore.setState({ currentTimeMs: 9000 });

    await startRecording();
    await vi.advanceTimersByTimeAsync(3000);
    unsubscribe();

    expect(useRecordingStore.getState()).toMatchObject({ status: "recording", startMs: 5000 });
  });

  it("negar o microfone deixa a gravação com erro denied", async () => {
    openProject([createTrack("audio", "Áudio 1")]);
    getUserMedia.mockRejectedValueOnce(Object.assign(new Error("negado"), { name: "NotAllowedError" }));

    await startRecording();

    expect(useRecordingStore.getState()).toMatchObject({ status: "error", errorCode: "denied" });
  });

  it("monta o nome do arquivo com a data e a hora", () => {
    const at = new Date(2026, 9, 9, 7, 5).getTime();
    expect(narrationFileName(at, "audio/webm;codecs=opus")).toBe("Narração 2026-10-09 07h05.webm");
  });

  it("placeRecordingClip usa a duração gravada, não a do asset", () => {
    const track = createTrack("audio", "Áudio 1");
    const result = placeRecordingClip([track], makeAsset("a1"), 500, 3000);
    expect(result.tracks[0]?.clips[0]).toMatchObject({ id: result.clipId, startMs: 500, durationMs: 3000 });
  });
});
