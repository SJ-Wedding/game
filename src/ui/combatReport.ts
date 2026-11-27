import { ROAN_UPGRADES, ROAN_WEAPONS, type RoanDesign, type RoanUpgradeId, type RoanWeaponId } from '../config/roan';
import { RUN_CONFIG } from '../config/run';
import { UPGRADE_BY_ID } from '../config/upgrades';
import { WEAPON_FUSIONS, WEAPONS, isFusionIngredient, type FusionId, type WeaponId } from '../config/weapons';
import type { AttackDetail, AttackId, AttackVariant, RunResult } from '../core/types';
import { formatTime } from '../core/math';
import { arenaEnemyText, type ArenaArt } from '../render/arena';
import { el, josa } from './dom';

const ATTACK_NAMES: Partial<Record<AttackId, string>> = {
  basic: '기본 사격', sword: '근접 공격', bleed: '출혈', bomb: '균열 폭탄', relic: '유물 효과',
};

const VARIANT_NAMES: Record<AttackVariant, string> = {
  hit: '일반 타격', heavyRound: '다섯째 종 강화탄', piercingRound: '관통 후 타격', echoRepeat: '틈새의 거울 추가 사격',
  main: '주 공격', combo: '연격', extra: '추가 공격', shock: '검압', thrust: '찌르기', crescent: '초승달 검기',
  critFollowup: '치명타 추가 찌르기', thrownAxe: '도끼 투척', returnedAxe: '돌아오는 도끼', weaponThrow: '무기 투척술',
  smallAxe: '도끼 비', shard: '파편', maceShock: '충격파', maceScar: '분쇄 자국',
  bleedTick: '지속 출혈', bleedBurst: '처치 시 출혈 폭발', bleedDetonation: '최대 중첩 출혈 폭발',
  openingBolt: '첫 번개', chainJump: '연쇄 타격', rebound: '동일 대상 되튐', fork: '분기 회로',
  doubleDischarge: '이중 방전', crownBlast: '폭풍의 왕관 폭발', overload: '과부하 축전지 폭발',
  stormCloud: '뇌운 병 낙뢰', rodBurst: '피뢰 표식 전이', turretShot: '포탑 직격',
  turretPierce: '관통 후 타격', turretSpread: '산탄', turretFrost: '빙결 탄두 폭발', turretSelfDestruct: '자폭 냉각기',
  outbound: '나가는 타격', returning: '돌아오는 타격', burn: '지속 화상', frostField: '서리 장판',
  infectionSeed: '첫 감염', infectionSpread: '처치 시 전염',
};

export function roanDesignName(design: RoanDesign): string {
  if (design === 'base') return '시작 검';
  return ROAN_WEAPONS[design as RoanWeaponId]?.name ?? ROAN_UPGRADES[design as RoanUpgradeId]?.name ?? design;
}

export function runEndReason(result: RunResult, arena: ArenaArt): string {
  const boss = josa(arena.names.boss, '을/를');
  if (result.cause === 'boss') return `${boss} 처치했습니다!`;
  if (result.cause === 'death') return `${arenaEnemyText(result.killedBy ?? '적의 공격', arena)}에 쓰러졌습니다.`;
  const remaining = result.bossHpRatio === null ? '' : ` (보스 체력 ${Math.ceil(result.bossHpRatio * 100)}% 남음)`;
  return `${formatTime(RUN_CONFIG.timeLimit)}까지 ${boss} 처치하지 못했습니다${remaining}.`;
}

function attackName(source: AttackId): string {
  return ATTACK_NAMES[source] ?? WEAPON_FUSIONS[source as FusionId]?.name ?? WEAPONS[source as WeaponId]?.name ?? source;
}

function damageRow(source: string, name: string, damage: number, hits: number | undefined, duration: number, sub = false): HTMLElement {
  const dps = duration > 0 ? damage / duration : 0;
  const n1 = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  return el('tr', sub ? { class: 'damage-variant', 'data-attack-variant': source } : { 'data-attack': source }, [
    el('th', { scope: 'row', text: name }),
    el('td', { text: n1(damage) }),
    el('td', { text: hits === undefined ? '–' : String(hits) }),
    el('td', { text: dps > 0 && dps < 0.1 ? '<0.1' : n1(dps) }),
  ]);
}

export function damageBreakdown(result: RunResult, detailed = false): HTMLElement {
  const totals = result.damageByAttack ?? {};
  const primary = result.loadout?.character === 'roan' ? 'sword' : result.loadout?.character === 'lumen' ? result.loadout.weapon : 'basic';
  const sources = new Set<AttackId>([primary, ...(Object.keys(totals) as AttackId[]), ...(result.fusions ?? [])]);
  for (const { id } of result.upgrades) {
    const weapon = UPGRADE_BY_ID[id]?.weapon;
    if (weapon && !isFusionIngredient(result.fusions ?? [], weapon)) sources.add(weapon);
  }
  const duration = result.combatTime ?? result.survivalTime;
  const details = detailed ? result.attackDetails ?? [] : [];
  const roan = new Map<RoanDesign, AttackDetail[]>();
  for (const detail of details) if (detail.design) {
    const group = roan.get(detail.design) ?? [];
    group.push(detail);
    roan.set(detail.design, group);
  }
  const sumDamage = (rows: AttackDetail[]) => rows.reduce((sum, detail) => sum + detail.damage, 0);
  const sumHits = (rows: AttackDetail[]) => rows.reduce((sum, detail) => sum + detail.hits, 0);
  const groups = [...sources].flatMap((source) => {
    const tracked = details.filter((detail) => detail.source === source);
    const byWeapon = tracked.filter((detail) => detail.design);
    const moves = tracked.filter((detail) => !detail.design);
    const damage = Math.max(0, (totals[source] ?? 0) - sumDamage(byWeapon));
    const hits = result.hitsByAttack ? (result.hitsByAttack[source] ?? 0) - sumHits(byWeapon) : undefined;
    if (byWeapon.length && (hits ?? 0) === 0 && damage < 0.0001) return [];
    const name = !detailed && source === 'sword' ? '검 베기' : attackName(source);
    return [{ source: String(source), name, damage, hits, moves }];
  });
  for (const [design, moves] of roan) {
    groups.push({ source: `roan:${design}`, name: roanDesignName(design), damage: sumDamage(moves), hits: sumHits(moves), moves });
  }
  const rows = groups.sort((a, b) => b.damage - a.damage).flatMap(({ source, name, damage, hits, moves }) => {
    const total = damageRow(source, name, damage, hits, duration);
    if (!moves.length) return [total];
    const variants = moves.sort((a, b) => b.damage - a.damage)
      .map((move) => damageRow(move.source, VARIANT_NAMES[move.variant] ?? move.variant, move.damage, move.hits, duration, true));
    const remainingHits = hits === undefined ? undefined : hits - sumHits(moves);
    const remainingDamage = Math.max(0, damage - sumDamage(moves));
    if ((remainingHits ?? 0) > 0 || remainingDamage > 0.0001) variants.push(damageRow(source, '일반 타격', remainingDamage, remainingHits, duration, true));
    return [total, ...variants];
  });
  return el('details', { class: 'result-damage ui-frame', open: '', 'data-testid': 'damage-breakdown' }, [
    el('summary', { text: '공격별 피해량 · DPS' }),
    el('small', { class: 'muted', text: '초과 피해를 포함한 총 피해량 ÷ 전체 전투 시간.' }),
    el('div', { class: 'result-damage-scroll' }, [
      el('table', { class: 'stat-table' }, [
        el('thead', {}, [el('tr', {}, [el('th', { text: '공격' }), el('th', { text: '총 피해량' }), el('th', { text: '적중 횟수' }), el('th', { text: '평균 DPS' })])]),
        el('tbody', {}, rows),
      ]),
    ]),
  ]);
}
