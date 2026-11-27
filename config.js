// 定数の集約。単位は m / 秒 / 点。DOM・three には依存しない。
export const CONFIG = {
  lanes: 3,               // 車線数（0 が最も左）
  carLength: 4.5,         // 車の長さ（m）。d ≤ 0 かつ d > -carLength の間が接触

  // 圧（0–100）
  pressure: {
    max: 100,
    range: 30,            // この距離（m）未満で上昇
    baseRate: 15,         // range 付近での上昇（/秒）
    closeRate: 50,        // d=0 での上昇（/秒）。距離に比例して補間
    decayRate: 25,        // 離れたときの減衰（/秒）
    laneChangeFactor: 0.5,// 車線変更時に圧へ掛ける係数
    passingAdd: 20,       // パッシング P の瞬間加算
    passingCooldown: 0.8,
    hornAdd: 30,          // クラクション H の瞬間加算
    hornCooldown: 1.2,
  },

  // ビビりゲージ（NPC ごと 0–100）
  fear: {
    max: 100,
    baseRate: 100,        // 圧 100・ビビり係数 1.0 での上昇（/秒）
    decayRate: 10,        // 狙われていない間の減衰（/秒）
  },

  // スコア
  score: {
    base: 100,
    closeBonusMax: 1.0,   // 最接近 d=0 で +100%（1+この値）
    comboStep: 0.5,       // コンボ 1 つ増えるごとの倍率加算
    comboMaxMultiplier: 5,
    comboWindow: 6,       // 秒。成立がないとコンボ途切れ
  },

  // クラッシュ
  crash: {
    maxCount: 3,          // 仮：3 回でゲームオーバー
    penalty: 200,
    slowDuration: 2.0,    // 減速時間（秒）
    slowFactor: 0.4,      // 減速中の速度倍率
    invulnDuration: 1.5,  // 連続判定の防止（秒）
  },

  // 警察
  police: {
    max: 100,
    tailDistance: 5,      // この距離（m）未満で上昇
    riseRate: 12,         // /秒
    decayRate: 4,         // /秒（緩やか）
    spawnGap: 60,         // 出現時の自車後方距離（m）
    closeRate: 3,         // 追跡中に詰める速度（m/秒）
    slowCloseRate: 4,     // クラッシュ減速中に上乗せで詰める速度（m/秒）
    arrestGap: 0,         // これ以下で逮捕
  },
};
