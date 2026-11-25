import type { GameObjects } from 'phaser';
import { SWORD } from '../config/characters';
import type { SwordSweep } from '../core/roan';

type Graphics = GameObjects.Graphics;

/** 초승달 검기가 처치 지점에서 끝까지 날아가는 시간 */
export const CRESCENT_WAVE_DURATION = SWORD.sweepDuration;

/** 시미터 각성: 처치 지점에서 앞으로 날아가는 붉은 초승달 검기 */
export function drawCrescentWave(ground: Graphics, g: Graphics, sweep: SwordSweep, progress: number): void {
  if (progress >= 1 || progress < 0) return;
  const { x, y, angle, range } = sweep;
  const half = (sweep.lineWidth ?? 40) / 2;
  const ease = 1 - (1 - progress) ** 2;
  const fade = 1 - progress ** 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const at = (forward: number, side: number) => ({ x: x + cos * forward - sin * side, y: y + sin * forward + cos * side });
  const head = range * ease;
  // 지나간 자리
  ground.fillStyle(0xb3263f, fade * 0.12).fillPoints([at(0, -half * 0.4), at(head, -half), at(head, half), at(0, half * 0.4)], true);
  // 초승달: 바깥 호는 앞으로 볼록, 안쪽 호는 덜 볼록
  const steps = 12;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= steps; i++) {
    const u = -1 + 2 * i / steps;
    const bulge = 1 - u * u;
    outer.push(at(head + 14 * bulge, u * half));
    inner.push(at(head + 4 * bulge - 6, u * half * 0.8));
  }
  g.fillStyle(0xff5c78, fade * 0.55).fillPoints([...outer, ...inner.reverse()], true);
  g.lineStyle(6, 0xd61f45, fade * 0.35).strokePoints(outer);
  g.lineStyle(2, 0xffe1e6, fade * 0.95).strokePoints(outer);
}
