// 粒子シミュレーション本体（ES module。ブラウザと Node の両方から使う）
// セルの種類ごとに「落ちる・広がる・燃える・溶ける・育つ」のルールを持つ。

export const E = Object.freeze({
  EMPTY: 0,
  WALL: 1,
  SAND: 2,
  WATER: 3,
  OIL: 4,
  FIRE: 5,
  WOOD: 6,
  ICE: 7,
  SEED: 8,
  STEAM: 9,
  PLANT: 10,
  EMBER: 11, // 燃えている木
});

export const MAX_ELEMENT = E.EMBER;

// パレットに並べる要素（順番どおりに表示する）
export const PALETTE = [
  { e: E.SAND, key: "sand", name: "すな", premium: false, hint: "下に落ちて、山になる。水にしずむ" },
  { e: E.WATER, key: "water", name: "みず", premium: false, hint: "横に広がって、たいらになる。火を消す" },
  { e: E.WALL, key: "wall", name: "かべ", premium: false, hint: "動かない。入れものを作ろう" },
  { e: E.OIL, key: "oil", name: "あぶら", premium: true, hint: "水にうく。火がつくと、もえる" },
  { e: E.FIRE, key: "fire", name: "ひ", premium: true, hint: "上にゆらめく。あぶら・木・草にもえうつる" },
  { e: E.WOOD, key: "wood", name: "き", premium: true, hint: "動かない。もえると、はいになる" },
  { e: E.ICE, key: "ice", name: "こおり", premium: true, hint: "火でとける。水をこおらせる" },
  { e: E.SEED, key: "seed", name: "たね", premium: true, hint: "水にふれると、草が育つ" },
  { e: E.EMPTY, key: "eraser", name: "けしゴム", premium: false, hint: "けす" },
];

export const COLORS = {
  [E.EMPTY]: [26, 28, 44],
  [E.WALL]: [96, 98, 112],
  [E.SAND]: [222, 186, 102],
  [E.WATER]: [66, 140, 240],
  [E.OIL]: [126, 92, 44],
  [E.FIRE]: [255, 130, 40],
  [E.WOOD]: [142, 92, 52],
  [E.ICE]: [196, 232, 255],
  [E.SEED]: [120, 180, 70],
  [E.STEAM]: [170, 180, 200],
  [E.PLANT]: [70, 170, 80],
  [E.EMBER]: [255, 90, 30],
};

const FLAMMABLE_CHANCE = {
  [E.OIL]: 0.5,
  [E.WOOD]: 0.04,
  [E.PLANT]: 0.15,
  [E.SEED]: 0.15,
};

function defaultAux(e, rng) {
  switch (e) {
    case E.FIRE:
      return 20 + ((rng() * 30) | 0);
    case E.EMBER:
      return 80 + ((rng() * 80) | 0);
    case E.STEAM:
      return 120 + ((rng() * 120) | 0);
    case E.PLANT:
      return 10;
    default:
      return 0;
  }
}

export class Sim {
  /**
   * @param {number} w 横のセル数
   * @param {number} h 縦のセル数
   * @param {() => number} rng 0 以上 1 未満の乱数（テストでは固定シードを渡す）
   */
  constructor(w, h, rng = Math.random) {
    this.w = w;
    this.h = h;
    this.rng = rng;
    this.cells = new Uint8Array(w * h);
    this.aux = new Uint8Array(w * h); // 火の寿命、蒸気の寿命、草のエネルギー
    this.moved = new Uint8Array(w * h);
    this.frame = 0;
    this.stats = { steam: 0, oilBurned: 0, woodBurned: 0, iceMelted: 0, rain: 0, frozen: 0 };
  }

  idx(x, y) {
    return y * this.w + x;
  }

  inb(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** 範囲外は壁として扱う */
  get(x, y) {
    return this.inb(x, y) ? this.cells[this.idx(x, y)] : E.WALL;
  }

  set(x, y, e, a) {
    if (!this.inb(x, y)) return;
    const i = this.idx(x, y);
    this.cells[i] = e;
    this.aux[i] = a === undefined ? defaultAux(e, this.rng) : a;
  }

  /** 中心 (cx, cy)、半径 r の円に要素を置く。消しゴムと壁は上書き、それ以外は空のセルにだけ置く */
  paint(cx, cy, r, e) {
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (!this.inb(x, y)) continue;
        const i = this.idx(x, y);
        if (e === E.EMPTY || e === E.WALL || this.cells[i] === E.EMPTY) {
          // 粉や液体は少し間引いて、自然な散らばりにする
          if (e !== E.EMPTY && e !== E.WALL && e !== E.WOOD && e !== E.ICE && this.rng() < 0.4) continue;
          this.set(x, y, e);
        }
      }
    }
  }

  clear() {
    this.cells.fill(E.EMPTY);
    this.aux.fill(0);
    this.frame = 0;
    this.stats = { steam: 0, oilBurned: 0, woodBurned: 0, iceMelted: 0, rain: 0, frozen: 0 };
  }

  count(e) {
    let n = 0;
    const c = this.cells;
    for (let i = 0; i < c.length; i++) if (c[i] === e) n++;
    return n;
  }

  _swap(i, j) {
    const c = this.cells;
    const a = this.aux;
    const t = c[i];
    c[i] = c[j];
    c[j] = t;
    const u = a[i];
    a[i] = a[j];
    a[j] = u;
    this.moved[i] = 1;
    this.moved[j] = 1;
  }

  _become(i, e) {
    this.cells[i] = e;
    this.aux[i] = defaultAux(e, this.rng);
    this.moved[i] = 1;
  }

  /** (x, y) から下、または斜め下に落ちる。passable は「通り抜けられる要素か」 */
  _fall(x, y, i, passable) {
    if (passable(this.get(x, y + 1))) {
      this._swap(i, this.idx(x, y + 1));
      return true;
    }
    const d = this.rng() < 0.5 ? -1 : 1;
    for (const dx of [d, -d]) {
      if (passable(this.get(x + dx, y + 1)) && this.get(x + dx, y) !== E.WALL) {
        this._swap(i, this.idx(x + dx, y + 1));
        return true;
      }
    }
    return false;
  }

  /** 液体が横に広がる（最大 dist セル先の空きまで動く） */
  _flow(x, y, i, dist) {
    // 1 フレームに 1 方向だけ試す（両方向を順に試すと、走査順と合わさって決定的な往復になる）
    const dx = this.rng() < 0.5 ? -1 : 1;
    let nx = x;
    for (let k = 1; k <= dist; k++) {
      if (this.get(x + dx * k, y) !== E.EMPTY) break;
      nx = x + dx * k;
    }
    if (nx === x) return false;
    this._swap(i, this.idx(nx, y));
    return true;
  }

  /** 気体が上に昇る */
  _rise(x, y, i, passable) {
    if (this.rng() < 0.9 && passable(this.get(x, y - 1))) {
      this._swap(i, this.idx(x, y - 1));
      return true;
    }
    const d = this.rng() < 0.5 ? -1 : 1;
    for (const dx of [d, -d]) {
      if (passable(this.get(x + dx, y - 1))) {
        this._swap(i, this.idx(x + dx, y - 1));
        return true;
      }
    }
    return this._flow(x, y, i, 1);
  }

  /** 火（または燃えている木）が周りに燃え移り、水で消える。消えたら true */
  _burnAround(x, y, i, isEmber) {
    const around = [
      [x, y - 1],
      [x, y + 1],
      [x - 1, y],
      [x + 1, y],
    ];
    for (const [nx, ny] of around) {
      const t = this.get(nx, ny);
      if (t === E.WATER) {
        const j = this.idx(nx, ny);
        this.stats.steam++;
        if (isEmber) {
          // 燃えている木に水がかかると、木は残り、水は蒸気になる
          this._become(j, E.STEAM);
          this._become(i, E.WOOD);
        } else {
          this._become(i, E.STEAM);
        }
        return true;
      }
    }
    for (const [nx, ny] of around) {
      const t = this.get(nx, ny);
      const chance = FLAMMABLE_CHANCE[t];
      if (chance !== undefined) {
        if (this.rng() < chance) {
          const j = this.idx(nx, ny);
          if (t === E.OIL) this.stats.oilBurned++;
          if (t === E.WOOD) this.stats.woodBurned++;
          this._become(j, t === E.WOOD ? E.EMBER : E.FIRE);
        }
      } else if (t === E.ICE && this.rng() < 0.3) {
        this.stats.iceMelted++;
        this._become(this.idx(nx, ny), E.WATER);
      }
    }
    return false;
  }

  _touchesFuel(x, y) {
    for (const [nx, ny] of [[x, y + 1], [x - 1, y], [x + 1, y], [x, y - 1]]) {
      const t = this.get(nx, ny);
      if (FLAMMABLE_CHANCE[t] !== undefined || t === E.EMBER) return true;
    }
    return false;
  }

  _hasNeighbor(x, y, e) {
    return this.get(x, y - 1) === e || this.get(x, y + 1) === e || this.get(x - 1, y) === e || this.get(x + 1, y) === e;
  }

  _neighborIndex(x, y, e) {
    if (this.get(x, y + 1) === e) return this.idx(x, y + 1);
    if (this.get(x - 1, y) === e) return this.idx(x - 1, y);
    if (this.get(x + 1, y) === e) return this.idx(x + 1, y);
    if (this.get(x, y - 1) === e) return this.idx(x, y - 1);
    return -1;
  }

  /** 1 フレーム進める */
  step() {
    const { w, h, cells, aux, moved, rng } = this;
    moved.fill(0);
    this.frame++;
    const ltr = (this.frame & 1) === 0;
    for (let y = h - 1; y >= 0; y--) {
      for (let k = 0; k < w; k++) {
        const x = ltr ? k : w - 1 - k;
        const i = y * w + x;
        if (moved[i]) continue;
        const e = cells[i];
        switch (e) {
          case E.SAND:
            this._fall(x, y, i, (t) => t === E.EMPTY || t === E.WATER || t === E.OIL || t === E.STEAM);
            break;

          case E.WATER:
            if (this._hasNeighbor(x, y, E.ICE) && rng() < 0.02) {
              this.stats.frozen++;
              this._become(i, E.ICE);
              break;
            }
            if (this._fall(x, y, i, (t) => t === E.EMPTY || t === E.OIL || t === E.STEAM)) break;
            this._flow(x, y, i, 3);
            break;

          case E.OIL:
            if (this._fall(x, y, i, (t) => t === E.EMPTY || t === E.STEAM)) break;
            this._flow(x, y, i, 2);
            break;

          case E.STEAM:
            if (--aux[i] === 0) {
              if (rng() < 0.7) {
                this.stats.rain++;
                this._become(i, E.WATER);
              } else {
                this._become(i, E.EMPTY);
              }
              break;
            }
            this._rise(x, y, i, (t) => t === E.EMPTY || t === E.WATER || t === E.OIL);
            break;

          case E.FIRE:
            if (--aux[i] === 0) {
              this._become(i, E.EMPTY);
              break;
            }
            if (this._burnAround(x, y, i, false)) break;
            if (this._touchesFuel(x, y)) break;
            if (rng() < 0.5) this._rise(x, y, i, (t) => t === E.EMPTY);
            break;

          case E.EMBER:
            if (--aux[i] === 0) {
              this._become(i, rng() < 0.5 ? E.SAND : E.EMPTY);
              break;
            }
            this._burnAround(x, y, i, true);
            break;

          case E.ICE:
            if (this._hasNeighbor(x, y, E.STEAM) && rng() < 0.05) {
              this.stats.iceMelted++;
              this._become(i, E.WATER);
            }
            break;

          case E.SEED: {
            const j = this._neighborIndex(x, y, E.WATER);
            if (j >= 0) {
              this._become(j, E.EMPTY);
              this._become(i, E.PLANT);
              aux[i] = 12;
              break;
            }
            this._fall(x, y, i, (t) => t === E.EMPTY);
            break;
          }

          case E.PLANT: {
            if (aux[i] < 40) {
              const j = this._neighborIndex(x, y, E.WATER);
              if (j >= 0) {
                this._become(j, E.EMPTY);
                aux[i] = Math.min(aux[i] + 10, 40);
              }
            }
            if (aux[i] > 0 && rng() < 0.08) {
              const r = rng();
              const nx = r < 0.7 ? x : r < 0.85 ? x - 1 : x + 1;
              const ny = y - 1;
              if (this.get(nx, ny) === E.EMPTY) {
                const j = this.idx(nx, ny);
                cells[j] = E.PLANT;
                aux[j] = Math.max(aux[i] - 2, 0);
                moved[j] = 1;
                aux[i]--;
              }
            }
            break;
          }

          default:
            break;
        }
      }
    }
  }
}

/** テスト用の固定シード乱数（mulberry32） */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
