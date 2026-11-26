import type { GameObjects } from 'phaser';
import type { RoanDesign } from '../config/roan';
import type { SwordSweep } from '../core/roan';
import { drawArm, drawGrip, type RoanPoint as Point } from './roanPose';

type Graphics = GameObjects.Graphics;

interface BladeStyle {
  scale: number;
  windup: number;
  followThrough: number;
  lift: number;
  tip: number;
  color: number;
  twoHands?: true;
}

const SWORD_STYLE: BladeStyle = { scale: 2.65, windup: 0.13, followThrough: 0.55, lift: 7, tip: 52, color: 0xcce8ff };
const STYLES: Partial<Record<RoanDesign, BladeStyle>> = {
  onehand: { scale: 2.55, windup: 0.08, followThrough: 0.43, lift: 5, tip: 46, color: 0x8fe8ff },
  greatsword: { scale: 2.75, windup: 0.23, followThrough: 0.65, lift: 18, tip: 68, color: 0xffd58e, twoHands: true },
  rapier: { scale: 2.7, windup: 0.12, followThrough: 0.42, lift: 3, tip: 55, color: 0xc6edff },
  waraxe: { scale: 2.9, windup: 0.19, followThrough: 0.51, lift: 29, tip: 49, color: 0xffa77c },
  greataxe: { scale: 2.9, windup: 0.25, followThrough: 0.67, lift: 34, tip: 66, color: 0xffc273, twoHands: true },
  halberd: { scale: 2.7, windup: 0.19, followThrough: 0.57, lift: 12, tip: 74, color: 0xf5d991, twoHands: true },
  throwingaxe: { scale: 3.1, windup: 0.07, followThrough: 0.42, lift: 13, tip: 29, color: 0xffb87d },
};

const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => n * n * (3 - 2 * n);

function polar(from: Point, angle: number, reach: number, side = 0): Point {
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  return { x: from.x + x * reach - y * side, y: from.y + y * reach + x * side };
}

export interface BladeMotion {
  direction: number;
  reach: number;
  height: number;
  lean: number;
  travel: number;
}

export function bladeMotion(sweep: SwordSweep, progress: number): BladeMotion {
  const style = STYLES[sweep.design] ?? SWORD_STYLE;
  const recovery = smooth(clamp((progress - style.followThrough) / (1 - style.followThrough)));
  if (sweep.throwing && !sweep.offHand) {
    return { direction: sweep.angle, reach: 15 + 20 * (1 - recovery), height: 5, lean: 7 * (1 - recovery), travel: 1 };
  }
  if (sweep.motion === 'thrust') {
    const thrustTime = sweep.design === 'rapier' ? 0.27 : 0.37;
    const extension = (1 - (1 - clamp(progress / thrustTime)) ** 3) * (1 - smooth(clamp((progress - thrustTime) / (1 - thrustTime))));
    return { direction: sweep.angle, reach: 12 + extension * 29, height: 0, lean: -3 + extension * 14, travel: extension };
  }
  const windup = smooth(clamp(progress / style.windup));
  const travel = smooth(clamp((progress - style.windup) / (style.followThrough - style.windup)));
  const direction = sweep.offHand || sweep.kind === 'combo' ? -1 : 1;
  const arc = -0.32 - windup * 0.18 + travel - recovery * 0.21;
  return {
    direction: sweep.angle + direction * sweep.width * arc,
    height: style.lift * (0.33 + 0.67 * windup) * (1 - travel) + recovery * 3,
    reach: 11 + Math.sin(travel * Math.PI) * 15 + travel * (1 - recovery) * 5,
    lean: -3 * windup * (1 - travel) + (8 * Math.sin(travel * Math.PI / 2)) * (1 - recovery),
    travel,
  };
}

interface HeldBlade extends Point {
  direction: number;
  scale: number;
  flip: boolean;
}

function bladeGrip(body: Point, sweep: SwordSweep, pose: BladeMotion) {
  const hand = sweep.offHand ? -1 : 1;
  const aimX = Math.cos(sweep.angle);
  const aimY = Math.sin(sweep.angle);
  const facingSide = Math.abs(aimX) > Math.abs(aimY) ? Math.sign(aimX) : -1;
  const side = facingSide * hand;
  const shoulder = polar(body, sweep.angle, 4, side * 7);
  const wrist = polar(shoulder, pose.direction, pose.reach);
  wrist.y -= pose.height;

  const returningStrike = sweep.kind === 'combo' || Boolean(sweep.offHand);
  const tilt = sweep.motion === 'thrust' || (sweep.throwing && !sweep.offHand) ? 0 : (returningStrike ? 1 : -1) * (0.22 - 0.42 * pose.travel);
  return { hand, side, shoulder, wrist, direction: pose.direction + tilt, returningStrike };
}

/** Move the gauntlets and the sprites from the same wrist positions. */
export function drawBladePose(g: Graphics, body: Point, sweep: SwordSweep, pose: BladeMotion, progress: number, alpha: number): HeldBlade[] {
  const style = STYLES[sweep.design] ?? SWORD_STYLE;
  const { hand, side, shoulder, wrist, direction, returningStrike } = bladeGrip(body, sweep, pose);
  if (style.twoHands) {
    const support = polar(wrist, direction, -12);
    drawArm(g, polar(body, sweep.angle, 1, -side * 8), support, alpha);
    drawGrip(g, support, alpha);
  }
  drawArm(g, shoulder, wrist, alpha);
  drawGrip(g, wrist, alpha);
  const held: HeldBlade[] = [];
  if (!sweep.throwing || sweep.offHand) {
    held.push({ ...wrist, direction, scale: style.scale, flip: returningStrike && sweep.design === 'throwingaxe' });
  } else {
    const flash = 1 - clamp(progress / 0.2);
    const spark = polar(wrist, sweep.angle, 15);
    g.lineStyle(2, 0xffe2ad, flash * alpha).lineBetween(wrist.x, wrist.y, spark.x, spark.y);
  }
  if (sweep.design === 'throwingaxe' && !(sweep.throwing && sweep.offHand)) {
    const rest = polar(body, sweep.angle, 2, -side * 13);
    const restAngle = sweep.angle - hand * 1.03;
    drawArm(g, polar(body, sweep.angle, 0, -side * 7), rest, alpha);
    drawGrip(g, rest, alpha);
    held.push({ ...rest, direction: restAngle, scale: style.scale, flip: !sweep.offHand });
  }
  return held;
}

export function drawBladeSweep(ground: Graphics, g: Graphics, sweep: SwordSweep, progress: number): void {
  const style = STYLES[sweep.design] ?? SWORD_STYLE;
  const pose = bladeMotion(sweep, progress);
  const color = sweep.kind === 'combo' ? 0xe9fff3 : style.color;
  const fade = (1 - progress) ** 1.6;
  if (sweep.motion === 'thrust') {
    const opacity = pose.travel ** 2 * fade;
    const from = polar(sweep, sweep.angle, 25);
    const tip = polar(sweep, sweep.angle, sweep.range * (0.58 + 0.42 * pose.travel));
    const shoulder = polar(tip, sweep.angle, -sweep.range * 0.23);
    const left = polar(shoulder, sweep.angle, 0, -8);
    const right = polar(shoulder, sweep.angle, 0, 8);
    g.fillStyle(color, opacity * 0.49).fillPoints([from, left, tip, right], true);
    g.lineStyle(2, 0xfffbec, opacity * 0.9).lineBetween(shoulder.x, shoulder.y, tip.x, tip.y);
    // The thrust still has a sector hitbox. Its edge stays subtle under the thrust line.
    const start = sweep.angle - sweep.width / 2;
    ground.lineStyle(2, color, opacity * 0.36).beginPath().arc(sweep.x, sweep.y, sweep.range, start, start + sweep.width).strokePath();
    return;
  }
  if (sweep.throwing && !sweep.offHand) return;
  const moving = pose.travel > 0 && pose.travel < 1;
  const after = clamp((progress - style.followThrough) / 0.24);
  if (!moving && (pose.travel === 0 || after >= 1)) return;
  const direction = sweep.offHand || sweep.kind === 'combo' ? -1 : 1;
  const pathWidth = Math.min(pose.travel, 0.33) * sweep.width;
  const start = sweep.angle + direction * sweep.width * (pose.travel - 0.5) - direction * pathWidth;
  const head = start + direction * pathWidth;
  ground.lineStyle(2, color, fade * 0.48).beginPath()
    .arc(sweep.x, sweep.y, sweep.range, start, head, direction < 0).strokePath();
  const last = Math.min(progress, style.followThrough);
  const samples = Array.from({ length: 9 }, (_, i) => {
    const at = Math.max(style.windup, last - (8 - i) * 0.026);
    const pose = bladeMotion(sweep, at);
    const body = polar(sweep, sweep.angle, pose.lean);
    const { wrist, direction } = bladeGrip(body, sweep, pose);
    const thickness = (style.twoHands ? 18 : 11) * Math.sin(Math.PI * i / 8);
    return { edge: polar(wrist, direction, style.tip), inner: polar(wrist, direction, style.tip - thickness) };
  });
  const outer = samples.map(({ edge }) => edge);
  g.fillStyle(color, fade * 0.53).fillPoints([...outer, ...samples.map(({ inner }) => inner).reverse()], true);
  g.lineStyle(2, color, fade * 0.88).strokePoints(outer);
}
