export const WEAPONS = {
  chain: { name: '연쇄 번개', description: '가까운 적에게 번개를 쏴 주변 적 3마리까지 연쇄 타격합니다.', color: 0x8be9ff },
  mine: { name: '균열 지뢰', description: '지나온 자리에 지뢰를 설치합니다. 적이 접근해 폭발할 때까지 남습니다.', color: 0xffad67 },
  orbit: { name: '회전 칼날', description: '두 개의 칼날이 몸 주위를 돌며 닿는 적을 벱니다.', color: 0xcce9f5 },
  axe: { name: '부메랑 도끼', description: '적을 관통하며, 돌아올 때 현재 위치를 따라옵니다.', color: 0xffd17c },
  turret: { name: '서리 포탑', description: '잠시 머무는 포탑이 주변 적에게 둔화탄을 쏩니다.', color: 0x96c8ff },
  flame: { name: '화염 발자국', description: '움직인 자리에 잠깐 남는 불길이 닿은 몬스터에게 피해를 줍니다. 플레이어는 불길을 밟아도 안전합니다.', color: 0xff9559 },
  barrier: { name: '균열 장벽', description: '회피 경로에 균열을 남겨 처음 건너는 적에게 피해를 줍니다.', color: 0xd698ff },
  spear: { name: '관통 창', description: '잠깐 조준한 뒤 같은 선 위의 적을 한꺼번에 꿰뚫습니다.', color: 0xffecac },
  mark: { name: '낙뢰 표식', description: '같은 적에게 기본탄을 세 번 맞히거나 기본탄으로 처치하면 그 자리에 낙뢰가 떨어져 주변 적도 맞힙니다.', color: 0xe2bbff },
  echo: { name: '메아리 사격', description: '이전 사격 위치에 나타난 잔영이 같은 방향으로 한 발 더 쏩니다.', color: 0x7df2dd },
  gravity: { name: '중력 구체', description: '느리게 전진하며 일반 적을 끌어당긴 뒤 폭발합니다.', color: 0xb6a2ff },
  infection: { name: '처치 전염', description: '적을 감염시킵니다. 감염된 적이 쓰러지면 주변 적으로 번집니다.', color: 0xa6ea73 },
} as const;

export type WeaponId = keyof typeof WEAPONS;
export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

export const WEAPON_MAX_RANK = 3;
export const WEAPON_DAMAGE_PER_RANK = 0.2;
export const WEAPON_GRADE_DAMAGE = { common: 0, rare: 0.08, epic: 0.16, legendary: 0.24 } as const;

export const SPECIAL_WEAPON_POWER: Record<WeaponId, number> = {
  chain: 1, infection: 0.75, mine: 1.45, orbit: 1.65, axe: 1.55,
  turret: 1.35, flame: 1.85, barrier: 1.65, spear: 1.55, mark: 1.65,
  echo: 1.6, gravity: 1.55,
};

/** 첫 값은 획득 직후, 이후 값은 Lv 2와 Lv 3 효과다. */
export const WEAPON_RANK_EFFECTS = {
  chain: { label: '최대 연쇄 대상', unit: '마리', values: [4, 5, 6] },
  mine: { label: '설치 주기', unit: '초', values: [2.4, 2.1, 1.8] },
  orbit: { label: '칼날 수', unit: '개', values: [2, 3, 4] },
  axe: { label: '도끼 타격 반경', unit: 'px', values: [13, 17, 21] },
  turret: { label: '설치 주기', unit: '초', values: [5.4, 4.9, 4.4] },
  flame: { label: '불길 반경', unit: 'px', values: [38, 46, 54] },
  barrier: { label: '장벽 타격 반폭', unit: 'px', values: [18, 24, 30] },
  spear: { label: '관통 사거리', unit: 'px', values: [540, 620, 700] },
  mark: { label: '낙뢰 반경', unit: 'px', values: [82, 98, 114] },
  echo: { label: '잔영 발동 주기', unit: '초', values: [1.25, 1, 0.75] },
  gravity: { label: '끌어당김·폭발 반경', unit: 'px', values: [145, 170, 195] },
  infection: { label: '처치 시 전염 반경', unit: 'px', values: [96, 115, 134] },
} as const satisfies Record<WeaponId, { label: string; unit: string; values: readonly [number, number, number] }>;

export function weaponRankEffect(id: WeaponId, rank: number): number {
  const index = Math.min(WEAPON_MAX_RANK, Math.max(1, rank)) - 1;
  return WEAPON_RANK_EFFECTS[id].values[index];
}

export const WEAPON_FUSIONS = {
  storm: { name: '뇌광 연쇄', pair: ['chain', 'mark'], radius: 155, damage: 5.6, interval: 1.4, range: 620, effect: '가장 가까운 적에게 낙뢰를 내리고 주변 적을 감전시킵니다.' },
  bastion: { name: '빙결 지뢰진', pair: ['mine', 'turret'], radius: 168, damage: 6.3, interval: 1.4, range: 460, effect: '적의 발밑에 서리 폭발을 일으켜 몬스터의 이동을 늦춥니다.' },
  tempest: { name: '쌍날 폭풍', pair: ['orbit', 'axe'], radius: 170, damage: 6.5, interval: 1.1, range: 0, effect: '플레이어 주위를 두 칼날이 휩씁니다.' },
  inferno: { name: '잿불 균열', pair: ['flame', 'barrier'], radius: 166, damage: 5.9, interval: 1.3, range: 530, effect: '적의 발밑을 불꽃 균열로 갈라 주변을 태우고 이동을 늦춥니다.' },
  volley: { name: '잔영 관통포', pair: ['spear', 'echo'], radius: 103, damage: 7.4, interval: 1.2, range: 760, effect: '잔영 포격이 조준 대상까지 관통하고 적중 지점 주변을 타격합니다.' },
  eclipse: { name: '검은 역병', pair: ['gravity', 'infection'], radius: 184, damage: 6.0, interval: 1.55, range: 610, effect: '몬스터를 독성 핵으로 끌어당긴 뒤 폭발시킵니다.' },
} as const satisfies Record<string, { name: string; pair: readonly [WeaponId, WeaponId]; radius: number; damage: number; interval: number; range: number; effect: string }>;

export type FusionId = keyof typeof WEAPON_FUSIONS;
export const FUSION_IDS = Object.keys(WEAPON_FUSIONS) as FusionId[];
export const FUSION_ARMOR_PIERCE = 0.5;
export const FUSION_RELIC_DAMAGE_BONUS = 0.15;

export function isFusionIngredient(fusions: Iterable<FusionId>, weapon: string): boolean {
  for (const id of fusions) if (WEAPON_FUSIONS[id].pair.some((ingredient) => ingredient === weapon)) return true;
  return false;
}
