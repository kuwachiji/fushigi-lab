// ミッション定義。check(sim) がグリッドの状態や統計から達成を判定する
import { E } from "./sim.js";

function maxColumnCount(sim, e) {
  let best = 0;
  for (let x = 0; x < sim.w; x++) {
    let n = 0;
    for (let y = 0; y < sim.h; y++) if (sim.get(x, y) === e) n++;
    if (n > best) best = n;
  }
  return best;
}

function maxRowCount(sim, e) {
  let best = 0;
  for (let y = 0; y < sim.h; y++) {
    let n = 0;
    for (let x = 0; x < sim.w; x++) if (sim.get(x, y) === e) n++;
    if (n > best) best = n;
  }
  return best;
}

/** 上のセルが top、その真下が bottom になっている組の数 */
function stackedPairs(sim, top, bottom) {
  let n = 0;
  for (let y = 0; y < sim.h - 1; y++) {
    for (let x = 0; x < sim.w; x++) {
      if (sim.get(x, y) === top && sim.get(x, y + 1) === bottom) n++;
    }
  }
  return n;
}

export const MISSIONS = [
  {
    id: "sand-hill",
    title: "すなの山をつくろう",
    text: "すなをたくさん落として、高さ 10 マス以上の山にしよう。",
    premium: false,
    check: (sim) => sim.count(E.SAND) >= 200 && maxColumnCount(sim, E.SAND) >= 10,
  },
  {
    id: "water-pool",
    title: "みずをためよう",
    text: "かべで入れものを作って、みずをためよう。水面はどうなるかな？",
    premium: false,
    check: (sim) => sim.count(E.WATER) >= 200 && maxRowCount(sim, E.WATER) >= 25,
  },
  {
    id: "oil-floats",
    title: "あぶらは みずに うく？",
    text: "みずの上にあぶらを落としてみよう。あぶらを みずの下に入れたらどうなる？",
    premium: true,
    check: (sim) => stackedPairs(sim, E.OIL, E.WATER) >= 30,
  },
  {
    id: "sand-sinks",
    title: "すなは みずに しずむ？",
    text: "みずの上から すなを落としてみよう。",
    premium: true,
    check: (sim) => stackedPairs(sim, E.WATER, E.SAND) >= 20,
  },
  {
    id: "fire-water",
    title: "ひを みずで 消そう",
    text: "ひに みずをかけると、何が出てくるかな？",
    premium: true,
    check: (sim) => sim.stats.steam >= 10,
  },
  {
    id: "oil-burn",
    title: "あぶらを もやそう",
    text: "あぶらに ひをつけてみよう。みずでは消せるかな？",
    premium: true,
    check: (sim) => sim.stats.oilBurned >= 30,
  },
  {
    id: "ice-melt",
    title: "こおりを とかそう",
    text: "こおりに ひを近づけてみよう。とけた みずは どこへ行く？",
    premium: true,
    check: (sim) => sim.stats.iceMelted >= 10,
  },
  {
    id: "plant",
    title: "たねを 育てよう",
    text: "たねに みずをあげると、草が育つよ。大きな草にしてみよう。",
    premium: true,
    check: (sim) => sim.count(E.PLANT) >= 30,
  },
];
