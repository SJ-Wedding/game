import { describe, expect, it } from 'vitest';
import { AUTO_COMBAT } from '../src/config/player';
import { RUN_CONFIG } from '../src/config/run';
import { IDLE_INPUT } from '../src/core/types';
import { makeSim, runTicks } from './helpers';

describe('자동 조준·자동 공격', () => {
  it('자동 전투가 기본으로 켜져 있다', () => {
    expect(AUTO_COMBAT.enabled).toBe(true);
  });

  it('사거리 안에 적이 없으면 공격하지 않는다', () => {
    const sim = makeSim({ god: true });
    sim.spawnEnemy('chaser', sim.player.x + AUTO_COMBAT.range + 200, sim.player.y);
    sim.step(IDLE_INPUT);
    expect(sim.target).toBeNull();
    expect(sim.shotsFired).toBe(0);
  });

  it('입력 없이도 사거리 안의 가장 가까운 적을 조준해 발사한다', () => {
    const sim = makeSim({ god: true });
    const p = sim.player;
    const far = sim.spawnEnemy('chaser', p.x + 400, p.y);
    const near = sim.spawnEnemy('chaser', p.x, p.y - 200);
    sim.step({ ...IDLE_INPUT, aimX: p.x + 9999, aimY: p.y, fire: false }); // 마우스 입력은 무시된다
    expect(sim.target).toBe(near);
    expect(sim.shotsFired).toBe(1);
    expect(sim.player.aim).toBeCloseTo(-Math.PI / 2, 2);
    expect(sim.playerShots[0].vy).toBeLessThan(0);
    expect(far.hp).toBe(far.maxHp);
  });

  it('가까운 적이 쓰러지면 다음 적으로 대상을 바꾼다', () => {
    const sim = makeSim({ god: true });
    const p = sim.player;
    const a = sim.spawnEnemy('chaser', p.x + 150, p.y);
    const b = sim.spawnEnemy('chaser', p.x - 350, p.y);
    a.hp = 1;
    runTicks(sim, 30);
    expect(a.dead).toBe(true);
    expect(sim.target).toBe(b);
  });

  it('보스도 자동으로 조준하되, 등장 연출(무적) 중에는 조준하지 않는다', () => {
    const sim = makeSim({ startTime: RUN_CONFIG.bossAt, god: true });
    sim.boss!.x = sim.player.x + 250;
    sim.boss!.y = sim.player.y;
    sim.step(IDLE_INPUT);
    expect(sim.target).toBeNull();
    runTicks(sim, 120);
    expect(sim.target).toBe(sim.boss);
    expect(sim.shotsFired).toBeGreaterThan(0);
  });
});
