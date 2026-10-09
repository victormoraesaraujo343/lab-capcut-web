// Construtores de figurinhas em SVG 256×256: formas, ícones do lucide (ISC) e decorativos. Funções puras, só geram texto.
import { STICKER_ICONS } from './stickerIcons.generated';

/** Forma de fundo de uma figurinha com ícone. */
export type BadgeShape = 'circle' | 'roundedSquare' | 'burst' | 'speech' | 'tag' | 'none';

/** Opções visuais de uma figurinha com ícone. */
export interface BadgeOptions {
  /** Forma do fundo. */
  shape: BadgeShape;
  /** Cor do fundo da forma (CSS). */
  bg: string;
  /** Cor do ícone (CSS). */
  fg: string;
  /** Cor do contorno da forma (CSS); sem ele, a forma não tem contorno. */
  strokeBg?: string;
  /** Ícone preenchido em vez de só traço. */
  filled?: boolean;
}

const SIZE = 256;
const CENTER = 128;
const ICON_PX = 140;
const ICON_SCALE = ICON_PX / 24;
const ICON_STROKE = 2.2;
const SHADOW_ID = 'stk-shadow';

/** Escapa texto para uso dentro de SVG. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Monta atributos XML a partir de um registro, com valores escapados. */
function attrText(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('');
}

/** Diz se existe um ícone com esse id na biblioteca de figurinhas. */
export function hasIcon(iconId: string): boolean {
  return STICKER_ICONS[iconId] !== undefined;
}

/** Envolve o conteúdo num documento SVG válido com a sombra suave definida. */
export function wrapSvg(body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<defs><filter id="${SHADOW_ID}" x="-20%" y="-20%" width="140%" height="140%">` +
    `<feDropShadow dx="0" dy="6" stdDeviation="7" flood-color="#000000" flood-opacity="0.28"/>` +
    `</filter></defs>${body}</svg>`
  );
}

/** Atributos de preenchimento e contorno de uma forma. */
function paint(fill: string, strokeBg?: string): string {
  const stroke = strokeBg === undefined ? '' : ` stroke="${escapeXml(strokeBg)}" stroke-width="10" stroke-linejoin="round"`;
  return ` fill="${escapeXml(fill)}"${stroke}`;
}

/** Vértices de uma estrela de N pontas, alternando raio externo e interno. */
function starPoints(points: number, outer: number, inner: number): string {
  const coords: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (Math.PI * i) / points - Math.PI / 2;
    const x = CENTER + radius * Math.cos(angle);
    const y = CENTER + radius * Math.sin(angle);
    coords.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return coords.join(' ');
}

/** Elementos SVG da forma de fundo de uma figurinha com ícone. */
function shapeBody(opts: BadgeOptions): string {
  const p = paint(opts.bg, opts.strokeBg);
  switch (opts.shape) {
    case 'circle':
      return `<circle cx="${CENTER}" cy="${CENTER}" r="112"${p}/>`;
    case 'roundedSquare':
      return `<rect x="20" y="20" width="216" height="216" rx="56"${p}/>`;
    case 'burst':
      return `<polygon points="${starPoints(14, 124, 102)}"${p}/>`;
    case 'speech':
      return `<rect x="24" y="24" width="208" height="164" rx="48"${p}/><polygon points="72,176 56,234 124,184"${p}/>`;
    case 'tag':
      return (
        `<path d="M40 40 L150 40 Q168 40 180 54 L232 128 L180 202 Q168 216 150 216 L40 216 Q28 216 28 204 L28 52 Q28 40 40 40 Z"${p}/>` +
        `<circle cx="62" cy="128" r="13" fill="#ffffff"/>`
      );
    case 'none':
      return '';
  }
}

/** Grupo do ícone centralizado, com traço ou preenchimento na cor do ícone. */
function iconGroup(iconId: string, fg: string, filled: boolean): string {
  const nodes = STICKER_ICONS[iconId];
  if (nodes === undefined) return '';
  const inner = nodes.map(([tag, attrs]) => `<${tag}${attrText(attrs)}/>`).join('');
  const offset = CENTER - ICON_PX / 2;
  const fill = filled ? escapeXml(fg) : 'none';
  return (
    `<g transform="translate(${offset} ${offset}) scale(${ICON_SCALE.toFixed(4)})" fill="${fill}" ` +
    `stroke="${escapeXml(fg)}" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`
  );
}

/** Figurinha com um ícone do lucide centralizado sobre uma forma colorida, com sombra suave. */
export function badge(iconId: string, opts: BadgeOptions): string {
  const icon = iconGroup(iconId, opts.fg, opts.filled === true);
  return wrapSvg(`<g filter="url(#${SHADOW_ID})">${shapeBody(opts)}${icon}</g>`);
}

/** Estrela cheia de cinco pontas. */
export function starShape(fill: string): string {
  return wrapSvg(`<g filter="url(#${SHADOW_ID})"><polygon points="${starPoints(5, 120, 50)}"${paint(fill, '#ffffff')}/></g>`);
}

/** Coração cheio. */
export function heartShape(fill: string): string {
  const d = 'M128 220 C40 160 24 120 24 88 C24 52 52 28 84 28 C104 28 120 40 128 56 C136 40 152 28 172 28 C204 28 232 52 232 88 C232 120 216 160 128 220 Z';
  return wrapSvg(`<g filter="url(#${SHADOW_ID})"><path d="${d}"${paint(fill)}/></g>`);
}

/** Brilho de quatro pontas. */
export function sparkleShape(fill: string): string {
  const d = 'M128 16 C136 104 152 120 240 128 C152 136 136 152 128 240 C120 152 104 136 16 128 C104 120 120 104 128 16 Z';
  return wrapSvg(`<g filter="url(#${SHADOW_ID})"><path d="${d}"${paint(fill)}/></g>`);
}

/** Balão de fala com três reticências. */
export function speechBubble(bg: string, dots: string): string {
  const dotShapes = [84, 128, 172].map((cx) => `<circle cx="${cx}" cy="106" r="13" fill="${escapeXml(dots)}"/>`).join('');
  return wrapSvg(
    `<g filter="url(#${SHADOW_ID})"><rect x="24" y="36" width="208" height="150" rx="56"${paint(bg)}/>` +
      `<polygon points="72,178 56,236 128,186"${paint(bg)}/>${dotShapes}</g>`,
  );
}

/** Seta grossa curva, terminando em ponta. */
export function curvedArrow(fg: string): string {
  const color = escapeXml(fg);
  return wrapSvg(
    `<g filter="url(#${SHADOW_ID})"><path d="M48 204 C48 112 110 72 186 84" fill="none" stroke="${color}" stroke-width="26" stroke-linecap="round"/>` +
      `<polygon points="152,38 228,84 170,128"${paint(fg)}/></g>`,
  );
}

/** Etiqueta com texto em negrito: pílula arredondada ou explosão (burst). */
export function textBadge(text: string, bg: string, fg: string, burst = false): string {
  const length = Math.max(1, Array.from(text).length);
  const size = Math.round(Math.min(72, 200 / (length * 0.62)));
  const shape = burst
    ? `<polygon points="${starPoints(12, 124, 100)}"${paint(bg, '#ffffff')}/>`
    : `<rect x="16" y="88" width="224" height="80" rx="40"${paint(bg, '#ffffff')}/>`;
  const label =
    `<text x="${CENTER}" y="${CENTER + size * 0.36}" text-anchor="middle" font-family="Inter, sans-serif" ` +
    `font-weight="800" font-size="${size}" fill="${escapeXml(fg)}">${escapeXml(text)}</text>`;
  return wrapSvg(`<g filter="url(#${SHADOW_ID})">${shape}${label}</g>`);
}
