// Catálogo das 100 figurinhas: ícones do lucide (ISC) em formas coloridas, mais decorativos próprios.
import { t } from '@/i18n/pt-BR';
import { badge, curvedArrow, heartShape, sparkleShape, speechBubble, starShape, textBadge, type BadgeShape } from './stickerArt';

/** Categorias do painel de figurinhas. */
export type StickerCategory = 'emotions' | 'arrows' | 'badges' | 'nature' | 'party' | 'social' | 'food' | 'misc';

/** Figurinha do catálogo: id único, categoria, chave do nome em t.stickers.names e o SVG gerado. */
export interface StickerDef {
  /** Identificador único (também o nome do asset no projeto). */
  id: string;
  /** Categoria do painel. */
  category: StickerCategory;
  /** Chave do rótulo em t.stickers.names (igual ao id). */
  labelKey: string;
  /** Gera o SVG 256×256 da figurinha. */
  svg: () => string;
}

const PINK = '#ff3d7f';
const ORANGE = '#ff8a00';
const YELLOW = '#ffd000';
const LIME = '#7ed321';
const TEAL = '#00c2a8';
const BLUE = '#2d7dff';
const SKY = '#38bdf8';
const PURPLE = '#8b5cf6';
const RED = '#ff3b30';
const GREEN = '#16a34a';
const NAVY = '#1e1b4b';
const CYAN = '#22d3ee';
const BROWN = '#8b5a2b';
const INK = '#111111';
const WHITE = '#ffffff';

/** Figurinha com um ícone do lucide numa forma colorida. */
function ic(
  id: string,
  category: StickerCategory,
  icon: string,
  shape: BadgeShape,
  bg: string,
  fg: string,
  filled = false,
): StickerDef {
  return { id, category, labelKey: id, svg: () => badge(icon, { shape, bg, fg, filled }) };
}

/** Figurinha decorativa, sem ícone do lucide. */
function dc(id: string, category: StickerCategory, build: () => string): StickerDef {
  return { id, category, labelKey: id, svg: build };
}

/** Categorias na ordem do painel, com o rótulo em português. */
export const STICKER_CATEGORIES: { id: StickerCategory; label: string }[] = [
  { id: 'emotions', label: t.stickers.categories.emotions },
  { id: 'arrows', label: t.stickers.categories.arrows },
  { id: 'badges', label: t.stickers.categories.badges },
  { id: 'nature', label: t.stickers.categories.nature },
  { id: 'party', label: t.stickers.categories.party },
  { id: 'social', label: t.stickers.categories.social },
  { id: 'food', label: t.stickers.categories.food },
  { id: 'misc', label: t.stickers.categories.misc },
];

/** As 100 figurinhas do catálogo, em ordem de categoria. */
export const STICKERS: StickerDef[] = [
  ic('smile', 'emotions', 'smile', 'circle', PINK, WHITE),
  ic('laugh', 'emotions', 'laugh', 'circle', YELLOW, INK),
  ic('frown', 'emotions', 'frown', 'circle', BLUE, WHITE),
  ic('heart', 'emotions', 'heart', 'none', PINK, PINK, true),
  ic('thumbs-up', 'emotions', 'thumbs-up', 'roundedSquare', TEAL, WHITE),
  ic('hand', 'emotions', 'hand', 'roundedSquare', ORANGE, WHITE),
  ic('sparkles', 'emotions', 'sparkles', 'circle', PURPLE, WHITE),
  ic('smile-speech', 'emotions', 'smile', 'speech', CYAN, INK),
  ic('heart-speech', 'emotions', 'heart', 'speech', PINK, WHITE, true),
  dc('star-filled', 'emotions', () => starShape(YELLOW)),
  dc('heart-filled', 'emotions', () => heartShape(RED)),
  dc('sparkle', 'emotions', () => sparkleShape(CYAN)),

  ic('arrow-right', 'arrows', 'arrow-right', 'circle', BLUE, WHITE),
  ic('arrow-left', 'arrows', 'arrow-left', 'circle', BLUE, WHITE),
  ic('arrow-up', 'arrows', 'arrow-up', 'circle', GREEN, WHITE),
  ic('arrow-down', 'arrows', 'arrow-down', 'circle', RED, WHITE),
  ic('corner-down-right', 'arrows', 'corner-down-right', 'roundedSquare', YELLOW, INK),
  ic('arrow-right-square', 'arrows', 'arrow-right', 'roundedSquare', PINK, WHITE),
  ic('arrow-up-burst', 'arrows', 'arrow-up', 'burst', ORANGE, WHITE),
  ic('arrow-down-tag', 'arrows', 'arrow-down', 'tag', NAVY, WHITE),
  ic('arrow-left-speech', 'arrows', 'arrow-left', 'speech', TEAL, WHITE),
  ic('corner-burst', 'arrows', 'corner-down-right', 'burst', LIME, INK),
  dc('curved-arrow', 'arrows', () => curvedArrow(ORANGE)),
  dc('curved-arrow-blue', 'arrows', () => curvedArrow(BLUE)),

  ic('check', 'badges', 'check', 'circle', GREEN, WHITE),
  ic('x', 'badges', 'x', 'circle', RED, WHITE),
  ic('percent', 'badges', 'percent', 'roundedSquare', PINK, WHITE),
  ic('trophy', 'badges', 'trophy', 'burst', YELLOW, INK),
  ic('medal', 'badges', 'medal', 'circle', ORANGE, WHITE),
  ic('gem', 'badges', 'gem', 'roundedSquare', CYAN, WHITE),
  ic('crown', 'badges', 'crown', 'burst', YELLOW, NAVY),
  ic('target', 'badges', 'target', 'circle', RED, WHITE),
  dc('label-new', 'badges', () => textBadge('NOVO', PINK, WHITE)),
  dc('label-wow', 'badges', () => textBadge('UAU!', YELLOW, INK, true)),
  dc('label-off', 'badges', () => textBadge('OFF', RED, WHITE, true)),
  dc('label-sale', 'badges', () => textBadge('PROMO', BLUE, WHITE)),
  dc('label-hot', 'badges', () => textBadge('HOT', ORANGE, WHITE)),
  dc('label-live', 'badges', () => textBadge('AO VIVO', RED, WHITE)),
  dc('label-free', 'badges', () => textBadge('GRÁTIS', TEAL, WHITE)),
  dc('label-ok', 'badges', () => textBadge('OK', GREEN, WHITE, true)),

  ic('sun', 'nature', 'sun', 'circle', YELLOW, ORANGE),
  ic('moon', 'nature', 'moon', 'circle', NAVY, YELLOW),
  ic('cloud', 'nature', 'cloud', 'circle', CYAN, WHITE),
  ic('umbrella', 'nature', 'umbrella', 'roundedSquare', BLUE, WHITE),
  ic('snowflake', 'nature', 'snowflake', 'circle', '#a5f3fc', BLUE),
  ic('flower', 'nature', 'flower', 'circle', PINK, WHITE),
  ic('leaf', 'nature', 'leaf', 'circle', GREEN, WHITE),
  ic('flame', 'nature', 'flame', 'burst', ORANGE, YELLOW, true),
  ic('zap', 'nature', 'zap', 'burst', YELLOW, INK, true),
  ic('leaf-speech', 'nature', 'leaf', 'speech', GREEN, WHITE),
  ic('flower-burst', 'nature', 'flower', 'burst', PINK, WHITE),
  ic('sun-burst', 'nature', 'sun', 'burst', ORANGE, YELLOW),

  ic('party-popper', 'party', 'party-popper', 'circle', PURPLE, WHITE),
  ic('cake', 'party', 'cake', 'roundedSquare', PINK, WHITE),
  ic('gift', 'party', 'gift', 'roundedSquare', ORANGE, WHITE),
  ic('music', 'party', 'music', 'circle', BLUE, WHITE),
  ic('camera', 'party', 'camera', 'roundedSquare', NAVY, WHITE),
  ic('rocket', 'party', 'rocket', 'burst', RED, WHITE),
  ic('cake-speech', 'party', 'cake', 'speech', PINK, WHITE),
  ic('music-speech', 'party', 'music', 'speech', SKY, WHITE),
  ic('gift-tag', 'party', 'gift', 'tag', ORANGE, WHITE),
  ic('party-burst', 'party', 'party-popper', 'burst', YELLOW, INK),
  ic('camera-speech', 'party', 'camera', 'speech', NAVY, WHITE),
  ic('star-pink', 'party', 'star', 'burst', PINK, WHITE, true),

  ic('message-circle', 'social', 'message-circle', 'circle', BLUE, WHITE),
  ic('mail', 'social', 'mail', 'roundedSquare', RED, WHITE),
  ic('phone', 'social', 'phone', 'circle', GREEN, WHITE),
  ic('bell', 'social', 'bell', 'circle', YELLOW, INK),
  ic('megaphone', 'social', 'megaphone', 'roundedSquare', ORANGE, WHITE),
  ic('eye', 'social', 'eye', 'circle', NAVY, WHITE),
  ic('globe', 'social', 'globe', 'circle', CYAN, WHITE),
  ic('message-speech', 'social', 'message-circle', 'speech', BLUE, WHITE),
  ic('bell-burst', 'social', 'bell', 'burst', RED, WHITE),
  ic('mail-speech', 'social', 'mail', 'speech', PINK, WHITE),
  ic('globe-burst', 'social', 'globe', 'burst', TEAL, WHITE),
  dc('label-follow', 'social', () => textBadge('SIGA', PINK, WHITE)),

  ic('coffee', 'food', 'coffee', 'circle', BROWN, WHITE),
  ic('pizza', 'food', 'pizza', 'circle', YELLOW, RED),
  ic('ice-cream-cone', 'food', 'ice-cream-cone', 'roundedSquare', PINK, WHITE),
  ic('coffee-speech', 'food', 'coffee', 'speech', BROWN, WHITE),
  ic('pizza-burst', 'food', 'pizza', 'burst', ORANGE, WHITE),
  ic('ice-cream-speech', 'food', 'ice-cream-cone', 'speech', PINK, WHITE),
  ic('coffee-tag', 'food', 'coffee', 'tag', BROWN, WHITE),
  ic('pizza-speech', 'food', 'pizza', 'speech', RED, WHITE),
  dc('label-yum', 'food', () => textBadge('HUM!', ORANGE, WHITE, true)),
  ic('ice-cream-burst', 'food', 'ice-cream-cone', 'burst', CYAN, WHITE),

  ic('lightbulb', 'misc', 'lightbulb', 'circle', YELLOW, INK),
  ic('clock', 'misc', 'clock', 'circle', INK, WHITE),
  ic('calendar', 'misc', 'calendar', 'roundedSquare', RED, WHITE),
  ic('play', 'misc', 'play', 'circle', GREEN, WHITE, true),
  ic('pause', 'misc', 'pause', 'circle', BLUE, WHITE, true),
  ic('volume-2', 'misc', 'volume-2', 'circle', PURPLE, WHITE),
  ic('wifi', 'misc', 'wifi', 'circle', TEAL, WHITE),
  ic('battery', 'misc', 'battery', 'roundedSquare', GREEN, WHITE),
  ic('map-pin', 'misc', 'map-pin', 'circle', RED, WHITE),
  ic('plane', 'misc', 'plane', 'circle', SKY, WHITE),
  ic('dollar-sign', 'misc', 'dollar-sign', 'circle', GREEN, WHITE),
  ic('tag', 'misc', 'tag', 'roundedSquare', PINK, WHITE),
  ic('shopping-bag', 'misc', 'shopping-bag', 'roundedSquare', NAVY, WHITE),
  dc('lightbulb-speech', 'misc', () => speechBubble(YELLOW, INK)),
];

/** Acha a figurinha do catálogo pelo id; devolve undefined se não existir. */
export function findSticker(id: string): StickerDef | undefined {
  return STICKERS.find((sticker) => sticker.id === id);
}
