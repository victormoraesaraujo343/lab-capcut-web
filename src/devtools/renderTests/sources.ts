// Fontes sintéticas determinísticas para os testes de render: imagens desenhadas em OffscreenCanvas 2D e um provider de quadros.
import type { Asset, FrameImage, FrameProvider } from '@/types';

/** Largura padrão das fontes sintéticas (igual ao projeto de teste). */
export const SOURCE_WIDTH = 320;
/** Altura padrão das fontes sintéticas (igual ao projeto de teste). */
export const SOURCE_HEIGHT = 180;

/** Quadro que um provider sintético pode devolver. */
export type SyntheticFrame = ImageBitmap | OffscreenCanvas;

/** Gerador de quadro por instante de mídia, indexado pelo id do asset. */
export type SyntheticSource = (mediaTimeMs: number) => SyntheticFrame;

/** Tipo de fonte que frameAt sabe desenhar. */
export type SourceKind = 'gradient' | 'greenScreen';

/** Chamada registrada pelo provider: qual asset e em que tempo de mídia foi pedido. */
export interface SyntheticCall {
  /** Id do asset pedido. */
  assetId: string;
  /** Tempo de mídia pedido, em ms. */
  mediaTimeMs: number;
}

/** Provider sintético: um FrameProvider que também guarda os pedidos feitos. */
export interface SyntheticProvider extends FrameProvider {
  /** Pedidos de quadro recebidos, na ordem. */
  readonly calls: SyntheticCall[];
}

/** Gerador pseudoaleatório determinístico (mulberry32): mesma semente, mesma sequência. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cria um canvas 2D offscreen do tamanho dado. */
function createCanvas(width: number, height: number): { canvas: OffscreenCanvas; ctx: OffscreenCanvasRenderingContext2D } {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('synthetic-canvas-2d-unavailable');
  return { canvas, ctx };
}

/** Cartão com gradiente, grade, formas coloridas e uma letra 'A' grande deslocada para a esquerda (assimétrico, pega inversões). */
export function gradientCard(width: number, height: number, seed: number): OffscreenCanvas {
  const { canvas, ctx } = createCanvas(width, height);
  const rng = seededRandom(seed);
  const hue1 = (seed * 47) % 360;
  const hue2 = (hue1 + 120 + rng() * 60) % 360;

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, `hsl(${hue1} 70% 35%)`);
  gradient.addColorStop(1, `hsl(${hue2} 75% 55%)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += width / 8) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += height / 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  for (let i = 0; i < 4; i++) {
    const hue = (hue1 + 40 + i * 70) % 360;
    ctx.fillStyle = `hsl(${hue} 90% 60%)`;
    const w = width * (0.12 + rng() * 0.18);
    const h = height * (0.12 + rng() * 0.2);
    ctx.fillRect(rng() * (width - w), rng() * (height - h), w, h);
  }
  ctx.fillStyle = `hsl(${(hue1 + 200) % 360} 85% 65%)`;
  ctx.beginPath();
  ctx.arc(width * 0.78, height * 0.7, height * 0.14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,140,0,0.22)';
  ctx.fillRect(0, height * 0.7, width, height * 0.3);

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, width * 0.06, height * 0.06);

  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(height * 0.8)}px "Inter"`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('A', width * 0.08, height * 0.02);
  return canvas;
}

/** Pessoa simplificada (cabeça e busto coloridos) sobre verde puro #00ff00, para testar chroma key. */
export function greenScreenCard(width: number, height: number): OffscreenCanvas {
  const { canvas, ctx } = createCanvas(width, height);
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#c68642';
  ctx.beginPath();
  ctx.arc(width * 0.5, height * 0.3, height * 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#3050c0';
  ctx.beginPath();
  ctx.roundRect(width * 0.3, height * 0.48, width * 0.4, height * 0.6, [height * 0.18, height * 0.18, 0, 0]);
  ctx.fill();

  ctx.fillStyle = '#ffd400';
  ctx.fillRect(width * 0.3, height * 0.72, width * 0.4, height * 0.05);
  return canvas;
}

/** Quadro que muda com o tempo: fonte do tipo dado, com o número do quadro (30 fps) e uma barra que anda. */
export function frameAt(kind: SourceKind, timeMs: number, width = SOURCE_WIDTH, height = SOURCE_HEIGHT): OffscreenCanvas {
  const base = kind === 'gradient' ? gradientCard(width, height, 7) : greenScreenCard(width, height);
  const { canvas, ctx } = createCanvas(width, height);
  ctx.drawImage(base, 0, 0);

  const barX = ((timeMs / 1000) * 0.25 % 1) * width;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(barX, height * 0.86, width * 0.1, height * 0.05);

  const frameNumber = Math.round((timeMs * 30) / 1000);
  ctx.fillStyle = '#000000';
  ctx.fillRect(width * 0.03, height * 0.03, width * 0.34, height * 0.14);
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(height * 0.1)}px "JetBrains Mono"`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(`F${frameNumber}`, width * 0.05, height * 0.05);
  return canvas;
}

/** Cria um provider de quadros sintéticos: cada asset do mapa desenha o quadro do seu gerador; sem decodificar vídeo. */
export function createSyntheticProvider(map: Record<string, SyntheticSource>): SyntheticProvider {
  const calls: SyntheticCall[] = [];
  return {
    calls,
    getFrame(asset: Asset, mediaTimeMs: number): Promise<FrameImage | null> {
      calls.push({ assetId: asset.id, mediaTimeMs });
      const source = map[asset.id];
      if (!source) return Promise.resolve(null);
      return Promise.resolve(source(mediaTimeMs));
    },
    prefetch(): void {
      // Sem decodificação: nada a pré-carregar.
    },
    releaseFrame(): void {
      // Os quadros são canvas próprios; não há o que fechar.
    },
    closeAsset(): void {
      // Sem recursos por asset.
    },
    dispose(): void {
      // Sem recursos a liberar.
    },
  };
}
