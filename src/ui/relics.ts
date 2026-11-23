import { RELICS, relicDescription, type RelicId } from '../config/relics';
import { el } from './dom';

export function relicInventory(ids: Iterable<RelicId>, context: 'hud' | 'pause' | 'status'): HTMLElement[] {
  return [...ids].map((id) => {
    const relic = RELICS[id];
    const tooltip = `${context}-relic-${id}`;
    return el('span', { class: 'relic-slot' }, [
      el('button', {
        class: 'relic-icon',
        type: 'button',
        'aria-label': relic.name,
        'aria-describedby': tooltip,
        'data-relic': id,
        text: relic.symbol,
      }),
      el('span', { class: 'relic-tooltip', id: tooltip, role: 'tooltip' }, [
        el('strong', { text: relic.name }),
        el('span', { text: relicDescription(id) }),
      ]),
    ]);
  });
}
