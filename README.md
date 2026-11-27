# 3D あおり運転シミュレーター

> 現実では絶対にやらない。だから、ここで思いっきり煽る。

ブラウザで遊ぶ 3D ゲームです。**ゲームの中だけの話です。現実では絶対にやらないでください。**

## 遊び方

車種と色を選んで「スタート」。前の車に詰めて圧をかけ、ビビらせて追い越しましょう。クラッシュが 3 回、または警察ゲージ満タンで逮捕されるとゲームオーバーです。結果画面から X でシェアできます。

| 操作 | PC | スマホ |
|---|---|---|
| 車線変更 | ← → | 画面の ← → ボタン |
| 加減速 | ↑ ↓ | 画面の ↑ ↓ ボタン |
| パッシング | P | P ボタン |
| クラクション | H | H ボタン |
| 視点切替 | V | V ボタン |
| スタート／リトライ | Enter／R | 画面のボタン |

## 構成

- `index.html` … 画面・描画・入力
- `logic.js` / `npc.js` / `config.js` … ゲームロジック（DOM・three.js に依存しない）
- `cars.js` … 車メッシュ
- `test.js` … ロジックのテスト（`node test.js`）
- `assets/ogp.png` … OGP 画像（1200×630）

three.js は CDN（jsDelivr）から読み込みます。ビルド不要の静的サイトです。

## 公開（GitHub Pages）

1. このフォルダの中身をそのまま公開リポジトリ `tailgate-sim` のルートに置く
2. Settings → Pages で、ブランチ main / ルート（/）を公開元にする
3. 公開 URL が決まったら、`index.html` の次の 3 か所を絶対 URL に差し替える
   - `og:url`（例：`https://<ユーザー>.github.io/tailgate-sim/`）
   - `og:image` / `twitter:image`（例：`https://<ユーザー>.github.io/tailgate-sim/assets/ogp.png`）

OGP の絶対 URL 化は、X などのクローラーが画像を取得するために必要です（相対パスのままだと表示されません）。

## ローカルで動かす

ES modules を使うため、`file://` ではなく簡易サーバーで開きます。

```
python3 -m http.server 8000
```
