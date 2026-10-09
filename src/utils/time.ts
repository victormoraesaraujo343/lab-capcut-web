const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

/** Preenche um número com zero à esquerda até ter pelo menos 2 dígitos. */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Formata uma duração em ms como `m:ss` ou `h:mm:ss`, arredondando os segundos para baixo. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / SECOND_MS));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${minutes}:${pad2(seconds)}`;
}

/** Formata uma posição em ms como timecode `HH:MM:SS:FF` para a taxa de quadros dada. */
export function formatTimecode(ms: number, fps: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / SECOND_MS);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const frames =
    Number.isFinite(fps) && fps > 0 ? Math.floor(((safeMs % SECOND_MS) * fps) / SECOND_MS) : 0;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}:${pad2(frames)}`;
}

/** Formata um timestamp como data relativa em pt-BR (ex.: "há 5 min", "ontem"), usando data curta após 7 dias. */
export function formatRelativeDate(timestamp: number, now: number = Date.now()): string {
  const diff = now - timestamp;
  if (diff < MINUTE_MS) {
    return 'agora';
  }
  if (diff < HOUR_MS) {
    return `há ${Math.floor(diff / MINUTE_MS)} min`;
  }
  if (diff < DAY_MS) {
    return `há ${Math.floor(diff / HOUR_MS)} h`;
  }
  if (diff < 2 * DAY_MS) {
    return 'ontem';
  }
  if (diff <= WEEK_MS) {
    return `há ${Math.floor(diff / DAY_MS)} dias`;
  }
  return dateFormatter.format(new Date(timestamp));
}
