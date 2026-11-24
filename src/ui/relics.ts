import { RELICS, relicDescription, type RelicId } from '../config/relics';
import type { FusionId } from '../config/weapons';
import { el } from './dom';

export const COMPACT_RELIC_LIMIT = 6;

export function relicInventory(ids: Iterable<RelicId>, context: 'hud' | 'pause' | 'status', options: {
  fusions?: Iterable<FusionId>;
  inspect?: (id: RelicId) => void;
} = {}): HTMLElement[] {
  return [...ids].map((id) => {
    const relic = RELICS[id];
    const tooltip = options.inspect ? 'status-relic-detail' : `${context}-relic-${id}`;
    const button = el('button', {
        class: 'relic-icon',
        type: 'button',
        'aria-label': relic.name,
        'aria-describedby': tooltip,
        'data-relic': id,
        text: relic.symbol,
    });
    if (options.inspect) {
      const inspect = options.inspect;
      button.addEventListener('pointerenter', () => inspect(id));
      button.addEventListener('focus', () => inspect(id));
      button.addEventListener('click', () => inspect(id));
      return button;
    }
    return el('span', { class: 'relic-slot' }, [button, el('span', { class: 'relic-tooltip', id: tooltip, role: 'tooltip' }, [
        el('strong', { text: relic.name }),
        el('span', { text: relicDescription(id, options.fusions) }),
      ]),
    ]);
  });
}
