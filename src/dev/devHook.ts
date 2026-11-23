import type { App } from '../app/App';
import { Bot } from '../core/bot';

/**
 * 개발 모드에서만 window.__rift 로 노출되는 디버그 도구.
 * 자동 브라우저 테스트(e2e)가 상태를 읽고 검증하는 데 쓴다. 게임 규칙을 바꾸지는 않는다(debug.* 제외).
 */
export function installDevHook(app: App): void {
  let bot: Bot | null = null;
  let botSim: unknown = null;
  const api = {
    app,
    get sim() {
      return app.sim;
    },
    snapshot() {
      const s = app.sim;
      return {
        screen: app.screen,
        runsStarted: app.runsStarted,
        listenerInstalls: app.listenerInstalls,
        elapsed: s?.elapsed ?? null,
        phase: s?.phase ?? null,
        paused: s?.paused ?? null,
        seed: s?.seed ?? null,
        level: s?.level ?? null,
        xp: s?.xp ?? null,
        hp: s?.player.hp ?? null,
        kills: s?.kills ?? null,
        enemies: s?.enemies.length ?? null,
        spawned: s?.spawnLog.length ?? null,
        spawnKinds: s ? s.spawnLog.map((r) => r.kind).join(',') : null,
        shotsFired: s?.shotsFired ?? null,
        playerShots: s?.playerShots.length ?? null,
        boss: s?.boss ? { hp: s.boss.hp, maxHp: s.boss.maxHp, state: s.boss.state, dead: s.boss.dead } : null,
        bossSpawned: s?.bossSpawned ?? null,
        stacks: s ? { ...s.stacks } : null,
        picks: s ? s.picks.map((p) => ({ ...p })) : null,
        stats: s ? { ...s.stats } : null,
        rerollsLeft: s?.rerollsLeft ?? null,
        revivesLeft: s?.revivesLeft ?? null,
        pickups: s ? s.pickups.map((p) => ({ ...p })) : null,
        choiceGrades: s ? s.choices.map((c) => (c.kind === 'upgrade' ? c.grade : null)) : null,
        tokens: app.save.meta.tokens,
        lastTokens: app.lastTokens,
        choices: s ? s.choices.map((c) => (c.kind === 'upgrade' ? c.def.id : c.id)) : null,
        player: s ? { x: s.player.x, y: s.player.y, dodgeCd: s.player.dodgeCd } : null,
        result: app.lastResult,
        save: app.save,
      };
    },
    /** 자동 플레이 봇의 다음 입력 (e2e 장시간 플레이용) */
    botInput() {
      const s = app.sim;
      if (!s) return null;
      if (botSim !== s) {
        bot = new Bot(s.seed);
        botSim = s;
      }
      return bot!.input(s);
    },
    botChoose() {
      const s = app.sim;
      if (!s || !bot) return 0;
      return bot.choose(s);
    },
    worldToClient(x: number, y: number) {
      return app.scene?.worldToClient(x, y) ?? null;
    },
    debug: {
      addXp(n: number) {
        app.sim?.gainXp(n);
      },
      addTokens(n: number) {
        app.save = { ...app.save, meta: { ...app.save.meta, tokens: app.save.meta.tokens + n } };
      },
      dropItem(kind: 'heal' | 'magnet' | 'bomb', dx = 60, dy = 0) {
        const s = app.sim;
        if (s) s.pickups.push({ x: s.player.x + dx, y: s.player.y + dy, kind, life: 20 });
      },
      setBossHp(ratio: number) {
        const b = app.sim?.boss;
        if (b) b.hp = Math.max(1, Math.round(b.maxHp * ratio));
      },
    },
  };
  (window as unknown as { __rift: typeof api }).__rift = api;
}
