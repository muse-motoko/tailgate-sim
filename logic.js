// ゲームロジック（DOM / three 非依存）。位置は道路方向 z（m、前方が +）。
import { CONFIG as DEFAULT_CONFIG } from './config.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** NPC を作る。fearCoef はビビり係数（性格）。大きいほど早く怯える。 */
export function createNpc({ id, z, lane, fearCoef = 1 }) {
  return { id, z, lane, fearCoef, fear: 0, dodged: false, passed: false, minD: Infinity };
}

export function createState({ playerZ = 0, playerLane = 1, npcs = [] } = {}) {
  return {
    time: 0,
    player: { z: playerZ, lane: playerLane },
    npcs,
    d: Infinity,          // 同車線の前方 NPC との車間距離
    targetId: null,
    pressure: 0,
    passingCd: 0,
    hornCd: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    overtakes: 0,
    comboTimer: 0,
    crashes: 0,
    slowTimer: 0,
    invulnTimer: 0,
    policeGauge: 0,
    police: { active: false, gap: 0 },
    gameOver: false,
    gameOverReason: null, // 'crashes' | 'arrested'
  };
}

/** 車間距離 d（m）。 */
export function distance(player, npc) {
  return npc.z - player.z;
}

/** 同車線で最も近い前方（または接触中）の NPC。 */
export function findTarget(state, cfg = DEFAULT_CONFIG) {
  let best = null;
  for (const n of state.npcs) {
    if (n.lane !== state.player.lane) continue;
    const d = distance(state.player, n);
    if (d <= -cfg.carLength) continue; // すでに後ろ
    if (!best || d < best.d) best = { npc: n, d };
  }
  return best;
}

/** 圧の上昇速度（/秒）。range 以上は 0、近いほど速い。 */
export function pressureRate(d, cfg = DEFAULT_CONFIG) {
  const p = cfg.pressure;
  if (d >= p.range) return 0;
  const t = clamp((p.range - Math.max(d, 0)) / p.range, 0, 1);
  return p.baseRate + (p.closeRate - p.baseRate) * t;
}

export function comboMultiplier(combo, cfg = DEFAULT_CONFIG) {
  if (combo <= 0) return 1;
  return Math.min(cfg.score.comboMaxMultiplier, 1 + cfg.score.comboStep * (combo - 1));
}

export function overtakeScore(minD, combo, cfg = DEFAULT_CONFIG) {
  const s = cfg.score;
  const closeness = 1 - clamp(minD / cfg.pressure.range, 0, 1);
  return Math.round(s.base * (1 + s.closeBonusMax * closeness) * comboMultiplier(combo, cfg));
}

/** 現在の速度倍率（クラッシュ減速中は低下）。 */
export function speedMultiplier(state, cfg = DEFAULT_CONFIG) {
  return state.slowTimer > 0 ? cfg.crash.slowFactor : 1;
}

/**
 * 1 フレーム進める。
 * input: { passing, horn, lane }（passing/horn は押した瞬間 true、lane は現在の車線）
 * 呼び出し側が state.player.z / npc.z を動かしてから呼ぶ。戻り値はイベント配列。
 */
export function update(state, dt, input = {}, cfg = DEFAULT_CONFIG) {
  const events = [];
  if (state.gameOver) return events;
  state.time += dt;

  // 車線変更：圧を減らす
  if (input.lane !== undefined && input.lane !== state.player.lane) {
    state.player.lane = input.lane;
    state.pressure *= cfg.pressure.laneChangeFactor;
    events.push({ type: 'laneChange', lane: input.lane });
  }

  state.passingCd = Math.max(0, state.passingCd - dt);
  state.hornCd = Math.max(0, state.hornCd - dt);
  state.slowTimer = Math.max(0, state.slowTimer - dt);
  state.invulnTimer = Math.max(0, state.invulnTimer - dt);

  const target = findTarget(state, cfg);
  state.d = target ? target.d : Infinity;
  state.targetId = target ? target.npc.id : null;

  // 圧
  const pc = cfg.pressure;
  if (target && target.d < pc.range) {
    state.pressure += pressureRate(target.d, cfg) * dt;
    if (input.passing && state.passingCd === 0) {
      state.pressure += pc.passingAdd;
      state.passingCd = pc.passingCooldown;
      events.push({ type: 'passing' });
    }
    if (input.horn && state.hornCd === 0) {
      state.pressure += pc.hornAdd;
      state.hornCd = pc.hornCooldown;
      events.push({ type: 'horn' });
    }
  } else {
    state.pressure -= pc.decayRate * dt;
  }
  state.pressure = clamp(state.pressure, 0, pc.max);

  // ビビりゲージ
  const fc = cfg.fear;
  for (const n of state.npcs) {
    if (target && n === target.npc && !n.dodged) {
      n.fear += (state.pressure / pc.max) * fc.baseRate * n.fearCoef * dt;
      if (target.d < n.minD) n.minD = Math.max(target.d, 0);
      if (n.fear >= fc.max) {
        n.fear = fc.max;
        // 譲る：基本は左車線へ。最左車線の車は右へ避ける
        const to = n.lane > 0 ? n.lane - 1 : Math.min(n.lane + 1, cfg.lanes - 1);
        if (to !== n.lane) {
          n.lane = to;
          n.dodged = true;
          events.push({ type: 'dodge', id: n.id });
        }
      }
    } else if (!n.dodged) {
      n.fear = Math.max(0, n.fear - fc.decayRate * dt);
    }
  }

  // 追い越し成立：避けた NPC を抜いた時点
  state.comboTimer = Math.max(0, state.comboTimer - dt);
  if (state.combo > 0 && state.comboTimer === 0) {
    state.combo = 0;
    events.push({ type: 'comboLost' });
  }
  for (const n of state.npcs) {
    if (n.dodged && !n.passed && n.z < state.player.z) {
      n.passed = true;
      state.combo += 1;
      state.overtakes += 1;
      state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.comboTimer = cfg.score.comboWindow;
      const pts = overtakeScore(n.minD === Infinity ? pc.range : n.minD, state.combo, cfg);
      state.score += pts;
      events.push({ type: 'overtake', id: n.id, points: pts, combo: state.combo });
    }
  }

  // クラッシュ
  if (target && target.d <= 0 && state.invulnTimer === 0) {
    state.crashes += 1;
    state.combo = 0;
    state.comboTimer = 0;
    state.score = Math.max(0, state.score - cfg.crash.penalty);
    state.slowTimer = cfg.crash.slowDuration;
    state.invulnTimer = cfg.crash.invulnDuration;
    state.pressure = 0;
    events.push({ type: 'crash', id: target.npc.id, crashes: state.crashes });
    if (state.crashes >= cfg.crash.maxCount) endGame(state, 'crashes', events);
  }

  // 警察
  const pol = cfg.police;
  if (!state.police.active) {
    if (target && target.d < pol.tailDistance) {
      state.policeGauge += pol.riseRate * dt;
    } else {
      state.policeGauge -= pol.decayRate * dt;
    }
    state.policeGauge = clamp(state.policeGauge, 0, pol.max);
    if (state.policeGauge >= pol.max) {
      state.police.active = true;
      state.police.gap = pol.spawnGap;
      events.push({ type: 'policeSpawn' });
    }
  } else if (!state.gameOver) {
    // クラッシュ減速中は逃げ切れず、追いつかれる速さが増す
    state.police.gap -= (pol.closeRate + (state.slowTimer > 0 ? pol.slowCloseRate : 0)) * dt;
    if (state.police.gap <= pol.arrestGap) {
      state.police.gap = pol.arrestGap;
      endGame(state, 'arrested', events);
    }
  }

  return events;
}

function endGame(state, reason, events) {
  state.gameOver = true;
  state.gameOverReason = reason;
  events.push({ type: 'gameOver', reason });
}

/** シェア文（X 向け）。 */
export function shareText(state) {
  return `3D あおり運転シミュレーター（ゲームの中だけ）で ${state.score} 点！追い越し ${state.overtakes} 台・最大 ${state.maxCombo} コンボ。` +
    (state.gameOverReason === 'arrested' ? '逮捕されました🚓' : 'クラッシュでゲームオーバー💥') + ' #あおり運転シミュレーター';
}
