import { WEAPON_FUSIONS, WEAPON_MAX_RANK, isFusionIngredient } from '../config/weapons';
import { relicInventory } from './relics';
import { WEAPON_TEXTURES } from '../render/textures';
import { BOSS_CONFIG } from '../config/boss';
import { RUN_CONFIG } from '../config/run';
import { ALL_UPGRADES } from '../config/upgrades';
import { formatTime } from '../core/math';
import type { GameSim } from '../core/sim';
import type { SimEvent } from '../core/types';
import { Cached, el, josa } from './dom';

/**
 * 전투 중 HUD: 체력, 경험치, 남은 시간, 회피 재사용 대기시간, 처치 수, 보스 체력, 안내 문구.
 */
export class Hud {
  private root: HTMLElement;
  private c = new Cached();
  private hpFill: HTMLElement;
  private hpText: HTMLElement;
  private xpFill: HTMLElement;
  private xpText: HTMLElement;
  private dodgeFill: HTMLElement;
  private dodgeText: HTMLElement;
  private dodgeBox: HTMLElement;
  private timer: HTMLElement;
  private timerSub: HTMLElement;
  private kills: HTMLElement;
  private bossBox: HTMLElement;
  private bossFill: HTMLElement;
  private bossText: HTMLElement;
  private banner: HTMLElement;
  private chips: HTMLElement;
  private recipes: HTMLButtonElement;
  private xpGainText: HTMLElement;
  private xpBatch = 0;
  private xpBatchAt = 0;
  private xpHideAt = 0;
  private relicBox: HTMLElement;
  private relicSlots: HTMLElement;
  private lastRelics = -1;
  private bannerUntil = 0;
  private lastPhaseLabel: string | null = null;
  private lastPicks = -1;

  constructor(root: HTMLElement) {
    this.root = root;
    root.replaceChildren();
    this.hpFill = el('div', { class: 'fill' });
    this.hpText = el('span', { class: 'label', 'data-testid': 'hud-hp' });
    this.xpFill = el('div', { class: 'fill' });
    this.xpText = el('span', { class: 'label', 'data-testid': 'hud-xp' });
    this.dodgeFill = el('div', { class: 'fill' });
    this.dodgeText = el('span', { class: 'label', 'data-testid': 'hud-dodge' });
    this.dodgeBox = el('div', { class: 'bar dodge' }, [this.dodgeFill, this.dodgeText]);
    this.timer = el('div', { class: 'timer', 'data-testid': 'hud-timer' });
    this.timerSub = el('div', { class: 'timer-sub' });
    this.kills = el('div', { class: 'kills', 'data-testid': 'hud-kills' });
    this.bossFill = el('div', { class: 'fill' });
    this.bossText = el('span', { class: 'label', 'data-testid': 'hud-boss' });
    this.bossBox = el('div', { class: 'boss-bar hidden' }, [
      el('div', { class: 'boss-name', text: BOSS_CONFIG.name }),
      el('div', { class: 'bar boss' }, [this.bossFill, this.bossText]),
    ]);
    this.banner = el('div', { class: 'banner', 'data-testid': 'hud-banner' });
    this.chips = el('div', { class: 'chips' });
    this.recipes = el('button', { class: 'hud-recipes', type: 'button', 'data-testid': 'hud-recipes' }, [
      '조합식 ', el('kbd', { text: 'C' }),
    ]);
    this.xpGainText = el('span', { class: 'xp-recent', 'data-testid': 'xp-recent' });
    this.relicSlots = el('div', { class: 'relic-slots' });
    this.relicBox = el('section', { class: 'hud-relics hidden', 'aria-label': '보유 유물', 'data-testid': 'hud-relics' }, [
      el('span', { class: 'relic-label', text: '보유 유물' }), this.relicSlots,
    ]);

    root.append(
      el('div', { class: 'hud-left' }, [
        el('div', { class: 'bar hp' }, [this.hpFill, this.hpText]),
        el('div', { class: 'bar xp' }, [this.xpFill, this.xpText]),
        this.dodgeBox,
        this.xpGainText,
      ]),
      el('div', { class: 'hud-center' }, [this.timer, this.timerSub]),
      el('div', { class: 'hud-right' }, [this.kills, this.recipes, this.relicBox]),
      this.bossBox,
      this.banner,
      this.chips,
    );
  }

  onRecipes(handler: () => void): void {
    this.recipes.addEventListener('click', handler);
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** 새 판 시작 시 캐시 초기화 */
  reset(): void {
    this.c.reset();
    this.bannerUntil = 0;
    this.lastPhaseLabel = null;
    this.lastPicks = -1;
    this.xpBatch = this.xpBatchAt = this.xpHideAt = 0;
    this.xpGainText.textContent = '';
    this.lastRelics = -1;
    this.banner.textContent = '';
    this.banner.classList.remove('show');
  }

  flash(text: string, seconds = 3): void {
    this.banner.textContent = text;
    this.banner.classList.add('show');
    this.bannerUntil = performance.now() + seconds * 1000;
  }

  update(sim: GameSim, events: SimEvent[]): void {
    const c = this.c;
    const p = sim.player;
    const maxHp = sim.relics.maxHp;
    if (this.lastRelics !== sim.relics.owned.size) {
      this.lastRelics = sim.relics.owned.size;
      this.relicSlots.replaceChildren(...relicInventory(sim.relics.owned, 'hud'));
      this.relicBox.classList.toggle('hidden', this.lastRelics === 0);
    }

    c.style(this.hpFill, 'hp', 'width', `${(100 * p.hp) / maxHp}%`);
    c.text(this.hpText, 'hp', `체력 ${Math.ceil(p.hp)} / ${Math.round(maxHp)}`);
    c.toggle(this.hpFill, 'hpLow', 'low', p.hp / maxHp < 0.3);

    const need = sim.xpNeeded;
    c.style(this.xpFill, 'xp', 'width', `${(100 * sim.xp) / need}%`);
    c.text(this.xpText, 'xp', `Lv ${sim.level}  ·  경험치 ${Math.floor(sim.xp)} / ${need}`);

    const ready = p.dodgeCd <= 0;
    c.style(this.dodgeFill, 'dodge', 'width', `${ready ? 100 : (100 * (1 - p.dodgeCd / sim.relics.dodgeCooldown)).toFixed(0)}%`);
    c.text(this.dodgeText, 'dodge', ready ? '회피 준비 (Space)' : `회피 ${p.dodgeCd.toFixed(1)}초`);
    c.toggle(this.dodgeBox, 'dodgeReady', 'ready', ready);

    c.text(this.timer, 'timer', sim.overtime ? `+${formatTime(Math.floor(sim.elapsed - RUN_CONFIG.timeLimit))}` : formatTime(Math.ceil(sim.remaining)));
    const toBoss = RUN_CONFIG.bossAt - sim.elapsed;
    c.text(
      this.timerSub,
      'timerSub',
      sim.overtime ? '연장전 · 강화 돌격수 출현' : sim.bossSpawned ? '연장전까지 · 보스를 처치하세요!' : `남은 시간 · 보스까지 ${formatTime(Math.ceil(toBoss))}`,
    );
    c.toggle(this.timer, 'urgent', 'urgent', sim.bossSpawned && sim.remaining < 30);
    c.text(this.kills, 'kills', `처치 ${sim.kills}`);

    const b = sim.boss;
    c.toggle(this.bossBox, 'boss', 'hidden', !b || b.dead);
    if (b && !b.dead) {
      c.style(this.bossFill, 'bossHp', 'width', `${(100 * b.hp) / b.maxHp}%`);
      c.text(this.bossText, 'bossHp', `${Math.ceil(b.hp)} / ${b.maxHp}${b.phase === 2 ? '  ·  격노' : ''}`);
    }

    if (sim.pickOrder.length !== this.lastPicks) {
      this.lastPicks = sim.pickOrder.length;
      this.chips.replaceChildren(
        ...[...sim.weapons.fusions].map((id) => el('span', {
          class: 'chip fusion-chip', text: `${WEAPON_FUSIONS[id].name} Lv ${WEAPON_MAX_RANK}`,
        })),
        ...ALL_UPGRADES.filter((u) => sim.stacks[u.id] > 0 && !isFusionIngredient(sim.weapons.fusions, u.id)).map((u) =>
          u.weapon
            ? el('span', { class: 'chip attack weapon-chip' }, [el('img', { src: WEAPON_TEXTURES[u.weapon], alt: '' }), `${u.name} Lv ${sim.stacks[u.id]}`])
            : el('span', { class: `chip ${u.category}`, text: `${u.name} ${sim.stacks[u.id]}` }),
        ),
      );
    }

    const now = performance.now();
    for (const ev of events) {
      if (ev.type !== 'pickup' || !ev.amount) continue;
      if (!this.xpBatch) this.xpBatchAt = now + 240;
      this.xpBatch += ev.amount;
    }
    if (this.xpBatch && now >= this.xpBatchAt) {
      this.xpGainText.textContent = `+${Number(this.xpBatch.toFixed(1))} XP`;
      this.xpBatch = 0;
      this.xpHideAt = now + 1100;
    } else if (now >= this.xpHideAt && this.xpGainText.textContent) {
      this.xpGainText.textContent = '';
    }

    // 안내 문구
    const ph = sim.currentSpawnPhase();
    if (ph && ph.label !== this.lastPhaseLabel) {
      if (this.lastPhaseLabel === null && sim.elapsed < 5) this.flash('WASD 이동 · 공격은 자동 · Space 회피 · Tab 상태창', 5);
      else if (ph.announce) this.flash(ph.announce, 4);
      this.lastPhaseLabel = ph.label;
    }
    for (const ev of events) {
      if (ev.type === 'eliteSpawn') this.flash('균열 수호자 출현! 돌진과 파편에 주의하세요', 3.5);
      else if (ev.type === 'assaultWarning') this.flash('2초 후 증원 공세! 화살표 방향에서 적이 몰려옵니다', 2.2);
      else if (ev.type === 'revive') this.flash('부활! 체력 50%로 다시 일어났습니다', 3);
      else if (ev.type === 'bomb') this.flash('균열 폭탄!', 1.5);
      else if (ev.type === 'bossSpawn') this.flash(`${BOSS_CONFIG.name} 등장 — ${formatTime(RUN_CONFIG.timeLimit)}부터 강화 돌격수가 몰려옵니다`, 4);
      else if (ev.type === 'bossPhase') this.flash(`${josa(BOSS_CONFIG.name, '이/가')} 격노했다!`, 3);
    }
    if (this.bannerUntil && performance.now() > this.bannerUntil) {
      this.bannerUntil = 0;
      this.banner.classList.remove('show');
    }
  }
}
