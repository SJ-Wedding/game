export const TRIPLE_CHOICE_COUNT = 3;

export const RELICS = {
  tripleChoice: { source: 'elite', symbol: 'Ⅲ', name: '삼중 선택의 인장', effect: '판마다 처음 장착할 때 보너스 강화 선택이 3회 열립니다. 각 화면에서 강화 하나를 고릅니다.' },
  awl: { source: 'level', symbol: '↠', name: '철심 탄환', effect: '기본탄 한 발이 일반 적을 한 마리 더 관통합니다. 후반 관통과 중첩됩니다.' },
  anvil: { source: 'level', symbol: '▲', name: '무쇠 공이', effect: '기본 사격 속도 −25%, 기본탄 한 발 피해 +55%.' },
  catalyst: { source: 'level', symbol: '◈', name: '균열 가속기', effect: '기본탄 피해 −25%. 주기형 특수 무기의 발동 및 연속 타격 간격 −25%.' },
  scatterSeal: { source: 'level', symbol: '⋰', name: '산탄 인장', effect: '기본 사격마다 탄환 +1발. 기본탄 한 발 피해 −18%.' },
  bountyKnot: { source: 'level', symbol: '✚', name: '현상금의 매듭', effect: '획득 후 적 12마리를 처치할 때마다 체력 4를 회복합니다.' },
  hawkLens: { source: 'level', symbol: '⊙', name: '매의 렌즈', effect: '기본탄 사거리와 자동 조준 범위 +120px, 기본탄 속도 +20%.' },
  swarm: { source: 'level', symbol: '⋇', name: '군집의 북', effect: '일반 몬스터 생성 빈도와 동시 등장 한도 +30%. 경험치 획득량 +25%.' },
  bloodPrice: { source: 'level', symbol: '◆', name: '피의 계약서', effect: '받는 피해 +25%. 경험치 획득량 +35%.' },
  elitePact: { source: 'elite', symbol: '♜', name: '쌍둥이 수호자의 인장', effect: '이후 균열 수호자 등장마다 한 마리가 더 등장합니다. 경험치 획득량 +30%.' },
  oath: { source: 'level', symbol: '✦', name: '사냥꾼의 맹세', effect: '기본 사격 속도 −15%. 획득 후 25마리 처치마다 모든 피해 +4%, 최대 +32%.' },
  buckle: { source: 'level', symbol: '➤', name: '방랑자의 버클', effect: '2초 이상 연속으로 이동하면 이동 속도 +15%. 멈추면 초기화됩니다.' },
  lastMatch: { source: 'level', symbol: '✹', name: '마지막 성냥', effect: '판마다 한 번, 죽을 피해에 체력 1로 버티고 2초간 무적. 발동 후 최대 체력 −20%.' },
  duel: { source: 'level', symbol: '⚔', name: '결투자의 인장', effect: '반경 280 안의 유일한 적에게 모든 피해 +25%. 적이 넷 이상이면 기본탄 피해 −10%.' },
  heart: { source: 'level', symbol: '♥', name: '마지막 심장', effect: '체력 30% 미만일 때 주기형 특수 무기의 다음 재사용 대기시간 −25%, 받는 회복 −50%.' },
  crown: { source: 'elite', symbol: '♛', weapon: 'chain', name: '폭풍의 왕관', effect: '연쇄 번개가 2회 더 튀고 각 타격마다 적 자리에서 폭발합니다. 연쇄 번개 타격 피해 −25%.' },
  compass: { source: 'elite', symbol: '✥', name: '매설자의 나침반', effect: '회피를 마친 자리에 즉시 무장된 균열 지뢰를 설치합니다. 회피 대기시간 +0.5초.' },
  cog: { source: 'elite', symbol: '☾', weapon: 'orbit', name: '쌍월 톱니', effect: '칼날 +1개. 평소 회전 반경 +20%. 회전 칼날로 적을 처치할 때마다 회전 칼날 피해 +0.5%, 최대 +15%.' },
  anchor: { source: 'elite', symbol: '⊙', weapon: 'gravity', name: '별의 닻', effect: '중력 구체가 제자리에서 발동합니다. 중력 구체 크기 +50%, 적을 끌어오는 힘 +50%.' },
  mirror: { source: 'elite', symbol: '⟐', weapon: 'echo', name: '틈새의 거울', effect: '잔영이 반대 방향으로도 사격합니다. 잔영으로 적을 처치하면 그 자리에서 잔영이 한 번 더 발동합니다. 잔영 피해 −30%.' },
  fuse: { source: 'elite', symbol: '⁕', weapon: 'mine', name: '두 번째 도화선', effect: '균열 지뢰가 터지면 지뢰 폭발 범위만큼의 장판이 2초간 남아 피해를 줍니다. 장판의 초당 피해는 지뢰 폭발 피해의 10%.' },
  laces: { source: 'elite', symbol: '≈', weapon: 'flame', name: '용광로의 신발끈', effect: '불길 위의 적은 20% 느려집니다. 같은 불길에 1초 이상 머문 적은 2초간 화상 피해를 받습니다. 화상 피해는 불길 피해의 20%.' },
  nail: { source: 'elite', symbol: '†', weapon: 'barrier', name: '문지기의 못', effect: '균열 장벽에 닿은 일반 적은 0.8초간 이동이 멈춥니다. 보스와 돌진 중인 적에게는 추가 피해를 줍니다.' },
} as const;

export type RelicId = keyof typeof RELICS;
export type RelicSource = (typeof RELICS)[RelicId]['source'] | 'opening';
export const OPENING_RELIC_LEVEL = 3;
export const OPENING_RELICS = ['awl', 'anvil', 'catalyst', 'scatterSeal', 'bountyKnot', 'hawkLens'] as const satisfies readonly RelicId[];
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
