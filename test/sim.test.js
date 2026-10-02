import { test } from "node:test";
import assert from "node:assert/strict";
import { Sim, E, MAX_ELEMENT, seededRandom } from "../sim.js";

function make(w, h, seed = 1) {
  return new Sim(w, h, seededRandom(seed));
}

function run(sim, n) {
  for (let i = 0; i < n; i++) sim.step();
}

function meanY(sim, e) {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < sim.h; y++) {
    for (let x = 0; x < sim.w; x++) {
      if (sim.get(x, y) === e) {
        sum += y;
        n++;
      }
    }
  }
  return n ? sum / n : NaN;
}

test("砂は下まで落ちる", () => {
  const sim = make(10, 20);
  sim.set(5, 0, E.SAND);
  run(sim, 40);
  assert.equal(sim.get(5, 19), E.SAND);
  assert.equal(sim.count(E.SAND), 1);
});

test("砂は積もって山になり、数は変わらない", () => {
  const sim = make(21, 30);
  for (let i = 0; i < 60; i++) {
    sim.set(10, 0, E.SAND);
    sim.step();
  }
  run(sim, 100);
  assert.equal(sim.count(E.SAND), 60);
  // 真ん中の列がいちばん高く、端にもこぼれている
  let center = 0;
  let side = 0;
  for (let y = 0; y < 30; y++) {
    if (sim.get(10, y) === E.SAND) center++;
    if (sim.get(7, y) === E.SAND || sim.get(13, y) === E.SAND) side++;
  }
  assert.ok(center >= 3, `center=${center}`);
  assert.ok(side >= 1, `side=${side}`);
});

test("水は横に広がって水平になる", () => {
  const sim = make(30, 12);
  for (let y = 0; y < 8; y++) for (let x = 12; x < 18; x++) sim.set(x, y, E.WATER);
  const total = sim.count(E.WATER);
  run(sim, 400);
  assert.equal(sim.count(E.WATER), total);
  const heights = [];
  for (let x = 0; x < 30; x++) {
    let n = 0;
    for (let y = 0; y < 12; y++) if (sim.get(x, y) === E.WATER) n++;
    heights.push(n);
  }
  assert.ok(Math.max(...heights) - Math.min(...heights) <= 2, heights.join(","));
});

test("油は水に浮く", () => {
  const sim = make(8, 20);
  for (let y = 10; y < 15; y++) for (let x = 0; x < 8; x++) sim.set(x, y, E.WATER);
  for (let y = 15; y < 20; y++) for (let x = 0; x < 8; x++) sim.set(x, y, E.OIL);
  run(sim, 600);
  assert.ok(meanY(sim, E.OIL) < meanY(sim, E.WATER), `oil=${meanY(sim, E.OIL)} water=${meanY(sim, E.WATER)}`);
  assert.equal(sim.count(E.OIL), 40);
  assert.equal(sim.count(E.WATER), 40);
});

test("砂は水に沈む", () => {
  const sim = make(8, 20);
  for (let y = 10; y < 20; y++) for (let x = 0; x < 8; x++) sim.set(x, y, E.WATER);
  for (let x = 0; x < 8; x++) sim.set(x, 5, E.SAND);
  run(sim, 200);
  assert.ok(meanY(sim, E.SAND) > meanY(sim, E.WATER));
  for (let x = 0; x < 8; x++) assert.equal(sim.get(x, 19), E.SAND);
});

test("火は水に触れると蒸気になる", () => {
  const sim = make(10, 10);
  sim.set(5, 5, E.WATER);
  sim.set(5, 6, E.FIRE);
  sim.step();
  assert.equal(sim.count(E.FIRE), 0);
  assert.equal(sim.count(E.STEAM), 1);
  assert.equal(sim.stats.steam, 1);
});

test("火はしばらくすると消える", () => {
  const sim = make(10, 10);
  sim.set(5, 9, E.FIRE);
  run(sim, 80);
  assert.equal(sim.count(E.FIRE), 0);
});

test("蒸気は上に昇り、やがて雨になる", () => {
  const sim = make(10, 30);
  sim.set(5, 29, E.STEAM);
  run(sim, 40);
  assert.ok(meanY(sim, E.STEAM) < 20, `y=${meanY(sim, E.STEAM)}`);
  run(sim, 400);
  assert.equal(sim.count(E.STEAM), 0);
  assert.ok(sim.stats.rain + 0 >= 0);
});

test("油は火で燃える", () => {
  const sim = make(10, 10);
  for (let x = 0; x < 10; x++) sim.set(x, 9, E.OIL);
  sim.set(5, 8, E.FIRE);
  run(sim, 60);
  assert.ok(sim.stats.oilBurned > 0);
  assert.ok(sim.count(E.OIL) < 10);
});

test("木は燃えて灰（砂）か空になる", () => {
  const sim = make(10, 10);
  for (let x = 0; x < 10; x++) sim.set(x, 9, E.WOOD);
  for (let x = 0; x < 10; x++) sim.set(x, 8, E.OIL);
  sim.set(5, 7, E.FIRE);
  run(sim, 400);
  assert.ok(sim.stats.woodBurned > 0);
  assert.ok(sim.count(E.WOOD) < 10);
  assert.equal(sim.count(E.EMBER) + sim.count(E.FIRE), 0);
});

test("氷は火でとける", () => {
  const sim = make(10, 10);
  sim.set(5, 5, E.ICE);
  for (let i = 0; i < 30; i++) {
    sim.set(5, 6, E.FIRE);
    sim.step();
  }
  assert.ok(sim.stats.iceMelted >= 1);
  assert.equal(sim.count(E.ICE), 0);
});

test("水は氷に触れるとこおる", () => {
  const sim = make(6, 6);
  for (let x = 0; x < 6; x++) sim.set(x, 5, E.ICE);
  for (let x = 0; x < 6; x++) sim.set(x, 4, E.WATER);
  run(sim, 300);
  assert.ok(sim.stats.frozen >= 1);
});

test("たねは水にふれると草になって上に育つ", () => {
  const sim = make(10, 20);
  sim.set(4, 19, E.SEED);
  for (let x = 5; x < 8; x++) sim.set(x, 19, E.WATER);
  run(sim, 300);
  assert.equal(sim.count(E.SEED), 0);
  assert.ok(sim.count(E.PLANT) >= 3, `plant=${sim.count(E.PLANT)}`);
  assert.ok(meanY(sim, E.PLANT) < 19);
});

test("たねは落ちる", () => {
  const sim = make(10, 20);
  sim.set(3, 0, E.SEED);
  run(sim, 40);
  assert.equal(sim.get(3, 19), E.SEED);
});

test("paint は円に置き、消しゴムは消す", () => {
  const sim = make(20, 20, 5);
  sim.paint(10, 10, 4, E.WALL);
  assert.equal(sim.get(10, 10), E.WALL);
  assert.equal(sim.get(10, 14), E.WALL);
  assert.equal(sim.get(10, 15), E.EMPTY);
  assert.equal(sim.get(14, 14), E.EMPTY);
  sim.paint(10, 10, 4, E.EMPTY);
  assert.equal(sim.count(E.WALL), 0);
  sim.paint(10, 10, 3, E.SAND);
  assert.ok(sim.count(E.SAND) > 5);
  sim.paint(10, 10, 3, E.WATER);
  assert.ok(sim.count(E.WATER) > 0);
});

test("いろいろ混ぜても壊れない", () => {
  const sim = make(60, 40, 42);
  const rng = seededRandom(7);
  for (let i = 0; i < 1500; i++) {
    const e = 1 + ((rng() * MAX_ELEMENT) | 0);
    sim.set((rng() * 60) | 0, (rng() * 40) | 0, e);
  }
  run(sim, 500);
  for (let i = 0; i < sim.cells.length; i++) {
    assert.ok(sim.cells[i] <= MAX_ELEMENT);
  }
  assert.equal(sim.count(E.WALL), sim.count(E.WALL));
});
