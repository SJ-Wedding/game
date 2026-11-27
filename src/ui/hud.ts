import { DIFFICULTY } from '../config/enemies';
import { ROAN_UPGRADES, ROAN_WEAPONS } from '../config/roan';
import { ASSAULT_CONFIG } from '../config/spawns';
import { WEAPON_FUSIONS, WEAPON_MAX_RANK, isFusionIngredient } from '../config/weapons';
import { COMPACT_RELIC_LIMIT, relicInventory } from './relics';
import { ARENA_ART, arenaEnemyText, arenaTheme, type ArenaArt } from '../render/arena';
import { WEAPON_TEXTURES } from '../render/textures';
import { xpVisual } from '../config/progression';
import { RUN_CONFIG } from '../config/run';
import { ALL_UPGRADES } from '../config/upgrades';
import { formatTime } from '../core/math';
import type { GameSim } from '../core/sim';
import type { SimEvent } from '../core/types';
import { Cached, el, josa } from './dom';
import { WEAPON_PREVIEWS } from './weaponPreview';


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
  private xpCount: HTMLElement;
  private dodgeFill: HTMLElement;
  private dodgeText: HTMLElement;
  private dodgeBox: HTMLElement;
  private swordForms: HTMLElement;
  private timer: HTMLElement;
  private timerSub: HTMLElement;
  private kills: HTMLElement;
  private bossBox: HTMLElement;
  private bossName: HTMLElement;
  private bossFill: HTMLElement;
  private bossText: HTMLElement;
  private readonly menu: HTMLButtonElement;
  private banner: HTMLElement;
  private chips: HTMLElement;
  private recipes: HTMLButtonElement;
  private xpGainText: HTMLElement;
  private xpBatch = 0;
  private xpBatchAt = 0;
  private xpHideAt = 0;
  private relicBox: HTMLElement;
  private relicSlots: HTMLElement;
  private moreRelics: HTMLButtonElement;
  private lastRelics = -1;
  private lastRelicFusions = -1;
  private bannerUntil = 0;
  private lastPhaseLabel: string | null = null;
  private lastPicks = -1;
  private arena: ArenaArt = ARENA_ART.canyon;

  constructor(root: HTMLElement, private readonly touch = false) {
    this.root = root;
    root.replaceChildren();
    this.hpFill = el('div', { class: 'fill' });
    this.hpText = el('span', { class: 'label', 'data-testid': 'hud-hp' });
    this.xpFill = el('div', { class: 'fill' });
    this.xpText = el('span', { class: 'xp-level', 'data-testid': 'hud-xp' });
    this.xpCount = el('span', { class: 'xp-count' });
    this.dodgeFill = el('div', { class: 'fill' });
    this.dodgeText = el('span', { class: 'label', 'data-testid': 'hud-dodge' });
    this.dodgeBox = el('div', { class: 'bar dodge' }, [this.dodgeFill, this.dodgeText]);
    this.swordForms = el('small', { class: 'sword-forms-hud hidden', 'data-testid': 'hud-sword-forms' });
    this.timer = el('div', { class: 'timer', 'data-testid': 'hud-timer' });
    this.timerSub = el('div', { class: 'timer-sub', 'data-testid': 'hud-sub' });
    this.kills = el('div', { class: 'kills', 'data-testid': 'hud-kills' });
    this.bossFill = el('div', { class: 'fill' });
    this.bossName = el('div', { class: 'boss-name' });
    this.bossText = el('span', { class: 'label', 'data-testid': 'hud-boss' });
    this.bossBox = el('div', { class: 'boss-bar ui-frame hidden' }, [
      this.bossName,
      el('div', { class: 'bar boss' }, [this.bossFill, this.bossText]),
    ]);
    this.banner = el('div', { class: 'banner', 'data-testid': 'hud-banner' });
    this.chips = el('div', { class: 'chips' });
    this.recipes = el('button', { class: 'hud-recipes', type: 'button', 'data-testid': 'hud-recipes' }, [
      '조합식 ', el('kbd', { text: 'C' }),
    ]);
    this.xpGainText = el('span', { class: 'xp-recent', 'data-testid': 'xp-recent' });
    this.relicSlots = el('div', { class: 'relic-slots' });
    this.moreRelics = el('button', { class: 'relic-overflow hidden', type: 'button', 'data-testid': 'hud-more-relics' });
    this.relicBox = el('section', { class: 'hud-relics ui-frame hidden', 'aria-label': '보유 유물', 'data-testid': 'hud-relics' }, [
      el('span', { class: 'relic-label', text: '보유 유물' }), this.relicSlots, this.moreRelics,
    ]);
    this.menu = el('button', { class: 'hud-menu ui-frame', type: 'button', 'data-testid': 'hud-menu', 'aria-label': '인게임 메뉴' }, [
      el('span', { class: 'hud-menu-bars', 'aria-hidden': 'true' }), '메뉴',
    ]);

    root.append(
      el('div', { class: 'hud-top-left' }, [
        this.menu,
        el('div', { class: 'hud-left ui-frame' }, [
          this.hpText,
          el('div', { class: 'bar hp' }, [this.hpFill]),
          this.dodgeBox,
          this.swordForms,
        ]),
      ]),
      el('div', { class: 'hud-center ui-frame' }, [this.timer, this.timerSub]),
      el('div', { class: 'hud-right' }, [el('div', { class: 'hud-kills ui-frame' }, [this.kills]), this.relicBox, this.recipes]),
      this.bossBox,
      this.banner,
      this.chips,
      el('div', { class: 'hud-xp ui-frame' }, [
        this.xpText, el('div', { class: 'bar xp' }, [this.xpFill]), this.xpCount, this.xpGainText,
        el('kbd', { text: 'Tab', title: '상태창' }),
      ]),
    );
  }

  onRecipes(handler: () => void): void {
    this.recipes.addEventListener('click', handler);
  }

  onMenu(handler: () => void): void {
    this.menu.addEventListener('click', handler);
  }

  onRelics(handler: () => void): void {
    this.moreRelics.addEventListener('click', handler);
  }

  show(): void {
    this.root.classList.remove('hidden');
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  /** 새 판 시작 시 캐시 초기화 */
  reset(sim: GameSim): void {
    this.arena = ARENA_ART[arenaTheme(sim.seed, sim.difficulty)];
    this.bossName.textContent = this.arena.names.boss;
    this.c.reset();
    this.bannerUntil = 0;
    this.lastPhaseLabel = null;
    this.lastPicks = -1;
    this.xpBatch = this.xpBatchAt = this.xpHideAt = 0;
    this.xpGainText.textContent = '';
    this.lastRelics = -1;
    this.lastRelicFusions = -1;
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
    c.toggle(this.recipes, 'recipeAvailability', 'hidden', sim.loadout.character !== 'ranger');
    const p = sim.player;
    const maxHp = sim.relics.maxHp;
    if (this.lastRelics !== sim.relics.owned.size || this.lastRelicFusions !== sim.weapons.fusions.size) {
      this.lastRelics = sim.relics.owned.size;
      this.lastRelicFusions = sim.weapons.fusions.size;
      const shown = [...sim.relics.owned].slice(-(this.touch ? 3 : COMPACT_RELIC_LIMIT));
      this.relicSlots.replaceChildren(...relicInventory(shown, 'hud', { fusions: sim.weapons.fusions }));
      const overflow = this.lastRelics - shown.length;
      this.moreRelics.classList.toggle('hidden', overflow === 0);
      this.moreRelics.textContent = `+${overflow} · 전체 보기`;
      this.relicBox.classList.toggle('hidden', this.lastRelics === 0);
    }

    c.style(this.hpFill, 'hp', 'width', `${(100 * p.hp) / maxHp}%`);
    const shield = Math.floor(sim.relics.shield);
    c.text(this.hpText, 'hp', `체력 ${Math.ceil(p.hp)} / ${Math.round(maxHp)}${shield > 0 ? ` · 보호막 ${shield}` : ''}`);
    c.toggle(this.hpFill, 'hpLow', 'low', p.hp / maxHp < 0.3);

    const need = sim.xpNeeded;
    c.style(this.xpFill, 'xp', 'width', `${(100 * sim.xp) / need}%`);
    c.text(this.xpText, 'level', `Lv ${sim.level}`);
    c.text(this.xpCount, 'xp', `${Math.floor(sim.xp)} / ${need} XP`);

    const ready = p.dodgeCd <= 0;
    c.style(this.dodgeFill, 'dodge', 'width', `${ready ? 100 : (100 * (1 - p.dodgeCd / sim.relics.dodgeCooldown)).toFixed(0)}%`);
    c.text(this.dodgeText, 'dodge', ready ? '회피 준비 (Space)' : `회피 ${p.dodgeCd.toFixed(1)}초`);
    c.toggle(this.dodgeBox, 'dodgeReady', 'ready', ready);

    const roan = sim.roan;
    c.toggle(this.swordForms, 'swordFormsVisible', 'hidden', !roan.weapon);
    if (roan.weapon) {
      const name = roan.upgrade ? `${ROAN_UPGRADES[roan.upgrade].name}${roan.awakened ? ' · 각성' : ''}` : ROAN_WEAPONS[roan.weapon].name;
      c.text(this.swordForms, 'swordForms', `무기 · ${name}`);
    }

    c.text(this.timer, 'timer', sim.overtime ? `+${formatTime(Math.floor(sim.elapsed - RUN_CONFIG.timeLimit))}` : formatTime(Math.ceil(sim.remaining)));
    const toBoss = RUN_CONFIG.bossAt - sim.elapsed;
    c.text(
      this.timerSub,
      'timerSub',
      `${DIFFICULTY[sim.difficulty].name} · ${this.arena.name} · ` + (sim.overtime ? '연장전 · 강화 돌격수 출현' : sim.bossSpawned ? '연장전까지 · 보스 처치' : `보스까지 ${formatTime(Math.ceil(toBoss))}`),
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
        ...[...sim.weapons.fusions].map((id) => weaponBadge(WEAPON_FUSIONS[id].name, WEAPON_MAX_RANK, WEAPON_PREVIEWS[id], true)),
        ...ALL_UPGRADES.filter((u) => sim.stacks[u.id] > 0 && !isFusionIngredient(sim.weapons.fusions, u.id)).map((u) =>
          u.weapon
            ? weaponBadge(u.name, sim.stacks[u.id], WEAPON_TEXTURES[u.weapon])
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
      this.xpGainText.style.color = `#${xpVisual(this.xpBatch).color.toString(16).padStart(6, '0')}`;
      this.xpBatch = 0;
      this.xpHideAt = now + 1100;
    } else if (now >= this.xpHideAt && this.xpGainText.textContent) {
      this.xpGainText.textContent = '';
    }

    // 안내 문구
    const ph = sim.currentSpawnPhase();
    if (ph && ph.label !== this.lastPhaseLabel) {
      if (this.lastPhaseLabel === null && sim.elapsed < 5) this.flash(this.touch
        ? '조이스틱 이동 · 회피 버튼 · 자동 공격'
        : 'WASD 이동 · 공격은 자동 · Space 회피 · Tab 상태창', 5);
      else if (ph.announce) this.flash(arenaEnemyText(ph.announce, this.arena), 4);
      this.lastPhaseLabel = ph.label;
    }
    for (const ev of events) {
      if (ev.type === 'eliteSpawn') this.flash(`${this.arena.names.elite} 출현! 돌진과 파편에 주의하세요`, 3.5);
      else if (ev.type === 'assaultWarning') this.flash(`${ASSAULT_CONFIG.warning}초 후 증원 공세! ${ev.amount}마리 · 화살표 방향`, ASSAULT_CONFIG.warning + 0.2);
      else if (ev.type === 'revive') this.flash('부활! 체력 50%로 다시 일어났습니다', 3);
      else if (ev.type === 'bomb') this.flash('균열 폭탄!', 1.5);
      else if (ev.type === 'bossSpawn') {
        const message = sim.elapsed >= RUN_CONFIG.bossAt && !sim.overtime ? `증원 웨이브당 ${ph?.batch}마리`
          : `${formatTime(RUN_CONFIG.timeLimit)}부터 강화 돌격수가 몰려옵니다`;
        this.flash(`${this.arena.names.boss} 등장 · ${message}`, 4);
      }
      else if (ev.type === 'bossPhase') this.flash(`${josa(this.arena.names.boss, '이/가')} 격노했다!`, 3);
    }
    if (this.bannerUntil && performance.now() > this.bannerUntil) {
      this.bannerUntil = 0;
      this.banner.classList.remove('show');
    }
  }
}

function weaponBadge(name: string, level: number, src: string, fusion = false): HTMLElement {
  return el('span', { class: `chip weapon-chip ui-frame${fusion ? ' fusion-chip' : ''}` }, [
    el('img', { src, alt: '' }), el('span', { class: 'shop-icon-text', text: `${name} ` }), `Lv ${level}`,
  ]);
}
