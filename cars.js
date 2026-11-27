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

// 車種ごとの形状パラメータ（長さ L に対する割合。fs/rs = 前/後ピラーの傾き、hd = ボンネット先端の落ち、rd = 後端の落ち、R = タイヤ半径）
const PROFILE = {
  kei:     { fs: 0.05, rs: 0.02, hd: 0.04, rd: 0.03, R: 0.28 },
  compact: { fs: 0.09, rs: 0.05, hd: 0.10, rd: 0.05, R: 0.30 },
  sedan:   { fs: 0.10, rs: 0.08, hd: 0.12, rd: 0.10, R: 0.32 },
  sports:  { fs: 0.15, rs: 0.13, hd: 0.20, rd: 0.14, R: 0.31 },
  suv:     { fs: 0.06, rs: 0.03, hd: 0.07, rd: 0.03, R: 0.38 },
  minivan: { fs: 0.09, rs: 0.02, hd: 0.10, rd: 0.03, R: 0.31 },
  truck:   { fs: 0, rs: 0, hd: 0, rd: 0, R: 0.45 },
};

// 共有キャッシュ（ジオメトリ・素材）。NPC が増えても GPU 側のデータが増えないようにする
const geoCache = new Map();
let sharedFor = null, shared = null;
function getShared(THREE) {
  if (sharedFor === THREE) return shared;
  sharedFor = THREE; geoCache.clear();
  const L = c => new THREE.MeshLambertMaterial({ color: c });
  shared = {
    glass: new THREE.MeshLambertMaterial({ color: 0x1c2a3a }),
    dark: L(0x1a1a1a), tire: L(0x141414), hub: L(0xc4c8d0), plate: L(0xf6f6f0),
    tail: new THREE.MeshBasicMaterial({ color: 0xe01818 }),
    paints: new Map(),
  };
  return shared;
}
const paintFor = (THREE, sh, color) => {
  if (!sh.paints.has(color)) sh.paints.set(color, new THREE.MeshLambertMaterial({ color }));
  return sh.paints.get(color);
};

/**
 * 車メッシュを作る。spec = { type, length, width, height, color(数値) }
 * 側面シルエット（ボンネット・フロントガラスの傾き・トランク）を押し出して作り、
 * 窓・タイヤ・ホイール・ライト・ナンバープレートなどを付ける。
 * 戻り値の Group.userData: { cabin（窓＋屋根。運転席視点で隠す）, headMat（ヘッドライト素材）, siren（パトカーのみ） }
 */
export function buildCarMesh(THREE, spec) {
  const model = getModel(spec.type) || PLAYER_MODELS[2];
  const L = spec.length ?? model.length, W = spec.width ?? model.width, H = spec.height ?? model.height;
  const { bodyH, cabin: cb } = model;
  const pf = PROFILE[model.base || model.type] || PROFILE.sedan;
  const sh = getShared(THREE);
  const lift = 0.3; // 地面からの車体下面
  const belt = lift + bodyH; // ベルトライン（窓の下端）
  const paint = paintFor(THREE, sh, model.fixedColor ?? spec.color);
  const { glass, dark } = sh;
  const g = new THREE.Group();
  const cabinG = new THREE.Group(); g.add(cabinG);

  const boxGeo = (w, h, l) => {
    const k = 'b' + [w, h, l].map(v => v.toFixed(3)).join(',');
    if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, l));
    return geoCache.get(k);
  };
  const box = (w, h, l, mat, x, y, z, parent = g) => {
    const m = new THREE.Mesh(boxGeo(w, h, l), mat);
    m.position.set(x, y, z); parent.add(m); return m;
  };
  // 側面シルエット（座標は z, y）を幅 w で押し出す
  const prism = (key, pts, w, mat, parent = g) => {
    const k = 'p' + key + [w].join(',');
    if (!geoCache.has(k)) {
      const s = new THREE.Shape(); pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
      const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
      geo.translate(0, 0, -w / 2); geo.rotateY(-Math.PI / 2);
      geoCache.set(k, geo);
    }
    const m = new THREE.Mesh(geoCache.get(k), mat); parent.add(m); return m;
  };
  const key = [model.type, L, W, H].join('_');
  const zf = -L / 2, zr = L / 2; // 前端・後端
  let zA = 0, zB = 0; // キャビン前端・後端

  if (model.type === 'truck') {
    const cabL = L * 0.27, cargoL = L * 0.68;
    box(W * 0.94, 0.25, L, dark, 0, lift + 0.12, 0); // シャーシ
    box(W, bodyH - 0.2, cabL, paint, 0, lift + 0.2 + (bodyH - 0.2) / 2, zf + cabL / 2); // 運転台下部
    const ch = cb.h + 0.2;
    zA = zf; zB = zf + cabL;
    box(W * 0.96, ch, cabL * 0.94, glass, 0, belt + ch / 2, zf + cabL * 0.47, cabinG); // 運転台の窓
    box(W, 0.08, cabL, paint, 0, belt + ch + 0.04, zf + cabL / 2, cabinG);           // 屋根
    box(W * 0.98, 0.1, 0.06, paint, 0, belt + ch * 0.5, zf + cabL * 0.55, cabinG);    // ピラー
    const cargoH = H - 0.65;
    box(W, cargoH, cargoL, paint, 0, 0.65 + cargoH / 2, zr - cargoL / 2);            // 荷台（箱）
    box(W * 1.01, 0.12, cargoL, dark, 0, 0.7, zr - cargoL / 2);                      // 荷台の下の帯
    box(W * 0.6, 0.35, 0.04, dark, 0, 0.9, zr + 0.02);                               // 後扉の取っ手側の影
  } else {
    // 車体下部（ボンネット〜トランクのシルエット）
    const hd = pf.hd;
    zA = zf + L * cb.at; zB = zA + L * cb.len;
    const nose = belt - hd;
    prism(key + 'b', [
      [zf, lift + 0.05], [zf, nose], [zA, belt], [zB, belt], [zr, belt - pf.rd], [zr, lift + 0.05],
    ], W, paint, g);
    // キャビン：窓（シルエット）＋ 屋根板
    const rtop = H - 0.06;
    const zA2 = zA + L * pf.fs, zB2 = zB - L * pf.rs;
    prism(key + 'g', [[zA, belt], [zA2, rtop], [zB2, rtop], [zB, belt]], W * 0.9, glass, cabinG);
    box(W * 0.93, 0.07, zB2 - zA2 + 0.06, paint, 0, H - 0.03, (zA2 + zB2) / 2, cabinG);
    // Bピラー（中央の柱）
    if (model.type !== 'sports') box(W * 0.93, (H - belt) * 0.9, 0.07, paint, 0, belt + (H - belt) * 0.45, (zA2 + zB2) / 2, cabinG);
    // サイドミラー
    for (const s of [-1, 1]) box(0.1, 0.08, 0.16, paint, s * (W / 2 + 0.07), belt + 0.06, zA + L * 0.03, cabinG);
    // 車種ごとの飾り
    if (model.type === 'sports') {
      box(W * 0.92, 0.05, 0.36, paint, 0, belt + 0.2, zr - 0.3);                      // リアウイング
      for (const s of [-1, 1]) box(0.05, 0.2, 0.08, dark, s * W * 0.3, belt + 0.1, zr - 0.3);
      box(W * 0.05, 0.02, L * 0.5, dark, 0, nose + 0.12, zf + L * 0.2);               // ボンネットのストライプ
    }
    if (model.type === 'suv') {
      box(0.05, 0.05, zB2 - zA2, dark, -W * 0.3, H + 0.03, (zA2 + zB2) / 2, cabinG); // ルーフレール
      box(0.05, 0.05, zB2 - zA2, dark, W * 0.3, H + 0.03, (zA2 + zB2) / 2, cabinG);
      box(W * 1.01, 0.12, L * 0.9, dark, 0, lift + 0.12, 0);                          // 下部のクラッディング
    }
    if (model.type === 'minivan') box(W * 1.005, 0.05, L * 0.3, dark, 0, belt - 0.2, zA + L * 0.4); // スライドドアの筋
    if (model.type === 'police') {
      box(W * 1.004, bodyH * 0.5, L * 0.98, dark, 0, lift + bodyH * 0.25 + 0.03, 0);   // 黒い下半分（白黒ツートン）
      const barZ = (zA2 + zB2) / 2;
      const redM = new THREE.MeshBasicMaterial({ color: 0xff2020 }), blueM = new THREE.MeshBasicMaterial({ color: 0x2060ff });
      box(0.95, 0.06, 0.34, dark, 0, H + 0.03, barZ, cabinG);                           // 赤色灯の台
      box(0.4, 0.14, 0.3, redM, -0.25, H + 0.12, barZ, cabinG);                         // 赤色灯
      box(0.4, 0.14, 0.3, blueM, 0.25, H + 0.12, barZ, cabinG);
      g.userData.siren = { red: redM, blue: blueM };
    }
    if (model.type === 'learner') { // 初心者マーク（前後に貼る。緑＋黄の簡易版）
      const gm = new THREE.MeshBasicMaterial({ color: 0x2a9d4a }), ym = new THREE.MeshBasicMaterial({ color: 0xf2c200 });
      for (const [z, s] of [[zr + 0.02, 1], [zf - 0.02, -1]]) {
        box(0.22, 0.22, 0.03, gm, 0.45, lift + bodyH * 0.8, z); box(0.11, 0.11, 0.04, ym, 0.45, lift + bodyH * 0.8, z + s * 0.005);
      }
    }
  }

  // ライト・グリル・バンパー・ナンバープレート
  const headMat = new THREE.MeshBasicMaterial({ color: 0xe6e2c4 });
  const ly = lift + bodyH * (model.type === 'truck' ? 0.55 : 0.62) - (model.type === 'sports' ? 0.04 : 0);
  for (const s of [-1, 1]) {
    box(W * 0.2, 0.15, 0.08, headMat, s * W * 0.33, ly, zf - 0.02);
    const tailW = model.type === 'sports' ? W * 0.28 : W * 0.16;
    box(tailW, 0.13, 0.06, sh.tail, s * W * 0.34, model.type === 'truck' ? 0.9 : ly + 0.03, zr + 0.02);
  }
  if (model.type !== 'truck') {
    box(W * 0.4, 0.1, 0.04, dark, 0, ly, zf - 0.015);                 // グリル
    box(W * 1.01, 0.12, 0.1, dark, 0, lift + 0.08, zf - 0.03);        // 前バンパー
    box(W * 1.01, 0.12, 0.1, dark, 0, lift + 0.08, zr + 0.03);        // 後バンパー
  } else box(W * 1.0, 0.16, 0.12, dark, 0, 0.45, zf - 0.04);
  const plateY = model.type === 'truck' ? 0.5 : lift + 0.2;
  box(0.46, 0.14, 0.03, sh.plate, 0, plateY, zf - 0.08);              // ナンバープレート（前）
  box(0.46, 0.14, 0.03, sh.plate, 0, plateY + (model.type === 'truck' ? 0.1 : 0.12), zr + 0.07); // （後）

  // タイヤ＋ホイール（4 輪）
  const R = pf.R;
  const tk = 'tire' + R;
  if (!geoCache.has(tk)) {
    const tg = new THREE.CylinderGeometry(R, R, 0.26, 14); tg.rotateZ(Math.PI / 2);
    const hg = new THREE.CylinderGeometry(R * 0.6, R * 0.6, 0.05, 10); hg.rotateZ(Math.PI / 2);
    geoCache.set(tk, [tg, hg]);
  }
  const [tireGeo, hubGeo] = geoCache.get(tk);
  const wz = model.type === 'truck' ? [zf + L * 0.14, zr - L * 0.2] : [zf + L * 0.22, zr - L * 0.2];
  for (const s of [-1, 1]) for (const z of wz) {
    const x = s * (W / 2 - 0.1);
    const t = new THREE.Mesh(tireGeo, sh.tire); t.position.set(x, R, z); g.add(t);
    const h = new THREE.Mesh(hubGeo, sh.hub); h.position.set(x + s * 0.12, R, z); g.add(h);
  }
  g.userData.cabin = cabinG; g.userData.headMat = headMat;
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
