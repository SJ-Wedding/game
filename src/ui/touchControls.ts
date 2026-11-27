import type { GameSim } from '../core/sim';
import type { StorageLike } from '../storage/save';
import { el } from './dom';

type MoveSide = 'left' | 'right';
const TOUCH_LAYOUT_KEY = 'rift-arena/touch-layout';

/** Keeps the move and dodge pointers independent so a second finger can dodge mid-move. */
export class TouchControls {
  private readonly stick: HTMLElement;
  private readonly thumb: HTMLElement;
  private readonly dodge: HTMLButtonElement;
  private readonly cooldown: HTMLElement;
  private pointer: number | null = null;
  private active = false;
  private ready = false;
  private dodgeQueued = false;
  moveX = 0;
  moveY = 0;

  constructor(private readonly root: HTMLElement, private readonly storage: StorageLike | null) {
    try {
      if (storage?.getItem(TOUCH_LAYOUT_KEY) === 'right') root.dataset.moveSide = 'right';
    } catch {
      // 저장소에 접근할 수 없으면 기본 배치를 쓴다.
    }
    this.thumb = el('span', { class: 'touch-thumb', 'aria-hidden': 'true', text: '이동' });
    this.stick = el('div', { class: 'touch-stick', role: 'group', 'aria-label': '이동 조이스틱', 'data-testid': 'touch-stick' }, [
      el('span', { class: 'stick-up', 'aria-hidden': 'true', text: '▴' }),
      el('span', { class: 'stick-right', 'aria-hidden': 'true', text: '▸' }),
      el('span', { class: 'stick-down', 'aria-hidden': 'true', text: '▾' }),
      el('span', { class: 'stick-left', 'aria-hidden': 'true', text: '◂' }),
      this.thumb,
    ]);
    this.cooldown = el('small', { class: 'touch-dodge-cooldown' });
    this.dodge = el('button', { type: 'button', class: 'touch-dodge', 'aria-label': '회피', 'aria-disabled': 'true', 'data-testid': 'touch-dodge' }, [
      el('span', { class: 'touch-dodge-face' }, [el('strong', { text: '회피' }), this.cooldown]),
    ]);
    root.replaceChildren(this.stick, this.dodge);

    this.stick.addEventListener('pointerdown', (event) => {
      if (!this.active || this.pointer !== null || event.button !== 0) return;
      event.preventDefault();
      this.pointer = event.pointerId;
      this.stick.setPointerCapture(event.pointerId);
      this.aimStick(event);
    });
    this.stick.addEventListener('pointermove', (event) => {
      if (event.pointerId === this.pointer) this.aimStick(event);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.stick.addEventListener(type, (event) => {
        if (event.pointerId === this.pointer) this.releaseStick();
      });
    }
    this.dodge.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.queueDodge();
    });
    // A keyboard or assistive technology click has no pointerdown event.
    this.dodge.addEventListener('click', (event) => {
      if (event.detail === 0) this.queueDodge();
    });
    window.addEventListener('blur', () => this.reset());
  }

  get moveSide(): MoveSide {
    return this.root.dataset.moveSide === 'right' ? 'right' : 'left';
  }

  setMoveSide(side: MoveSide): void {
    if (side === this.moveSide) return;
    this.reset();
    this.root.dataset.moveSide = side;
    try {
      this.storage?.setItem(TOUCH_LAYOUT_KEY, side);
    } catch {
      // 저장이 막혀도 현재 화면에는 새 배치를 적용한다.
    }
  }

  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    this.root.classList.toggle('hidden', !active);
    if (!active) this.reset();
  }

  consumeDodge(): boolean {
    const queued = this.dodgeQueued;
    this.dodgeQueued = false;
    return queued;
  }

  update(sim: GameSim): void {
    if (!this.active) return;
    const { player, relics } = sim;
    const cooldown = relics.has('windBoots') ? Math.min(player.dodgeCd, relics.spareDodgeCd) : player.dodgeCd;
    const dodging = player.dodgeTime > 0;
    const ready = !dodging && cooldown <= 0;
    const remaining = Math.ceil(cooldown * 10) / 10;
    const label = dodging ? '회피 중' : ready ? '준비' : `${remaining.toFixed(1)}초`;
    if (this.cooldown.textContent !== label) this.cooldown.textContent = label;
    if (ready !== this.ready) {
      this.ready = ready;
      this.dodge.classList.toggle('ready', ready);
      this.dodge.setAttribute('aria-disabled', String(!ready));
    }
    const percent = String(Math.round(100 * Math.max(0, 1 - cooldown / relics.dodgeCooldown))) + '%';
    if (this.dodge.style.getPropertyValue('--dodge-charge') !== percent) this.dodge.style.setProperty('--dodge-charge', percent);
  }

  reset(): void {
    this.dodgeQueued = false;
    this.releaseStick();
  }

  private queueDodge(): void {
    if (this.active && this.ready) this.dodgeQueued = true;
  }

  private aimStick(event: PointerEvent): void {
    const box = this.stick.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2);
    const y = event.clientY - (box.top + box.height / 2);
    const radius = Math.max(1, (box.width - this.thumb.offsetWidth) / 2 - 3);
    const length = Math.hypot(x, y);
    const scale = length ? Math.min(1, radius / length) : 0;
    const deadZone = radius * 0.16;
    const strength = Math.min(1, Math.max(0, (length - deadZone) / (radius - deadZone)));
    this.moveX = strength ? strength * x / length : 0;
    this.moveY = strength ? strength * y / length : 0;
    this.thumb.style.transform = `translate(${x * scale}px, ${y * scale}px)`;
  }

  private releaseStick(): void {
    const pointer = this.pointer;
    this.pointer = null;
    if (pointer !== null && this.stick.hasPointerCapture(pointer)) this.stick.releasePointerCapture(pointer);
    this.moveX = 0;
    this.moveY = 0;
    this.thumb.style.transform = '';
  }
}
