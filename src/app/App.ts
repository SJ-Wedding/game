import { DEFAULT_LOADOUT, LUMEN, SWORD, type Loadout } from '../config/characters';
import { OPENING_RELIC_LEVEL, carryable, relicAllowed, validCarry, type RelicId } from '../config/relics';
import type { Sfx } from '../audio/sfx';
import { randomSeed } from '../core/rng';
import { GameSim } from '../core/sim';
import type { InputState, RunResult, SimEvent } from '../core/types';
import type { DevOptions } from '../dev/devOptions';
import { simOptionsFor } from '../dev/devOptions';
import { purchaseMeta, recordRun, writeSave, type NewRecord, type SaveData, type StorageLike } from '../storage/save';
import type { TokenReward } from '../core/meta';
import { statLayers } from '../core/stats';
import type { Hud } from '../ui/hud';
import type { DevPanelState, Screens } from '../ui/screens';

export type Screen = 'title' | 'playing' | 'paused' | 'levelup' | 'result' | 'carry' | 'characters' | 'lumen-weapon' | 'status' | 'shop';

/** 렌더러(Phaser 씬)가 App 에 제공하는 기능 */
export interface SceneLink {
  worldToClient(x: number, y: number): { x: number; y: number };
}

export interface AppDeps {
  save: SaveData;
  storage: StorageLike | null;
  dev: DevOptions;
  sfx: Sfx;
  hud: Hud;
  screens: Screens;
  /** 문서 객체 (테스트에서 교체 가능) */
  doc?: Document;
}

/**
 * 화면 흐름(타이틀 → 전투 → 레벨업/일시정지 → 결과 → 재시작)을 관리한다.
 * - 전역 입력 리스너는 생성자에서 딱 한 번 등록한다 → 재시작해도 중복되지 않는다.
 * - 판마다 새 GameSim 을 만들고, 이전 판 객체는 버린다 → 스폰 상태가 이어지지 않는다.
 */
export class App {
  screen: Screen = 'title';
  sim: GameSim | null = null;
  save: SaveData;
  dev: DevOptions;
  lastResult: RunResult | null = null;
  lastNewRecords: NewRecord[] = [];
  lastTokens: TokenReward | null = null;
  /** 상태창을 닫으면 돌아갈 화면 */
  private statusReturn: 'playing' | 'paused' = 'playing';
  /** 지금까지 시작한 판 수 (디버그용) */
  runsStarted = 0;
  /** 전역 리스너 등록 횟수 (중복 검사용, 항상 1 이어야 함) */
  readonly listenerInstalls: number;
  scene: SceneLink | null = null;

  private readonly storage: StorageLike | null;
  private readonly sfx: Sfx;
  private readonly hud: Hud;
  private readonly screens: Screens;
  private resultShownAt = 0;
  private assistedCarry: RelicId[] = [];
  private assistedRelicDraft?: RelicId[];
  /** 개발 옵션 판의 전판 유물 (저장하지 않음) */
  private assistedPrevious: RelicId[] = [];

  constructor(deps: AppDeps) {
    this.save = deps.save;
    this.storage = deps.storage;
    this.dev = deps.dev;
    this.sfx = deps.sfx;
    this.hud = deps.hud;
    this.screens = deps.screens;
    this.hud.onRecipes(() => this.openStatus('recipes'));
    this.hud.onRelics(() => this.openStatus('relics'));

    const doc = deps.doc ?? document;
    doc.addEventListener('keydown', (e) => this.onKeyDown(e));
    doc.addEventListener('visibilitychange', () => {
      if (doc.visibilityState === 'hidden') this.pause('hidden');
    });
    this.listenerInstalls = 1;
    this.showTitle();
  }

  attachScene(scene: SceneLink): void {
    this.scene = scene;
  }

  // ───────────────────────── 흐름 ─────────────────────────

  showTitle(): void {
    this.sim = null;
    this.screen = 'title';
    this.hud.hide();
    this.screens.showTitle(
      this.save.records,
      this.save.meta,
      this.save.settings.volume,
      {
        onPlay: () => this.startRun(),
        onShop: () => this.showShop(),
        onVolume: (v) => this.setVolume(v),
        onDevChange: (s) => this.applyDevPanel(s),
      },
      this.dev.enabled ? this.devPanelState() : null,
    );
  }

  startRun(retry = false): void {
    this.sfx.unlock();
    if (retry) {
      this.prepareRun(this.sim?.loadout ?? DEFAULT_LOADOUT, () => this.showTitle(), true);
      return;
    }
    const back = this.screen === 'result' ? () => this.showResultView() : () => this.showTitle();
    this.showCharacterSelection(back);
  }

  private showCharacterSelection(back: () => void): void {
    this.screen = 'characters';
    this.hud.hide();
    this.screens.showCharacters((character) => {
      if (character === 'lumen') {
        this.screen = 'lumen-weapon';
        this.screens.showLumenWeapons(
          (weapon) => this.prepareRun({ character, weapon }, back),
          () => this.showCharacterSelection(back),
        );
      } else {
        this.prepareRun({ character }, back);
      }
    }, back);
  }

  private prepareRun(loadout: Loadout, back: () => void, retry = false): void {
    const seed = this.dev.enabled && this.dev.seed !== null ? this.dev.seed : randomSeed();
    const options = simOptionsFor(this.dev, seed);
    const assisted = Boolean(options.god || options.startTime || options.presetUpgrades);
    const draft = assisted ? this.assistedRelicDraft : this.save.pendingRelicDraft;
    if (!retry && draft) {
      const compatible = draft.filter((id) => relicAllowed(id, loadout));
      this.screen = 'carry';
      this.screens.showCarry(compatible, (selection) => {
        const carry = validCarry(selection.filter((id) => compatible.includes(id)));
        if (assisted) {
          this.assistedRelicDraft = undefined;
          this.assistedCarry = carry;
        } else {
          this.save = { ...this.save, relicCarry: carry, pendingRelicDraft: undefined };
          writeSave(this.storage, this.save);
        }
        this.prepareRun(loadout, back);
      }, back);
      return;
    }
    const carryRelics = retry ? this.sim?.options.carryRelics
      : assisted ? this.assistedCarry : this.save.relicCarry;
    const previousRelics = assisted ? this.assistedPrevious : this.save.previousRelics;
    this.sim = new GameSim({ ...options, meta: this.save.meta.purchases, carryRelics, previousRelics, loadout });
    if (!retry && assisted) this.assistedCarry = [];
    else if (!retry && this.save.relicCarry?.length) {
      this.save = { ...this.save, relicCarry: [] };
      writeSave(this.storage, this.save);
    }
    this.runsStarted++;
    this.screen = 'playing';
    this.screens.hide();
    this.hud.reset();
    this.hud.show();
  }

  pause(reason: 'esc' | 'hidden' = 'esc'): void {
    if (this.screen !== 'playing' || !this.sim) return;
    this.screen = 'paused';
    this.sim.setPaused(true);
    this.screens.showPause(reason, this.save.settings.volume, {
      onResume: () => this.resume(),
      onStatus: () => this.openStatus(),
      onRestart: () => this.startRun(true),
      onTitle: () => this.showTitle(),
      onVolume: (v) => this.setVolume(v),
    }, [...this.sim.relics.owned], this.sim.weapons.fusions);
  }

  resume(): void {
    if (this.screen !== 'paused' || !this.sim) return;
    this.sim.setPaused(false);
    this.screen = 'playing';
    this.screens.hide();
  }

  choose(index: number): void {
    const sim = this.sim;
    if (this.screen !== 'levelup' || !sim) return;
    if (!sim.choose(index)) return;
    if (sim.phase === 'levelup') this.showLevelUp();
    else {
      this.screen = 'playing';
      this.screens.hide();
    }
  }

  private showLevelUp(): void {
    const sim = this.sim!;
    this.screen = 'levelup';
    const reward = sim.choices[0];
    const title = reward?.kind === 'swordForm' ? `로안 공격 형태 · Lv ${sim.pendingLevel}`
      : reward?.kind === 'coin' ? '도박꾼의 동전' : sim.bonusOpen ? '삼중 선택의 인장' : sim.armoryOpen ? (sim.loadout.character === 'ranger' ? '수호자의 무기 보상' : '수호자의 전용 강화 보상') : reward?.kind === 'relic'
      ? (reward.source === 'elite' ? '중간 보스 유물' : `레벨 ${reward.source === 'opening' ? OPENING_RELIC_LEVEL : sim.pendingLevel - 1} 유물`)
      : sim.startPickOpen ? '시작 강화 선택' : `레벨 업! Lv ${sim.pendingLevel}`;
    this.screens.showLevelUp({
      title,
      pending: sim.pendingLevels,
      choices: sim.choices,
      fusions: sim.weapons.fusions,
      rerollsLeft: sim.rerollsLeft,
      armory: sim.armoryOpen,
      swordForms: sim.swordForms,
      specialist: sim.loadout.character !== 'ranger',
      masteryValue: (id) => sim.mastery(id),
      bonusChoices: sim.bonusOpen ? sim.bonusChoicesLeft : 0,
      notice: sim.coinNotice,
      onChoose: (i) => this.choose(i),
      onReroll: () => this.reroll(),
    });
  }

  reroll(): void {
    if (this.screen !== 'levelup' || !this.sim) return;
    if (this.sim.reroll()) this.showLevelUp();
  }

  /** 상태창 열기 (전투 시간 정지). 전투 중 또는 일시정지 메뉴에서 열 수 있다. */
  openStatus(section: 'stats' | 'recipes' | 'relics' = 'stats'): void {
    const sim = this.sim;
    if (!sim || (this.screen !== 'playing' && this.screen !== 'paused')) return;
    this.statusReturn = this.screen;
    sim.setPaused(true);
    this.screen = 'status';
    const layers = statLayers(sim.picks, sim.meta);
    layers.meta.luck = sim.meta.luck;
    layers.final = {
      ...layers.final,
      maxHp: sim.relics.maxHp,
      dodgeCooldown: sim.relics.dodgeCooldown,
      fireRate: sim.relics.fireRate,
      xpGain: sim.stats.xpGain * sim.relics.xpMultiplier,
      damageTaken: sim.relics.damageTaken(),
      luck: sim.luck,
      projectileRange: sim.stats.projectileRange + sim.reachBonus + sim.relics.basicReachBonus,
      projectileCount: sim.relics.projectileCount,
    };
    const loadout = sim.loadout;
    if (loadout.character === 'lumen') {
      layers.base.damage *= LUMEN.baseDamage;
      layers.meta.damage *= LUMEN.baseDamage;
      layers.final.damage *= sim.starterDamageMultiplier;
    } else if (loadout.character === 'roan') {
      for (const stats of [layers.base, layers.meta]) {
        stats.damage *= SWORD.damage;
        stats.fireRate /= SWORD.interval;
        stats.projectileRange = SWORD.range;
      }
      layers.final.damage = sim.swordDamage;
      layers.final.fireRate = 1 / sim.swordInterval;
      layers.final.projectileRange = sim.swordRange;
    }
    this.screens.showStatus({
      level: sim.level,
      loadout,
      starterRank: loadout.character === 'lumen' ? sim.stacks[loadout.weapon] : undefined,
      swordAngle: loadout.character === 'roan' && !sim.swordForms.length ? sim.swordAngle() : undefined,
      swordForms: sim.swordForms.map((id) => ({ id, angle: sim.swordAngle(id) })),
      echo: sim.stacks.echo > 0 ? { growth: sim.weapons.echoStats, luck: sim.luck } : undefined,
      layers,
      picks: sim.picks,
      fusions: [...sim.weapons.fusions],
      recipesOpen: section === 'recipes',
      relicsOpen: section === 'relics',
      relics: [...sim.relics.owned],
      rerollsLeft: sim.rerollsLeft,
      revivesLeft: sim.revivesLeft,
      onClose: () => this.closeStatus(),
    });
  }

  closeStatus(): void {
    if (this.screen !== 'status' || !this.sim) return;
    if (this.statusReturn === 'paused') {
      this.screen = 'playing';
      this.pause('esc');
    } else {
      this.screen = 'paused';
      this.resume();
    }
  }

  showShop(): void {
    this.screen = 'shop';
    this.screens.showShop(this.save.meta, (id) => this.buy(id), () => this.showTitle());
  }

  buy(id: string): void {
    const next = purchaseMeta(this.save, id);
    if (!next) return;
    this.save = next;
    writeSave(this.storage, this.save);
    this.showShop();
  }

  private finish(): void {
    const sim = this.sim!;
    const result = sim.result!;
    const { data, newRecords, tokens } = recordRun(this.save, result);
    this.save = data;
    // 이번 판에 얻은 유물은 다음 판 시작 유물 선택지에 나오지 않는다 (승패 무관)
    if (result.assisted) this.assistedPrevious = [...(result.relics ?? [])];
    else this.save = { ...this.save, previousRelics: [...(result.relics ?? [])] };
    if (result.outcome === 'victory') {
      // 판 밖 성장에 영향을 주는 유물은 계승 후보에서 뺀다
      const draft = (result.relics ?? []).filter(carryable);
      if (result.assisted) this.assistedRelicDraft = draft;
      else this.save = { ...this.save, pendingRelicDraft: draft };
    }
    writeSave(this.storage, this.save);
    this.lastResult = result;
    this.lastNewRecords = newRecords;
    this.lastTokens = tokens;
    this.showResultView();
  }

  private showResultView(): void {
    if (!this.lastResult) return;
    this.screen = 'result';
    this.resultShownAt = performance.now();
    this.screens.showResult(this.lastResult, this.lastNewRecords, this.lastTokens, () => this.startRun(), () => this.showTitle());
  }

  /** 렌더 루프에서 매 프레임 호출. 전투 중일 때만 시간이 흐른다. */
  frame(dt: number, input: InputState): SimEvent[] {
    const sim = this.sim;
    if (!sim) return [];
    if (this.screen === 'playing') {
      sim.advance(dt, input);
      if (sim.phase === 'levelup') this.showLevelUp();
      else if (sim.phase === 'ended') this.finish();
    }
    const events = sim.drainEvents();
    for (const ev of events) this.sfx.play(ev.type);
    if (this.screen !== 'title') this.hud.update(sim, events);
    return events;
  }

  // ───────────────────────── 설정 ─────────────────────────

  setVolume(v: number): void {
    this.save = { ...this.save, settings: { ...this.save.settings, volume: v } };
    this.sfx.setVolume(v);
    writeSave(this.storage, this.save);
  }

  private devPanelState(): DevPanelState {
    return {
      seed: this.dev.seed !== null ? String(this.dev.seed) : '',
      start: this.dev.start === 'boss' ? 'boss' : 'normal',
      god: this.dev.god,
    };
  }

  private applyDevPanel(s: DevPanelState): void {
    this.dev = {
      ...this.dev,
      seed: s.seed ? Number(s.seed) : null,
      start: s.start === 'boss' ? 'boss' : typeof this.dev.start === 'number' ? this.dev.start : null,
      god: s.god,
    };
  }

  // ───────────────────────── 입력 ─────────────────────────

  private onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'SELECT') && (target as HTMLInputElement).type !== 'range';
    switch (this.screen) {
      case 'playing':
        // 주의: 여기서 Space·방향키에 preventDefault 를 하면 Phaser 가 그 입력을 무시한다.
        // 스크롤 방지는 GameScene 의 키 캡처가 맡는다.
        if (e.code === 'Escape') this.pause('esc');
        if (e.code === 'KeyC' && !e.repeat && this.sim?.loadout.character === 'ranger') this.openStatus('recipes');
        if (e.code === 'Tab') {
          e.preventDefault();
          if (!e.repeat) this.openStatus();
        }
        break;
      case 'paused':
        if (e.code === 'Escape' && !e.repeat) this.resume();
        if (e.code === 'Tab') {
          e.preventDefault();
          if (!e.repeat) this.openStatus();
        }
        break;
      case 'status':
        if ((e.code === 'Escape' || (e.code === 'Tab' && !this.screens.hasStatusPreviewTargets)) && !e.repeat) {
          e.preventDefault();
          this.closeStatus();
        }
        break;
      case 'shop':
        if (e.code === 'Escape' && !e.repeat) this.showTitle();
        break;
      case 'levelup': {
        const n = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
        if (n >= 0 && !e.repeat) {
          e.preventDefault();
          this.choose(n % 3);
        }
        if (e.code === 'KeyR' && !e.repeat) {
          e.preventDefault();
          this.reroll();
        }
        if (e.code === 'Space') e.preventDefault();
        break;
      }
      case 'characters':
      case 'lumen-weapon':
        if (e.code === 'Escape' && !e.repeat) this.screens.cancelCharacterSelection();
        if (e.code === 'Space' && target instanceof HTMLButtonElement) {
          e.preventDefault();
          if (!e.repeat) target.click();
        }
        break;
      case 'carry':
        if (e.code === 'Escape' && !e.repeat) this.screens.cancelCarry();
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (!e.repeat && target instanceof HTMLButtonElement) target.click();
        }
        break;
      case 'result':
        // 죽는 순간 누르고 있던 키로 바로 넘어가지 않도록 잠깐 기다린다
        if ((e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyR') && !e.repeat && performance.now() - this.resultShownAt > 600) {
          e.preventDefault();
          this.startRun();
        } else if (e.code === 'Space' || e.code === 'Enter') e.preventDefault();
        break;
      case 'title':
        if (e.code === 'Enter' && !e.repeat && !typing) {
          e.preventDefault();
          this.startRun();
        }
        break;
    }
  }
}
