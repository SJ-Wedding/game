import type { Loadout } from './characters';
import { DAGGER_BLEED_CHAIN, DAGGER_THRUST, SCIMITAR_THRUST_BONUSES } from './roan';
import { FUSION_RELIC_DAMAGE_BONUS, isFusionIngredient, type FusionId } from './weapons';

export const TRIPLE_CHOICE_COUNT = 3;

export const RELICS = {
  // ── 루멘 균열 수호자 유물 (유물 기획안) ──
  lumenCrystal: { source: 'elite', symbol: '⬖', character: 'lumen', name: '마력 증폭 수정', effect: '루멘 전용 강화 1점당 무기 피해 보너스 3% → 4.5%. 최대 체력 −10%.' },
  lumenSight: { source: 'elite', symbol: '◬', character: 'lumen', name: '현자의 시야', effect: '전용 무기 사거리 +25% (연쇄: 첫 대상 탐색 거리, 포탑: 사격 거리).' },
  lumenRune: { source: 'elite', symbol: 'ᛉ', character: 'lumen', name: '약점 표식의 룬', effect: '전용 무기에 3번 맞은 적은 4초간 받는 피해 +15%. 전용 무기 피해 −5%.' },
  lumenCycle: { source: 'elite', symbol: '⟳', character: 'lumen', name: '마나 순환 고리', effect: '적 25마리를 처치할 때마다 전용 무기 대기시간이 즉시 초기화됩니다.' },
  lumenCloak: { source: 'elite', symbol: '☍', character: 'lumen', name: '정전기 망토', effect: '피격 시 반경 160px 안의 적에게 전용 무기 1타의 60% 피해를 줍니다. 재사용 2초.' },
  lumenStaff: { source: 'elite', symbol: '⚚', character: 'lumen', name: '집중의 지팡이', effect: '멈춰 있는 동안 전용 무기 피해 +20%. 이동 중에는 전용 무기 피해 −5%.' },
  chainCloud: { source: 'elite', symbol: '☁', character: 'lumen', lumenWeapon: 'chain', name: '뇌운 병', effect: '연쇄 번개의 첫 대상 자리에 3초간 뇌운이 남아 1초마다 반경 100px에 낙뢰(첫 타격의 40%)를 떨어뜨립니다. 연쇄 발동 간격 +10%.' },
  chainOverload: { source: 'elite', symbol: '⊕', character: 'lumen', lumenWeapon: 'chain', name: '과부하 축전지', effect: '한 번에 6회 이상 이어지면 마지막 대상 자리에서 반경 120px 폭발(첫 타격의 120%)이 일어납니다.' },
  chainRebound: { source: 'elite', symbol: '↯', character: 'lumen', lumenWeapon: 'chain', name: '되튐 증폭기', effect: '되튐 피해 30%·25%·20% → 45%·40%·35%, 연쇄 감쇠 최소값 0.4 → 0.5. 연쇄 발동 간격 +10%.' },
  chainDouble: { source: 'elite', symbol: '⫘', character: 'lumen', lumenWeapon: 'chain', name: '이중 방전 코일', effect: '25% 확률로 0.2초 뒤 연쇄 번개가 한 번 더 발동합니다(피해 60%).' },
  chainRod: { source: 'elite', symbol: '⚡', character: 'lumen', lumenWeapon: 'chain', name: '피뢰 표식', effect: '연쇄에 맞은 적이 4초 안에 쓰러지면 주변 적 2마리에게 번개가 튀어 각각 첫 타격의 50% 피해를 줍니다. 첫 대상 피해 −10%.' },
  chainConductor: { source: 'elite', symbol: '⌁', character: 'lumen', lumenWeapon: 'chain', name: '전도체 장갑', effect: '튐 거리 +40%, 분기 회로의 갈래 피해 50% → 65%.' },
  turretPermafrost: { source: 'elite', symbol: '❅', character: 'lumen', lumenWeapon: 'turret', name: '영구 동토 핵', effect: '둔화 0.9초 → 1.5초. 둔화된 적이 다시 맞으면 0.4초 빙결(이동 정지, 보스 제외). 포탑 피해 −10%.' },
  turretScope: { source: 'elite', symbol: '⊹', character: 'lumen', lumenWeapon: 'turret', name: '저격 망원경', effect: '사격 거리 +30%, 250px보다 먼 적에게 피해 +20%.' },
  turretBlast: { source: 'elite', symbol: '✳', character: 'lumen', lumenWeapon: 'turret', name: '자폭 냉각기', effect: '포탑이 사라질 때 그 자리에 반경 120px 서리 폭발(포탑 1발 피해의 300%)이 일어납니다.' },
  turretShotgun: { source: 'elite', symbol: '⋮', character: 'lumen', lumenWeapon: 'turret', name: '산탄 장전기', effect: '4발마다 3갈래 산탄을 발사합니다(각 60%). 포탑 사격 간격 +10%.' },
  turretMobile: { source: 'elite', symbol: '⇢', character: 'lumen', lumenWeapon: 'turret', name: '이동식 포대', effect: '포탑이 플레이어를 초당 60px로 따라옵니다. 포탑 지속시간 −15%.' },
  turretResonance: { source: 'elite', symbol: '≀', character: 'lumen', lumenWeapon: 'turret', name: '서리 공명기', effect: '포탑끼리 200px 안에 있으면 두 포탑의 사격 간격 −15%.' },
  // ── 로안 근접 특화 (기존 로안 유물 대체) ──
  chargeStance: { source: 'level', symbol: '➹', character: 'roan', name: '돌격 자세', effect: '공격 직후 0.4초간 이동 속도 +30%.' },
  meleeInstinct: { source: 'level', symbol: '⚇', character: 'roan', name: '근접 본능', effect: '몸 주위 100px 안의 적 1마리당 피해 +2%, 최대 +20%.' },
  bloodThirst: { source: 'elite', symbol: '♥', character: 'roan', name: '피의 갈증', effect: '근접 공격으로 10마리 처치할 때마다 체력 3 회복. 재생 효과 −50%.' },
  weaponThrow: { source: 'elite', symbol: '⤼', character: 'roan', name: '무기 투척술', effect: '12초마다 다음 공격이 무기를 던져 300px를 관통합니다(피해 150%).' },
  armorBreaker: { source: 'elite', symbol: '⛓', character: 'roan', name: '갑옷 파쇄자', effect: '같은 적을 3번 치면 5초간 그 적이 받는 피해 +12%.' },
  warriorBreath: { source: 'elite', symbol: '☄', character: 'roan', name: '전사의 숨결', effect: '체력 50% 이하일 때 공격 간격 −15%.' },
  toughMuscle: { source: 'elite', symbol: '✊', character: 'roan', name: '강인한 근육', effect: '최대 체력 +20%. 이동 속도 −5%.' },
  // ── 로안 상위 무기 전용 (24레벨에 고른 상위 무기의 유물만 등장) ──
  comboRhythm: { source: 'elite', symbol: '♪', character: 'roan', form: 'onehand', name: '연격의 리듬', effect: '연격이 발동하면 다음 공격 대기시간 −30%.' },
  sheathReflect: { source: 'elite', symbol: '⛨', character: 'roan', form: 'onehand', name: '칼집 반사', effect: '연격 추가 베기가 닿은 적 탄을 최대 2개 지웁니다.' },
  duelGrace: { source: 'elite', symbol: '⚜', character: 'roan', form: 'onehand', name: '결투의 품격', effect: '200px 안의 적이 1마리면 피해 +35%.' },
  giantGrip: { source: 'elite', symbol: '✋', character: 'roan', form: 'greatsword', name: '거인의 손잡이', effect: '피해 +20%. 이동 속도 −5%.' },
  earthSplitter: { source: 'elite', symbol: '⌇', character: 'roan', form: 'greatsword', name: '대지 가르기', effect: '공격 끝 지점에 반경 70px 검압(피해 40%).' },
  heavyMomentum: { source: 'elite', symbol: '⇶', character: 'roan', form: 'greatsword', name: '무거운 관성', effect: '한 번에 4마리 이상 맞히면 다음 공격 대기시간 −25%.' },
  vitalMark: { source: 'elite', symbol: '⊕', character: 'roan', form: 'rapier', name: '급소 표식', effect: '치명타를 맞은 적은 3초간 받는 피해 +15%.' },
  fencingStep: { source: 'elite', symbol: '⇄', character: 'roan', form: 'rapier', name: '펜싱 스텝', effect: '회피 후 2초간 치명타 확률 +30%p.' },
  rapidThrust: { source: 'elite', symbol: '⇉', character: 'roan', form: 'rapier', name: '연속 찌르기', effect: '치명타 시 0.1초 뒤 추가 찌르기(피해 50%).' },
  bloodFeast: { source: 'elite', symbol: '✚', character: 'roan', form: 'stiletto', name: '피의 축제', effect: '출혈 중인 적을 처치하면 체력 1 회복, 초당 최대 3.' },
  deepCut: { source: 'elite', symbol: '◢', character: 'roan', form: 'stiletto', name: '깊은 베임', effect: '출혈 피해 +25%. 직접 피해 −10%.' },
  bloodBurst: { source: 'elite', symbol: '✺', character: 'roan', form: 'stiletto', name: '혈류 폭발', effect: `출혈 폭발 반경 ${DAGGER_BLEED_CHAIN.burstRadius} → ${DAGGER_BLEED_CHAIN.burstRadiusRelic}px.` },
  desertWind: { source: 'elite', symbol: '≋', character: 'roan', form: 'scimitar', name: '사막의 바람', effect: `시미터 찌르기 폭 +${SCIMITAR_THRUST_BONUSES.desertWindWidth}px (최대 ${DAGGER_THRUST.maxWidth}px).` },
  crescentEdge: { source: 'elite', symbol: '◑', character: 'roan', form: 'scimitar', name: '초승달 칼날', effect: '출혈 중인 적을 처치하면 0.15초 뒤 추가 찌르기.' },
  bloodHook: { source: 'elite', symbol: 'ʃ', character: 'roan', form: 'scimitar', name: '피의 갈고리', effect: '출혈 중인 적을 치면 출혈 1중첩 추가.' },
  bladeDance: { source: 'elite', symbol: '⚘', character: 'roan', form: 'twinblades', name: '칼춤', effect: '연타마다 1초간 이동 속도 +5%, 최대 +25%.' },
  endlessWound: { source: 'elite', symbol: '∞', character: 'roan', form: 'twinblades', name: '끝없는 상처', effect: '적의 출혈 10중첩마다 그 적의 출혈 피해 +5%.' },
  shadowStrike: { source: 'elite', symbol: '⫽', character: 'roan', form: 'twinblades', name: '그림자 쌍격', effect: '5번째 공격마다 연타 +2.' },
  bellBlessing: { source: 'elite', symbol: '♫', character: 'roan', form: 'warmace', name: '종지기의 축복', effect: '기절 확률 +10%p.' },
  stunBeat: { source: 'elite', symbol: '⇟', character: 'roan', form: 'warmace', name: '기절 연타', effect: '기절한 적을 치면 다음 공격 대기시간 −20%.' },
  ironHead: { source: 'elite', symbol: '◉', character: 'roan', form: 'warmace', name: '쇠머리', effect: '적을 기절시키면 반경 60px 충격(피해 30%).' },
  poisonSpike: { source: 'elite', symbol: '☣', character: 'roan', form: 'morningstar', name: '독가시', effect: '파편에 맞은 적은 2초간 출혈(초당 피해 10%).' },
  spinSpike: { source: 'elite', symbol: '✲', character: 'roan', form: 'morningstar', name: '회전 가시', effect: '파편 관통 +1마리.' },
  spikeShield: { source: 'elite', symbol: '✷', character: 'roan', form: 'morningstar', name: '가시 방패', effect: '피격 시 파편 6개가 사방으로 튑니다.' },
  chainHook: { source: 'elite', symbol: '⚯', character: 'roan', form: 'flail', name: '사슬 감기', effect: '회전에 맞은 일반 적을 타격 지점으로 끌어당깁니다.' },
  centrifugeRush: { source: 'elite', symbol: '◌', character: 'roan', form: 'flail', name: '원심 폭주', effect: '회전 반경이 최대일 때 피해 +30%.' },
  chainGuard: { source: 'elite', symbol: '⛒', character: 'roan', form: 'flail', name: '쇠사슬 방어', effect: '회전이 닿은 적 탄을 최대 3개 지웁니다.' },
  quakeWave: { source: 'elite', symbol: '≈', character: 'roan', form: 'maul', name: '지진 파동', effect: '충격파가 1초 뒤 한 번 더(피해 50%).' },
  crushScar: { source: 'elite', symbol: '⌁', character: 'roan', form: 'maul', name: '분쇄 자국', effect: '충격파 자리에 2초간 균열, 0.5초마다 피해 15%와 둔화.' },
  earthFury: { source: 'elite', symbol: '⛰', character: 'roan', form: 'maul', name: '대지의 분노', effect: '충격파 기절 시간 +0.4초. 공격 간격 +10%.' },
  lumberjack: { source: 'elite', symbol: '♣', character: 'roan', form: 'greataxe', name: '나무꾼의 집념', effect: '처치할 때마다 다음 공격 피해 +10%, 최대 5중첩.' },
  sever: { source: 'elite', symbol: '✂', character: 'roan', form: 'greataxe', name: '절단', effect: '체력 15% 이하 일반 적은 즉사합니다.' },
  whirlwind: { source: 'elite', symbol: '❂', character: 'roan', form: 'greataxe', name: '휘몰아치기', effect: '5번째 공격마다 360° 회전 베기.' },
  spearWall: { source: 'elite', symbol: '⊞', character: 'roan', form: 'halberd', name: '창벽', effect: '밀쳐낸 일반 적을 0.5초 기절시킵니다.' },
  thrustLink: { source: 'elite', symbol: '⇥', character: 'roan', form: 'halberd', name: '찌르기 연계', effect: '찌르기에 맞은 적을 다음 베기가 맞히면 피해 +30%.' },
  guardStance: { source: 'elite', symbol: '▣', character: 'roan', form: 'halberd', name: '수비 자세', effect: '멈춰 있는 동안 받는 피해 −15%.' },
  twinThrow: { source: 'elite', symbol: '⫶', character: 'roan', form: 'throwingaxe', name: '쌍도끼 투척', effect: '투척 시 2자루를 함께 던집니다(두 번째 피해 60%).' },
  boomerangEdge: { source: 'elite', symbol: '↺', character: 'roan', form: 'throwingaxe', name: '부메랑 날', effect: '돌아오는 도끼 피해 +50%.' },
  axeRain: { source: 'elite', symbol: '⁂', character: 'roan', form: 'throwingaxe', name: '도끼 비', effect: '투척 도끼가 맞은 자리에 작은 도끼 3개가 튑니다(피해 25%).' },
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
  mirror: { source: 'elite', symbol: '⟐', weapon: 'echo', name: '틈새의 거울', effect: '잔영이 반대 방향으로도 사격합니다. 발동마다 잔영 탄으로 처음 적을 처치한 자리에서 잔영이 한 번 더 발동합니다. 잔영 피해 −30%.' },
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
  // ── 유물 추가 기획안: 공통 25 ──
  fuseChain: { source: 'level', symbol: '✸', name: '도화선 사슬', effect: '폭발로 처치된 적이 반경 70px 폭발(그 적 최대 체력의 12%)을 일으킵니다. 연쇄 최대 4단, 초당 20회. 폭발 수단이 없어도 15번째 처치마다 1회 폭발합니다.' },
  slaughterDrum: { source: 'level', symbol: '☰', name: '학살의 북소리', effect: '처치마다 광란 1중첩(3초, 처치 시 갱신). 중첩당 공격 속도 +1%, 최대 30중첩. 30중첩이면 이동 속도 +15%.' },
  bountyLedger: { source: 'elite', symbol: '✍', name: '현상금 장부', effect: '균열 수호자를 처치할 때마다 이번 판 모든 피해 +6%, 최대 +36%.' },
  plagueMask: { source: 'level', symbol: '☤', name: '역병 의사의 가면', effect: '적에게 걸린 상태이상(둔화·빙결·기절·화상·감염·출혈) 1종류당 그 적이 받는 피해 +8%, 최대 +32%.' },
  frostShard: { source: 'level', symbol: '❆', name: '서리 결정', effect: '둔화·빙결된 적이 죽으면 얼음 파편 4개가 튀어, 맞은 적에게 처치한 적 최대 체력의 10% 피해와 1초 둔화를 줍니다.' },
  emberJar: { source: 'level', symbol: '♨', name: '불씨 항아리', effect: '모든 공격이 10% 확률로 화상을 겁니다(3초, 초당 1타 피해의 25%, 최대 3중첩).' },
  sporePouch: { source: 'level', symbol: '✿', name: '역병 포자 주머니', effect: '모든 공격이 8% 확률로 감염을 겁니다(4초, 초당 1타 피해의 20%). 감염된 적이 죽으면 가까운 2마리에게 옮습니다.' },
  chargeCell: { source: 'level', symbol: '⌬', name: '전하 축적기', effect: '번개 피해를 받은 적에게 3초간 전하. 전하 걸린 적을 다른 공격이 맞히면 20% 확률로 가까운 적 2마리에게 감전(1타 피해의 60%).' },
  shadowStep: { source: 'level', symbol: '◒', name: '그림자 발자국', effect: '회피 경로에 2초간 그림자 길이 남습니다. 길 위의 적은 둔화되고 초당 1타 피해의 120%를 받습니다.' },
  sprintEngine: { source: 'level', symbol: '➽', name: '질주 엔진', effect: '기본보다 빠른 이동 속도 1%당 모든 피해 +0.6%, 최대 +40%.' },
  rallyFlag: { source: 'level', symbol: '⚑', name: '진지의 깃발', effect: '1.5초 멈추면 반경 220px 진지가 생깁니다(멈춰 있는 동안 유지). 진지 안에서 공격 속도·특수 무기 발동 속도 +20%, 받는 피해 −10%.' },
  vengeance: { source: 'level', symbol: '☬', name: '보복의 맹세', effect: '피격 후 4초간 모든 피해 +30%(다시 맞으면 갱신).' },
  painVault: { source: 'elite', symbol: '⊗', name: '고통의 저장고', effect: '받은 피해를 저장합니다(최대 최대 체력의 100%). 회피하면 저장량의 300%를 반경 200px에 방출하고 비웁니다.' },
  cliffDance: { source: 'level', symbol: '⚠', name: '벼랑 끝의 춤', effect: '체력 30% 이하에서 회피 대기시간 −50%, 처치마다 체력 1 회복(초당 최대 3).' },
  phoenixAsh: { source: 'elite', symbol: '☀', name: '불사조의 재', effect: '마지막 성냥·수호천사의 깃털·부활이 발동하면 반경 300px 화염 폭발(1타 피해의 1,000%) 후 10초간 모든 피해 +60%. 부활 수단이 없으면 판마다 한 번 체력 30%로 부활합니다.' },
  treasureMap: { source: 'level', symbol: '⌘', name: '보물 지도', effect: '균열 수호자 유물 후보가 3장에서 4장으로 늘어납니다. 다음 판으로 가져갈 수 없습니다.', carry: false },
  gemStorm: { source: 'level', symbol: '✶', name: '보석 폭풍', effect: '경험치 보석을 주울 때 4% 확률로 그 자리 반경 120px 폭발(1타 피해의 150%). 자석으로 끌려온 보석은 모두 폭발합니다(최대 30개).' },
  luckyStrike: { source: 'level', symbol: '☆', name: '행운의 일격', effect: '모든 공격이 (행운 × 1.5)% 확률로 피해 3배.' },
  riftCore: { source: 'elite', symbol: '⊚', name: '균열 핵 조각', effect: '균열 수호자가 죽은 자리에 4초간 균열 핵이 생겨 반경 260px 일반 적을 끌어당기고, 끝날 때 폭발합니다(수호자 최대 체력의 15%).' },
  overcharge: { source: 'level', symbol: '▤', name: '과충전 배터리', effect: '특수 무기·전용 무기·합체 무기가 5번 발동할 때마다 다음 발동 피해 +150%, 범위 +30%.' },
  echoBrand: { source: 'elite', symbol: '⟲', name: '메아리 각인', effect: '특수 무기·전용 무기로 처치하면 12% 확률로 그 무기가 0.2초 뒤 한 번 더 발동합니다(무기마다 2초에 1회).' },
  vortexCharm: { source: 'level', symbol: '❁', name: '소용돌이 부적', effect: '8초마다 반경 320px 일반 적을 몸 주위 120px까지 끌어당깁니다.' },
  expansionSeal: { source: 'level', symbol: '⤢', name: '확장의 인장', effect: '모든 범위(폭발·장판·충격파·특수 무기 반경·근접 거리) +20%. 공격 속도 −8%.' },
  stoppedWatch: { source: 'elite', symbol: '⧖', name: '멈춘 회중시계', effect: '40초마다 2초간 화면의 일반 적과 적 탄이 멈춥니다. 멈춘 적이 받는 피해 +40%.' },
  soulHarvest: { source: 'level', symbol: '☽', name: '영혼 수확', effect: '처치 시 20% 확률로 영혼 구슬이 생겨 0.5초 뒤 가장 가까운 적에게 날아가 1타 피해의 120%를 줍니다(관통 1).' },
  // ── 유물 추가 기획안: 균열 사수 5 ──
  armoryKey: { source: 'elite', symbol: '⚙', character: 'ranger', name: '무기고 열쇠', effect: '보유한 특수 무기 1종당 기본탄 피해 +5%, Lv3 무기는 1종당 +3% 추가. 합체 무기는 2종으로 셉니다.' },
  fusionCatalyst: { source: 'elite', symbol: '⧉', character: 'ranger', name: '융합 촉매', effect: '합체 무기가 발동하면 1.5초간 특수 무기 발동 간격 −30%.' },
  casingStorm: { source: 'level', symbol: '⁘', character: 'ranger', name: '탄피 폭풍', effect: '기본 사격 20회마다 사방 12방향으로 탄막을 쏩니다(각 기본탄 피해의 60%, 관통 1).' },
  overheat: { source: 'level', symbol: '☢', character: 'ranger', name: '과열 총신', effect: '기본탄 30회 명중마다 5초간 과열. 과열 중 기본탄이 명중 지점에서 반경 50px 폭발(기본탄 피해의 40%).' },
  marksman: { source: 'elite', symbol: '⌾', character: 'ranger', name: '사수의 표적', effect: '기본탄에 3번 맞은 적은 4초간 표적. 특수 무기가 표적을 맞히면 피해 +40%, 표적이 죽으면 기본탄 6발이 사방으로 퍼집니다.' },
  // ── 유물 추가 기획안: 루멘 5 ──
  manaOverload: { source: 'elite', symbol: '❋', character: 'lumen', name: '마력 과부하', effect: '전용 강화 점수 10점 이상이면 전용 무기 발동이 25% 확률로 증폭(피해 2배, 범위·연쇄 거리 +30%).' },
  dualGrimoire: { source: 'elite', symbol: '⧈', character: 'lumen', name: '이중 시전서', effect: '고르지 않은 전용 무기(연쇄 번개 ↔ 서리 포탑)를 피해 50%로 함께 사용합니다. 전용 강화는 고른 무기만 받습니다.' },
  thunderRod: { source: 'elite', symbol: '↟', character: 'lumen', lumenWeapon: 'chain', name: '뇌전 피뢰주', effect: '연쇄가 6회 이상 이어지면 마지막 대상 자리에 4초간 피뢰주가 서서 1초마다 주변 적 3마리에게 연쇄(첫 타격의 30%).' },
  blizzardCore: { source: 'elite', symbol: '❉', character: 'lumen', lumenWeapon: 'turret', name: '눈보라 핵', effect: '포탑이 3대 이상이면 포탑들을 잇는 영역에 눈보라. 안의 적은 둔화되고 초당 포탑 1발 피해의 50%를 받습니다.' },
  manaBurst: { source: 'level', symbol: '⇝', character: 'lumen', name: '마나 폭주 망토', effect: '회피하면 전용 무기가 즉시 발동합니다(재사용 6초). 포탑은 회피를 끝낸 자리에 설치됩니다.' },
  // ── 유물 추가 기획안: 로안 5 ──
  warCry: { source: 'elite', symbol: '⚐', character: 'roan', name: '전장의 함성', effect: '장비를 고를 때마다(12·24·36레벨) 최대 체력 +10%, 근접 피해 +8%. 36레벨 각성 때 반경 300px 적을 2초 기절시킵니다(보스 제외).' },
  bladeWave: { source: 'level', symbol: '≫', character: 'roan', name: '검기', effect: '근접 공격 4회마다 공격 방향으로 검기를 발사합니다(거리 300px, 관통, 근접 피해의 60%).' },
  counterMaster: { source: 'elite', symbol: '⤺', character: 'roan', name: '반격의 달인', effect: '회피 후 1초 안의 첫 공격 피해 +60%. 회피로 적 탄을 통과하면 회피 대기시간 −0.5초.' },
  ironCharge: { source: 'elite', symbol: '⇛', character: 'roan', name: '철벽 돌진', effect: '회피가 돌진으로 바뀌어 경로의 적에게 근접 피해의 100%를 주고 밀쳐냅니다. 회피 거리 +20%.' },
  bloodWind: { source: 'level', symbol: '❦', character: 'roan', name: '피바람', effect: '체력을 1 회복할 때마다 다음 근접 공격 피해 +2%, 최대 +60%(공격하면 소모).' },
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
  if ('form' in relic) return `${relic.effect} 다른 상위 무기를 고르면 효과 대신 검 피해 +5%.`;
  if (!('weapon' in relic)) return relic.effect;
  const bonus = `융합 무기 피해 +${FUSION_RELIC_DAMAGE_BONUS * 100}%.`;
  if (isFusionIngredient(fusions, relic.weapon)) return `${FUSION_EFFECTS[id as WeaponRelicId]} ${bonus}`;
  return `${relic.effect} 무기가 없으면 모든 공격 피해 +5%. 융합 후 전용 효과 적용 및 ${bonus}`;
}

// 탄환 전용 유물과 무기를 새로 발동시키는 유물은 전용 공격 빌드에서 제외한다.
const RANGED_RELICS = new Set<RelicId>([
  'awl', 'anvil', 'scatterSeal', 'hawkLens', 'chainOrb', 'slayerSeal', 'twinBlade', 'splitHead',
  'focusRing', 'executioner', 'sniperGlove', 'pulseBarrel', 'fifthBell', 'stormCore', 'compass', 'whetstone',
]);

export function relicAllowed(id: RelicId, loadout: Loadout): boolean {
  const relic = RELICS[id];
  if ('character' in relic) {
    if (loadout.character !== relic.character) return false;
    return !('lumenWeapon' in relic) || (loadout.character === 'lumen' && loadout.weapon === relic.lumenWeapon);
  }
  if (loadout.character === 'ranger') return true;
  if ('weapon' in relic) return loadout.character === 'lumen' && loadout.weapon === relic.weapon;
  if (loadout.character === 'roan' && (id === 'heart' || id === 'catalyst' || id === 'unstableCore' || id === 'hourglass'
    || id === 'chargeCell' || id === 'overcharge' || id === 'echoBrand')) return false;
  return !RANGED_RELICS.has(id);
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

/** 수호자의 정수: 균열 수호자 유물 후보가 3개보다 적을 때 빈칸을 채우는 대체 보상. 유물이 아니므로 다음 판으로 가져가지 않는다. */
export const ESSENCES = {
  power: { symbol: '✊', name: '수호자의 정수: 힘', effect: '모든 공격 피해 +4%.' },
  life: { symbol: '✙', name: '수호자의 정수: 생명', effect: '최대 체력 +15, 즉시 15 회복.' },
  swift: { symbol: '➠', name: '수호자의 정수: 신속', effect: '베기·기본 사격 속도 +5%.' },
} as const;
export type EssenceId = keyof typeof ESSENCES;
export const ESSENCE_IDS = Object.keys(ESSENCES) as EssenceId[];
export const ESSENCE_MAX_STACK = 5;
