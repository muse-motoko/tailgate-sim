// 車種定義とメッシュ生成。three.js のプリミティブの組み合わせだけで作る（外部モデルなし）。
// データ部分は three に依存しない（node のテストから読めるように、THREE は引数で受け取る）。
// 座標：進行方向は -z（前）、+z が後ろ。単位は m。

// 自車で選べる車種。maxSpeed は m/s、accel は加速（m/s²）
// body: 車体下部の高さ / cabin: キャビン（窓＋屋根）の長さ・高さ・前端からの位置（0=前端, 1=後端）
export const PLAYER_MODELS = [
  { type: 'kei', name: '軽自動車', length: 3.4, width: 1.5, height: 1.65, bodyH: 0.85, cabin: { len: 0.78, h: 0.8, at: 0.1 }, maxSpeed: 42, accel: 10 },
  { type: 'compact', name: 'コンパクト', length: 4.0, width: 1.7, height: 1.5, bodyH: 0.7, cabin: { len: 0.66, h: 0.65, at: 0.2 }, maxSpeed: 50, accel: 11 },
  { type: 'sedan', name: 'セダン', length: 4.6, width: 1.8, height: 1.35, bodyH: 0.65, cabin: { len: 0.46, h: 0.55, at: 0.28 }, maxSpeed: 55, accel: 12 },
  { type: 'sports', name: 'スポーツカー', length: 4.4, width: 1.9, height: 1.15, bodyH: 0.55, cabin: { len: 0.4, h: 0.48, at: 0.34 }, maxSpeed: 70, accel: 16 },
  { type: 'suv', name: 'SUV', length: 4.7, width: 1.9, height: 1.8, bodyH: 0.95, cabin: { len: 0.68, h: 0.78, at: 0.18 }, maxSpeed: 52, accel: 11 },
  { type: 'minivan', name: 'ミニバン', length: 4.8, width: 1.8, height: 1.85, bodyH: 0.9, cabin: { len: 0.84, h: 0.9, at: 0.1 }, maxSpeed: 48, accel: 10 },
];

// NPC だけに出てくる車種（slow: 速度の上書き範囲 m/s）
export const NPC_ONLY_MODELS = [
  { type: 'truck', name: 'トラック', length: 6.5, width: 2.1, height: 2.6, bodyH: 0.9, cabin: { len: 0.25, h: 0.9, at: 0 }, slow: [6, 9] },
  { type: 'learner', name: '初心者マークの軽', length: 3.4, width: 1.5, height: 1.65, bodyH: 0.85, cabin: { len: 0.78, h: 0.8, at: 0.1 }, base: 'kei', slow: [6, 10] },
  { type: 'police', name: 'パトカー', length: 4.6, width: 1.8, height: 1.35, bodyH: 0.65, cabin: { len: 0.46, h: 0.55, at: 0.28 }, base: 'sedan', fixedColor: 0xf2f2f2 },
];

// 色（自車で選べる 8 色）
export const COLORS = [
  { id: 'white', name: '白', hex: 0xf2f2f2 },
  { id: 'black', name: '黒', hex: 0x1e1e22 },
  { id: 'red', name: '赤', hex: 0xd62222 },
  { id: 'blue', name: '青', hex: 0x2255cc },
  { id: 'yellow', name: '黄', hex: 0xe8c020 },
  { id: 'silver', name: '銀', hex: 0xa8aab2 },
  { id: 'green', name: '緑', hex: 0x2a9d4a },
  { id: 'pink', name: 'ピンク', hex: 0xf08cb4 },
];

export const getModel = type => [...PLAYER_MODELS, ...NPC_ONLY_MODELS].find(m => m.type === type);

/**
 * 車メッシュを作る。spec = { type, length, width, height, color(数値) }
 * 戻り値の Group.userData: { cabin（窓＋屋根。運転席視点で隠す）, headMat（ヘッドライト素材） }
 */
export function buildCarMesh(THREE, spec) {
  const model = getModel(spec.type) || PLAYER_MODELS[2];
  const L = spec.length ?? model.length, W = spec.width ?? model.width, H = spec.height ?? model.height;
  const { bodyH, cabin: cb } = model;
  const lift = 0.3; // 地面からの車体下面
  const paint = new THREE.MeshLambertMaterial({ color: model.fixedColor ?? spec.color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x223344 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const g = new THREE.Group();
  const box = (w, h, l, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
    m.position.set(x, y, z); parent.add(m); return m;
  };

  // 車体下部
  box(W, bodyH, L, paint, 0, lift + bodyH / 2, 0);
  // キャビン（-z が前。at は前端からの割合）
  const cabinG = new THREE.Group(); g.add(cabinG);
  const cl = L * cb.len, cz = -L / 2 + L * cb.at + cl / 2, cy = lift + bodyH + cb.h / 2;
  if (model.type === 'truck') {
    box(W * 0.95, cb.h + 0.5, L * cb.len, glass, 0, cy + 0.15, cz, cabinG);        // 運転台
    box(W, H - lift - 0.2, L * 0.68, paint, 0, lift + (H - lift - 0.2) / 2 + 0.2, L * 0.16); // 荷台（箱）
  } else {
    box(W * 0.92, cb.h * 0.82, cl, glass, 0, cy - cb.h * 0.09, cz, cabinG);       // 窓
    box(W * 0.94, cb.h * 0.18, cl * 0.96, paint, 0, lift + bodyH + cb.h * 0.91, cz, cabinG); // 屋根
  }
  // 車種ごとの飾り
  if (model.type === 'sports') box(W * 0.9, 0.06, 0.35, paint, 0, lift + bodyH + 0.28, L / 2 - 0.2); // リアウイング
  if (model.type === 'suv') box(W * 0.6, 0.06, cl * 0.8, dark, 0, lift + bodyH + cb.h + 0.06, cz, cabinG); // ルーフレール
  if (model.type === 'police') {
    box(W * 1.002, bodyH * 0.35, L * 0.5, dark, 0, lift + bodyH * 0.45, 0.2); // 黒帯（ドア）
    const redM = new THREE.MeshBasicMaterial({ color: 0xff2020 }), blueM = new THREE.MeshBasicMaterial({ color: 0x2060ff });
    box(0.4, 0.14, 0.3, redM, -0.3, lift + bodyH + cb.h + 0.08, cz, cabinG);       // 赤色灯
    box(0.4, 0.14, 0.3, blueM, 0.3, lift + bodyH + cb.h + 0.08, cz, cabinG);
  }
  if (model.type === 'learner') { // 初心者マーク（前後に貼る。緑＋黄の簡易版）
    const gm = new THREE.MeshBasicMaterial({ color: 0x2a9d4a }), ym = new THREE.MeshBasicMaterial({ color: 0xf2c200 });
    for (const [z, s] of [[L / 2 + 0.02, 1], [-L / 2 - 0.02, -1]]) {
      box(0.22, 0.22, 0.03, gm, 0.45, lift + bodyH * 0.8, z); box(0.11, 0.11, 0.04, ym, 0.45, lift + bodyH * 0.8, z + s * 0.005);
    }
  }
  // ライト
  const headMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xcc1111 });
  for (const x of [-W * 0.33, W * 0.33]) {
    box(0.4, 0.18, 0.08, headMat, x, lift + bodyH * 0.7, -L / 2 - 0.02);
    box(0.3, 0.15, 0.06, tailMat, x, lift + bodyH * 0.7, L / 2 + 0.02);
  }
  // タイヤ
  const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.25, 12);
  for (const sx of [-1, 1]) for (const z of [-L * 0.32, L * 0.32]) {
    const w = new THREE.Mesh(wheelGeo, dark); w.rotation.z = Math.PI / 2; w.position.set(sx * (W / 2 - 0.05), 0.32, z); g.add(w);
  }
  g.userData = { cabin: cabinG, headMat };
  return g;
}

/** NPC 用の車スペック（rng で車種・色を選ぶ）。珍しい車種は重みを小さくする。 */
export function pickNpcCar(rng = Math.random) {
  const table = [
    ...PLAYER_MODELS.map(m => ({ m, w: 3 })),
    ...NPC_ONLY_MODELS.map(m => ({ m, w: m.type === 'police' ? 0.6 : 1.5 })),
  ];
  let r = rng() * table.reduce((s, t) => s + t.w, 0);
  let m = table[table.length - 1].m;
  for (const t of table) { if ((r -= t.w) < 0) { m = t.m; break; } }
  const color = m.fixedColor ?? COLORS[Math.floor(rng() * COLORS.length) % COLORS.length].hex;
  return { type: m.type, length: m.length, width: m.width, height: m.height, color, slow: m.slow };
}
