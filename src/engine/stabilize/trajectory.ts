// Trajetória da câmera: soma os deslocamentos, suaviza, calcula a compensação e o zoom mínimo para esconder as bordas.

/** Deslocamento entre dois quadros seguidos, em pixels. */
export interface Shift {
  dx: number;
  dy: number;
}

/** Ponto da trajetória, em pixels. */
export interface Point {
  x: number;
  y: number;
}

/** Zoom máximo permitido para esconder as bordas (25%). */
const MAX_CROP_SCALE = 1.25;

/** Trajetória acumulada: soma dos deslocamentos até cada quadro (o primeiro deslocamento é a origem). */
export function accumulate(shifts: Shift[]): Point[] {
  let x = 0;
  let y = 0;
  return shifts.map((shift) => {
    x += shift.dx;
    y += shift.dy;
    return { x, y };
  });
}

/** Média móvel da trajetória com janela de ±radius amostras (a janela encolhe nas pontas). */
export function smooth(points: Point[], radius: number): Point[] {
  const r = Math.max(0, Math.floor(radius));
  const n = points.length;
  const prefixX = new Float64Array(n + 1);
  const prefixY = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const p = points[i];
    prefixX[i + 1] = (prefixX[i] ?? 0) + (p?.x ?? 0);
    prefixY[i + 1] = (prefixY[i] ?? 0) + (p?.y ?? 0);
  }
  return points.map((_, i) => {
    const lo = Math.max(0, i - r);
    const hi = Math.min(n - 1, i + r);
    const count = hi - lo + 1;
    return {
      x: ((prefixX[hi + 1] ?? 0) - (prefixX[lo] ?? 0)) / count,
      y: ((prefixY[hi + 1] ?? 0) - (prefixY[lo] ?? 0)) / count,
    };
  });
}

/** Compensação por quadro: quanto o quadro precisa andar para ir do caminho bruto ao suavizado (suavizado − bruto). */
export function compensation(raw: Point[], smoothed: Point[]): Shift[] {
  const count = Math.min(raw.length, smoothed.length);
  const out: Shift[] = [];
  for (let i = 0; i < count; i++) {
    const r = raw[i];
    const s = smoothed[i];
    out.push({ dx: (s?.x ?? 0) - (r?.x ?? 0), dy: (s?.y ?? 0) - (r?.y ?? 0) });
  }
  return out;
}

/** Zoom mínimo (escala) para que a imagem deslocada continue cobrindo o quadro; limitado a 1.25. Use w e h = tamanho exibido do clipe, em px do projeto. */
export function cropScaleFor(compensations: Shift[], w: number, h: number): number {
  let worst = 0;
  if (w > 0 && h > 0) {
    for (const c of compensations) {
      worst = Math.max(worst, Math.abs(c.dx) / w, Math.abs(c.dy) / h);
    }
  }
  return Math.min(MAX_CROP_SCALE, Math.max(1, 1 + 2 * worst));
}
