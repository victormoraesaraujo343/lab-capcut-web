import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecordButton } from "@/features/recording/RecordButton";
import * as commands from "@/stores/recordingCommands";
import { useProjectStore } from "@/stores/projectStore";
import { useRecordingStore } from "@/stores/recordingStore";
import { createProject } from "@/engine/project/createProject";

vi.mock("@/stores/recordingCommands", () => ({
  startRecording: vi.fn(),
  stopRecording: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useProjectStore.setState({ project: createProject("Teste") });
  useRecordingStore.setState({ status: "idle", countdown: 0, elapsedMs: 0 });
});

afterEach(() => {
  cleanup();
  useProjectStore.setState({ project: null });
  useRecordingStore.setState({ status: "idle", countdown: 0, elapsedMs: 0, errorCode: undefined });
});

describe("RecordButton", () => {
  it("alterna entre começar e parar a gravação", () => {
    render(<RecordButton />);
    fireEvent.click(screen.getByRole("button", { name: "Gravar narração" }));
    expect(commands.startRecording).toHaveBeenCalledTimes(1);

    act(() => useRecordingStore.setState({ status: "recording", elapsedMs: 65000 }));
    expect(screen.getByText("1:05")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Parar gravação" }));
    expect(commands.stopRecording).toHaveBeenCalledTimes(1);
  });

  it("fica desabilitado durante a contagem", () => {
    render(<RecordButton />);
    act(() => useRecordingStore.setState({ status: "countdown", countdown: 2 }));
    expect(screen.getByRole("button", { name: "Gravar narração" })).toBeDisabled();
  });

  it("fica desabilitado enquanto espera a permissão do microfone", () => {
    render(<RecordButton />);
    act(() => useRecordingStore.setState({ status: "requesting" }));
    expect(screen.getByRole("button", { name: "Gravar narração" })).toBeDisabled();
  });
});
