import type { CatalogId } from '../core/catalog';
import { el } from './dom';

interface MotionDemo {
  file: string;
  setup: string;
  before: string;
  after: string;
}

const demos: Partial<Record<CatalogId, MotionDemo>> = {
  'upgrade:split': { file: 'split', setup: '균열 사수 · 일반 강화 1회', before: '탄환 1발', after: '탄환 2발' },
  'upgrade:swordRange': { file: 'swordRange', setup: '로안 시작 검 · 일반 강화 1회', before: '거리 125px', after: '거리 140px' },
  'upgrade:swordArc': { file: 'swordArc', setup: '로안 시작 검 · 일반 강화 1회', before: '베기 각도 130°', after: '베기 각도 150°' },
  'upgrade:chainFork': { file: 'chainFork', setup: '루멘 연쇄 번개 · Lv 8 · 일반 강화 1회', before: '연쇄 경로만 발생', after: '세 번째 적중에서 2갈래 분기' },
  'upgrade:turretMount': { file: 'turretMount', setup: '루멘 서리 포탑 · 일반 강화 1회', before: '포탑 1대', after: '포탑 2대' },
  'upgrade:turretFrost': { file: 'turretFrost', setup: '루멘 서리 포탑 · 일반 강화 1회', before: '직격', after: '직격과 반경 48px 폭발' },
  'relic:chargeStance': { file: 'chargeStance', setup: '로안 시작 검 · 공격 직후 같은 시간 동안 이동', before: '기본 이동 속도', after: '0.4초간 이동 속도 +30%' },
  'relic:weaponThrow': { file: 'weaponThrow', setup: '로안 시작 검 · 투척 재사용 대기시간이 끝난 상태', before: '근접 공격', after: '근접 공격과 300px 관통 투척' },
  'relic:awl': { file: 'awl', setup: '균열 사수 · Lv 1 기본 사격', before: '첫 적에게 적중', after: '첫 적을 관통해 두 번째 적에게도 적중' },
  'relic:migrantFeather': { file: 'migrantFeather', setup: '균열 사수 · 회복 물약을 주운 직후 같은 시간 동안 이동', before: '기본 이동 속도', after: '5초간 이동 속도 +25%' },
  'relic:chainCloud': { file: 'chainCloud', setup: '루멘 연쇄 번개 · 첫 대상 주변을 확대', before: '연쇄 번개만 발생', after: '첫 대상 자리에 뇌운이 남아 낙뢰' },
};

const media = import.meta.glob<string>('../assets/codex-motion/*.{gif,webp}', { eager: true, query: '?url', import: 'default' });

export function codexMotion(id: CatalogId): HTMLElement | null {
  const demo = demos[id];
  if (!demo) return null;
  const animation = media[`../assets/codex-motion/${demo.file}.gif`];
  const still = media[`../assets/codex-motion/${demo.file}.webp`];
  if (!animation || !still) return null;

  const image = el('img', {
    width: '568', height: '166', loading: 'lazy', decoding: 'async',
    alt: `왼쪽 적용 전: ${demo.before}. 오른쪽 적용 후: ${demo.after}.`,
  });
  const toggle = el('button', { type: 'button', 'data-testid': 'codex-motion-toggle' });
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const update = () => {
    image.src = playing ? animation : still;
    toggle.textContent = playing ? '정지' : 'GIF 재생';
  };
  toggle.addEventListener('click', () => { playing = !playing; update(); });
  update();

  const comparison = (heading: string, description: string) => el('div', {}, [
    el('strong', { text: heading }), el('span', { text: description }),
  ]);
  return el('figure', { class: 'codex-motion ui-frame', 'data-testid': 'codex-motion' }, [
    el('figcaption', { class: 'codex-motion-heading' }, [
      el('div', {}, [el('h4', { text: '전투 비교' }), el('small', { class: 'muted', text: demo.setup })]), toggle,
    ]),
    el('div', { class: 'codex-motion-labels' }, [comparison('적용 전', demo.before), comparison('적용 후', demo.after)]),
    image,
  ]);
}
