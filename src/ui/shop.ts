import shopIcons from '../assets/shop-icons.png';
import { CHARACTER_SHOP_IDS, CHARACTER_SHOP_ITEMS, characterShopAmount } from '../config/characterShop';
import { CHARACTERS, type Loadout } from '../config/characters';
import { META_STATS, META_UNLOCKS } from '../config/meta';
import { WEAPONS } from '../config/weapons';
import { metaLevel, nextCost } from '../core/meta';
import { CHARACTER_SHEETS, characterTexture } from '../render/textures';
import type { SaveMeta } from '../storage/save';
import { el } from './dom';

const TABS = ['common', 'ranger', 'lumen', 'roan'] as const;
export type ShopTab = (typeof TABS)[number];
const LABELS: Record<ShopTab, string> = { common: '공용', ranger: '균열 사수', lumen: '루멘', roan: '로안' };

function icon(index: number, label = ''): HTMLElement {
  const node = el('span', { class: 'shop-sprite', 'aria-hidden': 'true' }, label ? [el('span', { class: 'shop-icon-text', text: label })] : []);
  node.style.backgroundImage = `url("${shopIcons}")`;
  node.style.setProperty('--shop-sprite', String(index));
  return node;
}

function portrait(tab: ShopTab): HTMLElement {
  if (tab === 'common') return icon(18);
  const loadout: Loadout = tab === 'lumen' ? { character: 'lumen', weapon: 'chain' } : { character: tab };
  const node = el('span', { class: 'shop-portrait', 'aria-hidden': 'true' });
  node.style.backgroundImage = `url("${CHARACTER_SHEETS[characterTexture(loadout)]}")`;
  return node;
}

export function buildShop(meta: SaveMeta, activeTab: ShopTab, onSelect: (tab: ShopTab) => void,
  onBuy: (id: string) => void, onBack: () => void, focusItem?: string): HTMLElement {
  const tabs = TABS.map((tab, i) => {
    const button = el('button', { id: `shop-tab-${tab}`, type: 'button', role: 'tab', 'data-testid': `shop-tab-${tab}`,
      'aria-controls': 'shop-tabpanel', 'aria-selected': String(tab === activeTab), tabindex: tab === activeTab ? '0' : '-1',
    }, [portrait(tab), LABELS[tab]]);
    button.addEventListener('click', () => onSelect(tab));
    button.addEventListener('keydown', (event) => {
      const next = event.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : event.key === 'ArrowRight' ? (i + 1) % TABS.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault();
      onSelect(TABS[next]);
    });
    return button;
  });

  const row = (id: string, name: string, description: string, maxLevel: number, image?: HTMLElement, condition?: string) => {
    const level = metaLevel(meta.purchases, id);
    const cost = nextCost(meta.purchases, id);
    const button = el('button', { class: 'buy', type: 'button', 'data-testid': `buy-${id}`,
      'aria-label': cost === null ? `${name} 최대 단계` : `${name} 구매, ${cost}토큰`,
    }, cost === null ? ['최대'] : [icon(19, '◆'), ` ${cost}`]);
    button.disabled = cost === null || meta.tokens < cost;
    button.addEventListener('click', () => onBuy(id));
    return el('li', { class: 'shop-item' }, [
      ...(image ? [el('span', { class: 'shop-card-image' }, [image])] : []),
      el('div', { class: 'shop-card-copy' }, [
        el('strong', { text: name }),
        el('small', { class: 'shop-effect', text: description }),
        el('span', { class: 'lv', 'data-testid': `lv-${id}`, text: ` ${level}/${maxLevel}` }),
        ...(condition ? [el('small', { class: 'shop-condition', text: condition })] : []),
      ]),
      button,
    ]);
  };

  const content = el('div', { class: 'shop-content', id: 'shop-tabpanel', role: 'tabpanel', 'aria-labelledby': `shop-tab-${activeTab}` });
  if (activeTab === 'common') {
    const stats = META_STATS.map((item) => {
      const pct = Math.round(Math.abs(item.pctPerLevel) * 100);
      const description = item.pctByLevel ? item.pctByLevel.map((v, i) => `Lv ${i + 1} +${Math.round(v * 100)}%`).join(' · ')
        : `단계마다 ${pct}% ${item.pctPerLevel < 0 ? '감소' : '증가'}`;
      return row(item.id, item.name, description, item.maxLevel);
    });
    content.append(el('div', { class: 'shop-common' }, [
      el('section', {}, [el('h3', { text: '능력치' }), el('ul', { class: 'shop-list' }, stats)]),
      el('section', {}, [el('h3', { text: '해금' }), el('ul', { class: 'shop-list' }, META_UNLOCKS.map((item) => row(item.id, item.name, item.description, item.maxLevel)))]),
    ]));
  } else {
    const items = CHARACTER_SHOP_ITEMS.filter((item) => item.character === activeTab);
    const completed = items.filter((item) => metaLevel(meta.purchases, item.id) >= item.maxLevel).length;
    content.append(el('p', { class: 'shop-progress', text: `전용 강화 ${completed} / ${items.length} 완성` }),
      el('ul', { class: 'shop-list shop-grid' }, items.map((item) => {
        const level = metaLevel(meta.purchases, item.id);
        const next = Math.min(item.maxLevel, level + 1);
        const amount = characterShopAmount(item, next);
        const effect = `${item.effect} ${level > 0 && next > level ? `${characterShopAmount(item, level)} → ` : ''}${amount}`;
        const conditions = [
          ...('weapon' in item ? [`${WEAPONS[item.weapon].name} 전용`] : []),
          ...('minLevel' in item ? [`Lv${item.minLevel}부터`] : []),
        ];
        return row(item.id, item.name, effect, item.maxLevel, icon(CHARACTER_SHOP_IDS.indexOf(item.id)), conditions.join(' · '));
      })));
  }

  const back = el('button', { class: 'shop-back', type: 'button', 'data-testid': 'shop-back' }, ['돌아가기 ', el('kbd', { text: 'Esc' })]);
  back.addEventListener('click', onBack);
  const panel = el('div', { class: 'panel shop', role: 'dialog', 'aria-label': '강화 상점', 'aria-modal': 'true' }, [
    el('header', { class: 'shop-header' }, [el('h2', { text: '강화 상점' }),
      el('div', { class: 'shop-balance' }, [el('span', { text: '보유 토큰' }),
        el('strong', { class: 'token', 'data-testid': 'shop-tokens' }, [icon(19, '◆'), ` ${meta.tokens}`])])]),
    el('div', { class: 'shop-tabs', role: 'tablist', 'aria-label': '강화 구분' }, tabs),
    content,
    back,
  ]);
  panel.style.setProperty('--shop-accent', activeTab === 'common' ? '#8fdbf2' : CHARACTERS[activeTab].color);
  const focus = focusItem ? content.querySelector(`button[data-testid="buy-${focusItem}"]:enabled`) : null;
  (focus ?? tabs[TABS.indexOf(activeTab)]).setAttribute('data-autofocus', '');
  return panel;
}
