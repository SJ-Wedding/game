import shopIcons from '../assets/shop-icons.png';
import relicIcons from '../assets/relic-icons.webp';
import choiceIcons from '../assets/choice-icons.png';
import type { CharacterUpgradeId } from '../config/characters';
import { RELICS, type RelicId } from '../config/relics';
import type { UpgradeDef, UpgradeId } from '../config/upgrades';
import { WEAPON_TEXTURES } from '../render/textures';
import { el } from './dom';

export function shopSprite(index: number, label = ''): HTMLElement {
  const node = el('span', { class: 'shop-sprite', 'aria-hidden': 'true' }, label ? [el('span', { class: 'shop-icon-text', text: label })] : []);
  node.style.backgroundImage = `url("${shopIcons}")`;
  node.style.setProperty('--shop-sprite', String(index));
  return node;
}

const CHOICE_ICONS: Partial<Record<UpgradeId, number>> & Record<CharacterUpgradeId, number> = {
  swordRange: 0, swordArc: 1, swordSpeed: 2, swordDamage: 3, swordPierce: 4,
  rapid: 5, split: 6, power: 7,
  chainLinks: 8, chainVoltage: 9, chainSpeed: 10, chainFork: 11,
  turretMount: 12, turretSpeed: 13, turretFrost: 14, turretPierce: 15,
  swordComboDamage: 16, swordComboCycle: 17, swordParry: 18,
  daggerBleed: 19, daggerPoison: 20, daggerSpeed: 21,
  maceStun: 22, maceDaze: 23, maceArmor: 24,
  axeArc: 25, axeWound: 26, axeSpeed: 27,
  onehandSpeed: 28, onehandArc: 29, greatswordWeight: 30, greatswordReach: 31,
  rapierCrit: 32, rapierPierce: 33, stilettoStacks: 34, stilettoVenom: 35,
  scimitarArc: 36, scimitarScent: 37, twinCross: 38, twinChain: 39,
  warmaceWeight: 40, warmaceSkull: 41, morningSpikes: 42, morningSharp: 43,
  flailChain: 44, flailSpin: 45, maulQuake: 46, maulCrush: 47,
  greataxeEdge: 48, greataxeInstinct: 49, halberdPole: 50, halberdPush: 51,
  throwSpin: 52, throwReturn: 53,
  magnet: 54, fortune: 55,
};
const COMMON_ICONS: Partial<Record<UpgradeId, number>> = {
  vitality: 17, regen: 17, guard: 7,
  swift: 5, evasion: 5, wisdom: 6,
};

export function upgradeChoiceArt(def: UpgradeDef): HTMLElement {
  if (def.weapon) return el('img', { class: 'weapon-icon', src: WEAPON_TEXTURES[def.weapon], alt: '' });
  const index = CHOICE_ICONS[def.id];
  if (index === undefined) return shopSprite(COMMON_ICONS[def.id] ?? 18);

  const icon = el('span', { class: 'choice-sprite', 'aria-hidden': 'true' });
  icon.style.backgroundImage = `url("${choiceIcons}")`;
  // 8열 × 7행 아틀라스에서 한 칸을 표시한다.
  icon.style.backgroundPosition = `${(index % 8) * 100 / 7}% ${Math.floor(index / 8) * 100 / 6}%`;
  return icon;
}

/** 유물 아이콘 아틀라스(12×12) 위치. 아틀라스에 없는 유물은 기호 배지로 그린다. */
const RELIC_ART: Partial<Record<RelicId, number>> = {
  lumenCrystal: 0, lumenSight: 1, lumenRune: 2, lumenCycle: 3, lumenCloak: 4, lumenStaff: 5,
  chainCloud: 6, chainOverload: 7, chainRebound: 8, chainDouble: 9, chainRod: 10, chainConductor: 11,
  turretPermafrost: 12, turretScope: 13, turretBlast: 14, turretShotgun: 15, turretMobile: 16, turretResonance: 17,
  chargeStance: 18, meleeInstinct: 19, bloodThirst: 20, weaponThrow: 21, armorBreaker: 22, warriorBreath: 23,
  toughMuscle: 24, comboRhythm: 25, sheathReflect: 26, duelGrace: 27, giantGrip: 28, earthSplitter: 29,
  heavyMomentum: 30, vitalMark: 31, fencingStep: 32, rapidThrust: 33, bloodFeast: 34, deepCut: 35,
  bloodBurst: 36, desertWind: 37, crescentEdge: 38, bloodHook: 39, bladeDance: 40, endlessWound: 41,
  shadowStrike: 42, bellBlessing: 43, stunBeat: 44, ironHead: 45, poisonSpike: 46, spinSpike: 47,
  spikeShield: 48, chainHook: 49, centrifugeRush: 50, chainGuard: 51, quakeWave: 52, crushScar: 53,
  earthFury: 54, lumberjack: 55, sever: 56, whirlwind: 57, spearWall: 58, thrustLink: 59,
  guardStance: 60, twinThrow: 61, boomerangEdge: 62, axeRain: 63, tripleChoice: 64, awl: 65,
  anvil: 66, catalyst: 67, scatterSeal: 68, bountyKnot: 69, hawkLens: 70, swarm: 71,
  bloodPrice: 72, elitePact: 73, oath: 74, buckle: 75, lastMatch: 76, duel: 77,
  heart: 78, crown: 79, compass: 80, cog: 81, anchor: 82, mirror: 83,
  fuse: 84, laces: 85, nail: 86, whetstone: 87, chainOrb: 88, slayerSeal: 89,
  ruptureCog: 90, twinBlade: 91, giantHunter: 92, splitHead: 93, focusRing: 94, executioner: 95,
  sniperGlove: 96, pulseBarrel: 97, fifthBell: 98, chalice: 99, thornMail: 100, angelFeather: 101,
  steelHeart: 102, battleJoy: 103, calmShield: 104, mossCharm: 105, herbalist: 106, lightningRod: 107,
  windBoots: 108, hourglass: 109, cloak: 110, stormCore: 111, lightHands: 112, grazeFeather: 113,
  berserker: 114, greedDice: 115, glassCannon: 116, unstableCore: 117, collectorPack: 118, gamblerCoin: 119,
  magnetCore: 120, fortuneCard: 121, clover: 122, rottingGem: 123, namelessContract: 124, hastyInvite: 125,
  alchemistFlask: 126, powderBox: 127, migrantFeather: 128, riftCrystal: 129, returnRing: 130, winterLantern: 131,
  constellation: 132, secondBell: 133, plagueJar: 134,
};

export function relicArt(id: RelicId): HTMLElement {
  const index = RELIC_ART[id];
  if (index === undefined) {
    const relic = RELICS[id];
    const tone = 'character' in relic ? relic.character : relic.source;
    return el('span', { class: `relic-art relic-glyph relic-glyph-${tone}`, 'aria-hidden': 'true', 'data-glyph': relic.symbol });
  }
  const node = el('span', { class: 'relic-art', 'aria-hidden': 'true' });
  node.style.backgroundImage = `url("${relicIcons}")`;
  node.style.backgroundPosition = `${(index % 12) * 100 / 11}% ${Math.floor(index / 12) * 100 / 11}%`;
  return node;
}
