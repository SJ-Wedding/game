import { CHARACTERS, type CharacterId } from '../config/characters';
import { DIFFICULTY } from '../config/enemies';
import { GRADES } from '../config/grades';
import { ESSENCES, RELICS, relicDescription } from '../config/relics';
import { UPGRADE_BY_ID } from '../config/upgrades';
import { WEAPON_FUSIONS, WEAPONS, WEAPON_MAX_RANK } from '../config/weapons';
import { catalogPick } from '../core/catalog';
import { formatTime } from '../core/math';
import { upgradeText } from '../core/upgrades';
import { ARENA_ART, arenaTheme } from '../render/arena';
import type { ArchiveSnapshot, ArchivedRun } from '../storage/archive';
import { relicArt, shopSprite, upgradeChoiceArt } from './art';
import { CODEX_ENTRIES, CODEX_TABS, codexEntry, type CodexEntry, type CodexTab } from './codex';
import { codexMotion } from './codexMotion';
import { damageBreakdown, roanDesignName, runEndReason } from './combatReport';
import { el } from './dom';

const countFormat = new Intl.NumberFormat('ko-KR');
const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' });
const portrait: Record<CharacterId, number> = { ranger: 20, lumen: 21, roan: 22 };
const PAGE_SIZE = 20;
const formatCount = (count: number) => countFormat.format(count);
const dateLabel = (time: number) => dateFormat.format(time);

function panel(title: string, tools: HTMLElement, body: HTMLElement, back: () => void): HTMLElement {
  const close = el('button', { type: 'button', 'data-autofocus': '', 'data-testid': 'archive-close' },
    ['타이틀로 ', el('kbd', { text: 'Esc' })]);
  close.addEventListener('click', back);
  return el('div', { class: 'panel archive', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
    el('header', { class: 'ui-heading' }, [el('h2', { text: title })]),
    tools, body, el('footer', { class: 'ui-actions' }, [close]),
  ]);
}

function framedIcon(icon: HTMLElement): HTMLElement {
  return el('span', { class: 'archive-icon ui-frame', 'aria-hidden': 'true' }, [icon]);
}

function entryTitle(name: string, category: string, art: HTMLElement): HTMLElement {
  return el('div', { class: 'archive-entry-title' }, [framedIcon(art), el('div', {}, [
    el('p', { class: 'archive-category', text: category }),
    el('h3', { text: name }),
  ])]);
}

function facts(rows: readonly (readonly [string, string])[], layout = ''): HTMLElement {
  return el('dl', { class: `archive-facts ${layout}`.trim() }, rows.map(([label, value]) => el('div', {}, [
    el('dt', { text: label }), el('dd', { text: value }),
  ])));
}

function persistenceNotice(snapshot: ArchiveSnapshot): HTMLElement[] {
  return snapshot.persisted ? [] : [el('p', { class: 'archive-notice', role: 'status',
    text: '브라우저 저장소에 일부 기록을 저장하거나 읽지 못했습니다.' })];
}

function showCodexEntry(entry: CodexEntry): HTMLElement[] {
  const motion = codexMotion(entry.id);
  return [entryTitle(entry.name, entry.category, entry.art()), el('p', { class: 'archive-effect', text: entry.description }),
    ...(motion ? [motion] : []),
    ...(entry.facts?.length ? [facts(entry.facts)] : [])];
}

export function buildCodex(snapshot: Promise<ArchiveSnapshot>, back: () => void): HTMLElement {
  const tabs = el('div', { class: 'archive-tabs', role: 'group', 'aria-label': '도감 분류' });
  const search = el('input', { type: 'search', placeholder: '이름 또는 효과 검색', 'aria-label': '도감 검색' });
  const tally = el('span', { class: 'archive-tally', 'aria-live': 'polite' });
  const toolbar = el('div', { class: 'archive-toolbar' }, [tabs, search, tally]);
  const body = el('div', { class: 'archive-layout' });
  const list = el('div', { class: 'archive-list ui-scroll', 'aria-label': '발견 목록' });
  const detail = el('section', { class: 'archive-inspector ui-frame ui-scroll', 'aria-label': '도감 상세', 'data-testid': 'codex-detail' }, [
    el('p', { class: 'muted', text: '도감을 불러오는 중입니다.' }),
  ]);
  body.append(list, detail);

  void snapshot.then((data) => {
    const discovered = CODEX_ENTRIES.filter((entry) => data.discoveries.has(entry.id));
    let tab: CodexTab = discovered.length ? discovered[0].tab : 'relics';
    let selected: CodexEntry | undefined;
    const tabButtons = (Object.keys(CODEX_TABS) as CodexTab[]).map((key) => {
      const tabCount = discovered.filter((entry) => entry.tab === key).length;
      const button = el('button', { type: 'button', 'data-codex-tab': key, text: `${CODEX_TABS[key]} · ${tabCount}` });
      button.addEventListener('click', () => { tab = key; selected = undefined; update(); });
      return button;
    });
    tabs.append(...tabButtons);
    const select = (entry: CodexEntry) => {
      selected = entry;
      detail.replaceChildren(...showCodexEntry(entry));
      detail.scrollTop = 0;
      for (const button of list.querySelectorAll<HTMLButtonElement>('[data-entry]')) {
        button.setAttribute('aria-pressed', String(button.dataset.entry === entry.id));
      }
    };
    function update(): void {
      const query = search.value.trim().toLocaleLowerCase('ko-KR');
      const inTab = discovered.filter((entry) => entry.tab === tab);
      const matches = inTab.filter((entry) => [entry.name, entry.category, entry.description, ...(entry.facts?.flat() ?? [])]
        .some((value) => value.toLocaleLowerCase('ko-KR').includes(query)))
        .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'));
      for (const button of tabButtons) button.setAttribute('aria-pressed', String(button.dataset.codexTab === tab));
      tally.textContent = `발견 ${inTab.length} / ${CODEX_ENTRIES.filter((entry) => entry.tab === tab).length}`;
      list.replaceChildren(...matches.map((entry) => {
        const button = el('button', { type: 'button', class: 'archive-entry', 'data-entry': entry.id }, [
          framedIcon(entry.art()), el('span', {}, [el('strong', { text: entry.name }), el('small', { text: entry.category })]),
        ]);
        button.addEventListener('click', () => select(entry));
        return button;
      }));
      if (matches.length) select(matches.find((entry) => entry === selected) ?? matches[0]);
      else detail.replaceChildren(el('p', { class: 'archive-empty', text: query
        ? '검색어와 일치하는 발견 항목이 없습니다.'
        : '아직 발견한 항목이 없습니다. 플레이 중 선택지에 처음 나오면 도감에 등록됩니다.' }));
    }
    search.addEventListener('input', update);
    update();
    toolbar.append(...persistenceNotice(data));
  });
  return panel('도감', toolbar, body, back);
}

function historyTitle(run: ArchivedRun): string {
  return CHARACTERS[run.result.loadout?.character ?? 'ranger'].name;
}

function historyOutcome(run: ArchivedRun): string {
  return run.result.outcome === 'victory' ? '클리어' : '미클리어';
}

function historyRow(run: ArchivedRun, select: () => void): HTMLButtonElement {
  const { result } = run;
  const button = el('button', { type: 'button', class: 'archive-entry history-entry', 'data-run-id': run.id }, [
    framedIcon(shopSprite(portrait[result.loadout?.character ?? 'ranger'])),
    el('span', {}, [
      el('small', { text: dateLabel(run.endedAt) }),
      el('strong', { text: historyTitle(run) }),
      el('small', { text: `${DIFFICULTY[result.difficulty ?? 'hard'].name} · ${formatTime(result.survivalTime)} · ${formatCount(result.kills)}마리` }),
    ]),
    el('span', { class: `history-outcome ${result.outcome}`, text: historyOutcome(run) }),
  ]);
  button.addEventListener('click', select);
  return button;
}

function section(title: string, ...content: HTMLElement[]): HTMLElement {
  return el('section', { class: 'history-section ui-frame' }, [el('h4', { text: title }), ...content]);
}

function historyWeapons(run: ArchivedRun): HTMLElement {
  const { result } = run;
  const loadout = result.loadout;
  const names = new Set<string>();
  if (loadout?.character === 'roan') {
    names.add(roanDesignName('base'));
    for (const attack of result.attackDetails ?? []) if (attack.design) names.add(roanDesignName(attack.design));
    for (const id of result.pickOrder) {
      const pick = catalogPick(id);
      const entry = pick && codexEntry(pick);
      if (entry && entry.tab === 'gear') names.add(`${entry.name}${id.startsWith('awaken:') ? ' 각성' : ''}`);
    }
    if (result.roan) names.add(`${roanDesignName(result.roan.design)}${result.roan.awakened ? ' 각성' : ''}`);
  } else if (loadout?.character === 'lumen') {
    if (!result.upgrades.some(({ id }) => id === loadout.weapon)) names.add(`${WEAPONS[loadout.weapon].name} Lv 1`);
  } else names.add('기본 사격');
  for (const upgrade of result.upgrades) {
    const weapon = UPGRADE_BY_ID[upgrade.id]?.weapon;
    if (weapon) names.add(`${WEAPONS[weapon].name} Lv ${upgrade.stacks}`);
  }
  for (const fusion of result.fusions ?? []) names.add(`${WEAPON_FUSIONS[fusion].name} Lv ${WEAPON_MAX_RANK}`);
  return section('사용 무기', el('ul', { class: 'history-weapons' }, [...names].map((text) => el('li', { text }))));
}

function historyUpgrades(run: ArchivedRun): HTMLElement {
  const { result } = run;
  const rows = result.upgrades.flatMap((upgrade) => {
    const def = UPGRADE_BY_ID[upgrade.id];
    if (!def) return [];
    const grades = GRADES.flatMap((grade) => {
      const count = upgrade.grades.filter((id) => id === grade.id).length;
      if (!count) return [];
      return [el('li', {}, [el('strong', { text: `${grade.name} ×${count}`, style: `color: ${grade.color}` }),
        el('span', { text: def.weapon ? '' : upgradeText(def, grade.id) })])];
    });
    return [el('li', { class: 'history-build-row' }, [
      framedIcon(upgradeChoiceArt(def)), el('div', {}, [el('strong', { text: def.weapon ? `${upgrade.name} Lv ${upgrade.stacks}` : `${upgrade.name} ×${upgrade.stacks}` }), el('ul', {}, grades)]),
    ])];
  });
  const names = result.pickOrder.flatMap((id) => {
    const key = catalogPick(id);
    const entry = key && codexEntry(key);
    return entry ? [`${entry.name}${id.startsWith('awaken:') ? ' 각성' : ''}`] : [];
  });
  for (const [id, stack] of Object.entries(result.essences ?? {})) {
    if (stack > 0) rows.push(el('li', { class: 'history-essence', text: `${ESSENCES[id as keyof typeof ESSENCES].name} ×${stack}` }));
  }
  return section('선택한 강화',
    rows.length ? el('ul', { class: 'history-build' }, rows) : el('p', { class: 'muted', text: '선택한 강화가 없습니다.' }),
    ...(names.length ? [el('details', { class: 'history-order' }, [el('summary', { text: '선택 순서' }),
      el('ol', {}, names.map((text) => el('li', { text })))])] : []),
  );
}

function historyRelics(run: ArchivedRun): HTMLElement {
  const ids = run.result.relics ?? [];
  return section('보유 유물', ids.length ? el('ul', { class: 'history-build' }, ids.map((id) => el('li', { class: 'history-build-row' }, [
    framedIcon(relicArt(id)), el('div', {}, [el('strong', { text: RELICS[id].name }),
      el('p', { class: 'muted', text: relicDescription(id, run.result.fusions) })]),
  ]))) : el('p', { class: 'muted', text: '보유한 유물이 없습니다.' }));
}

function historyDetail(run: ArchivedRun): HTMLElement[] {
  const { result } = run;
  const difficulty = result.difficulty ?? 'hard';
  const arena = ARENA_ART[arenaTheme(result.seed, difficulty)];
  const character = result.loadout?.character ?? 'ranger';
  const kills = Object.entries(arena.names).map(([kind, name]): [string, string] => [name, `${formatCount(result.killsByKind[kind] ?? 0)}마리`]);
  return [
    entryTitle(historyTitle(run), `${historyOutcome(run)} · ${DIFFICULTY[difficulty].name} · ${arena.name}`, shopSprite(portrait[character])),
    el('p', { class: 'archive-effect', text: runEndReason(result, arena) }),
    facts([['날짜', dateLabel(run.endedAt)], ['생존 시간', formatTime(result.survivalTime)],
      ['처치', `${formatCount(result.kills)}마리`], ['도달 레벨', String(result.level)],
      ['획득 토큰', run.tokens === null ? '—' : formatCount(run.tokens)], ['시드', String(result.seed)]], 'history-summary'),
    historyWeapons(run), damageBreakdown(result, true), section('몬스터별 처치', facts(kills)),
    historyUpgrades(run), historyRelics(run),
  ];
}

function selectFilter(label: string, values: readonly (readonly [string, string])[]): HTMLSelectElement {
  return el('select', { 'aria-label': label }, [el('option', { value: '', text: label }),
    ...values.map(([value, text]) => el('option', { value, text }))]);
}

export function buildHistory(snapshot: Promise<ArchiveSnapshot>, back: () => void): HTMLElement {
  const character = selectFilter('모든 캐릭터', Object.entries(CHARACTERS).map(([id, value]) => [id, value.name]));
  const outcome = selectFilter('모든 결과', [['victory', '클리어'], ['defeat', '미클리어']]);
  const tally = el('span', { class: 'archive-tally', 'aria-live': 'polite' });
  const toolbar = el('div', { class: 'archive-toolbar' }, [character, outcome, tally]);
  const entries = el('div', { class: 'archive-list ui-scroll', 'aria-label': '전투 목록', 'data-testid': 'history-list' });
  const paging = el('div', { class: 'archive-paging' });
  const detail = el('section', { class: 'archive-inspector ui-frame ui-scroll', 'aria-label': '전투 상세', 'data-testid': 'history-detail' }, [
    el('p', { class: 'muted', text: '전투 기록을 불러오는 중입니다.' }),
  ]);
  const body = el('div', { class: 'archive-layout' }, [el('div', { class: 'archive-list-pane' }, [entries, paging]), detail]);

  void snapshot.then((data) => {
    let page = 0;
    let selected: ArchivedRun | undefined;
    const prev = el('button', { type: 'button', text: '이전' });
    const next = el('button', { type: 'button', text: '다음' });
    const pages = el('span', { 'aria-live': 'polite' });
    paging.append(prev, pages, next);
    prev.addEventListener('click', () => { page--; render(); });
    next.addEventListener('click', () => { page++; render(); });
    const select = (run: ArchivedRun) => {
      selected = run;
      detail.replaceChildren(...historyDetail(run));
      detail.scrollTop = 0;
      for (const button of entries.querySelectorAll<HTMLButtonElement>('[data-run-id]')) {
        button.setAttribute('aria-pressed', String(button.dataset.runId === run.id));
      }
    };
    function render(): void {
      const filtered = data.runs.filter(({ result }) => (!character.value || (result.loadout?.character ?? 'ranger') === character.value)
        && (!outcome.value || result.outcome === outcome.value));
      const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
      page = Math.max(0, Math.min(totalPages - 1, page));
      const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
      tally.textContent = `${formatCount(filtered.length)}판 · 이 브라우저`;
      pages.textContent = `${page + 1} / ${totalPages}`;
      prev.disabled = page === 0;
      next.disabled = page + 1 === totalPages;
      paging.classList.toggle('hidden', totalPages === 1);
      entries.replaceChildren(...visible.map((run) => historyRow(run, () => select(run))));
      entries.scrollTop = 0;
      if (visible.length) select(visible.find((run) => run === selected) ?? visible[0]);
      else detail.replaceChildren(el('p', { class: 'archive-empty', text: data.runs.length
        ? '조건에 맞는 전투 기록이 없습니다.'
        : '아직 전투 기록이 없습니다. 전투를 끝내면 승패와 상세 기록이 저장됩니다.' }));
    }
    const filter = () => { page = 0; selected = undefined; render(); };
    character.addEventListener('change', filter);
    outcome.addEventListener('change', filter);
    render();
    toolbar.append(...persistenceNotice(data));
  });
  return panel('전투 통계', toolbar, body, back);
}
