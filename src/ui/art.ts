import shopIcons from '../assets/shop-icons.png';
import relicIcons from '../assets/relic-icons.webp';
import { RELICS, type RelicId } from '../config/relics';
import { el } from './dom';

export function shopSprite(index: number, label = ''): HTMLElement {
  const node = el('span', { class: 'shop-sprite', 'aria-hidden': 'true' }, label ? [el('span', { class: 'shop-icon-text', text: label })] : []);
  node.style.backgroundImage = `url("${shopIcons}")`;
  node.style.setProperty('--shop-sprite', String(index));
  return node;
}

const RELIC_ART: Partial<Record<RelicId, number>> = { awl: 0, catalyst: 1, bountyKnot: 2, anvil: 3, crown: 4, swarm: 5 };

export function relicArt(id: RelicId): HTMLElement {
  const index = RELIC_ART[id];
  if (index === undefined) return el('span', { class: 'relic-art relic-glyph', 'aria-hidden': 'true', text: RELICS[id].symbol });
  const node = el('span', { class: 'relic-art relic-pixel', 'aria-hidden': 'true' });
  node.style.backgroundImage = `url("${relicIcons}")`;
  node.style.backgroundPosition = `${index * 20}% 0`;
  return node;
}
