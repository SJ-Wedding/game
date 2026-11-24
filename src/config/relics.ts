import { FUSION_RELIC_DAMAGE_BONUS, isFusionIngredient, type FusionId } from './weapons';

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
  compass: { source: 'elite', symbol: '✥', name: '매설자의 나침반', effect: '회피를 마친 자리에 즉시 무장된 균열 지뢰를 설치합니다. 빙결 지뢰진으로 합체한 뒤에는 해당 위치의 적에게 빙결 지뢰진이 발동합니다. 회피 대기시간 +0.5초.' },
  cog: { source: 'elite', symbol: '☾', weapon: 'orbit', name: '쌍월 톱니', effect: '칼날 +1개. 평소 회전 반경 +20%. 회전 칼날로 적을 처치할 때마다 회전 칼날 피해 +0.5%, 최대 +15%.' },
  anchor: { source: 'elite', symbol: '⊙', weapon: 'gravity', name: '별의 닻', effect: '중력 구체가 제자리에서 발동합니다. 중력 구체 크기 +50%, 적을 끌어오는 힘 +50%.' },
  mirror: { source: 'elite', symbol: '⟐', weapon: 'echo', name: '틈새의 거울', effect: '잔영이 반대 방향으로도 사격합니다. 잔영으로 적을 처치하면 그 자리에서 잔영이 한 번 더 발동합니다. 잔영 피해 −30%.' },
  fuse: { source: 'elite', symbol: '⁕', weapon: 'mine', name: '두 번째 도화선', effect: '균열 지뢰가 터지면 지뢰 폭발 범위만큼의 장판이 2초간 남아 피해를 줍니다. 장판의 초당 피해는 지뢰 폭발 피해의 10%.' },
  laces: { source: 'elite', symbol: '≈', weapon: 'flame', name: '용광로의 신발끈', effect: '불길 위의 적은 20% 느려집니다. 같은 불길에 1초 이상 머문 적은 2초간 화상 피해를 받습니다. 화상 피해는 불길 피해의 20%.' },
  nail: { source: 'elite', symbol: '†', weapon: 'barrier', name: '문지기의 못', effect: '균열 장벽에 닿은 일반 적은 0.8초간 이동이 멈춥니다. 보스와 돌진 중인 적에게는 추가 피해를 줍니다.' },
  // ── 문서 1장: 공격 및 연쇄 처치 ──
  whetstone: { source: 'level', symbol: '⚒', name: '피에 굶주린 숫돌', effect: '적 처치 시 3초간 기본 사격 속도 +10%. 최대 5중첩.' },
  chainOrb: { source: 'level', symbol: '☄', name: '연쇄 번개 구슬', effect: '기본탄이 명중할 때 15% 확률로 주변 적 최대 3마리에게 공격력의 40% 전격 피해를 튕깁니다.' },
  slayerSeal: { source: 'level', symbol: '☠', name: '학살자의 인장', effect: '2초 이내에 적을 5마리 이상 처치하면 다음 기본 사격의 피해 +100%.' },
  ruptureCog: { source: 'level', symbol: '✺', name: '파열의 톱니바퀴', effect: '처치한 일반 적이 폭발하며 반경 90px 안의 적에게 처치한 적 최대 체력의 15% 피해를 줍니다.' },
  twinBlade: { source: 'level', symbol: '⫽', name: '쌍둥이 그림자 검', effect: '기본 사격 시 20% 확률로 같은 방향으로 잔상 탄 1발을 추가로 쏩니다.' },
  giantHunter: { source: 'level', symbol: '➶', name: '거인 사냥꾼의 화살촉', effect: '보스와 균열 수호자에게 주는 모든 피해 +30%.' },
  splitHead: { source: 'level', symbol: '⋔', name: '갈라지는 화살촉', effect: '적을 처치하면 그 자리에서 작은 탄이 현재 탄 수 ×2만큼 좌우로 갈라집니다. 작은 탄 피해는 기본탄의 10%. 기본·특수 공격 처치 모두 적용.' },
  focusRing: { source: 'level', symbol: '◎', name: '집중의 고리', effect: '기본탄을 맞힐 때마다 기본탄 피해 +1%, 최대 +30%. 피해를 받으면 초기화됩니다.' },
  executioner: { source: 'level', symbol: '⚖', name: '처형인의 저울', effect: '체력이 10% 이하인 일반 적은 기본탄 한 발에 처치합니다. 기본 사격 속도 −30%.' },
  sniperGlove: { source: 'level', symbol: '⌖', name: '저격수의 장갑', effect: '320px보다 먼 적에게 기본탄 피해 +25%, 150px 안의 적에게는 −20%.' },
  pulseBarrel: { source: 'level', symbol: '♒', name: '맥동 총열', effect: '10초마다 3초간 기본 사격 속도 +60%. 그 외 시간에는 −10%.' },
  fifthBell: { source: 'level', symbol: '❺', name: '다섯째 종', effect: '기본 사격 다섯 번째마다 큰 탄을 쏩니다(피해 3배, 관통 +2). 기본 사격 속도 −15%.' },
  // ── 문서 2장: 생존, 흡수 및 방어 ──
  chalice: { source: 'level', symbol: '♆', name: '흡혈귀의 깨진 성배', effect: '둔화·감염·화상 상태인 적에게 피해를 줄 때마다 최대 체력의 1.5%를 회복합니다. 재사용 0.5초.' },
  thornMail: { source: 'level', symbol: '❈', name: '가시 돋친 철갑', effect: '피격 시 받은 피해의 150%를 반경 150px 안의 모든 적에게 반사합니다. 피격 후 무적 시간 +0.4초.' },
  angelFeather: { source: 'level', symbol: '☥', name: '수호천사의 깃털', effect: '체력이 0이 되면 판마다 한 번 최대 체력의 50%로 부활하고 반경 200px 안의 적을 밀쳐냅니다. 상점의 부활과 별도입니다.' },
  steelHeart: { source: 'level', symbol: '❤', name: '강철 심장', effect: '최대 체력 +35%. 피격 범위 +10%, 이동 속도 −20%.' },
  battleJoy: { source: 'level', symbol: '☼', name: '전투의 환희', effect: '반경 150px 안에 적이 4마리 이상 있으면 받는 피해 −25%.' },
  calmShield: { source: 'level', symbol: '⛉', name: '고요한 방패', effect: '8초 동안 피해를 받지 않으면 다음 피격 1회를 막는 보호막이 생깁니다. 최대 체력 −10%.' },
  mossCharm: { source: 'level', symbol: '☘', name: '이끼 낀 부적', effect: '멈춰 있는 동안 초당 체력 2를 회복합니다.' },
  herbalist: { source: 'level', symbol: '⚗', name: '약초꾼의 병', effect: '회복 물약 회복량 2배. 초당 체력 회복 효과 −50%.' },
  lightningRod: { source: 'level', symbol: 'ϟ', name: '피뢰침', effect: '적 탄에 받는 피해 −30%. 적과 부딪혀 받는 피해 +20%.' },
  // ── 문서 3장: 기동성 및 특수 무기 순환 ──
  windBoots: { source: 'level', symbol: '⇶', name: '바람의 장화', effect: '회피 최대 충전 +1회. 회피 직후 1.5초간 이동 속도 +25%.' },
  hourglass: { source: 'level', symbol: '⧗', name: '시간 왜곡의 모래시계', effect: '적을 처치할 때마다 모든 특수 무기의 남은 재사용 대기시간 −0.1초. 균열 수호자를 처치하면 −2초.' },
  cloak: { source: 'level', symbol: '♤', name: '잔상 망토', effect: '회피로 적을 통과하면 1.5초간 적 탄에 맞지 않으며, 그동안 첫 기본 사격의 피해 +100%.' },
  stormCore: { source: 'level', symbol: '⊛', name: '폭풍의 핵', effect: '1,500px 이동할 때마다 전하가 차고, 다음 기본 사격이 반경 160px 충격파(공격력의 200%)를 방출합니다.' },
  lightHands: { source: 'level', symbol: '✋', name: '가벼운 손놀림', effect: '기본 사격 속도 +15%, 특수 무기 재사용 대기시간 −10%.' },
  grazeFeather: { source: 'level', symbol: '〻', name: '스침의 깃', effect: '회피로 적 탄을 통과하면 회피 재사용 대기시간 −1초. 초당 최대 1회.' },
  // ── 문서 4장: 리스크-리턴 및 유틸리티 ──
  berserker: { source: 'level', symbol: '◐', name: '광전사의 피 묻은 안대', effect: '잃은 체력 1%당 모든 피해 +0.8%.' },
  greedDice: { source: 'level', symbol: '⚄', name: '탐욕의 황금 주사위', effect: '판 종료 시 받는 토큰 +40%. 적에게 받는 피해 +20%. 다음 판으로 가져갈 수 없습니다.', carry: false },
  glassCannon: { source: 'level', symbol: '◇', name: '유리 대포', effect: '모든 공격 피해 +80%. 최대 체력이 1로 고정됩니다.' },
  unstableCore: { source: 'level', symbol: '⚛', name: '불안정한 마력 코어', effect: '특수 무기 발동 시 25% 확률로 재사용 대기시간이 즉시 초기화되고, 10% 확률로 최대 체력의 5% 피해를 입습니다(이 피해로 쓰러지지 않음).' },
  collectorPack: { source: 'level', symbol: '⛁', name: '수집가의 배낭', effect: '보유한 유물 1개당 모든 피해 +4%, 최대 체력 +10.' },
  gamblerCoin: { source: 'level', symbol: '⊜', name: '도박꾼의 동전', effect: '균열 수호자를 처치하면 동전을 던질지 고릅니다. 앞면이면 유물 선택 1회 추가, 뒷면이면 현재 체력 15%와 이번 유물 선택을 잃습니다.' },
  magnetCore: { source: 'level', symbol: '⋒', name: '자석 핵', effect: '경험치 흡수 범위 +60%, 자석이 떨어질 확률 2배. 자석을 주우면 5초간 공격력·기본 사격 속도·이동 속도 +50%.' },
  fortuneCard: { source: 'level', symbol: '✪', name: '점술가의 카드', effect: '레벨업 새로고침 +2회. 레벨업 후보가 3개에서 2개로 줄어듭니다. 다음 판으로 가져갈 수 없습니다.', carry: false },
  clover: { source: 'level', symbol: '♣', name: '네잎 클로버 브로치', effect: '행운 +4. 최대 체력 −10. 다음 판으로 가져갈 수 없습니다.', carry: false },
  rottingGem: { source: 'level', symbol: '◍', name: '썩어 가는 보석', effect: '경험치 획득량 +100%. 경험치 보석이 바닥에 떨어진 지 10초가 지나면 사라집니다.' },
  namelessContract: { source: 'level', symbol: '✎', name: '이름 없는 계약', effect: '레벨업 보상에 일반 등급이 나오지 않습니다. 레벨업에 필요한 경험치 +40%.' },
  hastyInvite: { source: 'level', symbol: '✉', name: '서두른 초대장', effect: '보스가 지금 바로 등장합니다. 보스를 처치하면 받는 토큰 +50%. 다음 판으로 가져갈 수 없습니다.', carry: false },
  // ── 문서 5장: 드랍 아이템 및 엘리트 연동 ──
  alchemistFlask: { source: 'level', symbol: '⚱', name: '연금술사의 병', effect: '체력이 가득 찬 상태에서 회복 물약을 주우면 8초간 모든 피해 +30%.' },
  powderBox: { source: 'level', symbol: '✠', name: '화약 상자', effect: '균열 폭탄이 떨어질 확률 3배. 폭탄이 보스에게도 최대 체력의 3% 피해를 줍니다.' },
  migrantFeather: { source: 'level', symbol: '➹', name: '철새의 깃털', effect: '아이템을 주울 때마다 5초간 이동 속도 +25%.' },
  riftCrystal: { source: 'level', symbol: '❖', name: '균열 결정', effect: '균열 수호자를 처치하면 다음 레벨업 후보 중 1장이 희귀 등급 이상으로 나옵니다.' },
  // ── 문서 6장: 특수 무기 전용 ──
  returnRing: { source: 'elite', symbol: '↺', weapon: 'axe', name: '귀환의 고리', effect: '부메랑 도끼가 돌아올 때 타격 범위가 +50%에서 +100%까지 점점 커집니다. 투척 간격 +20%.' },
  winterLantern: { source: 'elite', symbol: '❄', weapon: 'turret', name: '겨울 등불', effect: '서리 포탑 지속시간 −30%. 포탑을 한 번에 2대 설치합니다.' },
  constellation: { source: 'elite', symbol: '✧', weapon: 'spear', name: '별자리 창끝', effect: '관통 창이 적 3마리 이상을 꿰뚫으면 끝 지점에서 창 2개가 좌우로 발사됩니다(피해 50%). 조준 시간 +0.3초.' },
  secondBell: { source: 'elite', symbol: '♫', weapon: 'mark', name: '두 번째 종소리', effect: '낙뢰 표식이 기본탄 3회 대신 2회 명중으로 발동합니다. 낙뢰 범위 −25%.' },
  plagueJar: { source: 'elite', symbol: '⚘', weapon: 'infection', name: '역병 항아리', effect: '감염이 번질 때 감염되는 적 +2마리. 감염 피해 −20%.' },
} as const;

export type RelicId = keyof typeof RELICS;
export type RelicSource = (typeof RELICS)[RelicId]['source'] | 'opening';
export const OPENING_RELIC_LEVEL = 3;
export const OPENING_RELICS = ['awl', 'anvil', 'catalyst', 'scatterSeal', 'bountyKnot', 'hawkLens'] as const satisfies readonly RelicId[];
export const RELIC_IDS = Object.keys(RELICS) as RelicId[];
export const CARRY_LIMIT = 3;

type WeaponRelicId = { [Id in RelicId]: (typeof RELICS)[Id] extends { weapon: string } ? Id : never }[RelicId];

const FUSION_EFFECTS: Record<WeaponRelicId, string> = {
  crown: '뇌광 연쇄가 주변 적 최대 2마리에게 더 튀고 맞은 적 자리마다 폭발합니다. 직접 피해 −25%.',
  secondBell: '뇌광 연쇄 발동 간격이 3분의 1 짧아집니다. 타격 반경 −25%.',
  cog: '쌍날 폭풍 칼날 +1개, 타격 반경 +20%. 이 무기로 처치할 때마다 피해 +0.5%, 최대 +15%.',
  returnRing: '쌍날 폭풍이 돌아올 때 타격 반경이 +50%에서 +100%까지 커집니다. 투척 간격 +20%.',
  fuse: '빙결 지뢰진 폭발 자리에 2초간 서리 장판을 남깁니다. 장판의 초당 피해는 폭발 피해의 10%.',
  winterLantern: '빙결 지뢰진이 두 곳에서 폭발합니다. 폭발 1회 피해와 둔화 지속시간 −30%.',
  laces: '잿불 균열에 맞은 적은 2초간 느려지고 0.45초마다 폭발 피해의 20%만큼 화상을 입습니다.',
  nail: '잿불 균열에 맞은 몬스터의 이동을 0.8초간 멈춥니다. 보스와 돌진 중인 적에게는 피해 +40%.',
  constellation: '잔영 관통포 조준 +0.3초. 세 대상 이상에 명중하면 마지막 적중 지점에서 양옆으로 포격이 갈라집니다. 갈래당 피해 50%.',
  mirror: '잔영 관통포가 반대 방향으로도 발사되고, 적을 처치하면 한 번 더 발사됩니다. 포격 1회 피해 −30%.',
  anchor: '검은 역병 폭발 반경 +50%, 적을 끌어오는 힘 +50%.',
  plagueJar: '검은 역병의 폭발이 범위 밖의 가까운 적 최대 2마리에게도 전염됩니다. 피해 −20%.',
};

export function relicDescription(id: RelicId, fusions: Iterable<FusionId> = []): string {
  const relic = RELICS[id];
  if (!('weapon' in relic)) return relic.effect;
  const bonus = `융합 무기 피해 +${FUSION_RELIC_DAMAGE_BONUS * 100}%.`;
  if (isFusionIngredient(fusions, relic.weapon)) return `${FUSION_EFFECTS[id as WeaponRelicId]} ${bonus}`;
  return `${relic.effect} 무기가 없으면 모든 공격 피해 +5%. 융합 후 전용 효과 적용 및 ${bonus}`;
}

export function validRelicIds(value: unknown): RelicId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is RelicId => typeof id === 'string' && Object.hasOwn(RELICS, id)))];
}

/** 판 밖 성장에 영향을 주는 유물은 다음 판으로 가져갈 수 없다 (문서 7장). */
export function carryable(id: RelicId): boolean {
  const relic = RELICS[id];
  return !('carry' in relic) || relic.carry !== false;
}

export function validCarry(value: unknown): RelicId[] {
  return validRelicIds(value).filter(carryable).slice(0, CARRY_LIMIT);
}
