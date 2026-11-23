export const RELICS = {
  swarm: { source: 'level', symbol: '⋇', name: '군집의 북', effect: '일반 몬스터 생성 빈도와 동시 등장 한도 +30%. 경험치 획득량 +25%.' },
  bloodPrice: { source: 'level', symbol: '◆', name: '피의 계약서', effect: '받는 피해 +25%. 경험치 획득량 +35%.' },
  elitePact: { source: 'elite', symbol: '♜', name: '쌍둥이 수호자의 인장', effect: '이후 균열 수호자 등장마다 한 마리가 더 등장합니다. 경험치 획득량 +30%.' },
  oath: { source: 'level', symbol: '✦', name: '사냥꾼의 맹세', effect: '기본 사격 속도 −15%. 획득 후 25마리 처치마다 모든 피해 +4%, 최대 +32%.' },
  buckle: { source: 'level', symbol: '➤', name: '방랑자의 버클', effect: '2초 이상 연속으로 이동하면 이동 속도 +15%. 멈추면 초기화됩니다.' },
  knot: { source: 'level', symbol: '◇', name: '수호자의 매듭', effect: '최대 체력의 20% 이상 피해를 받으면 3초간 받는 피해 −40%. 재사용 25초.' },
  flint: { source: 'level', symbol: '✧', name: '첫불의 부싯돌', effect: '장착 후 60초간 기본탄 피해 +25%. 지속 시간이 끝나면 최대 체력 +15 및 체력 15 회복.' },
  scars: { source: 'level', symbol: '╳', name: '흉터의 인장', effect: '피격될 때마다 다음 기본 사격의 피해 +30%를 한 번분 저장합니다. 최대 3회분.' },
  lastMatch: { source: 'level', symbol: '✹', name: '마지막 성냥', effect: '판마다 한 번, 죽을 피해에 체력 1로 버티고 2초간 무적. 발동 후 최대 체력 −20%.' },
  duel: { source: 'level', symbol: '⚔', name: '결투자의 인장', effect: '반경 280 안의 유일한 적에게 모든 피해 +25%. 적이 넷 이상이면 기본탄 피해 −10%.' },
  heart: { source: 'level', symbol: '♥', name: '마지막 심장', effect: '체력 30% 미만일 때 주기형 특수 무기의 다음 재사용 대기시간 −25%, 받는 회복 −50%.' },
  crown: { source: 'elite', symbol: '♛', weapon: 'chain', name: '폭풍의 왕관', effect: '연쇄 번개가 2회 더 튀고 마지막 적 자리에서 폭발합니다. 첫 타격 피해 −25%.' },
  compass: { source: 'elite', symbol: '✥', name: '매설자의 나침반', effect: '회피를 마친 자리에 즉시 무장된 균열 지뢰를 설치합니다. 회피 대기시간 +0.5초.' },
  cog: { source: 'elite', symbol: '☾', weapon: 'orbit', name: '쌍월 톱니', effect: '칼날 +1개. 평소 회전 반경 −20%. 회피 후 2초간 평소보다 크게 회전합니다.' },
  anchor: { source: 'elite', symbol: '⊙', weapon: 'gravity', name: '별의 닻', effect: '중력 구체가 제자리에서 발동합니다. 끌어당긴 적 하나당 폭발 피해 +8%, 최대 +80%.' },
  mirror: { source: 'elite', symbol: '⟐', weapon: 'echo', name: '틈새의 거울', effect: '잔영이 반대 방향으로도 사격합니다. 잔영 탄환 한 발당 피해 −30%.' },
  fuse: { source: 'elite', symbol: '⁕', weapon: 'mine', name: '두 번째 도화선', effect: '균열 지뢰가 터지면 0.7초 뒤 무장되는 작은 지뢰를 남깁니다. 작은 지뢰의 피해는 원래의 40%.' },
  laces: { source: 'elite', symbol: '≈', weapon: 'flame', name: '용광로의 신발끈', effect: '불길 위의 적은 20% 느려집니다. 같은 불길에 1초 이상 머문 적은 추가 피해를 받습니다.' },
  nail: { source: 'elite', symbol: '†', weapon: 'barrier', name: '문지기의 못', effect: '균열 장벽에 닿은 일반 적은 0.8초간 이동이 멈춥니다. 보스와 돌진 중인 적에게는 추가 피해를 줍니다.' },
} as const;

export type RelicId = keyof typeof RELICS;
export type RelicSource = (typeof RELICS)[RelicId]['source'];
export const RELIC_IDS = Object.keys(RELICS) as RelicId[];
export const CARRY_LIMIT = 3;

export function relicDescription(id: RelicId): string {
  const relic = RELICS[id];
  return 'weapon' in relic ? `${relic.effect} 해당 무기가 없으면 모든 공격 피해 +5%.` : relic.effect;
}

export function validRelicIds(value: unknown): RelicId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is RelicId => typeof id === 'string' && Object.hasOwn(RELICS, id)))];
}

export function validCarry(value: unknown): RelicId[] {
  return validRelicIds(value).slice(0, CARRY_LIMIT);
}
