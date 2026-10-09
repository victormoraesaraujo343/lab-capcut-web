import { formatDuration } from '../../utils/time';

/** Passo de um quadro a 30 fps, arredondado para milissegundos. */
const FRAME_MS = Math.round(1000 / 30);

/** Maior passo de marcação suportado, em milissegundos. */
const MAX_STEP_MS = 600_000;

/** Passos candidatos para o traço maior, em milissegundos, do menor para o maior. */
const MAJOR_STEPS_MS: readonly number[] = [
  FRAME_MS,
  100,
  250,
  500,
  1000,
  2000,
  5000,
  10000,
  15000,
  30000,
  60000,
  120000,
  300000,
  MAX_STEP_MS,
];

/** Subdivisões testadas entre traços maiores, da mais fina para a mais grossa. */
const SUBDIVISIONS: readonly number[] = [5, 4, 2];

/** Espaço mínimo, em px, entre traços menores. */
const MIN_MINOR_SPACING_PX = 8;

/** Espaço mínimo padrão, em px, entre rótulos de traços maiores. */
const DEFAULT_MIN_LABEL_SPACING_PX = 80;

/** Traço da régua, com posição em ms e em px. */
export interface RulerTick {
  ms: number;
  x: number;
  major: boolean;
  label: string | null;
}

interface ResolvedSteps {
  majorMs: number;
  minorMs: number;
  subdivisions: number;
}

/** Resolve o passo maior e a subdivisão menor para um zoom dado. */
function resolveSteps(zoomPxPerSec: number, minLabelSpacingPx: number): ResolvedSteps {
  const majorMs =
    MAJOR_STEPS_MS.find((step) => (step / 1000) * zoomPxPerSec >= minLabelSpacingPx) ??
    MAX_STEP_MS;
  const subdivisions =
    SUBDIVISIONS.find((n) => ((majorMs / n) / 1000) * zoomPxPerSec >= MIN_MINOR_SPACING_PX) ?? 1;
  return { majorMs, minorMs: majorMs / subdivisions, subdivisions };
}

/** Escolhe o passo dos traços maiores e menores para o zoom (px por segundo) dado. */
export function chooseTickStep(
  zoomPxPerSec: number,
  minLabelSpacingPx = DEFAULT_MIN_LABEL_SPACING_PX,
): { majorMs: number; minorMs: number } {
  const { majorMs, minorMs } = resolveSteps(zoomPxPerSec, minLabelSpacingPx);
  return { majorMs, minorMs };
}

/** Formata o rótulo de um traço maior: décimos abaixo de 1 s, senão `M:SS` ou `H:MM:SS`. */
export function formatRulerLabel(ms: number, majorMs: number): string {
  const safeMs = Math.max(0, ms);
  if (majorMs < 1000) {
    const totalTenths = Math.floor(safeMs / 100);
    const tenths = totalTenths % 10;
    const totalSeconds = Math.floor(totalTenths / 10);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }
  return formatDuration(safeMs);
}

/** Calcula os traços da régua entre `startMs` e `endMs`, com posição em px relativa ao tempo 0. */
export function computeTicks(
  startMs: number,
  endMs: number,
  zoomPxPerSec: number,
): RulerTick[] {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return [];
  }
  if (!(zoomPxPerSec > 0) || !Number.isFinite(zoomPxPerSec)) {
    return [];
  }
  const { majorMs, subdivisions } = resolveSteps(zoomPxPerSec, DEFAULT_MIN_LABEL_SPACING_PX);
  const kFrom = Math.floor((startMs * subdivisions) / majorMs);
  const kTo = Math.ceil((endMs * subdivisions) / majorMs);
  const ticks: RulerTick[] = [];
  for (let k = kFrom; k <= kTo; k++) {
    const ms = Math.round((k * majorMs) / subdivisions);
    if (ms < startMs || ms > endMs) {
      continue;
    }
    const major = k % subdivisions === 0;
    ticks.push({
      ms,
      x: (ms / 1000) * zoomPxPerSec,
      major,
      label: major ? formatRulerLabel(ms, majorMs) : null,
    });
  }
  return ticks;
}
