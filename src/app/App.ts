import type { Sfx } from '../audio/sfx';
import { randomSeed } from '../core/rng';
import { GameSim } from '../core/sim';
import type { InputState, RunResult, SimEvent } from '../core/types';
import type { DevOptions } from '../dev/devOptions';
import { simOptionsFor } from '../dev/devOptions';
import { recordRun, writeSave, type NewRecord, type SaveData, type StorageLike } from '../storage/save';
import type { Hud } from '../ui/hud';
import type { DevPanelState, Screens } from '../ui/screens';

export type Screen = 'title' | 'playing' | 'paused' | 'levelup' | 'result';

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

  constructor(deps: AppDeps) {
    this.save = deps.save;
    this.storage = deps.storage;
    this.dev = deps.dev;
    this.sfx = deps.sfx;
    this.hud = deps.hud;
    this.screens = deps.screens;

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
      this.save.settings.volume,
      {
        onPlay: () => this.startRun(),
        onVolume: (v) => this.setVolume(v),
        onDevChange: (s) => this.applyDevPanel(s),
      },
      this.dev.enabled ? this.devPanelState() : null,
    );
  }

  startRun(): void {
    this.sfx.unlock();
    const seed = this.dev.enabled && this.dev.seed !== null ? this.dev.seed : randomSeed();
    this.sim = new GameSim(simOptionsFor(this.dev, seed));
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
      onRestart: () => this.startRun(),
      onTitle: () => this.showTitle(),
      onVolume: (v) => this.setVolume(v),
    });
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
    this.screens.showLevelUp(sim.level - sim.pendingLevels + 1, sim.pendingLevels, sim.choices, (i) => this.choose(i));
  }

  private finish(): void {
    const sim = this.sim!;
    const result = sim.result!;
    const { data, newRecords } = recordRun(this.save, result);
    this.save = data;
    writeSave(this.storage, this.save);
    this.lastResult = result;
    this.lastNewRecords = newRecords;
    this.screen = 'result';
    this.resultShownAt = performance.now();
    this.screens.showResult(result, newRecords, () => this.startRun(), () => this.showTitle());
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
        break;
      case 'paused':
        if (e.code === 'Escape' && !e.repeat) this.resume();
        break;
      case 'levelup': {
        const n = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
        if (n >= 0 && !e.repeat) {
          e.preventDefault();
          this.choose(n % 3);
        }
        if (e.code === 'Space') e.preventDefault();
        break;
      }
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
