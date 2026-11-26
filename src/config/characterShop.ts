import type { CharacterId, LumenWeapon } from './characters';
import { ROAN_GEAR_LEVELS } from './roan';

export const CHARACTER_SHOP_COSTS = [15, 35, 65, 110, 175] as const;
export const SHOP_TIMING = { rangerEscape: 1, manaWard: 60, roanCounter: 1.5 } as const;

interface CharacterShopDef {
  character: CharacterId;
  weapon?: LumenWeapon;
  name: string;
  effect: string;
  step: number;
  unit: '%' | '%p' | '초' | '마리';
  costs?: readonly number[];
  minLevel?: number;
}

export const CHARACTER_SHOP = {
  rangerExtraPierce: { character: 'ranger', name: '관통 탄두', effect: '기본탄 관통', step: 1, unit: '마리', costs: [100] },
  rangerAim: { character: 'ranger', name: '정밀 조준', effect: '기본탄 조준 거리·사거리', step: 0.03, unit: '%' },
  rangerPierce: { character: 'ranger', name: '관통 탄피', effect: '기본탄 관통 후 피해', step: 0.04, unit: '%' },
  rangerTuning: { character: 'ranger', name: '무기 조율', effect: '일반 특수 무기 피해', step: 0.02, unit: '%', minLevel: 6 },
  rangerFusion: { character: 'ranger', name: '융합 냉각기', effect: '융합 발동 간격', step: -0.02, unit: '%' },
  rangerParts: { character: 'ranger', name: '재료 선별', effect: '미획득 융합 짝 후보 확률', step: 0.05, unit: '%p', minLevel: 12 },
  rangerEscape: { character: 'ranger', name: '이탈 기동', effect: `회피 후 ${SHOP_TIMING.rangerEscape}초간 이동 속도`, step: 0.04, unit: '%' },
  lumenTurretPierce: { character: 'lumen', weapon: 'turret', name: '서리 관통탄', effect: '포탑 일반 사격 관통', step: 1, unit: '마리', costs: [100] },
  lumenCycle: { character: 'lumen', name: '마력 순환', effect: '번개 발동·포탑 설치 간격', step: -0.02, unit: '%', minLevel: 6 },
  lumenWard: { character: 'lumen', name: '마력 장벽', effect: `피격 1회 피해 (${SHOP_TIMING.manaWard}초 재충전)`, step: -0.06, unit: '%' },
  lumenChainRange: { character: 'lumen', weapon: 'chain', name: '도전선 보강', effect: '다음 적 연쇄 거리', step: 0.04, unit: '%' },
  lumenChainRepeat: { character: 'lumen', weapon: 'chain', name: '전하 보존', effect: '같은 적 재연쇄 피해', step: 0.03, unit: '%' },
  lumenTurretRange: { character: 'lumen', weapon: 'turret', name: '정밀 조준기', effect: '포탑 조준 거리', step: 0.04, unit: '%' },
  lumenTurretSlow: { character: 'lumen', weapon: 'turret', name: '냉기 보존', effect: '포탑 둔화 지속시간', step: 0.1, unit: '초' },
  roanReach: { character: 'roan', name: '손잡이 보강', effect: '근접 공격 사거리', step: 0.02, unit: '%' },
  roanArmor: { character: 'roan', name: '갑주 보강', effect: '적 접촉 피해', step: -0.02, unit: '%' },
  roanCounter: { character: 'roan', name: '반격 자세', effect: `회피 후 ${SHOP_TIMING.roanCounter}초 내 첫 검격 피해`, step: 0.03, unit: '%', minLevel: ROAN_GEAR_LEVELS.weapon },
  roanTempo: { character: 'roan', name: '빠른 회수', effect: '근접 공격 간격', step: -0.012, unit: '%', minLevel: ROAN_GEAR_LEVELS.weapon },
  roanPierce: { character: 'roan', name: '약점 파악', effect: '남은 피해 저항 무시', step: 0.02, unit: '%', minLevel: ROAN_GEAR_LEVELS.upgrade },
  roanRepair: { character: 'roan', name: '전투 정비', effect: `Lv${Object.values(ROAN_GEAR_LEVELS).join('·')} 무기 선택 후 잃은 체력 회복`, step: 0.04, unit: '%' },
} as const satisfies Record<string, CharacterShopDef>;

export type CharacterShopId = keyof typeof CHARACTER_SHOP;
export const CHARACTER_SHOP_ITEMS = (Object.keys(CHARACTER_SHOP) as CharacterShopId[]).map((id) => {
  const item = CHARACTER_SHOP[id];
  const costs = 'costs' in item ? item.costs : CHARACTER_SHOP_COSTS;
  return { id, ...item, maxLevel: costs.length, costs };
});

export function characterShopAmount(def: Pick<CharacterShopDef, 'step' | 'unit'>, level: number): string {
  const scale = def.unit === '%' || def.unit === '%p' ? 100 : 1;
  const magnitude = Math.round(Math.abs(def.step) * level * scale * 100) / 100;
  return `${def.step < 0 && level ? '−' : '+'}${magnitude}${def.unit}`;
}
