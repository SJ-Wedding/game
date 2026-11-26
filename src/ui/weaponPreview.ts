import { WEAPONS, WEAPON_FUSIONS, type FusionId, type WeaponId } from '../config/weapons';
import axe from '../assets/weapon-previews/axe.webp';
import barrier from '../assets/weapon-previews/barrier.webp';
import bastion from '../assets/weapon-previews/bastion.webp';
import chain from '../assets/weapon-previews/chain.webp';
import echo from '../assets/weapon-previews/echo.webp';
import eclipse from '../assets/weapon-previews/eclipse.webp';
import flame from '../assets/weapon-previews/flame.webp';
import gravity from '../assets/weapon-previews/gravity.webp';
import inferno from '../assets/weapon-previews/inferno.webp';
import infection from '../assets/weapon-previews/infection.webp';
import mark from '../assets/weapon-previews/mark.webp';
import mine from '../assets/weapon-previews/mine.webp';
import orbit from '../assets/weapon-previews/orbit.webp';
import spear from '../assets/weapon-previews/spear.webp';
import storm from '../assets/weapon-previews/storm.webp';
import tempest from '../assets/weapon-previews/tempest.webp';
import turret from '../assets/weapon-previews/turret.webp';
import volley from '../assets/weapon-previews/volley.webp';
import { el } from './dom';

type PreviewId = WeaponId | FusionId;

export const WEAPON_PREVIEWS = {
  axe, barrier, bastion, chain, echo, eclipse, flame, gravity, inferno, infection, mark, mine, orbit, spear, storm, tempest, turret, volley,
} satisfies Record<PreviewId, string>;

export function weaponPreview() {
  const title = el('strong');
  const image = el('img', { width: '344', height: '206', decoding: 'async' });
  const description = el('small');
  const tooltip = el('div', {
    id: 'status-weapon-preview', class: 'weapon-effect-preview', role: 'tooltip', popover: 'manual',
  }, [title, image, description]);
  let active: HTMLButtonElement | null = null;

  function show(button: HTMLButtonElement, id: PreviewId): void {
    if (active === button) return;
    const fusion = WEAPON_FUSIONS[id as FusionId];
    const weapon = WEAPONS[id as WeaponId];
    const name = fusion?.name ?? weapon.name;
    active = button;
    title.textContent = name;
    description.textContent = fusion?.effect ?? weapon.description;
    image.src = WEAPON_PREVIEWS[id];
    image.alt = `${name} 인게임 효과`;
    if (!tooltip.matches(':popover-open')) tooltip.showPopover();

    const anchor = button.getBoundingClientRect();
    const { width, height } = tooltip.getBoundingClientRect();
    const gap = 10;
    const { clientWidth, clientHeight } = document.documentElement;
    const left = Math.min(clientWidth - width - gap, Math.max(gap, anchor.x + (anchor.width - width) / 2));
    const preferredTop = anchor.bottom + gap + height <= clientHeight - gap ? anchor.bottom + gap : anchor.top - height - gap;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.min(clientHeight - height - gap, Math.max(gap, preferredTop))}px`;
  }

  function hide(button: HTMLButtonElement): void {
    if (active !== button) return;
    active = null;
    tooltip.hidePopover();
  }

  function trigger(id: PreviewId, label: string, extraClass = ''): HTMLButtonElement {
    const button = el('button', {
      type: 'button', class: `weapon-preview-trigger ${extraClass}`, 'data-weapon-preview': id,
      'aria-describedby': tooltip.id, text: label,
    });
    button.addEventListener('pointerenter', () => show(button, id));
    button.addEventListener('pointerleave', () => { if (document.activeElement !== button) hide(button); });
    button.addEventListener('focus', () => show(button, id));
    button.addEventListener('blur', () => { if (!button.matches(':hover')) hide(button); });
    return button;
  }

  return { tooltip, trigger };
}
