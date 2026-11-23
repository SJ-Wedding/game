import { WEAPON_TEXTURES } from '../render/textures';
import { BOSS_CONFIG } from '../config/boss';
import { RUN_CONFIG } from '../config/run';
import { CATEGORY_LABEL } from '../config/upgrades';
import { formatTime } from '../core/math';
import type { RunResult, UpgradeChoice } from '../core/types';
import type { NewRecord, SaveRecords } from '../storage/save';
import { el, josa } from './dom';

/**
 * 타이틀 / 일시정지 / 레벨업 / 결과 화면. 화면은 DOM 오버레이로 그린다.
 * 화면은 규칙을 알지 못하고, 버튼이 눌리면 handlers 로 App 에 알리기만 한다.
 */

export interface DevPanelState {
  seed: string;
  start: 'normal' | 'boss';
  god: boolean;
}

export interface TitleHandlers {
  onPlay: () => void;
  onVolume: (v: number) => void;
  onDevChange?: (s: DevPanelState) => void;
}

export interface PauseHandlers {
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
  onVolume: (v: number) => void;
}

const NEW_RECORD_LABEL: Record<NewRecord, string> = {
  survival: '최장 생존 신기록',
  kills: '최다 처치 신기록',
  fastestWin: '최단 승리 신기록',
  firstWin: '첫 승리!',
};

export class Screens {
  private root: HTMLElement;
  current: 'none' | 'title' | 'pause' | 'levelup' | 'result' = 'none';

  constructor(root: HTMLElement) {
    this.root = root;
  }

  hide(): void {
    this.current = 'none';
    this.root.replaceChildren();
    this.root.classList.add('hidden');
  }

  private mount(name: Screens['current'], panel: HTMLElement): void {
    this.current = name;
    this.root.replaceChildren(panel);
    this.root.classList.remove('hidden');
    this.root.dataset.screen = name;
    // 첫 번째 주요 버튼에 포커스 (키보드 사용자를 위해)
    panel.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
  }

  private volumeControl(volume: number, onVolume: (v: number) => void): HTMLElement {
    const value = el('span', { class: 'vol-value', text: `${Math.round(volume * 100)}%` });
    const input = el('input', {
      type: 'range',
      min: '0',
      max: '100',
      step: '5',
      value: String(Math.round(volume * 100)),
      'aria-label': '음량',
      'data-testid': 'volume',
    });
    input.addEventListener('input', () => {
      const v = Number(input.value) / 100;
      value.textContent = `${input.value}%`;
      onVolume(v);
    });
    return el('label', { class: 'volume' }, ['음량', input, value]);
  }

  showTitle(records: SaveRecords, volume: number, h: TitleHandlers, dev: DevPanelState | null): void {
    const play = el('button', { class: 'primary big', 'data-testid': 'play', 'data-autofocus': '' }, ['플레이 ', el('kbd', { text: 'Enter' })]);
    play.addEventListener('click', h.onPlay);

    const rec = el('div', { class: 'records', 'data-testid': 'records' }, [
      el('h3', { text: '최고 기록' }),
      el('dl', {}, [
        el('dt', { text: '최장 생존' }),
        el('dd', { 'data-testid': 'best-survival', text: records.bestSurvival > 0 ? formatTime(records.bestSurvival) : '-' }),
        el('dt', { text: '최다 처치' }),
        el('dd', { 'data-testid': 'best-kills', text: records.bestKills > 0 ? String(records.bestKills) : '-' }),
        el('dt', { text: '최단 승리' }),
        el('dd', { 'data-testid': 'fastest-win', text: records.fastestWin !== null ? formatTime(records.fastestWin) : '-' }),
        el('dt', { text: '승리 / 플레이' }),
        el('dd', { 'data-testid': 'runs', text: `${records.wins} / ${records.runs}` }),
      ]),
    ]);

    const controls = el('div', { class: 'controls' }, [
      el('h3', { text: '조작' }),
      el('ul', {}, [
        el('li', {}, [el('kbd', { text: 'W A S D' }), ' 이동']),
        el('li', {}, [el('kbd', { text: '자동' }), ' 가장 가까운 적을 조준해 공격']),
        el('li', {}, [el('kbd', { text: 'Space' }), ' 회피 (잠깐 무적)']),
        el('li', {}, [el('kbd', { text: 'Esc' }), ' 일시정지']),
      ]),
    ]);

    const children: HTMLElement[] = [
      el('h1', { class: 'logo', text: '균열 아레나' }),
      el('p', { class: 'tagline', text: `몰려드는 균열의 괴물을 쓰러뜨리고 강해져, ${formatTime(RUN_CONFIG.timeLimit)} 안에 ${josa(BOSS_CONFIG.name, '을/를')} 처치하라.` }),
      play,
      el('div', { class: 'row' }, [controls, rec]),
      this.volumeControl(volume, h.onVolume),
    ];

    if (dev) children.push(this.devPanel(dev, h.onDevChange));
    this.mount('title', el('div', { class: 'panel title' }, children));
  }

  private devPanel(state: DevPanelState, onChange?: (s: DevPanelState) => void): HTMLElement {
    const s = { ...state };
    const seed = el('input', { type: 'text', inputmode: 'numeric', value: s.seed, placeholder: '무작위', 'data-testid': 'dev-seed', size: '10' });
    const start = el('select', { 'data-testid': 'dev-start' }, [
      el('option', { value: 'normal', text: '처음부터' }),
      el('option', { value: 'boss', text: `보스 직전 (${formatTime(RUN_CONFIG.bossAt - 5)}, 대표 빌드)` }),
    ]);
    start.value = s.start;
    const god = el('input', { type: 'checkbox', 'data-testid': 'dev-god' });
    god.checked = s.god;
    const emit = () => {
      s.seed = seed.value.replace(/[^0-9]/g, '');
      s.start = start.value as DevPanelState['start'];
      s.god = god.checked;
      onChange?.({ ...s });
    };
    seed.addEventListener('input', emit);
    start.addEventListener('change', emit);
    god.addEventListener('change', emit);
    return el('fieldset', { class: 'dev' }, [
      el('legend', { text: '개발 모드' }),
      el('label', {}, ['시드 ', seed]),
      el('label', {}, ['시작 ', start]),
      el('label', {}, [god, ' 무적']),
      el('small', { text: '개발 옵션(보스 직전·무적)을 쓴 판은 최고 기록에 반영되지 않습니다.' }),
    ]);
  }

  showPause(reason: 'esc' | 'hidden', volume: number, h: PauseHandlers): void {
    const resume = el('button', { class: 'primary', 'data-testid': 'resume', 'data-autofocus': '' }, ['계속하기 ', el('kbd', { text: 'Esc' })]);
    resume.addEventListener('click', h.onResume);
    const restart = el('button', { 'data-testid': 'pause-restart', text: '처음부터 다시' });
    restart.addEventListener('click', h.onRestart);
    const title = el('button', { 'data-testid': 'pause-title', text: '타이틀로' });
    title.addEventListener('click', h.onTitle);
    this.mount(
      'pause',
      el('div', { class: 'panel pause' }, [
        el('h2', { text: '일시정지' }),
        el('p', { class: 'muted', text: reason === 'hidden' ? '탭이 숨겨져 자동으로 멈췄습니다. 전투 시간과 적 생성도 멈춰 있습니다.' : '전투 시간과 적 생성이 멈춰 있습니다.' }),
        resume,
        this.volumeControl(volume, h.onVolume),
        el('div', { class: 'row buttons' }, [restart, title]),
        el('small', { class: 'muted', text: '처음부터 다시 / 타이틀로 이동하면 이번 판은 기록되지 않습니다.' }),
      ]),
    );
  }

  showLevelUp(level: number, pending: number, choices: UpgradeChoice[], onChoose: (i: number) => void): void {
    const cards = choices.map((c, i) => {
      const btn = el('button', { class: `card ${c.kind === 'upgrade' ? c.def.category : 'fallback'}`, 'data-testid': `choice-${i}` });
      if (i === 0) btn.setAttribute('data-autofocus', '');
      if (c.kind === 'upgrade') {
        const weapon = c.def.weapon;
        if (weapon) btn.append(el('img', { class: 'weapon-icon', src: WEAPON_TEXTURES[weapon], alt: '' }));
        btn.append(
          el('span', { class: 'cat', text: weapon ? '특수 무기' : CATEGORY_LABEL[c.def.category] }),
          el('strong', { class: 'name', text: c.def.name }),
          el('span', { class: 'desc', text: c.def.description }),
          el('span', { class: 'stack', text: weapon ? '획득 즉시 자동 발동' : c.nextStack === 1 ? `신규 · 최대 ${c.def.maxStacks}` : `${c.nextStack - 1} → ${c.nextStack} / 최대 ${c.def.maxStacks}` }),
        );
      } else {
        btn.append(el('span', { class: 'cat', text: '회복' }), el('strong', { class: 'name', text: c.name }), el('span', { class: 'desc', text: c.description }));
      }
      btn.append(el('kbd', { class: 'key', text: String(i + 1) }));
      btn.addEventListener('click', () => onChoose(i));
      return btn;
    });
    this.mount(
      'levelup',
      el('div', { class: 'panel levelup' }, [
        el('h2', { text: `레벨 업! Lv ${level}` }),
        el('p', { class: 'muted', text: `강화 하나를 선택하세요 (클릭 또는 1·2·3)${pending > 1 ? ` · 남은 선택 ${pending}` : ''}` }),
        el('div', { class: 'cards' }, cards),
      ]),
    );
  }

  showResult(result: RunResult, newRecords: NewRecord[], onRestart: () => void, onTitle: () => void): void {
    const win = result.outcome === 'victory';
    let cause: string;
    if (result.cause === 'boss') cause = `${josa(BOSS_CONFIG.name, '을/를')} 처치했습니다!`;
    else if (result.cause === 'death') cause = `${result.killedBy ?? '적의 공격'}에 쓰러졌습니다.`;
    else
      cause = `${formatTime(RUN_CONFIG.timeLimit)}까지 ${josa(BOSS_CONFIG.name, '을/를')} 처치하지 못했습니다${
        result.bossHpRatio !== null ? ` (보스 체력 ${Math.ceil(result.bossHpRatio * 100)}% 남음)` : ''
      }.`;

    const restart = el('button', { class: 'primary big', 'data-testid': 'restart', 'data-autofocus': '' }, ['다시 시작 ', el('kbd', { text: 'Enter' })]);
    restart.addEventListener('click', onRestart);
    const title = el('button', { 'data-testid': 'result-title', text: '타이틀로' });
    title.addEventListener('click', onTitle);

    const ups = result.upgrades.length
      ? result.upgrades.map((u) => el('li', { text: `${u.name} ×${u.stacks}` }))
      : [el('li', { class: 'muted', text: '선택한 강화 없음' })];

    this.mount(
      'result',
      el('div', { class: `panel result ${win ? 'win' : 'lose'}` }, [
        el('h2', { class: 'outcome', 'data-testid': 'outcome', text: win ? '승리' : '패배' }),
        el('p', { class: 'cause', 'data-testid': 'cause', text: cause }),
        newRecords.length ? el('div', { class: 'badges' }, newRecords.map((r) => el('span', { class: 'badge', text: NEW_RECORD_LABEL[r] }))) : el('div'),
        el('dl', { class: 'stats' }, [
          el('dt', { text: '생존 시간' }),
          el('dd', { 'data-testid': 'result-time', text: formatTime(result.survivalTime) }),
          el('dt', { text: '처치 수' }),
          el('dd', { 'data-testid': 'result-kills', text: String(result.kills) }),
          el('dt', { text: '도달 레벨' }),
          el('dd', { text: String(result.level) }),
        ]),
        el('h3', { text: '선택한 강화' }),
        el('ul', { class: 'upgrades', 'data-testid': 'result-upgrades' }, ups),
        restart,
        el('div', { class: 'row buttons' }, [title]),
        el('small', { class: 'muted' }, [
          'Enter · Space · R 키로 바로 다시 시작',
          el('br'),
          `시드 ${result.seed}${result.assisted ? ' · 개발 옵션 사용 (기록 미반영)' : ''}`,
        ]),
      ]),
    );
  }
}
