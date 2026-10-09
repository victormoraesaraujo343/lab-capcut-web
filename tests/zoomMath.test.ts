import { describe, expect, it } from 'vitest';
import { msToPx, pxToMs } from '@/engine/timeline/snap';
import { TIMELINE_TAIL_MS } from '@/features/timeline/layout';
import { contentWidthPx, wheelZoomFactor, zoomAroundPoint } from '@/features/timeline/zoomMath';

describe('zoomAroundPoint', () => {
  it('mantém o tempo sob o ponteiro ao aproximar', () => {
    const oldZoom = 100;
    const newZoom = 200;
    const scrollLeft = 50;
    const pointerX = 300;
    const timeUnder = pxToMs(scrollLeft + pointerX, oldZoom);
    const nextScroll = zoomAroundPoint(oldZoom, newZoom, scrollLeft, pointerX);
    expect(pxToMs(nextScroll + pointerX, newZoom)).toBeCloseTo(timeUnder, 6);
  });

  it('mantém o tempo sob o ponteiro ao afastar', () => {
    const timeUnder = pxToMs(1200 + 80, 400);
    const nextScroll = zoomAroundPoint(400, 150, 1200, 80);
    expect(pxToMs(nextScroll + 80, 150)).toBeCloseTo(timeUnder, 6);
  });

  it('nunca devolve rolagem negativa', () => {
    expect(zoomAroundPoint(100, 10, 0, 500)).toBe(0);
  });
});

describe('contentWidthPx', () => {
  it('soma a folga final à duração', () => {
    expect(contentWidthPx(10_000, 100, 200)).toBe(msToPx(10_000 + TIMELINE_TAIL_MS, 100));
  });

  it('nunca fica menor que a área visível', () => {
    expect(contentWidthPx(0, 10, 5000)).toBe(5000);
  });
});

describe('wheelZoomFactor', () => {
  it('não altera o zoom sem movimento', () => {
    expect(wheelZoomFactor(0)).toBe(1);
  });

  it('aproxima com a roda para cima e afasta para baixo', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
  });
});
