import type { GameObjects } from 'phaser';

export type RoanPoint = { x: number; y: number };
type Graphics = GameObjects.Graphics;

export function drawArm(g: Graphics, shoulder: RoanPoint, wrist: RoanPoint, alpha: number): void {
  const elbow = { x: (shoulder.x + wrist.x) / 2, y: (shoulder.y + wrist.y) / 2 + 5 };
  g.lineStyle(11, 0x171a27, alpha).strokePoints([shoulder, elbow, wrist]);
  g.lineStyle(7, 0x6e8599, alpha).strokePoints([shoulder, elbow, wrist]);
  g.lineStyle(3, 0xb6c9d3, alpha).lineBetween(elbow.x, elbow.y - 1, wrist.x, wrist.y - 1);
}

export function drawGrip(g: Graphics, wrist: RoanPoint, alpha: number): void {
  g.fillStyle(0x171a27, alpha).fillRoundedRect(wrist.x - 5, wrist.y - 4, 10, 9, 2);
  g.fillStyle(0xc5d4da, alpha).fillRect(wrist.x - 3, wrist.y - 2, 6, 4);
}
