import { describe, expect, it } from 'vitest';
import { computeEditorLayout, PREVIEW_MIN_WIDTH } from '../src/features/editor/editorLayout';

const sizes = { mediaWidth: 300, inspectorWidth: 300, timelineHeight: 280 };

describe('computeEditorLayout', () => {
  it('mantém os tamanhos em janela larga', () => {
    const layout = computeEditorLayout(1600, 900, sizes);
    expect(layout).toEqual({
      mediaWidth: 300,
      inspectorWidth: 300,
      timelineHeight: 280,
      showMedia: true,
      showInspector: true,
    });
  });

  it('encolhe os painéis laterais em 900 px sem escondê-los', () => {
    const layout = computeEditorLayout(900, 900, sizes);
    expect(layout.showMedia).toBe(true);
    expect(layout.showInspector).toBe(true);
    expect(layout.mediaWidth).toBeLessThan(300);
    expect(layout.inspectorWidth).toBeLessThan(300);
    expect(layout.mediaWidth).toBeGreaterThanOrEqual(200);
    expect(layout.inspectorWidth).toBeGreaterThanOrEqual(200);
    expect(900 - layout.mediaWidth - layout.inspectorWidth - 8).toBeGreaterThanOrEqual(PREVIEW_MIN_WIDTH);
  });

  it('esconde propriedades em 700 px', () => {
    const layout = computeEditorLayout(700, 900, sizes);
    expect(layout.showInspector).toBe(false);
    expect(layout.showMedia).toBe(true);
    expect(layout.mediaWidth).toBe(200);
  });

  it('esconde os dois painéis laterais em 450 px', () => {
    const layout = computeEditorLayout(450, 900, sizes);
    expect(layout.showInspector).toBe(false);
    expect(layout.showMedia).toBe(false);
  });

  it('encolhe a timeline até 150 px quando falta altura', () => {
    expect(computeEditorLayout(1600, 400, sizes).timelineHeight).toBe(150);
    expect(computeEditorLayout(1600, 346, sizes).timelineHeight).toBe(150);
  });

  it('reduz a timeline só o necessário para a linha do meio ter 220 px', () => {
    expect(computeEditorLayout(1600, 432, sizes).timelineHeight).toBe(164);
  });

  it('não altera os tamanhos recebidos', () => {
    const copy = { ...sizes };
    computeEditorLayout(450, 346, sizes);
    expect(sizes).toEqual(copy);
  });
});
