import { Colors } from '@/constants/theme';

function darken(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0x00ff) - amount);
  const b = Math.max(0, (num & 0x0000ff) - amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Multiply a hex color toward black; factor 1 = unchanged, 0 = black. */
export function shadeColor(hex: string, factor: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.round(((num >> 16) & 0xff) * factor);
  const g = Math.round(((num >> 8) & 0xff) * factor);
  const b = Math.round((num & 0xff) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Very dark tinted gradient for a card detail hero, derived from the card's brand color. */
export function heroGradient(hex: string | null | undefined): [string, string] {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return ['#0a1f28', '#060f14'];
  return [shadeColor(hex, 0.15), shadeColor(hex, 0.09)];
}

/** Gradient pair from merchant-configured card_color, or a fallback palette. */
export function cardGradient(
  cardColor: string | null | undefined,
  fallbackIndex = 0,
): [string, string] {
  if (cardColor && /^#[0-9a-fA-F]{6}$/.test(cardColor)) {
    return [cardColor, darken(cardColor, 28)];
  }
  return Colors.cardGradients[fallbackIndex % Colors.cardGradients.length];
}
