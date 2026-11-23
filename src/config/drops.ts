/**
 * 몬스터 처치 시 떨어지는 아이템.
 * chance: 처치 1회당 확률 (0~1). 엘리트는 eliteGuaranteed 아이템을 반드시 떨어뜨린다.
 * 한 번의 처치에서 아이템은 최대 1개 (위에서부터 순서대로 판정).
 */
export type DropKind = 'heal' | 'magnet' | 'bomb';

export interface DropDef {
  kind: DropKind;
  name: string;
  chance: number;
}

export const DROPS: DropDef[] = [
  { kind: 'bomb', name: '균열 폭탄', chance: 0.0025 },
  { kind: 'magnet', name: '자석', chance: 0.004 },
  { kind: 'heal', name: '회복 물약', chance: 0.015 },
];

export const DROP_CONFIG = {
  /** 엘리트가 반드시 떨어뜨리는 아이템 */
  eliteGuaranteed: 'heal' as DropKind,
  /** 회복 물약 회복량 */
  healAmount: 25,
  /** 폭탄 피해 (화면 안 일반·엘리트 적, 보스 제외) */
  bombDamage: 200,
  /** 폭탄 범위: 플레이어 기준 가로·세로 반경(px) — 화면 크기 정도 */
  bombHalfWidth: 660,
  bombHalfHeight: 380,
  /** 바닥에 남아 있는 시간(초). 마지막 blinkTime 초는 깜빡임 */
  life: 20,
  blinkTime: 5,
  /** 동시에 바닥에 있을 수 있는 최대 개수 (넘으면 새 드랍 생략) */
  maxOnField: 8,
  /** 줍는 거리(플레이어 반지름 + 이 값) */
  pickupReach: 18,
};
