import { ARENA_CONFIG } from '../config/arena';
import { BOSS_CONFIG } from '../config/boss';
import { DEFAULT_DIFFICULTY, ENEMY_CONFIG, type DifficultyId, type EnemyKind } from '../config/enemies';
import { deriveSeed, Rng } from '../core/rng';
import canyonFloor from '../assets/arenas/canyon.webp';
import canyonActors from '../assets/arenas/canyon-actors.png';
import canyonProps from '../assets/arenas/canyon-props.png';
import alpineFloor from '../assets/arenas/alpine.webp';
import alpineActors from '../assets/arenas/alpine-actors.png';
import alpineProps from '../assets/arenas/alpine-props.png';
import calderaFloor from '../assets/arenas/caldera.webp';
import calderaActors from '../assets/arenas/caldera-actors.png';
import calderaProps from '../assets/arenas/caldera-props.png';
import sanctuaryFloor from '../assets/arenas/sanctuary.webp';
import sanctuaryActors from '../assets/arenas/sanctuary-actors.png';
import sanctuaryProps from '../assets/arenas/sanctuary-props.png';

const normalNames: Record<EnemyKind | 'boss', string> = {
  chaser: ENEMY_CONFIG.chaser.name,
  charger: ENEMY_CONFIG.charger.name,
  spitter: ENEMY_CONFIG.spitter.name,
  elite: ENEMY_CONFIG.elite.name,
  boss: BOSS_CONFIG.name,
};

export const ARENA_ART = {
  canyon: { name: '사막 협곡', floor: canyonFloor, actors: canyonActors, props: canyonProps, edge: 0xf3c58d, names: normalNames },
  alpine: { name: '고산 숲', floor: alpineFloor, actors: alpineActors, props: alpineProps, edge: 0xb1d5b8, names: normalNames },
  caldera: {
    name: '흑요석 칼데라', floor: calderaFloor, actors: calderaActors, props: calderaProps, edge: 0xbca69c,
    names: { chaser: '재바람 망령', charger: '흑요석 돌격수', spitter: '잿불 포자', elite: '현무암 파수꾼', boss: '용암 군주' },
  },
  sanctuary: {
    name: '얼어붙은 성소', floor: sanctuaryFloor, actors: sanctuaryActors, props: sanctuaryProps, edge: 0xa5cde9,
    names: { chaser: '서리 망령', charger: '빙각 돌격수', spitter: '빙정 포자', elite: '빙벽 파수꾼', boss: '빙관 군주' },
  },
} as const;

type ArenaTheme = keyof typeof ARENA_ART;
export type ArenaArt = (typeof ARENA_ART)[ArenaTheme];
const THEMES = {
  normal: ['canyon', 'alpine'],
  hard: ['caldera', 'sanctuary'],
} as const satisfies Record<DifficultyId, readonly ArenaTheme[]>;

export const ARENA_ART_MARGIN = 200;
export const ARENA_PROP_SIZE = 32;
export const ARENA_ACTOR_SIZE = 96;
export const ARENA_ACTOR_FRAMES = { chaser: 0, charger: 1, spitter: 2, elite: 3, boss: 4, chargerWindup: 5 } as const;

interface ArenaDecoration {
  x: number;
  y: number;
  frame: number;
  scale: number;
  flipX: boolean;
}

export function arenaTheme(seed: number, difficulty: DifficultyId): ArenaTheme {
  const themeRng = new Rng(deriveSeed(seed, 'arena-theme'));
  const themes = THEMES[difficulty];
  return themes[themeRng.int(themes.length)];
}

export function arenaEnemyText(text: string, art: ArenaArt): string {
  for (const kind of Object.keys(normalNames) as (keyof typeof normalNames)[]) {
    text = text.replaceAll(normalNames[kind], art.names[kind]);
  }
  return text;
}

export function arenaLayout(seed: number, difficulty: DifficultyId = DEFAULT_DIFFICULTY): { theme: ArenaTheme; decorations: ArenaDecoration[] } {
  const rng = new Rng(deriveSeed(seed, 'arena-decoration'));
  const theme = arenaTheme(seed, difficulty);
  const { width, height } = ARENA_CONFIG;
  const decorations: ArenaDecoration[] = [];

  // 낮은 장식을 셀마다 하나씩 배치하고 시작 위치 주변을 비운다.
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 7; col++) {
      if (rng.next() < 0.24) continue;
      const x = Math.round((col + rng.range(0.24, 0.76)) * width / 7);
      const y = Math.round((row + rng.range(0.24, 0.76)) * height / 5);
      if (Math.hypot(x - width / 2, y - height / 2) < 190) continue;
      decorations.push({ x, y, frame: rng.int(3), scale: rng.range(0.85, 1.3), flipX: rng.next() < 0.5 });
    }
  }

  // 키가 큰 장식은 진입 경계 바깥의 절벽과 숲 가장자리에만 배치한다.
  for (const [along, across, vertical] of [[width, -48, false], [width, height + 48, false],
    [height, -48, true], [height, width + 48, true]] as const) {
    const slots = vertical ? 4 : 6;
    for (let i = 0; i < slots; i++) {
      if (rng.next() < 0.22) continue;
      const offset = Math.round((i + rng.range(0.25, 0.75)) * along / slots);
      decorations.push({ x: vertical ? across : offset, y: vertical ? offset : across,
        frame: 3 + rng.int(2), scale: rng.range(2.4, 3.4), flipX: rng.next() < 0.5 });
    }
  }
  return { theme, decorations };
}
