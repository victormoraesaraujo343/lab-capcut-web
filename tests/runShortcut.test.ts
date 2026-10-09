import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runShortcut } from "@/features/timeline/runShortcut";
import * as commands from "@/stores/timelineCommands";
import { usePlaybackStore } from "@/stores/playbackStore";
import { useProjectStore } from "@/stores/projectStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createProject } from "@/engine/project/createProject";
import { DEFAULT_KEYMAP, type ShortcutAction } from "@/utils/keymap";

vi.mock("@/stores/timelineCommands", () => ({
  splitAtPlayhead: vi.fn(),
  deleteSelected: vi.fn(),
  duplicateSelected: vi.fn(),
  copySelected: vi.fn(),
  cutSelected: vi.fn(),
  pasteAtPlayhead: vi.fn(),
  trimSelectedToPlayhead: vi.fn(),
  goToEdge: vi.fn(),
  goToStart: vi.fn(),
  goToEnd: vi.fn(),
  selectAll: vi.fn(),
  groupSelected: vi.fn(),
  ungroupSelected: vi.fn(),
}));

const initialTimeline = useTimelineStore.getState();

/** Abre um projeto de teste com duração fixa e fps conhecido. */
function openProject(durationMs = 9000): void {
  const project = createProject("Teste");
  useProjectStore.setState({ project: { ...project, durationMs } });
}

beforeEach(() => {
  vi.clearAllMocks();
  openProject();
  usePlaybackStore.setState({ currentTimeMs: 0, isPlaying: false });
  useTimelineStore.setState({ tool: "select", zoom: 100, snapEnabled: true });
});

afterEach(() => {
  useProjectStore.setState({ project: null });
  useTimelineStore.setState(initialTimeline, true);
  usePlaybackStore.setState({ currentTimeMs: 0, isPlaying: false });
});

describe("runShortcut", () => {
  it("trata toda ação do mapa padrão quando há projeto aberto", () => {
    for (const action of Object.keys(DEFAULT_KEYMAP) as ShortcutAction[]) {
      expect(runShortcut(action), action).toBe(true);
    }
  });

  it("playPause alterna a reprodução", () => {
    runShortcut("playPause");
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    runShortcut("playPause");
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
  });

  it("split chama splitAtPlayhead", () => {
    runShortcut("split");
    expect(commands.splitAtPlayhead).toHaveBeenCalledTimes(1);
  });

  it("delete e rippleDelete apagam a seleção com e sem ripple", () => {
    runShortcut("delete");
    expect(commands.deleteSelected).toHaveBeenLastCalledWith(false);
    runShortcut("rippleDelete");
    expect(commands.deleteSelected).toHaveBeenLastCalledWith(true);
  });

  it("undo e redo chamam as ações da timeline", () => {
    const undo = vi.fn();
    const redo = vi.fn();
    useTimelineStore.setState({ undo, redo });
    runShortcut("undo");
    runShortcut("redo");
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it("duplicate, copy, paste e cut chamam os comandos de edição", () => {
    runShortcut("duplicate");
    runShortcut("copy");
    runShortcut("paste");
    runShortcut("cut");
    expect(commands.duplicateSelected).toHaveBeenCalledTimes(1);
    expect(commands.copySelected).toHaveBeenCalledTimes(1);
    expect(commands.pasteAtPlayhead).toHaveBeenCalledTimes(1);
    expect(commands.cutSelected).toHaveBeenCalledTimes(1);
  });

  it("trimStartToPlayhead e trimEndToPlayhead aparam do lado certo", () => {
    runShortcut("trimStartToPlayhead");
    expect(commands.trimSelectedToPlayhead).toHaveBeenLastCalledWith("start");
    runShortcut("trimEndToPlayhead");
    expect(commands.trimSelectedToPlayhead).toHaveBeenLastCalledWith("end");
  });

  it("prevEdge e nextEdge vão para a borda anterior e seguinte", () => {
    runShortcut("prevEdge");
    expect(commands.goToEdge).toHaveBeenLastCalledWith("prev");
    runShortcut("nextEdge");
    expect(commands.goToEdge).toHaveBeenLastCalledWith("next");
  });

  it("zoomIn e zoomOut multiplicam o zoom", () => {
    runShortcut("zoomIn");
    expect(useTimelineStore.getState().zoom).toBeCloseTo(125);
    runShortcut("zoomOut");
    expect(useTimelineStore.getState().zoom).toBeCloseTo(100);
  });

  it("selectAll, group e ungroup chamam os comandos certos", () => {
    runShortcut("selectAll");
    runShortcut("group");
    runShortcut("ungroup");
    expect(commands.selectAll).toHaveBeenCalledTimes(1);
    expect(commands.groupSelected).toHaveBeenCalledTimes(1);
    expect(commands.ungroupSelected).toHaveBeenCalledTimes(1);
  });

  it("bladeTool e selectTool trocam a ferramenta", () => {
    runShortcut("bladeTool");
    expect(useTimelineStore.getState().tool).toBe("blade");
    runShortcut("selectTool");
    expect(useTimelineStore.getState().tool).toBe("select");
  });

  it("frameForward e frameBack andam um quadro pelo fps do projeto", () => {
    const fps = useProjectStore.getState().project?.fps ?? 0;
    usePlaybackStore.getState().seek(1000);
    runShortcut("frameForward");
    expect(usePlaybackStore.getState().currentTimeMs).toBeCloseTo(1000 + 1000 / fps);
    runShortcut("frameBack");
    expect(usePlaybackStore.getState().currentTimeMs).toBeCloseTo(1000);
  });

  it("frameBack sem projeto não trata a ação", () => {
    useProjectStore.setState({ project: null });
    expect(runShortcut("frameBack")).toBe(false);
  });

  it("goToStart e goToEnd levam o cursor ao início e ao fim", () => {
    vi.mocked(commands.goToStart).mockImplementation(() =>
      usePlaybackStore.getState().seek(0),
    );
    vi.mocked(commands.goToEnd).mockImplementation(() =>
      usePlaybackStore.getState().seek(9000),
    );
    usePlaybackStore.getState().seek(4000);
    runShortcut("goToEnd");
    expect(commands.goToEnd).toHaveBeenCalledTimes(1);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(9000);
    runShortcut("goToStart");
    expect(commands.goToStart).toHaveBeenCalledTimes(1);
    expect(usePlaybackStore.getState().currentTimeMs).toBe(0);
  });

  it("toggleSnap liga e desliga o ímã", () => {
    runShortcut("toggleSnap");
    expect(useTimelineStore.getState().snapEnabled).toBe(false);
    runShortcut("toggleSnap");
    expect(useTimelineStore.getState().snapEnabled).toBe(true);
  });
});
