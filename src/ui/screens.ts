import { DIFFICULTY, DIFFICULTY_IDS, type DifficultyId } from '../config/enemies';
import { CHARACTERS, CHARACTER_MAX_HP, CHARACTER_UPGRADES, LUMEN_WEAPONS, characterUpgradeValue, type CharacterId, type CharacterUpgradeId, type Loadout, type LumenWeapon } from '../config/characters';
import { ROAN_GEAR_LEVELS, ROAN_UPGRADES, ROAN_WEAPONS, type RoanUpgradeId, type RoanWeaponId } from '../config/roan';
import chainPreview from '../assets/weapon-previews/chain.webp';
import turretPreview from '../assets/weapon-previews/turret.webp';
import titleArt from '../assets/title-art.webp';
import { ECHO_GROWTH, FUSION_ARMOR_PIERCE, FUSION_IDS, WEAPON_FUSIONS, WEAPONS, WEAPON_MAX_RANK, isFusionIngredient, type echoGrowth, type FusionId, WEAPON_DAMAGE_PER_RANK, WEAPON_RANK_EFFECTS, WEAPON_GRADE_DAMAGE, weaponRankEffect } from '../config/weapons';
import { CARRY_LIMIT, ESSENCES, ESSENCE_MAX_STACK, RELICS, relicDescription, type EssenceId, type RelicId } from '../config/relics';
import { COMPACT_RELIC_LIMIT, relicInventory } from './relics';
import { WEAPON_PREVIEWS, weaponPreview } from './weaponPreview';
import { relicArt, shopSprite } from './art';
import { CHARACTER_SHEETS, roanTexture, WEAPON_TEXTURES } from '../render/textures';
import { BOSS_CONFIG } from '../config/boss';
import { RUN_CONFIG } from '../config/run';
import { GRADES, GRADE_INDEX } from '../config/grades';
import type { PlayerStats } from '../config/player';
import { CATEGORY_LABEL } from '../config/upgrades';
import type { TokenReward } from '../core/meta';
import { buildShop, type ShopTab } from './shop';
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
  /** 계정 저장을 쓸 때만 있음 */
  onAccount?: () => void;
  onDifficulty?: (d: DifficultyId) => void;
  onVolume: (v: number) => void;
  onDevChange?: (s: DevPanelState) => void;
}

export interface AccountHandlers {
  onRegister: (username: string, password: string) => void;
  onLogin: (username: string, password: string) => void;
  onLogout: () => void;
  onClose: () => void;
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
  current: 'none' | 'title' | 'account' | 'pause' | 'levelup' | 'result' | 'carry' | 'characters' | 'lumen-weapon' | 'status' | 'shop' = 'none';

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
    if (name !== 'shop') panel.classList.add('ui-panel', 'ui-frame');
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

  showTitle(records: SaveRecords, meta: SaveMeta, volume: number, h: TitleHandlers, dev: DevPanelState | null, account?: { username: string | null }, difficulty: DifficultyId = 'normal'): void {
    const play = el('button', { class: 'primary big', 'data-testid': 'play', 'data-autofocus': '' }, ['플레이 ', el('kbd', { text: 'Enter' })]);
    play.addEventListener('click', h.onPlay);
    const shop = el('button', { class: 'shop-btn', 'data-testid': 'open-shop', text: '강화 상점' });
    shop.addEventListener('click', h.onShop);

    const rec = el('dl', { class: 'records ui-metrics', 'data-testid': 'records', 'aria-label': `최고 기록 · ${DIFFICULTY[difficulty].name}` }, [
      metric('기록 난이도', DIFFICULTY[difficulty].name, 'records-difficulty'),
      metric('최장 생존', records.bestSurvival > 0 ? formatTime(records.bestSurvival) : '-', 'best-survival'),
      metric('최다 처치', records.bestKills > 0 ? String(records.bestKills) : '-', 'best-kills'),
      metric('최단 승리', records.fastestWin !== null ? formatTime(records.fastestWin) : '-', 'fastest-win'),
      metric('승리 / 플레이', `${records.wins} / ${records.runs}`, 'runs'),
    ]);

    const controls = el('div', { class: 'controls' }, [
      el('h3', { text: '조작' }),
      el('ul', {}, [
        el('li', {}, [el('kbd', { text: 'W A S D' }), ' 이동']),
        el('li', {}, [el('kbd', { text: 'Space' }), ' 회피 (잠깐 무적)']),
        el('li', {}, [el('kbd', { text: 'Tab' }), ' 상태창 (능력치 확인)']),
        el('li', {}, [el('kbd', { text: 'Esc' }), ' 일시정지']),
      ]),
      el('p', { class: 'muted', text: '가까운 적을 자동으로 조준해 공격합니다.' }),
    ]);

    this.mount('title', el('div', { class: 'panel title' }, [
      el('div', { class: 'title-layout ui-scroll' }, [
        el('section', { class: 'title-menu' }, [
          el('h1', { class: 'logo' }, ['균열 ', el('span', { text: '아레나' })]),
          el('p', { class: 'tagline', text: `몰려드는 괴물을 쓰러뜨리고 ${josa(BOSS_CONFIG.name, '을/를')} 처치하세요. ${formatTime(RUN_CONFIG.timeLimit)}부터는 강화 돌격수가 몰려옵니다.` }),
          el('div', { class: 'title-actions' }, [play, shop, el('span', { class: 'title-tokens token ui-frame', 'data-testid': 'title-tokens', 'aria-label': `보유 토큰 ${meta.tokens}` }, [shopSprite(19, '◆'), ` ${meta.tokens}`])]),
          ...(h.onDifficulty ? [this.difficultyToggle(difficulty, h.onDifficulty)] : []),
          ...(account && h.onAccount ? [this.accountLine(account.username, h.onAccount)] : []),
          controls,
          this.volumeControl(volume, h.onVolume),
          ...(dev ? [this.devPanel(dev, h.onDevChange)] : []),
        ]),
        el('div', { class: 'title-showcase' }, [el('img', { class: 'title-art', src: titleArt, alt: '' }), rec]),
      ]),
    ]));
  }

  private difficultyToggle(current: DifficultyId, onChange: (d: DifficultyId) => void): HTMLElement {
    const buttons = DIFFICULTY_IDS.map((id) => {
      const b = el('button', { class: `difficulty-btn${id === current ? ' selected' : ''}`, 'data-testid': `difficulty-${id}`, 'aria-pressed': String(id === current), text: DIFFICULTY[id].name });
      b.addEventListener('click', () => { if (id !== current) onChange(id); });
      return b;
    });
    return el('div', { class: 'difficulty-toggle', role: 'group', 'aria-label': '난이도', 'data-testid': 'difficulty-toggle' }, [
      el('span', { class: 'muted', text: '난이도' }), ...buttons,
      el('small', { class: 'muted', text: current === 'normal' ? '토큰 ×0.7' : '몬스터 체력·공격 대폭 강화' }),
    ]);
  }

  private accountLine(username: string | null, onAccount: () => void): HTMLElement {
    const btn = el('button', { class: 'small', 'data-testid': 'open-account', text: username ? '계정 관리' : '회원가입 · 로그인' });
    btn.addEventListener('click', onAccount);
    return el('p', { class: 'account-line', 'data-testid': 'account-line' }, [
      el('span', { text: username ? `계정 ${username} · 모든 브라우저에서 이어서 플레이` : '게스트 · 이 브라우저에만 저장됩니다' }),
      ' ', btn,
    ]);
  }

  /** 아이디 계정: 회원가입·로그인(게스트) 또는 로그아웃(로그인 상태) */
  showAccount(state: { username: string | null; message?: string; busy?: boolean; draft?: string }, h: AccountHandlers): void {
    const message = el('p', { class: 'account-message', 'data-testid': 'account-message', role: 'status', text: state.message ?? '' });
    const back = el('button', { 'data-testid': 'account-close', text: '닫기' });
    back.addEventListener('click', h.onClose);
    if (state.username) {
      const logout = el('button', { 'data-testid': 'account-logout', text: '로그아웃' });
      logout.addEventListener('click', h.onLogout);
      if (state.busy) logout.setAttribute('disabled', '');
      this.mount('account', el('div', { class: 'panel account', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'account-title' }, [
        el('h2', { id: 'account-title', text: `계정 · ${state.username}` }),
        el('p', { class: 'muted', text: '다른 브라우저에서 같은 아이디로 로그인하면 상점 강화 내역과 기록을 이어서 씁니다. 로그아웃하면 이 브라우저는 새 게스트로 시작합니다.' }),
        message,
        el('div', { class: 'row buttons' }, [logout, back]),
      ]));
      return;
    }
    const user = el('input', { type: 'text', 'data-testid': 'account-username', autocomplete: 'username', maxlength: '16', placeholder: '아이디 (영문 소문자·숫자·_ 3~16자)', 'data-autofocus': '' });
    user.value = state.draft ?? '';
    const pass = el('input', { type: 'password', 'data-testid': 'account-password', autocomplete: 'current-password', placeholder: '비밀번호 (6자 이상)' });
    const register = el('button', { class: 'primary', 'data-testid': 'account-register', text: '회원가입' });
    const login = el('button', { 'data-testid': 'account-login', text: '로그인' });
    register.addEventListener('click', () => h.onRegister(user.value.trim().toLowerCase(), pass.value));
    login.addEventListener('click', () => h.onLogin(user.value.trim().toLowerCase(), pass.value));
    if (state.busy) for (const b of [register, login]) b.setAttribute('disabled', '');
    this.mount('account', el('div', { class: 'panel account', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'account-title' }, [
      el('h2', { id: 'account-title', text: '회원가입 · 로그인' }),
      el('p', { class: 'muted', text: '이메일 없이 아이디와 비밀번호만 씁니다. 회원가입하면 지금 진행 상황이 계정에 저장되고, 다른 브라우저에서 로그인하면 계정 데이터로 바뀝니다.' }),
      el('div', { class: 'account-form' }, [user, pass]),
      message,
      el('div', { class: 'row buttons' }, [register, login, back]),
    ]));
  }

  showCharacters(onChoose: (id: CharacterId) => void, onBack: () => void): void {
    const entries: Loadout[] = [{ character: 'ranger' }, { character: 'lumen', weapon: 'chain' }, { character: 'roan' }];
    const cards = entries.map((loadout) => {
      const id = loadout.character;
      const info = CHARACTERS[id];
      const signature = id === 'ranger' ? '기본 공격 · 자동 사격' : id === 'lumen' ? '시작 무기 · 연쇄 번개 / 서리 포탑' : `근접 무기 선택 · Lv ${ROAN_GEAR_LEVELS.weapon}`;
      return this.characterCard({
        title: info.name, description: info.description, signature, testId: `character-${id}`,
        onClick: () => onChoose(id), focus: id === 'ranger', color: id === 'lumen' ? '#ffda79' : info.color,
        art: [shopSprite(id === 'ranger' ? 20 : id === 'lumen' ? 21 : 22)], extra: `시작 체력 ${CHARACTER_MAX_HP[id]}`,
      });
    });
    this.showCharacterCards('characters', '캐릭터 선택', cards, onBack);
  }

  showLumenWeapons(onChoose: (id: LumenWeapon) => void, onBack: () => void): void {
    const cards = LUMEN_WEAPONS.map((weapon, index) =>
      this.characterCard({
        title: WEAPONS[weapon].name,
        description: weapon === 'chain' ? '가까운 적에서 시작해 먼 적으로 번개를 튕깁니다. 이미 맞힌 적에게 돌아오면 피해가 줄어듭니다.'
          : '포탑을 설치해 적을 둔화시킵니다. 설치 대수와 포격 효과를 키웁니다.',
        signature: weapon === 'chain' ? '전용 강화 · 연쇄 횟수 · 되튐 피해' : '전용 강화 · 설치 대수 · 관통',
        testId: `lumen-${weapon}`, onClick: () => onChoose(weapon), focus: index === 0,
        art: [el('img', { class: 'character-attack sample', src: weapon === 'chain' ? chainPreview : turretPreview, alt: '' }),
          el('img', { class: 'weapon-icon', src: WEAPON_TEXTURES[weapon], alt: '' })],
        color: weapon === 'chain' ? '#75d9ff' : '#ffda79',
      }));
    this.showCharacterCards('lumen-weapon', '루멘의 시작 무기', cards, onBack);
  }

  private characterCard({ title, description, signature, testId, onClick, focus, art, color, extra }: {
    title: string; description: string; signature: string; testId: string; color: string;
    onClick: () => void; focus: boolean; art: HTMLElement[]; extra?: string;
  }): HTMLButtonElement {
    const card = el('button', { class: 'character-card', type: 'button', 'data-testid': testId, ...(focus ? { 'data-autofocus': '' } : {}) }, [
      el('span', { class: 'character-preview', 'aria-hidden': 'true' }, art),
      el('strong', { text: title }),
      el('span', { class: 'muted', text: description }),
      el('span', { class: 'character-signature', text: signature }),
      ...(extra ? [el('span', { class: 'character-extra', text: extra })] : []),
    ]);
    card.style.setProperty('--character-color', color);
    card.addEventListener('click', onClick);
    return card;
  }

  private showCharacterCards(screen: 'characters' | 'lumen-weapon', title: string, cards: HTMLButtonElement[], onBack: () => void): void {
    const back = el('button', { class: 'character-back', type: 'button', 'data-testid': 'character-back' }, ['돌아가기 ', el('kbd', { text: 'Esc' })]);
    back.addEventListener('click', onBack);
    this.mount(screen, el('div', { class: `panel character-select ${screen}`, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'character-heading' }, [
      el('header', { class: 'ui-heading' }, [el('h2', { id: 'character-heading', text: title }), ...(screen === 'lumen-weapon' ? [shopSprite(21)] : [])]),
      el('div', { class: 'character-cards ui-scroll' }, cards),
      el('footer', { class: 'ui-actions' }, [back, el('small', { class: 'muted' }, [el('kbd', { text: 'Enter' }), ' 선택'])]),
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
        el('header', {}, [el('h2', { text: '일시정지' }),
          el('p', { class: 'muted', text: reason === 'hidden' ? '탭이 숨겨져 자동으로 멈췄습니다. 전투 시간과 적 생성도 멈춰 있습니다.' : '전투 시간과 적 생성이 멈춰 있습니다.' })]),
        el('div', { class: 'pause-content ui-scroll' }, [resume, status, this.volumeControl(volume, h.onVolume),
          ...(relics.length ? [
            el('h3', { text: '보유 유물' }),
            el('div', { class: 'relic-slots' }, relicInventory(relics.slice(-COMPACT_RELIC_LIMIT), 'pause', { fusions })),
            ...(relics.length > COMPACT_RELIC_LIMIT ? [el('small', { class: 'muted', text: `전체 유물 ${relics.length}개 · 상태 보기에서 확인` })] : []),
          ] : [])]),
        el('footer', { class: 'pause-footer' }, [el('div', { class: 'row buttons' }, [restart, title]),
          el('small', { class: 'muted', text: '처음부터 다시 / 타이틀로 이동하면 이번 판은 기록되지 않습니다.' })]),
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
    lumenMasteryDamageBonus: (extraPoints: number) => number;
    fusions: Iterable<FusionId>;
    bonusChoices: number;
    notice?: string | null;
    essences?: Readonly<Record<EssenceId, number>>;
    onChoose: (i: number) => void;
    onReroll: () => void;
  }): void {
    const coin = opts.choices[0]?.kind === 'coin';
    const reward = opts.choices.some((c) => c.kind === 'relic' || c.kind === 'essence') || coin;
    const first = opts.choices[0];
    const gearStage = first?.kind === 'roanGear' ? first.gear.stage : null;
    const formChoice = gearStage !== null;
    const cards = opts.choices.map((c, i) => {
      const grade = c.kind === 'upgrade' ? GRADES[GRADE_INDEX[c.grade]] : null;
      const btn = el('button', {
        class: `card ${c.kind === 'upgrade' ? c.def.category : c.kind === 'relic' ? 'relic-card' : c.kind === 'fusion' ? 'fusion-card' : c.kind === 'coin' ? 'relic-card coin-card' : c.kind === 'essence' ? 'relic-card essence-card' : c.kind === 'roanGear' ? 'sword-form-card' : 'fallback'}${grade ? ` grade-${grade.id}` : ''}`,
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
            class: 'mastery-bonus', text: `선택 후 시작 무기 피해 보너스 +${Math.round(opts.lumenMasteryDamageBonus(gain) * 1000) / 10}%`,
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
      } else if (c.kind === 'roanGear') {
        const { gear } = c;
        btn.dataset.swordForm = gear.id;
        btn.dataset.gearStage = gear.stage;
        const sprite = el('span', { class: 'gear-sprite', 'aria-hidden': 'true' });
        sprite.style.backgroundImage = `url("${CHARACTER_SHEETS[roanTexture(gear.id)]}")`;
        btn.append(sprite);
        if (gear.stage === 'weapon') {
          const w = ROAN_WEAPONS[gear.id];
          btn.style.setProperty('--form-color', `#${w.color.toString(16)}`);
          btn.append(
            el('span', { class: 'cat', text: '무기' }),
            el('span', { class: 'sword-form-symbol', 'aria-hidden': 'true', text: w.symbol }),
            el('strong', { class: 'name', text: w.name }),
            el('span', { class: 'desc', text: w.description }),
            el('small', { class: 'mastery-bonus', text: w.special }),
          );
        } else {
          const u = ROAN_UPGRADES[gear.id];
          btn.style.setProperty('--form-color', `#${ROAN_WEAPONS[u.weapon].color.toString(16)}`);
          btn.append(
            el('span', { class: 'cat', text: gear.stage === 'upgrade' ? '상위 무기' : '무기 각성' }),
            el('span', { class: 'sword-form-symbol', 'aria-hidden': 'true', text: u.symbol }),
            el('strong', { class: 'name', text: gear.stage === 'upgrade' ? u.name : `${u.name} 각성` }),
            el('span', { class: 'desc', text: gear.stage === 'upgrade' ? u.effect : u.awaken }),
            ...(gear.stage === 'upgrade' ? [el('small', { class: 'mastery-bonus', text: `${ROAN_GEAR_LEVELS.awaken}레벨 각성: ${u.awaken}` })] : []),
          );
        }
      } else if (c.kind === 'relic') {
        const relic = RELICS[c.id];
        btn.append(
          relicArt(c.id),
          el('strong', { class: 'name', text: relic.name }),
          el('span', { class: 'desc', text: relicDescription(c.id, opts.fusions) }),
        );
      } else if (c.kind === 'essence') {
        const essence = ESSENCES[c.id];
        const stacks = opts.essences?.[c.id] ?? 0;
        btn.append(
          el('span', { class: 'relic-symbol', 'aria-hidden': 'true', text: essence.symbol }),
          el('strong', { class: 'name', text: essence.name }),
          el('span', { class: 'desc', text: essence.effect }),
          el('span', { class: 'stack', text: `대체 보상 · ${stacks} → ${stacks + 1} / 최대 ${ESSENCE_MAX_STACK}중첩 · 다음 판 계승 불가` }),
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
      const graphic = btn.querySelector<HTMLElement>('.weapon-icon, .gear-sprite, .relic-art, .relic-symbol')
        ?? (c.kind === 'fusion' ? el('img', { class: 'fusion-art', src: WEAPON_PREVIEWS[c.id], alt: '' })
          : shopSprite(c.kind === 'upgrade' ? ({ attack: 1, survival: 2, mobility: 4 }[c.def.category]) : 4));
      btn.prepend(el('span', { class: 'choice-art ui-frame', 'aria-hidden': 'true' }, [graphic]));
      btn.append(el('kbd', { class: 'key', text: String(i + 1) }));
      btn.addEventListener('click', () => opts.onChoose(i));
      return btn;
    });
    const reroll = el('button', { class: 'reroll', 'data-testid': 'reroll' }, [`새로고침 (남은 ${opts.rerollsLeft}회) `, el('kbd', { text: 'R' })]);
    if (opts.rerollsLeft <= 0) reroll.setAttribute('disabled', '');
    reroll.addEventListener('click', opts.onReroll);
    this.mount(
      'levelup',
      el('div', { class: `panel levelup${reward ? ' levelup-reward' : ''}` }, [
        el('header', {}, [el('h2', { text: opts.title }),
          ...(opts.notice ? [el('p', { class: 'coin-notice', 'data-testid': 'coin-notice', text: opts.notice })] : []),
          el('p', { class: 'muted', text: gearStage === 'weapon' ? `무기 하나를 고르세요 (클릭 또는 1~${opts.choices.length}). 이번 판 동안 이 무기로 싸우고, 무기마다 체력·속도·회피가 다릅니다.` : gearStage === 'upgrade' ? `상위 무기를 고르세요 (클릭 또는 1~${opts.choices.length}). 이 상위 무기의 전용 강화와 유물이 나옵니다.` : gearStage === 'awaken' ? '고른 상위 무기를 각성합니다 (클릭 또는 1).' : coin ? '균열 수호자 유물을 걸고 동전을 던질지 고르세요 (클릭 또는 1·2)' : opts.bonusChoices ? `보너스 강화 하나를 선택하세요 · 남은 선택 ${opts.bonusChoices}회` : opts.armory ? (opts.specialist ? '전용 강화를 하나 선택하세요' : '특수 무기 하나를 획득·강화하거나 준비된 합체를 선택하세요') : reward ? '유물 하나를 선택하세요 (클릭 또는 1·2·3)' : `강화 하나를 선택하세요 (클릭 또는 1·2·3)${opts.pending > 1 ? ` · 남은 선택 ${opts.pending}` : ''}` })]),
        el('div', { class: 'choices-scroll ui-scroll' }, [el('div', { class: cards.length > 3 ? 'cards many' : 'cards', style: `--choice-count: ${cards.length}` }, cards)]),
        el('footer', {}, formChoice || reward || opts.armory || opts.bonusChoices ? [] : [reroll]),
      ]),
    );
  }

  /** 상태창: 능력치(시작 → 영구 강화 → 최종)와 이번 판 강화 */
  showStatus(opts: {
    level: number;
    loadout: Loadout;
    starterRank?: number;
    roan?: { weapon: RoanWeaponId | null; upgrade: RoanUpgradeId | null; awakened: boolean; angle: number; range: number; lineWidth?: number };
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
        el('th', { text: opts.loadout.character === 'roan' && key === 'projectileRange'
          ? (opts.roan?.lineWidth === undefined ? '베기 거리' : '찌르기 거리') : label }),
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
        ...(def.weapon ? [el('span', { class: 'preview-hint', 'aria-hidden': 'true', text: '미리보기' })] : []),
        ...(mastery ? [el('small', { class: 'mastery-total', text: CHARACTER_UPGRADES[mastery].text(cumulative) })] : []),
      ]);
    });
    if (opts.loadout.character === 'lumen' && !grouped.has(opts.loadout.weapon)) {
      const weapon = opts.loadout.weapon;
      picks.unshift(el('li', {}, [preview.trigger(weapon, `${WEAPONS[weapon].name} Lv ${opts.starterRank ?? 1}`),
        el('span', { class: 'preview-hint', 'aria-hidden': 'true', text: '미리보기' })]));
    }
    picks.unshift(...opts.fusions.map((id) => el('li', {}, [preview.trigger(id, `${WEAPON_FUSIONS[id].name} Lv ${WEAPON_MAX_RANK}`, 'fusion-chip'),
      el('span', { class: 'preview-hint', 'aria-hidden': 'true', text: '미리보기' })])));
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
      el('div', { class: 'status-stats ui-frame' }, [el('h3', { text: '능력치' }), el('table', { class: 'stat-table' }, [
          el('thead', {}, [el('tr', {}, [el('th', { text: '능력치' }), el('th', { text: '시작' }), el('th', { text: '영구 강화' }), el('th', { text: '현재' })])]),
          el('tbody', {}, rows),
      ])]),
      el('div', { class: 'status-build ui-frame' }, [
        ...(!specialist && opts.recipesOpen ? [recipes] : []),
        ...(opts.roan ? [this.roanStatus(opts.roan)] : []),
        el('h3', { text: '이번 판 강화 스택 (점 색 = 등급)' }),
        el('ul', { class: 'upgrades' }, picks.length ? picks : [el('li', { class: 'muted', text: '아직 없음' })]),
        ...(opts.echo ? [this.echoStatus(opts.echo.growth, opts.echo.luck, opts.fusions.includes('volley'))] : []),
        ...(!specialist && !opts.recipesOpen ? [recipes] : []),
      ]),
    ]);
    const relicName = el('strong');
    const relicEffect = el('p');
    const art = el('span', { class: 'status-relic-art ui-frame', 'aria-hidden': 'true' });
    const relicDetail = el('div', { id: 'status-relic-detail', class: 'status-relic-detail ui-frame', 'aria-live': 'polite' }, [
      el('div', { class: 'relic-detail-heading' }, [art, relicName]), relicEffect,
    ]);
    const relicSlots = el('div', { class: 'relic-slots status-relic-scroll', 'data-testid': 'status-relics' });
    let inspected: RelicId | undefined;
    const inspect = (id: RelicId) => {
      if (id === inspected) return;
      inspected = id;
      art.replaceChildren(relicArt(id));
      relicName.textContent = RELICS[id].name;
      relicEffect.textContent = relicDescription(id, opts.fusions);
      for (const button of relicSlots.querySelectorAll<HTMLButtonElement>('[data-relic]')) {
        button.setAttribute('aria-pressed', String(button.dataset.relic === id));
      }
    };
    relicSlots.append(...relicInventory(opts.relics, 'status', { inspect }));
    const relicsPane = el('section', { class: 'status-pane', id: 'status-relics-pane', role: 'tabpanel', 'aria-labelledby': relicsTab.id },
      opts.relics.length ? [
        el('div', { class: 'status-relic-inventory ui-frame' }, [el('h3', { text: '보유 유물' }), relicSlots]),
        relicDetail,
      ] : [el('p', { class: 'muted', text: '이번 판에 획득한 유물이 없습니다.' })]);
    if (opts.relics.length) inspect(opts.relics[0]);
    const content = el('div', { class: 'status-content ui-scroll' }, [statsPane, relicsPane]);
    const select = (showRelics: boolean) => {
      statsTab.setAttribute('aria-selected', String(!showRelics));
      relicsTab.setAttribute('aria-selected', String(showRelics));
      statsPane.classList.toggle('hidden', showRelics);
      relicsPane.classList.toggle('hidden', !showRelics);
      content.scrollTop = 0;
    };
    statsTab.addEventListener('click', () => select(false));
    relicsTab.addEventListener('click', () => select(true));
    select(opts.relicsOpen);
    this.mount('status', el('div', { class: 'panel status', role: 'dialog', 'aria-label': '상태창', 'aria-modal': 'true' }, [
        el('header', { class: 'ui-heading' }, [el('h2', { text: '상태창' }),
          el('span', { class: 'ui-context', text: `${CHARACTERS[opts.loadout.character].name} · Lv ${opts.level}` })]),
        el('div', { class: 'status-tabs', role: 'tablist', 'aria-label': '상태창 분류' }, [statsTab, relicsTab]),
        content,
        el('footer', { class: 'ui-actions' }, [close,
          el('span', { class: 'muted', 'data-testid': 'status-extra', text: `새로고침 남은 횟수 ${opts.rerollsLeft} · 부활 ${opts.revivesLeft > 0 ? '가능' : '없음'}` })]),
        preview.tooltip,
    ]));
  }

  private roanStatus(roan: NonNullable<Parameters<Screens['showStatus']>[0]['roan']>): HTMLElement {
    const items: string[] = [];
    if (roan.weapon) items.push(`무기 · ${ROAN_WEAPONS[roan.weapon].name}: ${ROAN_WEAPONS[roan.weapon].special}`);
    if (roan.upgrade) items.push(`상위 무기 · ${ROAN_UPGRADES[roan.upgrade].name}${roan.awakened ? ' (각성)' : ''}: ${ROAN_UPGRADES[roan.upgrade].effect}`);
    const shape = roan.lineWidth === undefined ? `각도 ${Math.round(roan.angle)}°` : `직선 찌르기 · 폭 ${roan.lineWidth}px`;
    items.push(`${shape} · 거리 ${Math.round(roan.range)}px`);
    return el('section', { class: 'sword-forms', 'data-testid': 'sword-forms' }, [
      el('h3', { text: '로안 무기' }),
      roan.weapon ? el('ul', {}, items.map((text) => el('li', { text })))
        : el('p', { class: 'muted', text: `기본 베기 · Lv ${ROAN_GEAR_LEVELS.weapon}에 무기 선택` }),
    ]);
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

  showShop(meta: SaveMeta, tab: ShopTab, onSelect: (tab: ShopTab) => void,
    onBuy: (id: string) => void, onBack: () => void, focusItem?: string): void {
    const scrollTop = focusItem ? this.root.querySelector('.shop-content')?.scrollTop : undefined;
    const panel = buildShop(meta, tab, onSelect, onBuy, onBack, focusItem);
    this.mount('shop', panel);
    if (scrollTop !== undefined) panel.querySelector('.shop-content')!.scrollTop = scrollTop;
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
        el('header', { class: 'result-heading' }, [
          el('div', { class: 'ui-heading' }, [el('h2', { class: 'outcome', 'data-testid': 'outcome', text: win ? '승리' : '패배' }),
            el('p', { class: 'cause ui-context', 'data-testid': 'cause', text: cause })]),
          ...(result.loadout ? [el('p', {
            class: 'muted', text: CHARACTERS[result.loadout.character].name + (result.loadout.character === 'lumen' ? ` · ${WEAPONS[result.loadout.weapon].name}` : '') + ` · ${DIFFICULTY[result.difficulty ?? 'hard'].name}`,
          })] : []),
        ]),
        el('div', { class: 'result-scroll ui-scroll' }, [
          el('dl', { class: 'stats ui-metrics' }, [
            metric('생존 시간', formatTime(result.survivalTime), 'result-time'),
            metric('처치 수', String(result.kills), 'result-kills'),
            metric('도달 레벨', String(result.level)),
            ...(tokens ? [metric('획득 토큰', String(tokens.total), undefined, true)] : []),
          ]),
          ...(newRecords.length ? [el('div', { class: 'badges' }, newRecords.map((r) => el('span', { class: 'badge', text: NEW_RECORD_LABEL[r] })))] : []),
          el('div', { class: 'result-report' }, [this.damageBreakdown(result),
            el('section', { class: 'result-build ui-frame' }, [el('h3', { text: '이번 판 강화' }),
              el('ul', { class: 'upgrades', 'data-testid': 'result-upgrades' }, ups),
              tokens ? el('div', { class: 'tokens', 'data-testid': 'result-tokens' }, [
                el('strong', { class: 'token' }, [shopSprite(19), `획득 토큰 ◆ ${tokens.total}`]),
                el('small', { class: 'muted', text: `생존 ${tokens.survival} · 처치 ${tokens.kills} · 엘리트 ${tokens.elites} · 승리 ${tokens.victory}${tokens.relics ? ` · 유물 ${tokens.relics}` : ''}${tokens.difficulty ? ` · 난이도 ${tokens.difficulty}` : ''}` }),
              ]) : el('small', { class: 'muted', text: '개발 옵션 사용 판은 토큰을 받지 않습니다.' }),
            ]),
          ]),
        ]),
        el('footer', { class: 'ui-actions' }, [title,
          el('small', { class: 'muted', text: `시드 ${result.seed}${result.assisted ? ' · 개발 옵션 사용 (기록 미반영)' : ''}` }), restart]),
      ]),
    );
  }

  private damageBreakdown(result: RunResult): HTMLElement {
    const totals = result.damageByAttack ?? {};
    const primary = result.loadout?.character === 'roan' ? 'sword' : result.loadout?.character === 'lumen' ? result.loadout.weapon : 'basic';
    const sources = new Set<AttackId>([primary, ...(Object.keys(totals) as AttackId[]), ...(result.fusions ?? [])]);
    for (const { id } of result.upgrades) {
      const weapon = UPGRADE_BY_ID[id]?.weapon;
      if (weapon && !isFusionIngredient(result.fusions ?? [], weapon)) sources.add(weapon);
    }
    const duration = result.combatTime ?? result.survivalTime;
    const rows = [...sources].sort((a, b) => (totals[b] ?? 0) - (totals[a] ?? 0)).map((source) => {
      const name = attackName(source);
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
    return el('details', { class: 'result-damage ui-frame', open: '', 'data-testid': 'damage-breakdown' }, [
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
        el('span', { class: 'carry-art ui-frame' }, [relicArt(id)]),
        el('span', { class: 'carry-copy' }, [el('strong', { text: relic.name }), el('small', { text: relicDescription(id) })]),
        el('span', { class: 'carry-check', 'aria-hidden': 'true' }),
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
      el('header', {}, [el('div', { class: 'ui-heading' }, [el('h2', { id: 'carry-title', text: '다음 판에 가져갈 유물' }),
        ...(ids.length ? [el('span', { class: 'ui-context' }, ['선택 ', count])] : [])]),
        el('p', { class: 'muted', text: ids.length ? `유물을 최대 ${CARRY_LIMIT}개 고르세요.` : '선택한 캐릭터로 가져갈 수 있는 유물이 없습니다.' })]),
      el('div', { class: 'ui-scroll' }, [el('div', { class: 'carry-grid' }, buttons)]),
      el('footer', { class: 'ui-actions' }, [back, start]),
    ]));
  }

}

function metric(label: string, value: string, testId?: string, token = false): HTMLElement {
  return el('div', { class: 'ui-frame' }, [el('dt', { text: label }), el('dd', {
    text: value, ...(testId ? { 'data-testid': testId } : {}), ...(token ? { class: 'token' } : {}),
  })]);
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

/** 결과 화면의 공격 이름. 이름이 없는 공격이 생겨도 결과 화면이 멈추지 않게 id 를 그대로 보여 준다. */
function attackName(source: AttackId): string {
  const fixed: Partial<Record<AttackId, string>> = { basic: '기본 사격', sword: '검 베기', bleed: '출혈', bomb: '균열 폭탄', relic: '유물 효과' };
  if (fixed[source]) return fixed[source];
  if (Object.hasOwn(WEAPON_FUSIONS, source)) return WEAPON_FUSIONS[source as FusionId].name;
  if (Object.hasOwn(WEAPONS, source)) return WEAPONS[source as keyof typeof WEAPONS].name;
  return String(source);
}
