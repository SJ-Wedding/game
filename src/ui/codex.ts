import { CHARACTERS, CHARACTER_UPGRADES } from '../config/characters';
import { GRADES } from '../config/grades';
import { PROGRESSION_CONFIG } from '../config/progression';
import { ESSENCES, ESSENCE_MAX_STACK, OPENING_RELICS, OPENING_RELIC_LEVEL, RELICS, RELIC_IDS, relicDescription } from '../config/relics';
import { ROAN_GEAR_LEVELS, ROAN_UPGRADES, ROAN_UPGRADE_IDS, ROAN_WEAPONS, ROAN_WEAPON_IDS, type RoanDesign } from '../config/roan';
import { ALL_UPGRADES, CATEGORY_LABEL } from '../config/upgrades';
import { FUSION_ARMOR_PIERCE, FUSION_IDS, WEAPON_DAMAGE_PER_RANK, WEAPON_FUSIONS, WEAPON_GRADE_DAMAGE, WEAPON_MAX_RANK, WEAPON_RANK_EFFECTS, WEAPONS, weaponRankEffect } from '../config/weapons';
import type { CatalogId } from '../core/catalog';
import { upgradeText } from '../core/upgrades';
import { CHARACTER_SHEETS, roanTexture } from '../render/textures';
import { relicArt, shopSprite, upgradeChoiceArt } from './art';
import { roanDesignName } from './combatReport';
import { el } from './dom';
import { WEAPON_PREVIEWS } from './weaponPreview';

export const CODEX_TABS = { relics: '유물', upgrades: '강화 선택지', weapons: '특수 무기·융합', gear: '로안 장비' } as const;
export type CodexTab = keyof typeof CODEX_TABS;

export interface CodexEntry {
  id: CatalogId;
  tab: CodexTab;
  name: string;
  category: string;
  art: () => HTMLElement;
  description: string;
  facts?: readonly (readonly [name: string, value: string])[];
}

function gearArt(design: RoanDesign): HTMLElement {
  const sprite = el('span', { class: 'archive-gear', 'aria-hidden': 'true' });
  sprite.style.backgroundImage = `url("${CHARACTER_SHEETS[roanTexture(design)]}")`;
  return sprite;
}

const relics: CodexEntry[] = RELIC_IDS.map((id) => {
  const relic = RELICS[id];
  const category = OPENING_RELICS.some((key) => key === id) ? `시작 유물 · Lv ${OPENING_RELIC_LEVEL}`
    : relic.source === 'elite' ? '중간 보스 유물' : '레벨업 유물';
  const facts: [string, string][] = [];
  if ('character' in relic) facts.push(['캐릭터', CHARACTERS[relic.character].name]);
  if ('lumenWeapon' in relic) facts.push(['전용 무기', WEAPONS[relic.lumenWeapon].name]);
  if ('form' in relic) facts.push(['전용 장비', roanDesignName(relic.form)]);
  if ('carry' in relic && !relic.carry) facts.push(['계승', '계승 불가']);
  if ('weapon' in relic) {
    const fusion = FUSION_IDS.find((key) => WEAPON_FUSIONS[key].pair.some((weapon) => weapon === relic.weapon));
    facts.push(['전용 무기', WEAPONS[relic.weapon].name]);
    if (fusion) facts.push([WEAPON_FUSIONS[fusion].name, relicDescription(id, [fusion])]);
  }
  return { id: `relic:${id}`, tab: 'relics', name: relic.name, category, art: () => relicArt(id), description: relicDescription(id), facts };
});

const upgrades: CodexEntry[] = ALL_UPGRADES.map((def) => {
  const category = def.weapon ? '특수 무기' : def.mastery ? '캐릭터 전용 강화' : CATEGORY_LABEL[def.category];
  const facts: [string, string][] = [];
  const weapon = def.weapon;
  if (def.mastery) {
    const mastery = CHARACTER_UPGRADES[def.mastery];
    facts.push(['캐릭터', CHARACTERS[mastery.path === 'roan' ? 'roan' : 'lumen'].name]);
    if (mastery.path !== 'roan') facts.push(['전용 무기', WEAPONS[mastery.path].name]);
    if ('form' in mastery) facts.push(['전용 장비', roanDesignName(mastery.form)]);
    if ('minLevel' in mastery) facts.push(['등장 조건', `Lv ${mastery.minLevel} 이상`]);
  }
  if (weapon && def.maxStacks) {
    const effect = WEAPON_RANK_EFFECTS[weapon];
    facts.push(['최대 단계', `Lv ${def.maxStacks}`]);
    facts.push(['단계당 피해', `무기 피해 보너스 +${Math.round(WEAPON_DAMAGE_PER_RANK * 100)}%p`]);
    facts.push([effect.label, Array.from({ length: def.maxStacks }, (_, rank) => `Lv ${rank + 1} · ${weaponRankEffect(weapon, rank + 1)}${effect.unit}`).join(' / ')]);
  }
  for (const grade of GRADES) {
    facts.push([grade.name, weapon ? `해당 선택의 무기 피해 보너스 +${Math.round(WEAPON_GRADE_DAMAGE[grade.id] * 100)}%` : upgradeText(def, grade.id)]);
  }
  return { id: `upgrade:${def.id}`, tab: weapon ? 'weapons' : 'upgrades', name: def.name, category,
    art: () => upgradeChoiceArt(def), description: def.description, facts };
});

const fusions: CodexEntry[] = FUSION_IDS.map((id) => {
  const fusion = WEAPON_FUSIONS[id];
  return {
    id: `fusion:${id}`, tab: 'weapons', name: fusion.name, category: '융합 무기', description: fusion.effect,
    art: () => el('img', { class: 'archive-preview', src: WEAPON_PREVIEWS[id], alt: '' }),
    facts: [['조합식', fusion.pair.map((weapon) => `${WEAPONS[weapon].name} Lv ${WEAPON_MAX_RANK}`).join(' + ')],
      ['융합 후', `Lv ${WEAPON_MAX_RANK} · ${fusion.interval}초 주기 · 방어 ${FUSION_ARMOR_PIERCE * 100}% 관통`]],
  };
});

const gear: CodexEntry[] = [
  ...ROAN_WEAPON_IDS.map((id): CodexEntry => {
    const weapon = ROAN_WEAPONS[id];
    return { id: `roanWeapon:${id}`, tab: 'gear', name: weapon.name, category: `기본 무기 · Lv ${ROAN_GEAR_LEVELS.weapon}`,
      art: () => gearArt(id), description: weapon.description,
      facts: [['특수 효과', weapon.special], ['기본 최대 체력', String(weapon.maxHp)], ['공격 거리', `${weapon.range}px`]] };
  }),
  ...ROAN_UPGRADE_IDS.map((id): CodexEntry => {
    const weapon = ROAN_UPGRADES[id];
    return { id: `roanUpgrade:${id}`, tab: 'gear', name: weapon.name, category: `상위 무기 · Lv ${ROAN_GEAR_LEVELS.upgrade}`,
      art: () => gearArt(id), description: weapon.effect,
      facts: [['기본 계열', ROAN_WEAPONS[weapon.weapon].name], [`Lv ${ROAN_GEAR_LEVELS.awaken} 각성`, weapon.awaken]] };
  }),
];

const essences: CodexEntry[] = Object.entries(ESSENCES).map(([id, essence]) => ({
  id: `essence:${id as keyof typeof ESSENCES}`, tab: 'upgrades', name: essence.name, category: '중간 보스 대체 보상',
  art: () => el('span', { class: 'relic-symbol', 'aria-hidden': 'true', text: essence.symbol }),
  description: essence.effect, facts: [['최대 중첩', `${ESSENCE_MAX_STACK}회`], ['계승', '계승 불가']],
}));

const fallback = PROGRESSION_CONFIG.fallback;
export const CODEX_ENTRIES: readonly CodexEntry[] = [
  ...relics, ...upgrades, ...fusions, ...gear, ...essences,
  { id: 'fallback:heal', tab: 'upgrades', name: fallback.name, category: '대체 선택지', art: () => shopSprite(17), description: fallback.description },
];

const entriesById = new Map(CODEX_ENTRIES.map((entry) => [entry.id, entry]));
export function codexEntry(id: CatalogId): CodexEntry | undefined {
  return entriesById.get(id);
}
