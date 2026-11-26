import type { Loadout } from '../config/characters';
import lumenChain from '../assets/lumen-chain.png';
import lumenTurret from '../assets/lumen-turret.png';
import roan from '../assets/roan.png';
import roanThrust from '../assets/roan-thrust.png';
import type { WeaponId } from '../config/weapons';
import player from '../assets/player.png';

import chain from '../assets/chain.png';
import mine from '../assets/mine.png';
import orbit from '../assets/orbit.png';
import axe from '../assets/axe.png';
import turret from '../assets/turret.png';
import flame from '../assets/flame.png';
import barrier from '../assets/barrier.png';
import spear from '../assets/spear.png';
import mark from '../assets/mark.png';
import echo from '../assets/echo.png';
import gravity from '../assets/gravity.png';
import infection from '../assets/infection.png';
import weaponEffects from '../assets/weapon-effects.png';
import fusionCombat from '../assets/fusion-combat.png';

import roanWeapons from '../assets/roan-weapons.png';
import type { RoanDesign } from '../config/roan';

/** 로안 무기별 스프라이트 (scripts/art/roan_weapons.py 로 생성) */
const ROAN_SHEETS = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/roan/*.png', { eager: true, import: 'default' }) as Record<string, string>)
    .map(([path, url]) => [`roan-${path.split('/').at(-1)!.replace('.png', '')}`, url]),
);

export const CHARACTER_FRAME_SIZE = 40;
export const FUSION_ART_FRAME_SIZE = 96;
export const CHARACTER_SHEETS: Record<string, string> = { player, 'lumen-chain': lumenChain, 'lumen-turret': lumenTurret, roan, 'roan-thrust': roanThrust, ...ROAN_SHEETS };

export function roanTexture(design: RoanDesign): string {
  return design === 'base' ? 'roan' : `roan-${design}`;
}

/** 휘두르기 모션용 무기 이미지: 프레임 16x40, 손잡이 위치 (프레임 안 좌표) */
export const ROAN_WEAPON_SHEET = roanWeapons;
export const ROAN_WEAPON_FRAME = { width: 16, height: 40 } as const;
const ROAN_WEAPON_ORDER = ['dagger', 'mace', 'waraxe', 'onehand', 'greatsword', 'rapier', 'stiletto', 'scimitar', 'twinblades',
  'warmace', 'morningstar', 'flail', 'maul', 'greataxe', 'halberd', 'throwingaxe', 'sword'] as const;
const ROAN_GRIPS: Record<(typeof ROAN_WEAPON_ORDER)[number], [number, number]> = {
  dagger: [7, 36], mace: [7, 35], waraxe: [6, 34], onehand: [7, 34], greatsword: [7, 33], rapier: [7, 34], stiletto: [7, 36],
  scimitar: [7, 36], twinblades: [7, 36], warmace: [7, 35], morningstar: [7, 35], flail: [9, 35], maul: [7, 34], greataxe: [7, 34],
  halberd: [7, 33], throwingaxe: [6, 35], sword: [7, 34],
};
export function roanWeaponFrame(design: RoanDesign): { frame: number; gripX: number; gripY: number } {
  const key = design === 'base' ? 'sword' : design;
  const [gripX, gripY] = ROAN_GRIPS[key];
  return { frame: ROAN_WEAPON_ORDER.indexOf(key), gripX, gripY };
}
export function characterTexture(loadout: Loadout): string {
  return loadout.character === 'lumen' ? `lumen-${loadout.weapon}` : loadout.character === 'roan' ? 'roan' : 'player';
}

export const WEAPON_TEXTURES = {
  chain, mine, orbit, axe, turret, flame, barrier, spear, mark, echo, gravity, infection,
} satisfies Record<WeaponId, string>;

export const WEAPON_FRAMES = { mine: 0, gravity: 7 } as const;
export const WEAPON_SPRITES = { orbit, axe, turret, echo };
export type WeaponSprite = keyof typeof WEAPON_FRAMES | keyof typeof WEAPON_SPRITES;
export { fusionCombat, weaponEffects };
