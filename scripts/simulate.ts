import { RUN_CONFIG } from '../src/config/run';
/**
 * 밸런스 시뮬레이션: 자동 플레이 봇으로 여러 시드를 끝까지 플레이하고 결과를 요약한다.
 *   npm run sim                  # 기본 20 시드
 *   npm run sim -- --runs 50 --skill 0.75 --seed 1000
 * 브라우저 없이 같은 전투 규칙(src/core)을 그대로 쓰므로 수 초 안에 끝난다.
 */
import { BALANCE_REFERENCE_META, META_STATS, META_UNLOCKS } from '../src/config/meta';
import { Bot } from '../src/core/bot';
import { tokenReward, type MetaPurchases } from '../src/core/meta';
import { formatTime } from '../src/core/math';
import { GameSim } from '../src/core/sim';

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

const runs = arg('runs', 20);
const skill = arg('skill', 0.75);
const baseSeed = arg('seed', 1000);
/** --meta ref(기본: 밸런스 기준, 토큰 145개) | none(영구 강화 없음) | max(전부 구매) */
const metaArg = (() => {
  const i = process.argv.indexOf('--meta');
  return i >= 0 ? process.argv[i + 1] : 'ref';
})();
const META: MetaPurchases =
  metaArg === 'none'
    ? {}
    : metaArg === 'max'
      ? Object.fromEntries([...META_STATS, ...META_UNLOCKS].map((d) => [d.id, d.maxLevel]))
      : BALANCE_REFERENCE_META;

interface Row {
  seed: number;
  outcome: string;
  cause: string;
  time: number;
  level: number;
  levelAtBoss: number | null;
  picksAtBoss: number | null;
  hpAtBoss: number | null;
  firstLevel: number | null;
  bossHp: number | null;
  kills: number;
  killedBy: string | null;
  tokens: number;
}

const rows: Row[] = [];
for (let i = 0; i < runs; i++) {
  const seed = baseSeed + i;
  const sim = new GameSim({ seed, meta: META });
  const bot = new Bot(seed, { skill });
  let levelAtBoss: number | null = null;
  let picksAtBoss: number | null = null;
  let hpAtBoss: number | null = null;
  let guard = 0;
  while (sim.phase !== 'ended' && guard++ < 60 * 60 * 20) {
    if (sim.phase === 'levelup') {
      if (bot.wantsReroll(sim)) sim.reroll();
      else sim.choose(bot.choose(sim));
      continue;
    }
    sim.step(bot.input(sim));
    if (sim.bossSpawned && levelAtBoss === null) {
      levelAtBoss = sim.level;
      picksAtBoss = sim.pickOrder.length;
      hpAtBoss = Math.round(sim.player.hp);
    }
  }
  const r = sim.result;
  rows.push({
    seed,
    outcome: r?.outcome ?? 'unfinished',
    cause: r?.cause ?? '—',
    time: r?.survivalTime ?? sim.elapsed,
    level: sim.level,
    levelAtBoss,
    picksAtBoss,
    hpAtBoss,
    firstLevel: sim.firstLevelUpAt,
    bossHp: r?.bossHpRatio ?? (sim.boss ? sim.boss.hp / sim.boss.maxHp : null),
    kills: sim.kills,
    killedBy: r?.killedBy ?? null,
    tokens: r ? tokenReward(r).total : 0,
  });
}

console.log('seed   결과   원인     시간   Lv  보스시Lv 보스시HP 첫레벨업 보스잔여HP 처치  사망원인');
for (const r of rows) {
  console.log(
    [
      String(r.seed).padEnd(6),
      (r.outcome === 'victory' ? '승리' : r.outcome === 'defeat' ? '패배' : '미종료').padEnd(5),
      r.cause.padEnd(8),
      formatTime(r.time).padStart(5),
      String(r.level).padStart(3),
      String(r.levelAtBoss ?? '-').padStart(7),
      String(r.hpAtBoss ?? '-').padStart(8),
      (r.firstLevel !== null ? `${r.firstLevel.toFixed(0)}s` : '-').padStart(8),
      (r.bossHp !== null ? `${Math.round(r.bossHp * 100)}%` : '-').padStart(10),
      String(r.kills).padStart(5),
      ' ' + (r.killedBy ?? ''),
    ].join(' '),
  );
}
const wins = rows.filter((r) => r.outcome === 'victory');
const winTimes = wins.map((r) => r.time).sort((a, b) => a - b);
const median = (xs: number[]) => (xs.length ? xs[Math.floor(xs.length / 2)] : NaN);
const firsts = rows.map((r) => r.firstLevel ?? NaN).filter((x) => !isNaN(x)).sort((a, b) => a - b);
const lvls = rows.map((r) => r.levelAtBoss).filter((x): x is number => x !== null).sort((a, b) => a - b);
console.log('\n── 요약 ──');
console.log(`봇 숙련도 ${skill}, ${runs}판, 영구 강화 ${metaArg}`);
const toks = rows.map((r) => r.tokens).sort((a, b) => a - b);
console.log(`판당 토큰 중앙값 ${median(toks)} (범위 ${toks[0]}~${toks[toks.length - 1]})`);
console.log(`승리 ${wins.length} / 사망 ${rows.filter((r) => r.cause === 'death').length} / 미종료 ${rows.filter((r) => r.outcome === 'unfinished').length}`);
if (wins.length) console.log(`승리 시각: 최소 ${formatTime(winTimes[0])}, 중앙값 ${formatTime(median(winTimes))}, 최대 ${formatTime(winTimes[winTimes.length - 1])}`);
console.log(`승리 중 ${formatTime(RUN_CONFIG.bossAt)}~${formatTime(RUN_CONFIG.timeLimit)} 비율: ${wins.filter((r) => r.time >= RUN_CONFIG.bossAt && r.time <= RUN_CONFIG.timeLimit).length}/${wins.length}`);
console.log(`첫 레벨업 중앙값 ${median(firsts).toFixed(0)}초 (최대 ${firsts[firsts.length - 1]?.toFixed(0)}초)`);
if (lvls.length) console.log(`보스 등장 시 레벨 중앙값 ${median(lvls)} (범위 ${lvls[0]}~${lvls[lvls.length - 1]})`);
