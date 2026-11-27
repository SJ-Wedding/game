import { describe, expect, it } from 'vitest';
import { ARENA_CONFIG } from '../src/config/arena';
import { xpVisual } from '../src/config/progression';
import { ARENA_ART, ARENA_PROP_SIZE, arenaEnemyText, arenaLayout } from '../src/render/arena';

describe('아레나 테마', () => {
  it('각 난이도에서 전용 테마 두 종과 시드별 장식이 재현된다', () => {
    const layouts = Array.from({ length: 12 }, (_, seed) => arenaLayout(seed));
    const hardLayouts = Array.from({ length: 12 }, (_, seed) => arenaLayout(seed, 'hard'));
    expect(new Set(layouts.map(({ theme }) => theme))).toEqual(new Set(['canyon', 'alpine']));
    expect(new Set(hardLayouts.map(({ theme }) => theme))).toEqual(new Set(['caldera', 'sanctuary']));
    expect(arenaLayout(0)).toEqual(layouts[0]);
    expect(arenaLayout(0, 'hard')).toEqual(hardLayouts[0]);
    expect(layouts[0].decorations).not.toEqual(layouts[1].decorations);
  });

  it('난이도와 테마에 맞는 전용 그래픽과 표시 이름을 쓴다', () => {
    const art = Object.values(ARENA_ART);
    expect(new Set(art.map(({ floor }) => floor)).size).toBe(4);
    expect(new Set(art.map(({ actors }) => actors)).size).toBe(4);
    expect(new Set(art.map(({ props }) => props)).size).toBe(4);
    expect(arenaEnemyText('가시 포자의 독침', ARENA_ART.caldera)).toBe('잿불 포자의 독침');
    expect(arenaEnemyText('잿불 군주의 낙화', ARENA_ART.sanctuary)).toBe('빙관 군주의 낙화');
  });

  it('장식은 시작 지점을 비우고 큰 장식 전체가 전투 경계 바깥에 들어간다', () => {
    const { width, height, wallPadding: pad } = ARENA_CONFIG;
    for (let seed = 0; seed < 12; seed++) {
      const { decorations } = arenaLayout(seed);
      expect(decorations.some(({ frame }) => frame < 3)).toBe(true);
      expect(decorations.some(({ frame }) => frame >= 3)).toBe(true);
      for (const { x, y, frame, scale } of decorations) {
        const half = ARENA_PROP_SIZE * scale / 2;
        if (frame < 3) {
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
