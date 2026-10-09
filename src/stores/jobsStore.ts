// Trabalhos demorados em segundo plano (inverter clipe, estabilizar, remover fundo): progresso e estado para a interface.
// Quem executa o trabalho chama start/update/finish/fail; a interface só lê.
import { create } from 'zustand';

/** Tipos de trabalho em segundo plano. */
export type JobKind = 'reverse' | 'stabilize' | 'removeBackground' | 'proxy';

/** Um trabalho em segundo plano. */
export interface Job {
  id: string;
  kind: JobKind;
  /** Clipe que originou o trabalho (para mostrar o progresso no clipe e no inspetor). */
  clipId: string;
  /** Progresso 0..1. */
  progress: number;
  status: 'running' | 'done' | 'error' | 'cancelled';
  /** Código de erro curto (mensagem traduzida na interface). */
  errorCode?: string;
  /** Cancela o trabalho (fornecido por quem executa). */
  cancel?: () => void;
}

/** Estado e ações dos trabalhos. */
export interface JobsState {
  jobs: Job[];
  /** Registra um trabalho novo em andamento. */
  start: (job: Omit<Job, 'progress' | 'status'>) => void;
  /** Atualiza o progresso (0..1). */
  update: (id: string, progress: number) => void;
  /** Marca como concluído (some da lista depois de 4 s). */
  finish: (id: string) => void;
  /** Marca como falho, com um código de erro. */
  fail: (id: string, errorCode: string) => void;
  /** Cancela e remove. */
  cancelJob: (id: string) => void;
  /** Remove da lista. */
  dismiss: (id: string) => void;
}

/** Hook dos trabalhos em segundo plano. */
export const useJobsStore = create<JobsState>()((set, get) => ({
  jobs: [],
  // Registra um trabalho em andamento.
  start: (job) => set((s) => ({ jobs: [...s.jobs.filter((j) => j.id !== job.id), { ...job, progress: 0, status: 'running' }] })),
  // Atualiza o progresso.
  update: (id, progress) =>
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, progress: Math.min(1, Math.max(0, progress)) } : j)) })),
  // Conclui e agenda a remoção.
  finish: (id) => {
    set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, progress: 1, status: 'done' } : j)) }));
    setTimeout(() => get().dismiss(id), 4000);
  },
  // Marca falha.
  fail: (id, errorCode) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? { ...j, status: 'error', errorCode } : j)) })),
  // Cancela e remove.
  cancelJob: (id) => {
    get().jobs.find((j) => j.id === id)?.cancel?.();
    get().dismiss(id);
  },
  // Remove da lista.
  dismiss: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),
}));
