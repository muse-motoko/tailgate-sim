// NPC の生成・入れ替え（DOM / three 非依存）。乱数は rng を差し替えられる。
import { createNpc } from './logic.js';
import { PLAYER_MODELS, NPC_ONLY_MODELS, pickNpcCar } from './cars.js';

export const NPC_CONFIG = {
  count: 10,           // 常に保つ台数
  spawnMin: 40,       // 自車前方の出現距離（m）
  spawnMax: 160,
  despawnBehind: 40,  // 自車よりこれ以上後ろで消す（m）
  despawnAhead: 220,  // これより先に離れすぎたら消す（m）
  laneGap: 25,        // 同車線での最小車間（m）
  speedMin: 8,       // NPC の速度（m/秒）。自車の初速 20 より遅めが中心
  speedMax: 16,
  fearMin: 0.6,       // ビビり係数
  fearMax: 1.6,
};

// 車種・色は cars.js で定義（NPC は自車用 6 車種＋トラック・初心者マーク軽・パトカー）
export const CAR_TYPES = [...PLAYER_MODELS, ...NPC_ONLY_MODELS];

const between = (lo, hi, rng) => lo + (hi - lo) * rng();

/** 前方に NPC を 1 台生成。同車線で近すぎる位置は避ける（置けなければ null）。 */
export function spawnNpc(state, id, rng = Math.random, cfg = NPC_CONFIG, lanes = 3) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const lane = Math.floor(rng() * lanes) % lanes;
    const z = state.player.z + between(cfg.spawnMin, cfg.spawnMax, rng);
    if (state.npcs.some(n => n.lane === lane && Math.abs(n.z - z) < cfg.laneGap)) continue;
    const npc = createNpc({ id, z, lane, fearCoef: between(cfg.fearMin, cfg.fearMax, rng) });
    npc.speed = between(cfg.speedMin, cfg.speedMax, rng);
    const { slow, ...car } = pickNpcCar(rng);
    npc.car = car;
    if (slow) npc.speed = between(slow[0], slow[1], rng); // トラック・初心者マークは遅め
    state.npcs.push(npc);
    return npc;
  }
  return null;
}

/** NPC を前進させ、範囲外を除いて台数を補充する。戻り値は消えた NPC の id 配列。 */
export function advanceNpcs(state, dt, nextId, rng = Math.random, cfg = NPC_CONFIG) {
  for (const n of state.npcs) n.z += n.speed * dt;
  const removed = [];
  state.npcs = state.npcs.filter(n => {
    const d = n.z - state.player.z;
    const gone = d < -cfg.despawnBehind || d > cfg.despawnAhead;
    if (gone) removed.push(n.id);
    return !gone;
  });
  for (let i = 0; state.npcs.length < cfg.count && i < cfg.count * 2; i++) spawnNpc(state, nextId(), rng, cfg);
  return removed;
}
