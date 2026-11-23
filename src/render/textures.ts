import type { WeaponId } from '../config/weapons';
import arena from '../assets/arena.png';
import player from '../assets/player.png';
import chaser from '../assets/chaser.png';
import charger from '../assets/charger.png';
import spitter from '../assets/spitter.png';
import elite from '../assets/elite.png';
import boss from '../assets/boss.png';

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

export const ARENA_TEXTURE = arena;
export const ACTOR_TEXTURES = { player, chaser, charger, spitter, elite, boss };

export const WEAPON_TEXTURES = {
  chain, mine, orbit, axe, turret, flame, barrier, spear, mark, echo, gravity, infection,
} satisfies Record<WeaponId, string>;

export const WEAPON_FRAMES = { mine: 0, orbit: 1, axe: 2, turret: 3, flame: 4, barrier: 5, echo: 6, gravity: 7 } as const;
export type WeaponSprite = keyof typeof WEAPON_FRAMES;
export { weaponEffects };
