import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TimelineToolbar } from "@/features/timeline/TimelineToolbar";
import * as commands from "@/stores/timelineCommands";
import { usePlaybackStore } from "@/stores/playbackStore";
import { useProjectStore } from "@/stores/projectStore";
import { useTimelineStore } from "@/stores/timelineStore";
import { createProject } from "@/engine/project/createProject";

vi.mock("@/stores/timelineCommands", () => ({
  splitAtPlayhead: vi.fn(),
  deleteSelected: vi.fn(),
  duplicateSelected: vi.fn(),
  groupSelected: vi.fn(),
  ungroupSelected: vi.fn(),
  trimSelectedToPlayhead: vi.fn(),
  copySelected: vi.fn(),
  pasteAtPlayhead: vi.fn(),
}));

const initialTimeline = useTimelineStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  const project = createProject("Teste");
  useProjectStore.setState({ project: { ...project, durationMs: 2000 } });
  useTimelineStore.getState().resetHistory();
  useTimelineStore.setState({ tool: "select" });
});

afterEach(() => {
  cleanup();
  useProjectStore.setState({ project: null });
  useTimelineStore.setState(initialTimeline, true);
  usePlaybackStore.setState({ currentTimeMs: 0, isPlaying: false });
});

describe("TimelineToolbar", () => {
  it("desabilita Desfazer e Refazer sem histórico", () => {
    render(<TimelineToolbar />);
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refazer" })).toBeDisabled();
  });

  it("clicar em Lâmina troca a ferramenta e marca o botão", () => {
    render(<TimelineToolbar />);
    const blade = screen.getByRole("button", { name: "Lâmina (B)" });
    expect(blade).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(blade);
    expect(useTimelineStore.getState().tool).toBe("blade");
    expect(blade).toHaveAttribute("aria-pressed", "true");
  });

  it("clicar em Dividir chama splitAtPlayhead", () => {
    render(<TimelineToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Dividir" }));
    expect(commands.splitAtPlayhead).toHaveBeenCalledTimes(1);
  });

  it("Excluir fica desabilitado sem seleção de clipes", () => {
    render(<TimelineToolbar />);
    expect(screen.getByRole("button", { name: "Excluir" })).toBeDisabled();
  });

  it("mostra o tempo atual e a duração no formato de timecode", () => {
    render(<TimelineToolbar />);
    expect(screen.getByText("/ 00:00:02:00")).toBeInTheDocument();
  });

  it("Copiar chama copySelected quando há seleção", () => {
    useTimelineStore.setState({ selectedClipIds: ["a"] });
    render(<TimelineToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Copiar" }));
    expect(commands.copySelected).toHaveBeenCalledTimes(1);
  });

  it("Colar fica desabilitado sem nada copiado", () => {
    render(<TimelineToolbar />);
    expect(screen.getByRole("button", { name: "Colar" })).toBeDisabled();
  });

  it("o menu de ações tem Excluir e fechar espaço, que apaga com ripple", () => {
    useTimelineStore.setState({ selectedClipIds: ["a"] });
    render(<TimelineToolbar />);
    expect(screen.queryByRole("menuitem", { name: "Excluir e fechar espaço" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Excluir e fechar espaço" }));
    expect(commands.deleteSelected).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Reproduzir alterna a reprodução", () => {
    render(<TimelineToolbar />);
    fireEvent.click(screen.getByRole("button", { name: "Reproduzir (Espaço)" }));
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    expect(screen.getByRole("button", { name: "Pausar (Espaço)" })).toBeInTheDocument();
  });
});
