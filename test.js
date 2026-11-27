import assert from 'node:assert';
import { CONFIG } from './config.js';
import {
  createNpc, createState, update, pressureRate, comboMultiplier,
  overtakeScore, speedMultiplier, shareText,
} from './logic.js';
import { spawnNpc, advanceNpcs, NPC_CONFIG, CAR_TYPES } from './npc.js';

let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok -', name); };
const mk = (d, opts = {}) => createState({
  playerLane: 1,
  npcs: [createNpc({ id: 'a', z: d, lane: 1, fearCoef: opts.fearCoef ?? 1 })],
});
const run = (s, sec, input = {}, step = 0.1) => {
  const ev = [];
  for (let t = 0; t < sec - 1e-9; t += step) ev.push(...update(s, step, input));
  return ev;
};

test('圧：range（30m）以上では上がらない', () => {
  const s = mk(35); run(s, 3); assert.strictEqual(s.pressure, 0);
});
test('圧：近いほど速く上がる', () => {
  assert.ok(pressureRate(3) > pressureRate(10));
  assert.strictEqual(pressureRate(CONFIG.pressure.range), 0);
  const a = mk(10), b = mk(4); run(a, 1); run(b, 1);
  assert.ok(b.pressure > a.pressure);
});
test('圧：上限 100', () => {
  const s = mk(2, { fearCoef: 0 }); run(s, 30); assert.ok(s.pressure <= 100);
});
test('パッシング：瞬間加算とクールダウン 0.8 秒', () => {
  const s = mk(14, { fearCoef: 0 });
  update(s, 0.01, { passing: true });
  const p1 = s.pressure; assert.ok(p1 >= CONFIG.pressure.passingAdd);
  update(s, 0.01, { passing: true });
  assert.ok(s.pressure - p1 < 1, 'cooldown 中は加算されない');
  run(s, 0.8);
  const p2 = s.pressure; update(s, 0.01, { passing: true });
  assert.ok(s.pressure - p2 >= CONFIG.pressure.passingAdd);
});
test('クラクション：瞬間加算とクールダウン 1.2 秒', () => {
  const s = mk(14, { fearCoef: 0 });
  update(s, 0.01, { horn: true });
  const p1 = s.pressure; assert.ok(p1 >= CONFIG.pressure.hornAdd);
  run(s, 1.0, { horn: true });
  assert.strictEqual(s.hornCd > 0, true);
  const before = s.pressure; run(s, 0.3);
  update(s, 0.01, { horn: true });
  assert.ok(s.pressure - before >= CONFIG.pressure.hornAdd - 5);
});
test('圧：離れると減衰、車線変更で減る', () => {
  const s = mk(5, { fearCoef: 0 }); run(s, 1);
  const p = s.pressure; s.npcs[0].z = 50; run(s, 0.5);
  assert.ok(s.pressure < p);
  const t = mk(5, { fearCoef: 0 }); run(t, 1);
  const q = t.pressure; update(t, 0.001, { lane: 2 });
  assert.ok(t.pressure < q);
});
test('ビビり：性格の係数で速さが変わる', () => {
  const a = mk(5, { fearCoef: 0.5 }), b = mk(5, { fearCoef: 2 });
  run(a, 1); run(b, 1);
  assert.ok(b.npcs[0].fear > a.npcs[0].fear);
});
test('ビビり：満タンで左車線へ避ける', () => {
  const s = mk(5, { fearCoef: 3 });
  const ev = run(s, 10);
  assert.ok(ev.some(e => e.type === 'dodge'));
  assert.strictEqual(s.npcs[0].lane, 0);
});
test('追い越し：避けた NPC を抜くと成立、スコア加算', () => {
  const s = mk(5, { fearCoef: 3 });
  run(s, 10);
  assert.strictEqual(s.score, 0);
  s.player.z = s.npcs[0].z + 1;
  const ev = update(s, 0.1);
  const o = ev.find(e => e.type === 'overtake');
  assert.ok(o && s.score === o.points && s.combo === 1);
});
test('スコア：近さボーナスとコンボ倍率', () => {
  assert.ok(overtakeScore(1, 1) > overtakeScore(29, 1));
  assert.strictEqual(overtakeScore(CONFIG.pressure.range, 1), CONFIG.score.base);
  assert.ok(comboMultiplier(3) > comboMultiplier(2));
  assert.strictEqual(comboMultiplier(99), CONFIG.score.comboMaxMultiplier);
});
test('コンボ：連続で伸び、時間切れで途切れる', () => {
  const s = createState({ npcs: [
    createNpc({ id: 'a', z: -5, lane: 0 }), createNpc({ id: 'b', z: -6, lane: 0 })] });
  s.npcs.forEach(x => { x.dodged = true; });
  update(s, 0.1); assert.strictEqual(s.combo, 2);
  const ev = run(s, CONFIG.score.comboWindow + 1);
  assert.ok(ev.some(e => e.type === 'comboLost') && s.combo === 0);
});
test('クラッシュ：コンボ消滅・減速・ペナルティ、連続判定なし', () => {
  const s = mk(0.5, { fearCoef: 0 });
  s.combo = 3; s.comboTimer = 5; s.score = 500;
  s.player.z = 1; // d = -0.5
  const ev = update(s, 0.1);
  assert.ok(ev.some(e => e.type === 'crash'));
  assert.strictEqual(s.combo, 0);
  assert.strictEqual(s.score, 500 - CONFIG.crash.penalty);
  assert.ok(speedMultiplier(s) < 1);
  update(s, 0.1); assert.strictEqual(s.crashes, 1);
});
test('クラッシュ：3 回でゲームオーバー', () => {
  const s = mk(0, { fearCoef: 0 });
  for (let i = 0; i < 3; i++) { run(s, CONFIG.crash.invulnDuration + 0.2); }
  assert.strictEqual(s.gameOver, true);
  assert.strictEqual(s.gameOverReason, 'crashes');
});
test('警察：5m 未満で上昇、離れると緩やかに下がる', () => {
  const s = mk(3, { fearCoef: 0 }); run(s, 2);
  const g = s.policeGauge; assert.ok(g > 0);
  s.npcs[0].z = 30; run(s, 1);
  assert.ok(s.policeGauge < g);
  assert.ok(CONFIG.police.decayRate < CONFIG.police.riseRate);
  const t = mk(8, { fearCoef: 0 }); run(t, 3); assert.strictEqual(t.policeGauge, 0);
});
test('警察：満タンで出現・追跡・逮捕でゲームオーバー', () => {
  const s = mk(3, { fearCoef: 0 });
  const ev = run(s, 20);
  assert.ok(ev.some(e => e.type === 'policeSpawn'));
  assert.strictEqual(s.gameOver, false);
  s.npcs[0].z = 1000; // 衝突を避ける
  const ev2 = run(s, 40);
  assert.ok(ev2.some(e => e.type === 'gameOver' && e.reason === 'arrested'));
  assert.strictEqual(s.gameOverReason, 'arrested');
});
test('警察：減速中は追いつかれるのが速い', () => {
  const a = mk(1000), b = mk(1000);
  a.police = { active: true, gap: 60 }; b.police = { active: true, gap: 60 }; b.slowTimer = 2;
  run(a, 1); run(b, 1);
  assert.ok(b.police.gap < a.police.gap);
});
test('結果：追い越し台数・最大コンボを記録し、シェア文にスコアが入る', () => {
  const s = createState({ npcs: [createNpc({ id: 'a', z: -5, lane: 0 }), createNpc({ id: 'b', z: -6, lane: 0 })] });
  s.npcs.forEach(x => { x.dodged = true; });
  update(s, 0.1);
  assert.strictEqual(s.overtakes, 2); assert.strictEqual(s.maxCombo, 2);
  s.gameOverReason = 'arrested';
  const t = shareText(s);
  assert.ok(t.includes(String(s.score)) && t.includes('2 台') && t.includes('逮捕'));
});
test('ゲームオーバー後は更新されない', () => {
  const s = mk(3); s.gameOver = true;
  assert.deepStrictEqual(update(s, 1), []);
});

const seeded = (seed = 1) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
test('NPC：生成は前方・車種色つき・同車線で近すぎない', () => {
  const s = createState(); const rng = seeded(7); let id = 0;
  advanceNpcs(s, 0, () => ++id, rng);
  assert.strictEqual(s.npcs.length, NPC_CONFIG.count);
  for (const a of s.npcs) {
    assert.ok(a.z - s.player.z >= NPC_CONFIG.spawnMin);
    assert.ok(CAR_TYPES.some(c => c.type === a.car.type) && Number.isInteger(a.car.color));
    for (const b of s.npcs) if (a !== b && a.lane === b.lane) assert.ok(Math.abs(a.z - b.z) >= NPC_CONFIG.laneGap);
  }
});
test('NPC：後方に離れたら消えて補充される（無限に続く）', () => {
  const s = createState(); const rng = seeded(3); let id = 0;
  advanceNpcs(s, 0, () => ++id, rng);
  const first = s.npcs.map(n => n.id);
  for (let t = 0; t < 60; t += 0.1) { s.player.z += 30 * 0.1; advanceNpcs(s, 0.1, () => ++id, rng); }
  assert.ok(s.npcs.length >= NPC_CONFIG.count - 1);
  assert.ok(!s.npcs.some(n => first.includes(n.id)));
});
test('統合：近づくと圧が溜まり、避けて追い越しが成立する', () => {
  const s = createState({ playerLane: 1, npcs: [] });
  const n = createNpc({ id: 'x', z: 25, lane: 1, fearCoef: 1.5 }); n.speed = 15; s.npcs.push(n);
  const ev = [];
  for (let t = 0; t < 60 && !ev.some(e => e.type === 'overtake'); t += 0.05) {
    s.player.z += (s.d < 10 ? 15 : 17) * 0.05; n.z += n.speed * 0.05;
    ev.push(...update(s, 0.05, { lane: 1, horn: t % 2 < 0.06, passing: t % 2 > 1 && t % 2 < 1.06 }));
  }
  assert.ok(ev.some(e => e.type === 'dodge'));
  assert.ok(ev.some(e => e.type === 'overtake'));
  assert.strictEqual(s.crashes, 0);
});


test('最左車線の NPC も右へ避ける', () => {
  const s = createState({ playerLane: 0, npcs: [createNpc({ id: 'a', z: 5, lane: 0, fearCoef: 3 })] });
  const ev = run(s, 10);
  assert.ok(ev.some(e => e.type === 'dodge'));
  assert.strictEqual(s.npcs[0].lane, 1);
});
test('普通の速度（相対 8m/s）で近づくだけで避ける（全車線・標準ビビり係数）', () => {
  for (const lane of [0, 1, 2]) {
    const s = createState({ playerLane: lane, npcs: [createNpc({ id: 'a', z: 30, lane, fearCoef: 0.6 })] });
    const ev = [];
    for (let t = 0; t < 8 && !s.npcs[0].dodged; t += 0.05) { s.player.z += 8 * 0.05; ev.push(...update(s, 0.05, {})); }
    assert.ok(ev.some(e => e.type === 'dodge'), 'lane ' + lane);
    assert.strictEqual(s.crashes, 0);
  }
});

// --- cars.js ---
{
  const { PLAYER_MODELS, COLORS, NPC_ONLY_MODELS, pickNpcCar } = await import('./cars.js');
  test('車種 6・色 8・NPC 専用 3 が定義されている', () => {
    assert.equal(PLAYER_MODELS.length, 6); assert.equal(COLORS.length, 8); assert.equal(NPC_ONLY_MODELS.length, 3);
    const sports = PLAYER_MODELS.find(m => m.type === 'sports');
    assert.ok(PLAYER_MODELS.every(m => m.maxSpeed <= sports.maxSpeed));
  });
  test('NPC：トラック・初心者マーク・パトカーが出うる', () => {
    const seen = new Set(); let r = 0; const rng = () => (r = (r * 9301 + 49297 + 0.1234) % 1);
    for (let i = 0; i < 2000; i++) seen.add(pickNpcCar(rng).type);
    for (const t of ['truck', 'learner', 'police', 'kei', 'minivan']) assert.ok(seen.has(t), t);
  });
}

console.log(`\n${n} tests passed`);
