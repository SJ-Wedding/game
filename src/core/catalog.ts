import { PROGRESSION_CONFIG } from '../config/progression';
import type { EssenceId, RelicId } from '../config/relics';
import { ROAN_UPGRADES, ROAN_WEAPONS, type RoanUpgradeId, type RoanWeaponId } from '../config/roan';
import { UPGRADE_BY_ID, type UpgradeId } from '../config/upgrades';
import { WEAPON_FUSIONS, type FusionId } from '../config/weapons';
import type { RunResult, UpgradeChoice } from './types';

export type CatalogId =
  | `relic:${RelicId}` | `upgrade:${UpgradeId}` | `fusion:${FusionId}`
  | `roanWeapon:${RoanWeaponId}` | `roanUpgrade:${RoanUpgradeId}`
  | `essence:${EssenceId}` | 'fallback:heal';

export function catalogChoice(choice: UpgradeChoice): CatalogId | undefined {
  switch (choice.kind) {
    case 'upgrade': return `upgrade:${choice.def.id}`;
    case 'relic': return `relic:${choice.id}`;
    case 'fusion': return `fusion:${choice.id}`;
    case 'essence': return `essence:${choice.id}`;
    case 'fallback': return 'fallback:heal';
    case 'roanGear':
      return choice.gear.stage === 'weapon' ? `roanWeapon:${choice.gear.id}` : `roanUpgrade:${choice.gear.id}`;
    case 'coin': return undefined;
  }
}

export function catalogPick(id: string): CatalogId | undefined {
  const gear = id.startsWith('awaken:') ? id.slice('awaken:'.length) : id;
  if (Object.hasOwn(UPGRADE_BY_ID, id)) return `upgrade:${id as UpgradeId}`;
  if (Object.hasOwn(WEAPON_FUSIONS, id)) return `fusion:${id as FusionId}`;
  if (Object.hasOwn(ROAN_WEAPONS, gear)) return `roanWeapon:${gear as RoanWeaponId}`;
  if (Object.hasOwn(ROAN_UPGRADES, gear)) return `roanUpgrade:${gear as RoanUpgradeId}`;
  if (id === PROGRESSION_CONFIG.fallback.id) return 'fallback:heal';
  return undefined;
}

export function catalogRun(result: RunResult): CatalogId[] {
  const found = result.pickOrder.flatMap((pick) => {
    const id = catalogPick(pick);
    return id ? [id] : [];
  });
  for (const id of result.relics ?? []) found.push(`relic:${id}`);
  for (const { id } of result.upgrades) found.push(`upgrade:${id}`);
  for (const id of result.fusions ?? []) found.push(`fusion:${id}`);
  if (result.loadout?.character === 'lumen') found.push(`upgrade:${result.loadout.weapon}`);
  for (const [id, count] of Object.entries(result.essences ?? {})) {
    if (count > 0) found.push(`essence:${id as EssenceId}`);
  }
  return found;
}
