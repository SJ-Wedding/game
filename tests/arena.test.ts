import { describe, expect, it } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arena';
import { xpVisual } from '../src/config/progression';
import { arenaLayout, ARENA_SPRITE_SIZE } from '../src/render/arena';

describe('아레나 테마', () => {
  it('테마와 장식은 같은 시드에서 재현되며 두 테마가 모두 등장한다', () => {
    const layouts = Array.from({ length: 12 }, (_, seed) => arenaLayout(seed));
    expect(new Set(layouts.map(({ theme }) => theme))).toEqual(new Set(['canyon', 'alpine']));
    expect(arenaLayout(0)).toEqual(layouts[0]);
    expect(layouts[0].decorations).not.toEqual(layouts[1].decorations);
  });

  it('장식은 시작 지점을 비우고 큰 장식 전체가 전투 경계 바깥에 들어간다', () => {
    const { width, height, wallPadding: pad } = ARENA_CONFIG;
    for (let seed = 0; seed < 12; seed++) {
      const { decorations } = arenaLayout(seed);
      expect(decorations.some(({ frame }) => frame < 8)).toBe(true);
      expect(decorations.some(({ frame }) => frame >= 8)).toBe(true);
      for (const { x, y, frame, scale } of decorations) {
        const half = ARENA_SPRITE_SIZE * scale / 2;
        if (frame < 8) {
          expect(Math.hypot(x - width / 2, y - height / 2)).toBeGreaterThanOrEqual(190);
        } else {
          expect(x + half < pad || y + half < pad || x - half > width - pad || y - half > height - pad).toBe(true);
        }
      }
    }
  });

  it('실제 경험치 획득량 경계에서 보석 색과 크기가 바뀐다', () => {
    const tiers = [1, 3, 4, 10, 40].map(xpVisual);
    expect(new Set(tiers.map(({ color }) => color)).size).toBe(5);
    expect(tiers.map(({ size }) => size)).toEqual([6, 7, 8, 9, 11]);
    expect(xpVisual(2.99)).toBe(tiers[0]);
    expect(xpVisual(39.99)).toBe(tiers[3]);
  });
});
