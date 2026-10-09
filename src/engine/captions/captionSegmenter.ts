// Divide a transcrição do Whisper em legendas curtas: limpa o texto, junta pedaços curtos,
// quebra frases longas (fim de frase, depois vírgula, depois espaço) e garante tempos sem sobreposição.

/** Trecho de texto com tempo, em ms. */
export interface TimedText {
  text: string;
  startMs: number;
  endMs: number;
}

/** Opções da segmentação; os valores padrão seguem o padrão de legendas. */
export interface SegmentOptions {
  /** Máximo de caracteres por legenda; padrão 42. */
  maxChars?: number;
  /** Máxima duração de uma legenda, em ms; padrão 5000. */
  maxDurationMs?: number;
  /** Mínima duração de uma legenda, em ms; padrão 700. */
  minDurationMs?: number;
}

/** Opções já resolvidas, com todos os valores preenchidos. */
interface ResolvedOptions {
  maxChars: number;
  maxDurationMs: number;
  minDurationMs: number;
}

/** Intervalo máximo entre dois pedaços para que possam ser juntados, em ms. */
const MAX_JOIN_GAP_MS = 1000;

/** Divide a transcrição em legendas prontas para exibir. */
export function segmentCaptions(chunks: TimedText[], options: SegmentOptions = {}): TimedText[] {
  const resolved = resolveOptions(options);
  const cleaned = [...chunks]
    .sort((a, b) => a.startMs - b.startMs)
    .map(sanitizeChunk)
    .filter((chunk): chunk is TimedText => chunk !== null);
  const joined = joinShortChunks(cleaned, resolved);
  const split = joined.flatMap((piece) => splitLongPiece(piece, resolved));
  return fixTiming(split, resolved.minDurationMs);
}

/** Preenche as opções ausentes com os valores padrão. */
function resolveOptions(options: SegmentOptions): ResolvedOptions {
  return {
    maxChars: Math.max(1, options.maxChars ?? 42),
    maxDurationMs: Math.max(1, options.maxDurationMs ?? 5000),
    minDurationMs: Math.max(0, options.minDurationMs ?? 700),
  };
}

/** Limpa um trecho: remove marcadores, apara espaços e descarta o que não tem letra nem número. */
function sanitizeChunk(chunk: TimedText): TimedText | null {
  const text = cleanText(chunk.text);
  if (text === '' || !/[\p{L}\p{N}]/u.test(text)) {
    return null;
  }
  const startMs = Math.max(0, Math.round(chunk.startMs));
  const endMs = Math.max(Math.round(chunk.endMs), startMs + 1);
  return { text, startMs, endMs };
}

/** Remove marcadores como [Música], [BLANK_AUDIO] e símbolos de nota; um texto só entre parênteses (ex.: (risos)) vira vazio. */
function cleanText(raw: string): string {
  const withoutBrackets = raw.replace(/\[[^\]]*\]/g, ' ').replace(/[♪♫]+/g, ' ');
  const text = withoutBrackets.replace(/\s+/g, ' ').trim();
  if (/^\([^)]*\)$/.test(text)) {
    return '';
  }
  return text;
}

/** Junta pedaços curtos, mas nunca cruza fim de frase; prefere parar depois de vírgula quando já há texto suficiente. */
function joinShortChunks(chunks: TimedText[], options: ResolvedOptions): TimedText[] {
  const joined: TimedText[] = [];
  let current: TimedText | null = null;
  for (const chunk of chunks) {
    if (current === null) {
      current = { ...chunk };
      continue;
    }
    const endsSentence = /[.!?…]$/.test(current.text);
    const endsClause = /[,;:]$/.test(current.text) && current.text.length >= options.maxChars / 2;
    const mustBreak = endsSentence || endsClause;
    const mergedText: string = `${current.text} ${chunk.text}`;
    const mergedDuration = chunk.endMs - current.startMs;
    const gap = chunk.startMs - current.endMs;
    const canJoin =
      !mustBreak &&
      gap <= MAX_JOIN_GAP_MS &&
      mergedText.length <= options.maxChars &&
      mergedDuration <= options.maxDurationMs;
    if (canJoin) {
      current = { text: mergedText, startMs: current.startMs, endMs: chunk.endMs };
    } else {
      joined.push(current);
      current = { ...chunk };
    }
  }
  if (current !== null) {
    joined.push(current);
  }
  return joined;
}

/** Quebra um pedaço em legendas: cada frase começa uma legenda nova; frases longas são quebradas e o tempo segue os caracteres. */
function splitLongPiece(piece: TimedText, options: ResolvedOptions): TimedText[] {
  const duration = piece.endMs - piece.startMs;
  const partCount = Math.max(
    Math.ceil(piece.text.length / options.maxChars),
    Math.ceil(duration / options.maxDurationMs),
    1,
  );
  const lines = wrapCaptions(piece.text, options.maxChars, partCount);
  if (lines.length === 1) {
    return [piece];
  }
  const totalWeight = lines.reduce((sum, line) => sum + line.length, 0);
  let consumed = 0;
  return lines.map((line, index) => {
    const startFraction = consumed / totalWeight;
    consumed += line.length;
    const endFraction = consumed / totalWeight;
    const isLast = index === lines.length - 1;
    return {
      text: line,
      startMs: piece.startMs + Math.round(duration * startFraction),
      endMs: isLast ? piece.endMs : piece.startMs + Math.round(duration * endFraction),
    };
  });
}

/** Quebra o texto em legendas; se faltarem partes para caber na duração, aperta o limite de caracteres. */
function wrapCaptions(text: string, maxChars: number, partCount: number): string[] {
  const lines = wrapText(text, maxChars);
  if (lines.length >= partCount) return lines;
  return wrapText(text, Math.max(1, Math.ceil(text.length / partCount)));
}

/** Separa por frase (. ! ? …) e quebra cada frase que passa de maxChars. */
function wrapText(text: string, maxChars: number): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .filter((sentence) => sentence !== '')
    .flatMap((sentence) => wrapSentence(sentence, maxChars));
}

/** Quebra uma frase em trechos de até maxChars, repetindo a escolha de corte no que sobra. */
function wrapSentence(sentence: string, maxChars: number): string[] {
  const lines: string[] = [];
  let rest = sentence;
  while (rest.length > maxChars) {
    const cut = findCut(rest, maxChars);
    if (cut === -1) break;
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest !== '') lines.push(rest);
  return lines;
}

/** Posição do corte dentro de maxChars: a última vírgula/;/: (se já for metade do limite), senão o último espaço; -1 se não houver. */
function findCut(text: string, maxChars: number): number {
  const limit = Math.min(maxChars, text.length - 1);
  let clauseCut = -1;
  let spaceCut = -1;
  for (let i = limit; i >= 1; i -= 1) {
    if (text[i] !== ' ') continue;
    if (clauseCut === -1 && /[,;:]/.test(text[i - 1] ?? '')) clauseCut = i;
    if (spaceCut === -1) spaceCut = i;
    if (clauseCut !== -1) break;
  }
  if (clauseCut !== -1 && clauseCut >= maxChars / 2) return clauseCut;
  return spaceCut;
}

/** Garante ordem, duração mínima e nenhuma sobreposição: o fim de cada legenda não passa do início da próxima. */
function fixTiming(pieces: TimedText[], minDurationMs: number): TimedText[] {
  const ordered: TimedText[] = [];
  let previousEnd = 0;
  for (const piece of pieces) {
    const startMs = Math.max(piece.startMs, previousEnd);
    const endMs = Math.max(piece.endMs, startMs + 1);
    ordered.push({ text: piece.text, startMs, endMs });
    previousEnd = endMs;
  }
  return ordered.map((piece, index) => {
    const next = ordered[index + 1];
    const wantedEnd = Math.max(piece.endMs, piece.startMs + minDurationMs);
    const endMs = next === undefined ? wantedEnd : Math.min(wantedEnd, next.startMs);
    return { text: piece.text, startMs: piece.startMs, endMs };
  });
}
