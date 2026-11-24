import { CHARACTERS, CHARACTER_UPGRADES, LUMEN, LUMEN_WEAPONS, characterUpgradeValue, type CharacterId, type CharacterUpgradeId, type Loadout, type LumenWeapon } from '../config/characters';
import chainPreview from '../assets/weapon-previews/chain.webp';
import turretPreview from '../assets/weapon-previews/turret.webp';
import { ECHO_GROWTH, FUSION_ARMOR_PIERCE, FUSION_IDS, WEAPON_FUSIONS, WEAPONS, WEAPON_MAX_RANK, isFusionIngredient, type echoGrowth, type FusionId, WEAPON_DAMAGE_PER_RANK, WEAPON_RANK_EFFECTS, WEAPON_GRADE_DAMAGE, weaponRankEffect } from '../config/weapons';
import { CARRY_LIMIT, RELICS, relicDescription, type RelicId } from '../config/relics';
import { COMPACT_RELIC_LIMIT, relicInventory } from './relics';
import { weaponPreview } from './weaponPreview';
import { ACTOR_TEXTURES, CHARACTER_SHEETS, characterTexture, WEAPON_TEXTURES } from '../render/textures';
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
import type { AttackId, RunResult, UpgradeChoice } from '../core/types';
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
  current: 'none' | 'title' | 'pause' | 'levelup' | 'result' | 'carry' | 'characters' | 'lumen-weapon' | 'status' | 'shop' = 'none';

  constructor(root: HTMLElement) {
    this.root = root;
  }

  get hasStatusPreviewTargets(): boolean {
    return Boolean(this.root.querySelector('.status .relic-icon, .status .upgrades .weapon-preview-trigger, .status .fusion-recipes[open] .weapon-preview-trigger'));
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
      el('p', { class: 'tagline', text: `몰려드는 괴물을 쓰러뜨리고 ${josa(BOSS_CONFIG.name, '을/를')} 처치하세요. ${formatTime(RUN_CONFIG.timeLimit)}부터는 강화 돌격수가 몰려옵니다.` }),
      el('div', { class: 'row buttons' }, [play, shop]),
      el('div', { class: 'row' }, [controls, rec]),
      this.volumeControl(volume, h.onVolume),
    ];

    if (dev) children.push(this.devPanel(dev, h.onDevChange));
    this.mount('title', el('div', { class: 'panel title' }, children));
  }

  showCharacters(onChoose: (id: CharacterId) => void, onBack: () => void): void {
    const entries: Loadout[] = [{ character: 'ranger' }, { character: 'lumen', weapon: 'chain' }, { character: 'roan' }];
    const cards = entries.map((loadout) => {
      const id = loadout.character;
      const info = CHARACTERS[id];
      return this.characterCard(loadout, info.name, info.description, `character-${id}`, () => onChoose(id), id === 'ranger');
    });
    this.showCharacterCards('characters', '캐릭터 선택', cards, onBack);
  }

  showLumenWeapons(onChoose: (id: LumenWeapon) => void, onBack: () => void): void {
    const cards = LUMEN_WEAPONS.map((weapon, index) =>
      this.characterCard({ character: 'lumen', weapon }, WEAPONS[weapon].name,
        weapon === 'chain' ? '멀리서 번개를 튕깁니다. 연쇄 횟수와 첫 타격 화력을 키웁니다.'
          : '포탑을 설치해 적을 둔화시킵니다. 설치 대수와 포격 효과를 키웁니다.',
        `lumen-${weapon}`, () => onChoose(weapon), index === 0));
    this.showCharacterCards('lumen-weapon', '루멘의 시작 무기', cards, onBack);
  }

  private characterCard(loadout: Loadout, title: string, description: string, testId: string,
    onClick: () => void, focus: boolean): HTMLButtonElement {
    const key = characterTexture(loadout);
    const url = key === 'player' ? ACTOR_TEXTURES.player : CHARACTER_SHEETS[key];
    const fx = loadout.character === 'lumen' ? loadout.weapon : loadout.character;
    const portrait = el('span', { class: `character-pixel ${key === 'player' ? 'single' : ''}` });
    portrait.style.backgroundImage = `url("${url}")`;
    const effect = fx === 'chain' || fx === 'turret'
      ? el('img', { src: fx === 'chain' ? chainPreview : turretPreview, alt: '', class: 'character-attack sample' })
      : el('span', { class: `character-attack ${fx}` });
    const card = el('button', { class: 'character-card', type: 'button', 'data-testid': testId, ...(focus ? { 'data-autofocus': '' } : {}) }, [
      el('span', { class: 'character-preview', 'aria-hidden': 'true' }, [effect, portrait]),
      el('strong', { text: title }),
      el('span', { class: 'muted', text: description }),
    ]);
    card.style.setProperty('--character-color', CHARACTERS[loadout.character].color);
    card.addEventListener('click', onClick);
    return card;
  }

  private showCharacterCards(screen: 'characters' | 'lumen-weapon', title: string, cards: HTMLButtonElement[], onBack: () => void): void {
    const back = el('button', { class: 'character-back', type: 'button', 'data-testid': 'character-back' }, ['뒤로 ', el('kbd', { text: 'Esc' })]);
    back.addEventListener('click', onBack);
    this.mount(screen, el('div', { class: `panel character-select ${screen}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'character-heading' }, [
      el('h2', { id: 'character-heading', text: title }),
      el('div', { class: 'character-cards' }, cards),
      back,
    ]));
  }

  cancelCharacterSelection(): void {
    this.root.querySelector<HTMLButtonElement>('.character-back')?.click();
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

  showPause(reason: 'esc' | 'hidden', volume: number, h: PauseHandlers, relics: RelicId[], fusions: Iterable<FusionId>): void {
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
          el('div', { class: 'relic-slots' }, relicInventory(relics.slice(-COMPACT_RELIC_LIMIT), 'pause', { fusions })),
          ...(relics.length > COMPACT_RELIC_LIMIT ? [el('small', { class: 'muted', text: `전체 유물 ${relics.length}개 · 상태 보기에서 확인` })] : []),
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
    armory: boolean;
    specialist: boolean;
    masteryValue: (id: CharacterUpgradeId) => number;
    fusions: Iterable<FusionId>;
    bonusChoices: number;
    notice?: string | null;
    onChoose: (i: number) => void;
    onReroll: () => void;
  }): void {
    const coin = opts.choices[0]?.kind === 'coin';
    const reward = opts.choices[0]?.kind === 'relic' || coin;
    const cards = opts.choices.map((c, i) => {
      const grade = c.kind === 'upgrade' ? GRADES[GRADE_INDEX[c.grade]] : null;
      const btn = el('button', {
        class: `card ${c.kind === 'upgrade' ? c.def.category : c.kind === 'relic' ? 'relic-card' : c.kind === 'fusion' ? 'fusion-card' : c.kind === 'coin' ? 'relic-card coin-card' : 'fallback'}${grade ? ` grade-${grade.id}` : ''}`,
        'data-testid': `choice-${i}`,
        'data-grade': grade?.id ?? '',
      });
      if (grade) btn.style.setProperty('--grade', grade.color);
      if (i === 0) btn.setAttribute('data-autofocus', '');
      if (c.kind === 'upgrade') {
        const weapon = c.def.weapon;
        const mastery = c.def.mastery;
        const current = mastery ? opts.masteryValue(mastery) : 0;
        const gain = mastery ? characterUpgradeValue(mastery, c.grade) : 0;
        const effect = mastery && current > 0 ? `선택 후 누적 · ${CHARACTER_UPGRADES[mastery].text(current + gain)}` : upgradeText(c.def, c.grade);
        if (weapon) btn.append(el('img', { class: 'weapon-icon', src: WEAPON_TEXTURES[weapon], alt: '' }));
        btn.append(
          el('span', { class: 'cat', text: weapon ? `${grade!.name} · 특수 무기 ${c.nextStack === 1 ? '획득' : '강화'}` : `${grade!.name} · ${c.def.mastery ? '전용 강화' : CATEGORY_LABEL[c.def.category]}` }),
          el('strong', { class: 'name', text: c.def.name }),
          el('span', { class: 'desc', text: weapon && c.nextStack > 1
            ? `이 무기 피해 보너스 +${Math.round((c.nextStack - 2) * WEAPON_DAMAGE_PER_RANK * 100)}% → +${Math.round((c.nextStack - 1) * WEAPON_DAMAGE_PER_RANK * 100)}%`
            : effect }),
          ...(mastery && CHARACTER_UPGRADES[mastery].path !== 'roan' ? [el('small', {
            class: 'mastery-bonus', text: `시작 무기 피해 보너스 +${Math.round(gain * LUMEN.damagePerPoint * 100)}%`,
          })] : []),
          ...(weapon ? [el('span', { class: 'desc', text: `이 등급의 무기 피해 보너스 +${Math.round(WEAPON_GRADE_DAMAGE[c.grade] * 100)}%` })] : []),
          ...(weapon && c.nextStack > 1 ? [el('span', { class: 'desc',
            text: `${WEAPON_RANK_EFFECTS[weapon].label} ${weaponRankEffect(weapon, c.nextStack - 1)} → ${weaponRankEffect(weapon, c.nextStack)}${WEAPON_RANK_EFFECTS[weapon].unit}`,
          })] : []),
          ...(weapon === 'echo' ? [el('small', { class: 'mastery-bonus', text: `이번 판 처치가 누적됩니다 · 행운 1당 처치 스택 +${ECHO_GROWTH.luckPerPoint}` })] : []),
          el('span', { class: 'stack', text: weapon ? (c.nextStack === 1 ? `획득 즉시 자동 발동 · 최대 Lv ${c.def.maxStacks}` : `Lv ${c.nextStack - 1} → Lv ${c.nextStack} / 최대 Lv ${c.def.maxStacks}`) : c.nextStack === 1 ? '신규 강화' : `${c.nextStack - 1} → ${c.nextStack}중첩` }),
        );
      } else if (c.kind === 'fusion') {
        const recipe = WEAPON_FUSIONS[c.id];
        btn.append(
          el('span', { class: 'cat', text: `특수 무기 합체 · Lv ${WEAPON_MAX_RANK}` }),
          el('strong', { class: 'name', text: recipe.name }),
          el('span', { class: 'desc', text: recipe.pair.map((id) => WEAPONS[id].name).join(' + ') }),
          el('span', { class: 'desc', text: recipe.effect }),
          el('span', { class: 'desc', text: `재료 공격을 대체 · ${recipe.interval}초 주기 · 방어 ${FUSION_ARMOR_PIERCE * 100}% 관통` }),
          ...(c.id === 'volley' ? [el('small', { class: 'mastery-bonus', text: '메아리의 처치 피해·발동 간격 보너스 50% 계승' })] : []),
        );
      } else if (c.kind === 'relic') {
        const relic = RELICS[c.id];
        btn.append(
          el('span', { class: 'relic-symbol', 'aria-hidden': 'true', text: relic.symbol }),
          el('strong', { class: 'name', text: relic.name }),
          el('span', { class: 'desc', text: relicDescription(c.id, opts.fusions) }),
        );
      } else if (c.kind === 'coin') {
        btn.append(
          el('span', { class: 'relic-symbol', 'aria-hidden': 'true', text: c.id === 'flip' ? '⊜' : '✋' }),
          el('strong', { class: 'name', text: c.id === 'flip' ? '동전 던지기' : '던지지 않기' }),
          el('span', { class: 'desc', text: c.id === 'flip'
            ? '50%: 유물 선택 1회 추가 · 50%: 현재 체력 15%와 이번 유물 선택을 잃음'
            : '그대로 유물 하나를 고릅니다.' }),
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
        ...(opts.notice ? [el('p', { class: 'coin-notice', 'data-testid': 'coin-notice', text: opts.notice })] : []),
        el('p', { class: 'muted', text: coin ? '균열 수호자 유물을 걸고 동전을 던질지 고르세요 (클릭 또는 1·2)' : opts.bonusChoices ? `보너스 강화 하나를 선택하세요 · 남은 선택 ${opts.bonusChoices}회` : opts.armory ? (opts.specialist ? '전용 강화를 하나 선택하세요' : '특수 무기 하나를 획득·강화하거나 준비된 합체를 선택하세요') : reward ? '유물 하나를 선택하세요 (클릭 또는 1·2·3)' : `강화 하나를 선택하세요 (클릭 또는 1·2·3)${opts.pending > 1 ? ` · 남은 선택 ${opts.pending}` : ''}` }),
        el('div', { class: 'cards' }, cards),
        ...(reward || opts.armory || opts.bonusChoices ? [] : [reroll]),
      ]),
    );
  }

  /** 상태창: 능력치(시작 → 영구 강화 → 최종)와 이번 판 강화 */
  showStatus(opts: {
    level: number;
    loadout: Loadout;
    starterRank?: number;
    swordAngle?: number;
    echo?: { growth: ReturnType<typeof echoGrowth>; luck: number };
    layers: { base: PlayerStats; meta: PlayerStats; final: PlayerStats };
    picks: UpgradePick[];
    fusions: FusionId[];
    recipesOpen: boolean;
    relicsOpen: boolean;
    relics: RelicId[];
    rerollsLeft: number;
    revivesLeft: number;
    onClose: () => void;
  }): void {
    const { base, meta, final } = opts.layers;
    const specialist = opts.loadout.character !== 'ranger';
    const statRows = STATUS_ROWS.filter(([key]) => !specialist
      || (key !== 'projectileCount' && (opts.loadout.character !== 'lumen' || (key !== 'fireRate' && key !== 'projectileRange'))));
    const rows = statRows.map(([key, label, f]) =>
      el('tr', { 'data-stat': key }, [
        el('th', { text: opts.loadout.character === 'roan' && key === 'projectileRange' ? '베기 거리' : label }),
        el('td', { text: f(base[key]) }),
        el('td', { text: f(meta[key]) }),
        el('td', { class: 'final', 'data-testid': `stat-${key}`, text: f(final[key]) }),
      ]),
    );
    const grouped = new Map<UpgradePick['id'], UpgradePick[]>();
    for (const p of opts.picks) {
      const list = grouped.get(p.id);
      if (list) list.push(p);
      else grouped.set(p.id, [p]);
    }
    const preview = weaponPreview();
    const stackDetails = (list: UpgradePick[]) => {
      const grades = GRADES.map((grade) => {
        const count = list.filter((pick) => pick.grade === grade.id).length;
        return count ? el('span', { class: 'status-stack-grade', title: `${grade.name} ${count}회` }, [
          el('span', { class: 'gdot', style: `background:${grade.color}` }), String(count),
        ]) : null;
      });
      return [
        el('strong', { class: 'status-stack-count', text: `${list.length}스택` }),
        ...grades.filter((grade): grade is HTMLSpanElement => grade !== null),
      ];
    };
    const picks = [...grouped.entries()].filter(([id]) => !isFusionIngredient(opts.fusions, id)).map(([id, list]) => {
      const def = UPGRADE_BY_ID[id];
      const level = def.weapon && opts.loadout.character === 'lumen' ? opts.starterRank ?? list.length : list.length;
      const item = def.weapon ? preview.trigger(def.weapon, `${def.name} Lv ${level}`) : el('span', { text: def.name });
      const mastery = def.mastery;
      const cumulative = mastery ? list.reduce((sum, pick) => sum + characterUpgradeValue(mastery, pick.grade), 0) : 0;
      return el('li', { 'data-upgrade-id': id, class: mastery ? 'mastery-stack' : '' }, [
        item, ...stackDetails(list),
        ...(mastery ? [el('small', { class: 'mastery-total', text: CHARACTER_UPGRADES[mastery].text(cumulative) })] : []),
      ]);
    });
    if (opts.loadout.character === 'lumen' && !grouped.has(opts.loadout.weapon)) {
      const weapon = opts.loadout.weapon;
      picks.unshift(el('li', {}, [preview.trigger(weapon, `${WEAPONS[weapon].name} Lv ${opts.starterRank ?? 1}`)]));
    }
    picks.unshift(...opts.fusions.map((id) => el('li', {}, [preview.trigger(id, `${WEAPON_FUSIONS[id].name} Lv ${WEAPON_MAX_RANK}`, 'fusion-chip')])));
    const close = el('button', { class: 'primary', 'data-testid': 'status-close', 'data-autofocus': '' }, ['닫기 ', el('kbd', { text: 'Esc' })]);
    close.addEventListener('click', opts.onClose);
    const recipes = el('details', { class: 'fusion-recipes', ...(opts.recipesOpen ? { open: '' } : {}) }, [
          el('summary', { text: '특수 무기 합체 조합식' }),
          el('ul', {}, FUSION_IDS.map((id) => {
            const recipe = WEAPON_FUSIONS[id];
            const ingredients = recipe.pair.map((weapon) => {
              const list = grouped.get(weapon);
              const fused = opts.fusions.includes(id);
              const level = list?.length ?? (fused ? WEAPON_MAX_RANK : 0);
              const trigger = preview.trigger(weapon, `${WEAPONS[weapon].name} Lv ${level}`);
              return fused && list ? el('span', {}, [trigger, ...stackDetails(list)]) : trigger;
            });
            return el('li', {}, [preview.trigger(id, recipe.name), el('small', {}, [ingredients[0], ' + ', ingredients[1]])]);
          })),
          el('small', { class: 'muted', text: `두 재료가 모두 Lv ${WEAPON_MAX_RANK}이면 합체를 선택할 수 있습니다. 합체하면 재료 공격을 대체합니다.` }),
        ]);
    const statsTab = el('button', { type: 'button', role: 'tab', id: 'status-stats-tab', 'aria-controls': 'status-stats-pane', text: '능력치·강화' });
    const relicsTab = el('button', { type: 'button', role: 'tab', id: 'status-relics-tab', 'aria-controls': 'status-relics-pane', text: `보유 유물 ${opts.relics.length}개` });
    const statsPane = el('section', { class: 'status-pane', id: 'status-stats-pane', role: 'tabpanel', 'aria-labelledby': statsTab.id }, [
        ...(!specialist && opts.recipesOpen ? [recipes] : []),
        el('table', { class: 'stat-table' }, [
          el('thead', {}, [el('tr', {}, [el('th', { text: '능력치' }), el('th', { text: '시작' }), el('th', { text: '영구 강화' }), el('th', { text: '현재' })])]),
          el('tbody', {}, rows),
        ]),
        ...(opts.swordAngle ? [el('small', { class: 'muted', text: `검 타격 각도 ${opts.swordAngle}°` })] : []),
        el('h3', { text: '이번 판 강화 스택 (점 색 = 등급)' }),
        el('ul', { class: 'upgrades' }, picks.length ? picks : [el('li', { class: 'muted', text: '아직 없음' })]),
        ...(opts.echo ? [this.echoStatus(opts.echo.growth, opts.echo.luck, opts.fusions.includes('volley'))] : []),
        ...(!specialist && !opts.recipesOpen ? [recipes] : []),
        el('p', { class: 'muted', 'data-testid': 'status-extra', text: `새로고침 남은 횟수 ${opts.rerollsLeft} · 부활 ${opts.revivesLeft > 0 ? '가능' : '없음'}` }),
    ]);
    const relicName = el('strong');
    const relicEffect = el('p');
    const relicDetail = el('div', { id: 'status-relic-detail', class: 'status-relic-detail', 'aria-live': 'polite' }, [relicName, relicEffect]);
    const inspect = (id: RelicId) => {
      relicName.textContent = RELICS[id].name;
      relicEffect.textContent = relicDescription(id, opts.fusions);
    };
    const relicsPane = el('section', { class: 'status-pane', id: 'status-relics-pane', role: 'tabpanel', 'aria-labelledby': relicsTab.id },
      opts.relics.length ? [
        el('div', { class: 'relic-slots status-relic-scroll', 'data-testid': 'status-relics' }, relicInventory(opts.relics, 'status', { inspect })),
        relicDetail,
      ] : [el('p', { class: 'muted', text: '이번 판에 획득한 유물이 없습니다.' })]);
    if (opts.relics.length) inspect(opts.relics[0]);
    const select = (showRelics: boolean) => {
      statsTab.setAttribute('aria-selected', String(!showRelics));
      relicsTab.setAttribute('aria-selected', String(showRelics));
      statsPane.classList.toggle('hidden', showRelics);
      relicsPane.classList.toggle('hidden', !showRelics);
    };
    statsTab.addEventListener('click', () => select(false));
    relicsTab.addEventListener('click', () => select(true));
    select(opts.relicsOpen);
    this.mount('status', el('div', { class: 'panel status' }, [
        el('h2', { text: `${specialist ? CHARACTERS[opts.loadout.character].name : '상태'} · Lv ${opts.level}` }),
        el('p', { class: 'muted', text: '상태창을 보는 동안 전투 시간이 멈춥니다.' }),
        el('div', { class: 'status-tabs', role: 'tablist', 'aria-label': '상태창 분류' }, [statsTab, relicsTab]),
        statsPane,
        relicsPane,
        close,
        preview.tooltip,
    ]));
  }

  private echoStatus(growth: ReturnType<typeof echoGrowth>, luck: number, fused: boolean): HTMLElement {
    const { stages, maxStacks, luckPerPoint, damagePerStep, intervalPerStep, extraCloneDamage, cloneStages, shotStages, fusionShare } = ECHO_GROWTH;
    const fmt = (stacks: number) => Math.floor(stacks).toLocaleString('ko-KR');
    const share = fused ? fusionShare : 1;
    const growthPct = (value: number) => `${Number((value * 100).toFixed(1))}%`;
    const active = `피해 +${growthPct(growth.damageBonus * share)} · 발동 간격 −${growthPct(growth.intervalReduction * share)}`;
    const current = fused ? `잔영 관통포에 적용 · ${active}` : `탄 ${growth.shots}발/분신 · 분신 ${growth.clones}명 · ${active}`;
    return el('details', { class: 'fusion-recipes echo-growth', open: '', 'data-testid': 'echo-growth' }, [
      el('summary', { text: `메아리 처치 성장 · ${growth.stage}/${stages}단계 · ${fmt(growth.progress)} / ${fmt(maxStacks)}스택` }),
      el('p', { text: current }),
      el('small', { class: 'muted', text: [
        growth.nextAt === undefined ? '최대 성장' : `다음 단계 ${fmt(growth.nextAt)}스택`,
        `현재 처치당 +${(1 + Math.max(0, luck) * luckPerPoint).toFixed(2)}스택`,
        `단계마다 피해 +${growthPct(damagePerStep * share)}, 발동 간격 −${growthPct(intervalPerStep * share)}`,
      ].join(' · ') }),
      ...(!fused ? [el('p', { class: 'muted', text: `탄 +1발 ${shotStages.join('·')}단계 · 분신 +1명 ${cloneStages.join('·')}단계 · 추가 분신 피해 ${Math.round(extraCloneDamage * 100)}%부터 차등 적용` })] : []),
    ]);
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
      if (m.pctByLevel) return item(m.id, m.name, m.pctByLevel.map((v, i) => `Lv ${i + 1} +${Math.round(v * 100)}%`).join(' · '), m.maxLevel);
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

  showResult(result: RunResult, newRecords: NewRecord[], tokens: TokenReward | null, onRestart: () => void, onTitle: () => void): void {
    const win = result.outcome === 'victory';
    let cause: string;
    if (result.cause === 'boss') cause = `${josa(BOSS_CONFIG.name, '을/를')} 처치했습니다!`;
    else if (result.cause === 'death') cause = `${result.killedBy ?? '적의 공격'}에 쓰러졌습니다.`;
    else
      cause = `${formatTime(RUN_CONFIG.timeLimit)}까지 ${josa(BOSS_CONFIG.name, '을/를')} 처치하지 못했습니다${
        result.bossHpRatio !== null ? ` (보스 체력 ${Math.ceil(result.bossHpRatio * 100)}% 남음)` : ''
      }.`;

    const restart = el('button', { class: 'primary big', 'data-testid': 'restart', 'data-autofocus': '' }, [win ? '다음 판 ' : '다시 시작 ', el('kbd', { text: 'Enter' })]);
    restart.addEventListener('click', onRestart);
    const title = el('button', { 'data-testid': 'result-title', text: '타이틀로' });
    title.addEventListener('click', onTitle);

    const fusions = result.fusions ?? [];
    const upgrades = result.upgrades.filter((u) => !isFusionIngredient(fusions, u.id));
    const ups = upgrades.length
      ? upgrades.map((u) =>
          el('li', {}, [
            `${u.name} ×${u.stacks} `,
            ...u.grades.map((g) => el('span', { class: 'gdot', title: GRADES[GRADE_INDEX[g]].name, style: `background:${GRADES[GRADE_INDEX[g]].color}` })),
          ]),
        )
      : fusions.length ? [] : [el('li', { class: 'muted', text: '선택한 강화 없음' })];

    ups.unshift(...fusions.map((id) => el('li', { class: 'fusion-chip', text: `${WEAPON_FUSIONS[id].name} Lv ${WEAPON_MAX_RANK}` })));
    this.mount(
      'result',
      el('div', { class: `panel result ${win ? 'win' : 'lose'}` }, [
        el('h2', { class: 'outcome', 'data-testid': 'outcome', text: win ? '승리' : '패배' }),
        el('p', { class: 'cause', 'data-testid': 'cause', text: cause }),
        ...(result.loadout && result.loadout.character !== 'ranger' ? [el('p', {
          class: 'muted', text: CHARACTERS[result.loadout.character].name + (result.loadout.character === 'lumen' ? ` · ${WEAPONS[result.loadout.weapon].name}` : ''),
        })] : []),
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
              el('small', { class: 'muted', text: ` (생존 ${tokens.survival} · 처치 ${tokens.kills} · 엘리트 ${tokens.elites} · 승리 ${tokens.victory}${tokens.relics ? ` · 유물 ${tokens.relics}` : ''}) — 타이틀의 강화 상점에서 사용` }),
            ])
          : el('small', { class: 'muted', text: '개발 옵션 사용 판은 토큰을 받지 않습니다.' }),
        this.damageBreakdown(result),
        restart,
        el('div', { class: 'row buttons' }, [title]),
        el('small', { class: 'muted' }, [
          win ? 'Enter · Space · R 키로 다음 판 캐릭터 선택' : 'Enter · Space · R 키로 다시 시작',
          el('br'),
          `시드 ${result.seed}${result.assisted ? ' · 개발 옵션 사용 (기록 미반영)' : ''}`,
        ]),
      ]),
    );
  }

  private damageBreakdown(result: RunResult): HTMLElement {
    const totals = result.damageByAttack ?? {};
    const primary = result.loadout?.character === 'roan' ? 'sword' : result.loadout?.character === 'lumen' ? result.loadout.weapon : 'basic';
    const sources = new Set<AttackId>([primary, ...(Object.keys(totals) as AttackId[]), ...(result.fusions ?? [])]);
    for (const { id } of result.upgrades) {
      const weapon = UPGRADE_BY_ID[id].weapon;
      if (weapon && !isFusionIngredient(result.fusions ?? [], weapon)) sources.add(weapon);
    }
    const duration = result.combatTime ?? result.survivalTime;
    const rows = [...sources].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0)).map((source) => {
      const name = source === 'basic' ? '기본 사격' : source === 'sword' ? '검 베기' : source === 'bomb' ? '균열 폭탄' : source === 'relic' ? '유물 효과'
        : source in WEAPON_FUSIONS ? WEAPON_FUSIONS[source as FusionId].name : WEAPONS[source as keyof typeof WEAPONS].name;
      const damage = totals[source] ?? 0;
      const dps = duration > 0 ? damage / duration : 0;
      const hits = result.hitsByAttack?.[source] ?? 0;
      return el('tr', { 'data-attack': source }, [
        el('th', { scope: 'row', text: name }),
        el('td', { text: n1(damage) }),
        el('td', { text: result.hitsByAttack ? String(hits) : '–' }),
        el('td', { text: dps > 0 && dps < 0.1 ? '<0.1' : n1(dps) }),
      ]);
    });
    return el('details', { class: 'result-damage', open: '', 'data-testid': 'damage-breakdown' }, [
      el('summary', { text: '공격별 피해량 · DPS' }),
      el('small', { class: 'muted', text: '초과 피해를 포함한 총 피해량 ÷ 전체 전투 시간.' }),
      el('div', { class: 'result-damage-scroll' }, [
        el('table', { class: 'stat-table' }, [
          el('thead', {}, [el('tr', {}, [el('th', { text: '공격' }), el('th', { text: '총 피해량' }), el('th', { text: '적중 횟수' }), el('th', { text: '평균 DPS' })])]),
          el('tbody', {}, rows),
        ]),
      ]),
    ]);
  }

  cancelCarry(): void {
    this.root.querySelector<HTMLButtonElement>('[data-testid="carry-back"]')?.click();
  }

  showCarry(ids: RelicId[], onConfirm: (ids: RelicId[]) => void, onBack: () => void): void {
    const selected = new Set<RelicId>();
    const count = el('span', { class: 'muted', 'aria-live': 'polite', text: `0 / ${CARRY_LIMIT}` });
    const start = el('button', { class: 'primary', type: 'button', 'data-testid': 'carry-confirm', text: '유물 없이 시작' });
    start.addEventListener('click', () => onConfirm([...selected]));
    const back = el('button', { type: 'button', 'data-testid': 'carry-back', text: '돌아가기' });
    back.addEventListener('click', onBack);
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
        start.textContent = selected.size ? `유물 ${selected.size}개로 시작` : '유물 없이 시작';
      });
      return button;
    });
    (buttons[0] ?? back).setAttribute('data-autofocus', '');
    this.mount('carry', el('div', { class: 'panel carry', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'carry-title' }, [
      el('h2', { id: 'carry-title', text: '다음 판에 가져갈 유물' }),
      el('p', { class: 'muted', text: ids.length ? `유물을 최대 ${CARRY_LIMIT}개 고르세요.` : '선택한 캐릭터로 가져갈 수 있는 유물이 없습니다.' }),
      ...(ids.length ? [count, el('div', { class: 'carry-grid' }, buttons)] : []),
      el('div', { class: 'row buttons' }, [back, start]),
    ]));
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
  ['luck', '행운', n1],
  ['projectileRange', '기본탄 사거리', n1],
];
