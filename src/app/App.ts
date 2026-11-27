import type { DifficultyId } from '../config/enemies';
import { DEFAULT_LOADOUT, LUMEN, SWORD, type Loadout } from '../config/characters';
import { OPENING_RELIC_LEVEL, carryable, relicAllowed, validCarry, type RelicId } from '../config/relics';
import type { Sfx } from '../audio/sfx';
import { randomSeed } from '../core/rng';
import { catalogChoice } from '../core/catalog';
import { GameSim } from '../core/sim';
import type { InputState, RunResult, SimEvent } from '../core/types';
import type { DevOptions } from '../dev/devOptions';
import { simOptionsFor } from '../dev/devOptions';
import { cloudRecords, defaultSave, mergeCloud, recordsFor, purchaseMeta, recordRun, writeSave, type CloudRow, type NewRecord, type SaveData, type StorageLike } from '../storage/save';
import type { TokenReward } from '../core/meta';
import { statLayers } from '../core/stats';
import type { Hud } from '../ui/hud';
import type { DevPanelState, Screens } from '../ui/screens';
import type { ShopTab } from '../ui/shop';
import { ArchiveStore } from '../storage/archive';

export type Screen = 'title' | 'account' | 'playing' | 'paused' | 'levelup' | 'result' | 'carry' | 'characters' | 'lumen-weapon' | 'status' | 'shop' | 'codex' | 'history';

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
  /** 계정 저장 (없으면 브라우저 저장만 쓴다) */
  cloud?: CloudLink | null;
}

/**
 * 화면 흐름(타이틀 → 전투 → 레벨업/일시정지 → 결과 → 재시작)을 관리한다.
 * - 전역 입력 리스너는 생성자에서 딱 한 번 등록한다 → 재시작해도 중복되지 않는다.
 * - 판마다 새 GameSim 을 만들고, 이전 판 객체는 버린다 → 스폰 상태가 이어지지 않는다.
 */
/** 계정 저장 연결 (storage/cloud.ts 의 CloudSave) */
export interface CloudLink {
  pull(): Promise<CloudRow | null>;
  push(data: SaveData): Promise<void>;
  register(username: string, password: string, data: SaveData): Promise<{ ok: true } | { ok: false; error: string }>;
  login(username: string, password: string): Promise<({ ok: true } | { ok: false; error: string }) & { row?: CloudRow }>;
  logout(): Promise<boolean>;
}

const ACCOUNT_ERRORS: Record<string, string> = {
  username_taken: '이미 사용 중인 아이디입니다.',
  invalid_credentials: '아이디 또는 비밀번호가 맞지 않습니다.',
  weak_password: '비밀번호는 6자 이상이어야 합니다.',
  invalid_username: '아이디는 영문 소문자·숫자·밑줄(_) 3~16자입니다.',
  offline: '서버에 연결할 수 없습니다. 잠시 뒤 다시 시도해 주세요.',
};

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
  private shopTab: ShopTab = 'common';
  /** 지금까지 시작한 판 수 (디버그용) */
  runsStarted = 0;
  /** 전역 리스너 등록 횟수 (중복 검사용, 항상 1 이어야 함) */
  readonly listenerInstalls: number;
  scene: SceneLink | null = null;

  private readonly storage: StorageLike | null;
  private readonly cloud: CloudLink | null;
  /** 로그인한 아이디 (게스트면 null) */
  account: string | null = null;
  /** 회원가입·로그인 창에 입력하던 아이디 (오류 뒤 다시 그릴 때 유지) */
  private accountDraft = '';
  private readonly sfx: Sfx;
  private readonly hud: Hud;
  private readonly screens: Screens;
  private readonly archive = new ArchiveStore();
  private resultShownAt = 0;
  private assistedCarry: RelicId[] = [];
  private assistedRelicDraft?: RelicId[];
  /** 개발 옵션 판의 전판 유물 (저장하지 않음) */
  private assistedPrevious: RelicId[] = [];

  constructor(deps: AppDeps) {
    this.save = deps.save;
    this.storage = deps.storage;
    this.cloud = deps.cloud ?? null;
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
      recordsFor(this.save, this.difficulty),
      this.save.meta,
      this.save.settings.volume,
      {
        onPlay: () => this.startRun(),
        onShop: () => this.showShop(),
        onCodex: () => this.showArchive('codex'),
        onHistory: () => this.showArchive('history'),
        onVolume: (v) => this.setVolume(v),
        onDevChange: (s) => this.applyDevPanel(s),
        ...(this.cloud ? { onAccount: () => this.showAccount() } : {}),
        ...(this.dev.difficulty ? {} : { onDifficulty: (d: DifficultyId) => this.setDifficulty(d) }),
      },
      this.dev.enabled ? this.devPanelState() : null,
      this.cloud ? { username: this.account } : undefined,
      this.difficulty,
    );
  }

  /** 이번 판 난이도: 개발 옵션(?difficulty=) → 저장된 설정 */
  get difficulty(): DifficultyId {
    return this.dev.difficulty ?? this.save.settings.difficulty;
  }

  setDifficulty(d: DifficultyId): void {
    this.save = { ...this.save, settings: { ...this.save.settings, difficulty: d } };
    writeSave(this.storage, this.save);
    this.showTitle();
  }

  // ───────────────────────── 아이디 계정 ─────────────────────────

  showAccount(message?: string, busy = false): void {
    this.screen = 'account';
    this.screens.showAccount({ username: this.account, message, busy, draft: this.accountDraft }, {
      onRegister: (u, p) => void this.registerAccount(u, p),
      onLogin: (u, p) => void this.loginAccount(u, p),
      onLogout: () => void this.logoutAccount(),
      onClose: () => this.showTitle(),
    });
  }

  private accountError(error: string): string {
    return ACCOUNT_ERRORS[error] ?? `처리하지 못했습니다 (${error}).`;
  }

  /** 회원가입: 지금 진행 상황을 아이디 계정으로 옮긴다 */
  async registerAccount(username: string, password: string): Promise<void> {
    if (!this.cloud) return;
    this.accountDraft = username;
    if (!/^[a-z0-9_]{3,16}$/.test(username)) return this.showAccount(ACCOUNT_ERRORS.invalid_username);
    if (password.length < 6) return this.showAccount(ACCOUNT_ERRORS.weak_password);
    this.showAccount('가입하는 중…', true);
    const r = await this.cloud.register(username, password, this.save);
    if (this.screen !== 'account') return;
    if (!r.ok) return this.showAccount(this.accountError(r.error));
    this.account = username;
    this.showAccount('가입했습니다. 다른 브라우저에서도 이 아이디로 로그인하세요.');
  }

  /** 로그인: 이 브라우저의 상점 내역을 계정 데이터로 바꾼다 (기록은 더 좋은 값을 남김) */
  async loginAccount(username: string, password: string): Promise<void> {
    if (!this.cloud) return;
    this.accountDraft = username;
    if (!username || !password) return this.showAccount('아이디와 비밀번호를 입력하세요.');
    this.showAccount('로그인하는 중…', true);
    const r = await this.cloud.login(username, password);
    if (this.screen !== 'account') return;
    if (!r.ok || !r.row) return this.showAccount(this.accountError(r.ok ? 'unknown' : r.error));
    this.account = r.row.account ?? username;
    this.save = mergeCloud(this.save, r.row, true);
    writeSave(this.storage, this.save);
    this.showTitle();
  }

  /** 로그아웃: 계정 연결을 끊고 이 브라우저는 새 게스트로 시작한다 (계정 데이터는 서버에 그대로) */
  async logoutAccount(): Promise<void> {
    if (!this.cloud) return;
    this.showAccount('로그아웃하는 중…', true);
    const ok = await this.cloud.logout();
    if (!ok) return this.showAccount(ACCOUNT_ERRORS.offline);
    this.account = null;
    this.save = { ...defaultSave(), settings: this.save.settings };
    writeSave(this.storage, this.save);
    this.showTitle();
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
    this.sim = new GameSim({ ...options, meta: this.save.meta.purchases, carryRelics, previousRelics, loadout, difficulty: this.difficulty });
    if (!assisted) {
      this.archive.discover([...this.sim.relics.owned].map((id) => `relic:${id}` as const));
      if (loadout.character === 'lumen') this.archive.discover([`upgrade:${loadout.weapon}`]);
    }
    if (!retry && assisted) this.assistedCarry = [];
    else if (!retry && this.save.relicCarry?.length) {
      this.save = { ...this.save, relicCarry: [] };
      writeSave(this.storage, this.save);
    }
    this.runsStarted++;
    this.screen = 'playing';
    this.screens.hide();
    this.hud.reset(this.sim);
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
    if (!sim.assisted) this.archive.discover(sim.choices.flatMap((choice) => {
      const id = catalogChoice(choice);
      return id ? [id] : [];
    }));
    const reward = sim.choices[0];
    const title = reward?.kind === 'roanGear' ? `${reward.gear.stage === 'weapon' ? '로안 무기 선택' : reward.gear.stage === 'upgrade' ? '상위 무기 선택' : '무기 각성'} · Lv ${sim.pendingLevel}`
      : reward?.kind === 'coin' ? '도박꾼의 동전' : sim.bonusOpen ? '삼중 선택의 인장' : sim.armoryOpen ? (sim.loadout.character === 'ranger' ? '수호자의 무기 보상' : '수호자의 전용 강화 보상') : reward?.kind === 'essence' ? '중간 보스 유물'
      : reward?.kind === 'relic'
      ? (reward.source === 'elite' ? '중간 보스 유물' : `레벨 ${reward.source === 'opening' ? OPENING_RELIC_LEVEL : sim.pendingLevel - 1} 유물`)
      : sim.startPickOpen ? '시작 강화 선택' : `레벨 업! Lv ${sim.pendingLevel}`;
    this.screens.showLevelUp({
      title,
      pending: sim.pendingLevels,
      choices: sim.choices,
      fusions: sim.weapons.fusions,
      rerollsLeft: sim.rerollsLeft,
      armory: sim.armoryOpen,
      specialist: sim.loadout.character !== 'ranger',
      masteryValue: (id) => sim.mastery(id),
      lumenMasteryDamageBonus: (extraPoints) => sim.lumenMasteryDamageBonus(extraPoints),
      bonusChoices: sim.bonusOpen ? sim.bonusChoicesLeft : 0,
      notice: sim.coinNotice,
      essences: sim.essences,
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
    const layers = statLayers(sim.picks, sim.meta, sim.loadout.character, sim.loadout.character === 'roan' ? sim.roan.baseOverrides : undefined);
    layers.meta.luck = sim.meta.luck;
    layers.final = {
      ...layers.final,
      maxHp: sim.relics.maxHp,
      dodgeCooldown: sim.relics.dodgeCooldown,
      fireRate: sim.relics.fireRate,
      xpGain: sim.xpGainMultiplier,
      damageTaken: sim.relics.damageTaken(),
      luck: sim.luck,
      projectileRange: sim.basicProjectileRange,
      projectileCount: sim.relics.projectileCount,
    };
    const loadout = sim.loadout;
    if (loadout.character === 'lumen') {
      layers.meta.damage *= LUMEN.starterDamage[loadout.weapon] / layers.base.damage;
      layers.base.damage = LUMEN.starterDamage[loadout.weapon];
      layers.final.damage = sim.weapons.specialistHitDamage();
    } else if (loadout.character === 'roan') {
      for (const stats of [layers.base, layers.meta]) {
        stats.damage *= SWORD.damage;
        stats.fireRate /= SWORD.interval;
        stats.projectileRange = SWORD.range;
      }
      layers.final.damage = sim.swordDamage;
      layers.final.fireRate = 1 / sim.swordInterval;
      layers.final.projectileRange = sim.roan.range;
    }
    this.screens.showStatus({
      level: sim.level,
      loadout,
      starterRank: loadout.character === 'lumen' ? sim.stacks[loadout.weapon] : undefined,
      roan: loadout.character === 'roan'
        ? { weapon: sim.roan.weapon, upgrade: sim.roan.upgrade, awakened: sim.roan.awakened, angle: sim.roan.angle,
          range: sim.roan.range, lineWidth: sim.roan.lineWidth }
        : undefined,
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

  /** 상점 내역·기록이 바뀌었을 때: 저장 번호를 올리고 브라우저와 계정에 저장 */
  private persistAccount(): void {
    if (this.cloud) this.save = { ...this.save, cloudRev: (this.save.cloudRev ?? 0) + 1 };
    writeSave(this.storage, this.save);
    void this.cloud?.push(this.save);
  }

  /** 접속 시 한 번: 계정 저장을 받아 브라우저 저장과 합치고, 브라우저 쪽이 더 새로우면 올린다 */
  async syncAccount(): Promise<void> {
    if (!this.cloud) return;
    const remote = await this.cloud.pull().catch(() => null);
    this.account = remote?.account ?? null;
    const merged = mergeCloud(this.save, remote);
    if (merged !== this.save) {
      this.save = merged;
      writeSave(this.storage, this.save);
      if (this.screen === 'shop') this.showShop();
    }
    if (this.screen === 'title') this.showTitle();
    // 합친 결과가 서버와 다르면(브라우저 쪽이 더 새로움) 저장 번호를 올려 다시 올린다
    const same = remote && JSON.stringify([remote.meta, remote.records]) === JSON.stringify([this.save.meta, cloudRecords(this.save)]);
    if (!same) {
      this.save = { ...this.save, cloudRev: Math.max(this.save.cloudRev ?? 0, remote?.rev ?? 0) + 1 };
      writeSave(this.storage, this.save);
      await this.cloud.push(this.save);
    }
  }

  showShop(focusItem?: string): void {
    this.screen = 'shop';
    this.screens.showShop(this.save.meta, this.shopTab, (tab) => {
      this.shopTab = tab;
      this.showShop();
    }, (id) => this.buy(id), () => this.showTitle(), focusItem);
  }

  showArchive(screen: 'codex' | 'history'): void {
    this.screen = screen;
    const knownRelics = [...(this.save.previousRelics ?? []), ...(this.save.relicCarry ?? []), ...(this.save.pendingRelicDraft ?? [])];
    this.archive.discover(knownRelics.map((id) => `relic:${id}` as const));
    this.screens.showArchive(screen, this.archive.snapshot(), () => this.showTitle());
  }

  buy(id: string): void {
    const next = purchaseMeta(this.save, id);
    if (!next) return;
    this.save = next;
    this.persistAccount();
    this.showShop(id);
  }

  private finish(): void {
    const sim = this.sim!;
    const result = sim.result!;
    const { data, newRecords, tokens } = recordRun(this.save, result);
    this.archive.record(result, tokens?.total ?? null);
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
    if (result.assisted) writeSave(this.storage, this.save);
    else this.persistAccount();
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
      case 'account':
      case 'codex':
      case 'history':
        if (e.code === 'Escape' && !e.repeat) this.showTitle();
        break;
      case 'levelup': {
        const digit = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
        if (digit && !e.repeat) {
          e.preventDefault();
          this.choose(Number(digit[1]) - 1);
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
        if (e.code === 'Enter' && !e.repeat && !typing && !(target instanceof HTMLButtonElement)) {
          e.preventDefault();
          this.startRun();
        }
        break;
    }
  }
}
