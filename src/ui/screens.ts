import { WEAPON_DAMAGE_PER_RANK } from '../config/weapons';
import { CARRY_LIMIT, RELICS, relicDescription, type RelicId } from '../config/relics';
import { relicInventory } from './relics';
import { WEAPON_TEXTURES } from '../render/textures';
import { BOSS_CONFIG } from '../config/boss';
import { RUN_CONFIG } from '../config/run';
import { GRADES, GRADE_INDEX } from '../config/grades';
import { META_STATS, META_UNLOCKS } from '../config/meta';
import type { PlayerStats } from '../config/player';
import { CATEGORY_LABEL } from '../config/upgrades';
import { metaLevel, nextCost, type TokenReward } from '../core/meta';
import type { UpgradePick } from '../core/stats';
import { upgradeText } from '../core/upgrades';
import { UPGRADE_BY_ID } from '../config/upgrades';
import { formatTime } from '../core/math';
import type { RunResult, UpgradeChoice } from '../core/types';
import type { NewRecord, SaveMeta, SaveRecords } from '../storage/save';
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
  onShop: () => void;
  onVolume: (v: number) => void;
  onDevChange?: (s: DevPanelState) => void;
}

export interface PauseHandlers {
  onResume: () => void;
  onStatus: () => void;
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
  current: 'none' | 'title' | 'pause' | 'levelup' | 'result' | 'status' | 'shop' = 'none';

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

  showTitle(records: SaveRecords, meta: SaveMeta, volume: number, h: TitleHandlers, dev: DevPanelState | null): void {
    const play = el('button', { class: 'primary big', 'data-testid': 'play', 'data-autofocus': '' }, ['플레이 ', el('kbd', { text: 'Enter' })]);
    play.addEventListener('click', h.onPlay);
    const shop = el('button', { class: 'shop-btn', 'data-testid': 'open-shop' }, ['강화 상점 · ', el('span', { class: 'token', 'data-testid': 'title-tokens', text: `◆ ${meta.tokens}` })]);
    shop.addEventListener('click', h.onShop);

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
        el('li', {}, [el('kbd', { text: 'Tab' }), ' 상태창 (능력치 확인)']),
        el('li', {}, [el('kbd', { text: 'Esc' }), ' 일시정지']),
      ]),
    ]);

    const children: HTMLElement[] = [
      el('h1', { class: 'logo', text: '균열 아레나' }),
      el('p', { class: 'tagline', text: `몰려드는 균열의 괴물을 쓰러뜨리고 강해져, ${formatTime(RUN_CONFIG.timeLimit)} 안에 ${josa(BOSS_CONFIG.name, '을/를')} 처치하라.` }),
      el('div', { class: 'row buttons' }, [play, shop]),
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

  showPause(reason: 'esc' | 'hidden', volume: number, h: PauseHandlers, relics: RelicId[]): void {
    const resume = el('button', { class: 'primary', 'data-testid': 'resume', 'data-autofocus': '' }, ['계속하기 ', el('kbd', { text: 'Esc' })]);
    resume.addEventListener('click', h.onResume);
    const restart = el('button', { 'data-testid': 'pause-restart', text: '처음부터 다시' });
    restart.addEventListener('click', h.onRestart);
    const title = el('button', { 'data-testid': 'pause-title', text: '타이틀로' });
    title.addEventListener('click', h.onTitle);
    const status = el('button', { 'data-testid': 'pause-status' }, ['상태 보기 ', el('kbd', { text: 'Tab' })]);
    status.addEventListener('click', h.onStatus);
    this.mount(
      'pause',
      el('div', { class: 'panel pause' }, [
        el('h2', { text: '일시정지' }),
        el('p', { class: 'muted', text: reason === 'hidden' ? '탭이 숨겨져 자동으로 멈췄습니다. 전투 시간과 적 생성도 멈춰 있습니다.' : '전투 시간과 적 생성이 멈춰 있습니다.' }),
        resume,
        status,
        this.volumeControl(volume, h.onVolume),
        ...(relics.length ? [
          el('h3', { text: '보유 유물' }),
          el('div', { class: 'relic-slots' }, relicInventory(relics, 'pause')),
        ] : []),
        el('div', { class: 'row buttons' }, [restart, title]),
        el('small', { class: 'muted', text: '처음부터 다시 / 타이틀로 이동하면 이번 판은 기록되지 않습니다.' }),
      ]),
    );
  }

  showLevelUp(opts: {
    title: string;
    pending: number;
    choices: UpgradeChoice[];
    rerollsLeft: number;
    onChoose: (i: number) => void;
    onReroll: () => void;
  }): void {
    const reward = opts.choices[0]?.kind === 'relic';
    const cards = opts.choices.map((c, i) => {
      const grade = c.kind === 'upgrade' && !c.def.weapon ? GRADES[GRADE_INDEX[c.grade]] : null;
      const btn = el('button', {
        class: `card ${c.kind === 'upgrade' ? c.def.category : c.kind === 'relic' ? 'relic-card' : 'fallback'}${grade ? ` grade-${grade.id}` : ''}`,
        'data-testid': `choice-${i}`,
        'data-grade': grade?.id ?? '',
      });
      if (grade) btn.style.setProperty('--grade', grade.color);
      if (i === 0) btn.setAttribute('data-autofocus', '');
      if (c.kind === 'upgrade') {
        const weapon = c.def.weapon;
        if (weapon) btn.append(el('img', { class: 'weapon-icon', src: WEAPON_TEXTURES[weapon], alt: '' }));
        btn.append(
          el('span', { class: 'cat', text: weapon ? (c.nextStack === 1 ? '특수 무기 획득' : '특수 무기 강화') : `${grade!.name} · ${CATEGORY_LABEL[c.def.category]}` }),
          el('strong', { class: 'name', text: c.def.name }),
          el('span', { class: 'desc', text: weapon && c.nextStack > 1
            ? `이 무기 피해 보너스 +${Math.round((c.nextStack - 2) * WEAPON_DAMAGE_PER_RANK * 100)}% → +${Math.round((c.nextStack - 1) * WEAPON_DAMAGE_PER_RANK * 100)}%`
            : upgradeText(c.def, c.grade) }),
          el('span', { class: 'stack', text: weapon ? (c.nextStack === 1 ? `획득 즉시 자동 발동 · 최대 Lv ${c.def.maxStacks}` : `Lv ${c.nextStack - 1} → Lv ${c.nextStack} / 최대 Lv ${c.def.maxStacks}`) : c.nextStack === 1 ? `신규 · 최대 ${c.def.maxStacks}회` : `${c.nextStack - 1} → ${c.nextStack} / 최대 ${c.def.maxStacks}회` }),
        );
      } else if (c.kind === 'relic') {
        const relic = RELICS[c.id];
        btn.append(
          el('span', { class: 'relic-symbol', 'aria-hidden': 'true', text: relic.symbol }),
          el('strong', { class: 'name', text: relic.name }),
          el('span', { class: 'desc', text: relicDescription(c.id) }),
        );
      } else {
        btn.append(el('span', { class: 'cat', text: '회복' }), el('strong', { class: 'name', text: c.name }), el('span', { class: 'desc', text: c.description }));
      }
      btn.append(el('kbd', { class: 'key', text: String(i + 1) }));
      btn.addEventListener('click', () => opts.onChoose(i));
      return btn;
    });
    const reroll = el('button', { class: 'reroll', 'data-testid': 'reroll' }, [`새로고침 (남은 ${opts.rerollsLeft}회) `, el('kbd', { text: 'R' })]);
    if (opts.rerollsLeft <= 0) reroll.setAttribute('disabled', '');
    reroll.addEventListener('click', opts.onReroll);
    this.mount(
      'levelup',
      el('div', { class: 'panel levelup' }, [
        el('h2', { text: opts.title }),
        el('p', { class: 'muted', text: reward ? '유물 하나를 선택하세요 (클릭 또는 1·2·3)' : `강화 하나를 선택하세요 (클릭 또는 1·2·3)${opts.pending > 1 ? ` · 남은 선택 ${opts.pending}` : ''}` }),
        el('div', { class: 'cards' }, cards),
        ...(reward ? [] : [reroll]),
      ]),
    );
  }

  /** 상태창: 능력치(시작 → 영구 강화 → 최종)와 이번 판 강화 */
  showStatus(opts: {
    level: number;
    layers: { base: PlayerStats; meta: PlayerStats; final: PlayerStats };
    picks: UpgradePick[];
    relics: RelicId[];
    rerollsLeft: number;
    revivesLeft: number;
    onClose: () => void;
  }): void {
    const { base, meta, final } = opts.layers;
    const rows = STATUS_ROWS.map(([key, label, f]) =>
      el('tr', { 'data-stat': key }, [
        el('th', { text: label }),
        el('td', { text: f(base[key]) }),
        el('td', { text: f(meta[key]) }),
        el('td', { class: 'final', 'data-testid': `stat-${key}`, text: f(final[key]) }),
      ]),
    );
    const grouped = new Map<UpgradePick['id'], UpgradePick[]>();
    for (const p of opts.picks) grouped.set(p.id, [...(grouped.get(p.id) ?? []), p]);
    const picks = [...grouped.entries()].map(([id, list]) => {
      const def = UPGRADE_BY_ID[id];
      if (def.weapon) return el('li', { text: `${def.name} Lv ${list.length}` });
      return el('li', {}, [
        el('span', { text: `${def.name} ` }),
        ...list.map((p) => el('span', { class: 'gdot', title: GRADES[GRADE_INDEX[p.grade]].name, style: `background:${GRADES[GRADE_INDEX[p.grade]].color}` })),
      ]);
    });
    const close = el('button', { class: 'primary', 'data-testid': 'status-close', 'data-autofocus': '' }, ['닫기 ', el('kbd', { text: 'Esc' })]);
    close.addEventListener('click', opts.onClose);
    this.mount(
      'status',
      el('div', { class: 'panel status' }, [
        el('h2', { text: `상태 · Lv ${opts.level}` }),
        el('p', { class: 'muted', text: '상태창을 보는 동안 전투 시간이 멈춥니다.' }),
        el('table', { class: 'stat-table' }, [
          el('thead', {}, [el('tr', {}, [el('th', { text: '능력치' }), el('th', { text: '시작' }), el('th', { text: '영구 강화' }), el('th', { text: '현재' })])]),
          el('tbody', {}, rows),
        ]),
        el('h3', { text: '이번 판 강화 (점 색 = 등급)' }),
        el('ul', { class: 'upgrades' }, picks.length ? picks : [el('li', { class: 'muted', text: '아직 없음' })]),
        el('h3', { text: '보유 유물' }),
        opts.relics.length
          ? el('div', { class: 'relic-slots', 'data-testid': 'status-relics' }, relicInventory(opts.relics, 'status'))
          : el('p', { class: 'muted', text: '아직 없음' }),
        el('p', { class: 'muted', 'data-testid': 'status-extra', text: `새로고침 남은 횟수 ${opts.rerollsLeft} · 부활 ${opts.revivesLeft > 0 ? '가능' : '없음'}` }),
        close,
      ]),
    );
  }

  /** 강화 상점: 토큰으로 영구 강화 구매 */
  showShop(meta: SaveMeta, onBuy: (id: string) => void, onBack: () => void): void {
    const item = (id: string, name: string, desc: string, maxLevel: number) => {
      const lv = metaLevel(meta.purchases, id);
      const cost = nextCost(meta.purchases, id);
      const btn = el('button', { class: 'buy', 'data-testid': `buy-${id}` }, [cost === null ? '최대' : `◆ ${cost}`]);
      if (cost === null || meta.tokens < cost) btn.setAttribute('disabled', '');
      btn.addEventListener('click', () => onBuy(id));
      return el('li', { class: 'shop-item' }, [
        el('div', {}, [el('strong', { text: name }), el('span', { class: 'lv', 'data-testid': `lv-${id}`, text: ` ${lv}/${maxLevel}` }), el('br'), el('small', { class: 'muted', text: desc })]),
        btn,
      ]);
    };
    const stats = META_STATS.map((m) => {
      const pct = Math.round(Math.abs(m.pctPerLevel) * 100);
      return item(m.id, m.name, `단계마다 ${pct}% ${m.pctPerLevel < 0 ? '감소' : '증가'}`, m.maxLevel);
    });
    const unlocks = META_UNLOCKS.map((u) => item(u.id, u.name, u.description, u.maxLevel));
    const back = el('button', { class: 'primary', 'data-testid': 'shop-back', 'data-autofocus': '' }, ['돌아가기 ', el('kbd', { text: 'Esc' })]);
    back.addEventListener('click', onBack);
    this.mount(
      'shop',
      el('div', { class: 'panel shop' }, [
        el('h2', { text: '강화 상점' }),
        el('p', {}, ['보유 토큰 ', el('strong', { class: 'token', 'data-testid': 'shop-tokens', text: `◆ ${meta.tokens}` })]),
        el('p', { class: 'muted', text: '판이 끝날 때마다 생존 시간·처치·엘리트·승리에 따라 토큰을 받습니다. 영구 강화는 다음 판부터 적용됩니다.' }),
        el('div', { class: 'row shop-cols' }, [
          el('div', {}, [el('h3', { text: '능력치' }), el('ul', { class: 'shop-list' }, stats)]),
          el('div', {}, [el('h3', { text: '해금' }), el('ul', { class: 'shop-list' }, unlocks)]),
        ]),
        back,
      ]),
    );
  }

  showResult(result: RunResult, newRecords: NewRecord[], tokens: TokenReward | null, onRestart: () => void, onTitle: () => void, onCarry: (ids: RelicId[]) => void): void {
    const win = result.outcome === 'victory';
    let cause: string;
    if (result.cause === 'boss') cause = `${josa(BOSS_CONFIG.name, '을/를')} 처치했습니다!`;
    else if (result.cause === 'death') cause = `${result.killedBy ?? '적의 공격'}에 쓰러졌습니다.`;
    else
      cause = `${formatTime(RUN_CONFIG.timeLimit)}까지 ${josa(BOSS_CONFIG.name, '을/를')} 처치하지 못했습니다${
        result.bossHpRatio !== null ? ` (보스 체력 ${Math.ceil(result.bossHpRatio * 100)}% 남음)` : ''
      }.`;

    const restart = el('button', { class: 'primary big', 'data-testid': 'restart', 'data-autofocus': '' }, [win ? '다음 판 시작 ' : '다시 시작 ', el('kbd', { text: 'Enter' })]);
    restart.addEventListener('click', onRestart);
    const title = el('button', { 'data-testid': 'result-title', text: '타이틀로' });
    title.addEventListener('click', onTitle);

    const ups = result.upgrades.length
      ? result.upgrades.map((u) =>
          el('li', {}, [
            `${u.name} ×${u.stacks} `,
            ...u.grades.map((g) => el('span', { class: 'gdot', title: GRADES[GRADE_INDEX[g]].name, style: `background:${GRADES[GRADE_INDEX[g]].color}` })),
          ]),
        )
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
        tokens
          ? el('div', { class: 'tokens', 'data-testid': 'result-tokens' }, [
              el('strong', { class: 'token', text: `획득 토큰 ◆ ${tokens.total}` }),
              el('small', { class: 'muted', text: ` (생존 ${tokens.survival} · 처치 ${tokens.kills} · 엘리트 ${tokens.elites} · 승리 ${tokens.victory}) — 타이틀의 강화 상점에서 사용` }),
            ])
          : el('small', { class: 'muted', text: '개발 옵션 사용 판은 토큰을 받지 않습니다.' }),
        ...(win && result.relics?.length ? [this.carrySelection(result.relics, onCarry)] : []),
        restart,
        el('div', { class: 'row buttons' }, [title]),
        el('small', { class: 'muted' }, [
          win ? 'Enter · Space · R 키로 다음 판 시작' : 'Enter · Space · R 키로 다시 시작',
          el('br'),
          `시드 ${result.seed}${result.assisted ? ' · 개발 옵션 사용 (기록 미반영)' : ''}`,
        ]),
      ]),
    );
  }

  private carrySelection(ids: RelicId[], onChange: (ids: RelicId[]) => void): HTMLElement {
    const selected = new Set<RelicId>();
    const count = el('span', { class: 'muted', 'aria-live': 'polite', text: `0 / ${CARRY_LIMIT}` });
    const buttons = ids.map((id) => {
      const relic = RELICS[id];
      const button = el('button', { class: 'relic-pick', type: 'button', 'aria-pressed': 'false', 'data-relic': id }, [
        el('strong', { text: `${relic.symbol} ${relic.name}` }),
        el('small', { text: relicDescription(id) }),
      ]);
      button.addEventListener('click', () => {
        if (selected.has(id)) selected.delete(id);
        else if (selected.size < CARRY_LIMIT) selected.add(id);
        else return;
        button.setAttribute('aria-pressed', String(selected.has(id)));
        count.textContent = `${selected.size} / ${CARRY_LIMIT}`;
        for (const item of buttons) item.disabled = selected.size >= CARRY_LIMIT && item.getAttribute('aria-pressed') !== 'true';
        onChange([...selected]);
      });
      return button;
    });
    return el('section', { class: 'carry-relics', 'aria-label': '다음 판에 가져갈 유물' }, [
      el('h3', { text: '다음 판에 가져갈 유물' }), count,
      el('div', { class: 'carry-grid' }, buttons),
    ]);
  }

}

type Fmt = (v: number) => string;
const n0: Fmt = (v) => String(Math.round(v));
const n1: Fmt = (v) => v.toFixed(1).replace(/\.0$/, '');
const pct: Fmt = (v) => `${Math.round(v * 100)}%`;

/** 상태창에 보여 줄 능력치 [키, 이름, 표시 형식] */
const STATUS_ROWS: [keyof PlayerStats, string, Fmt][] = [
  ['damage', '공격력', n1],
  ['fireRate', '공격 속도', (v) => `${v.toFixed(2)}회/초`],
  ['projectileCount', '투사체 수', n0],
  ['maxHp', '최대 체력', n0],
  ['regen', '체력 재생', (v) => `${n1(v)}/초`],
  ['damageTaken', '받는 피해', pct],
  ['moveSpeed', '이동 속도', n0],
  ['dodgeCooldown', '회피 재사용', (v) => `${v.toFixed(2)}초`],
  ['pickupRadius', '흡수 범위', n0],
  ['xpGain', '경험치 획득', pct],
];
