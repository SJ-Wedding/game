export const WEAPONS = {
  chain: { name: '연쇄 번개', description: '가까운 적에게 번개를 쏴 주변 적 3마리까지 연쇄 타격합니다.', color: 0x8be9ff },
  mine: { name: '균열 지뢰', description: '지나온 자리에 지뢰를 설치합니다. 적이 접근해 폭발할 때까지 남습니다.', color: 0xffad67 },
  orbit: { name: '회전 칼날', description: '두 개의 칼날이 몸 주위를 돌며 닿는 적을 벱니다.', color: 0xcce9f5 },
  axe: { name: '부메랑 도끼', description: '적을 관통하며, 돌아올 때 현재 위치를 따라옵니다.', color: 0xffd17c },
  turret: { name: '서리 포탑', description: '잠시 머무는 포탑이 주변 적에게 둔화탄을 쏩니다.', color: 0x96c8ff },
  flame: { name: '화염 발자국', description: '움직인 자리에 잠깐 남는 불길이 적을 태웁니다.', color: 0xff9559 },
  barrier: { name: '균열 장벽', description: '회피 경로에 균열을 남겨 처음 건너는 적에게 피해를 줍니다.', color: 0xd698ff },
  spear: { name: '관통 창', description: '잠깐 조준한 뒤 같은 선 위의 적을 한꺼번에 꿰뚫습니다.', color: 0xffecac },
  mark: { name: '낙뢰 표식', description: '같은 적에게 기본탄을 세 번 맞히면 주변에도 낙뢰가 떨어집니다.', color: 0xe2bbff },
  echo: { name: '메아리 사격', description: '이전 사격 위치에 나타난 잔영이 같은 방향으로 한 발 더 쏩니다.', color: 0x7df2dd },
  gravity: { name: '중력 구체', description: '느리게 전진하며 일반 적을 끌어당긴 뒤 폭발합니다.', color: 0xb6a2ff },
  infection: { name: '처치 전염', description: '적을 감염시킵니다. 감염된 적이 쓰러지면 주변 적으로 번집니다.', color: 0xa6ea73 },
} as const;

export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export const WEAPON_MAX_RANK = 3;
export const WEAPON_DAMAGE_PER_RANK = 0.2;

/** 첫 값은 획득 직후, 이후 값은 Lv 2와 Lv 3 효과다. */
export const WEAPON_RANK_EFFECTS = {
  chain: { label: '최대 연쇄 대상', unit: '마리', values: [4, 5, 6] },
  mine: { label: '설치 주기', unit: '초', values: [2.8, 2.5, 2.2] },
  orbit: { label: '칼날 수', unit: '개', values: [2, 3, 4] },
  axe: { label: '도끼 타격 반경', unit: 'px', values: [13, 17, 21] },
  turret: { label: '설치 주기', unit: '초', values: [6.5, 6, 5.5] },
  flame: { label: '불길 반경', unit: 'px', values: [29, 35, 41] },
  barrier: { label: '장벽 타격 반폭', unit: 'px', values: [11, 15, 19] },
  spear: { label: '관통 사거리', unit: 'px', values: [450, 510, 570] },
  mark: { label: '낙뢰 반경', unit: 'px', values: [66, 79, 92] },
  echo: { label: '방향당 잔영 탄환', unit: '발', values: [1, 2, 3] },
  gravity: { label: '끌어당김·폭발 반경', unit: 'px', values: [125, 145, 165] },
  infection: { label: '처치 시 전염 반경', unit: 'px', values: [96, 115, 134] },
} as const satisfies Record<WeaponId, { label: string; unit: string; values: readonly [number, number, number] }>;

export function weaponRankEffect(id: WeaponId, rank: number): number {
  const index = Math.min(WEAPON_MAX_RANK, Math.max(1, rank)) - 1;
  return WEAPON_RANK_EFFECTS[id].values[index];
}

export const WEAPON_FUSIONS = {
  storm: { name: '뇌광 연쇄', pair: ['chain', 'mark'], radius: 100, damage: 2.1 },
  bastion: { name: '빙결 지뢰진', pair: ['mine', 'turret'], radius: 112, damage: 2.0 },
  tempest: { name: '쌍날 폭풍', pair: ['orbit', 'axe'], radius: 78, damage: 2.5 },
  inferno: { name: '잿불 균열', pair: ['flame', 'barrier'], radius: 90, damage: 2.3 },
  volley: { name: '잔영 관통포', pair: ['spear', 'echo'], radius: 74, damage: 2.8 },
  eclipse: { name: '검은 역병', pair: ['gravity', 'infection'], radius: 128, damage: 1.8 },
} as const satisfies Record<string, { name: string; pair: readonly [WeaponId, WeaponId]; radius: number; damage: number }>;

export type FusionId = keyof typeof WEAPON_FUSIONS;
export const FUSION_IDS = Object.keys(WEAPON_FUSIONS) as FusionId[];
export const FUSION_HIT_WINDOW = 3;

export function isFusionIngredient(fusions: Iterable<FusionId>, weapon: string): boolean {
  for (const id of fusions) if (WEAPON_FUSIONS[id].pair.some((ingredient) => ingredient === weapon)) return true;
  return false;
}
