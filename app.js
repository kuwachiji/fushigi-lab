// 画面の制御。ライセンス取得 → プラン判定 → 使える材料・ミッション・機能の出し分け
import { Sim, E, PALETTE, COLORS } from "./sim.js";
import { MISSIONS } from "./missions.js";

// ライセンス API が返す license_type とプランの対応。種類を増やすときはここに足す
const PLANS = {
  free: { label: "無料版", cls: "free", premium: false },
  premium: { label: "有料版", cls: "premium", premium: true },
};

// API が予約している値（どの製品でも同じ意味）
const RESERVED = { no: "none", expired: "expired", lapsed: "lapsed" };

// ライセンスサーバーのベース URL。切り替えるときはここを変える（URL のクエリでは受け取らない）
const LICENSE_API = "https://dev.nobilog.jp";

const STORAGE = {
  token: "fushigi.token", // 学習プラットフォームから受け取ったトークン（sessionStorage: タブを閉じると消える）
  missions: "fushigi.missions",
  note: "fushigi.note",
};

const GRID_W = 160;
const GRID_H = 100;
const FETCH_TIMEOUT_MS = 5000;

const BRUSHES = [
  { r: 1, name: "ほそい", premium: true },
  { r: 3, name: "ふつう", premium: false },
  { r: 6, name: "ふとい", premium: true },
];

// ---------- 保存（Storage は使えないことがあるので必ず try/catch） ----------
function readFrom(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeTo(storage, key, value) {
  try {
    if (value === null || value === undefined) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

// ブラウザに残す設定（ミッション、ノート）
const load = (key) => readFrom(localStorage, key);
const store = (key, value) => writeTo(localStorage, key, value);
// タブを閉じたら消す（トークン）。開き直すときは学習プラットフォームを経由させる
const loadSession = (key) => readFrom(sessionStorage, key);
const storeSession = (key, value) => writeTo(sessionStorage, key, value);

// ---------- URL クエリの受け取り ----------
// 読むのは `token` だけ
(function takeQueryParams() {
  const params = new URLSearchParams(location.search);
  if (!params.has("token")) return;
  storeSession(STORAGE.token, params.get("token"));
  // トークンは URL に残さない（ブックマークや共有で漏れないように）
  history.replaceState(null, "", location.pathname + location.hash);
})();

// ---------- ライセンス取得 ----------
async function fetchLicense(api, token) {
  const base = api.replace(/\/+$/, "");
  const url = `${base}/api/license/?token=${encodeURIComponent(token)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    // ヘッダを付けない単純リクエストにする（preflight を起こさない）
    const res = await fetch(url, { signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* JSON でない応答 */
    }
    return { ok: true, url, status: res.status, json, text };
  } catch (error) {
    return { ok: false, url, error: String(error && error.name === "AbortError" ? "タイムアウト（5 秒）" : error) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- 状態 ----------
let plan = "checking"; // checking | none | error | expired | lapsed | unknown | free | premium
let licenseValue = null;
let selected = E.SAND;
let brush = BRUSHES[1];
let running = true;
let attract = false;
let done = new Set();
let tick = 0;

function features() {
  const usable = plan === "free" || plan === "premium" || plan === "unknown";
  return { usable, premium: plan === "premium" };
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const canvas = $("lab");
const ctx = canvas.getContext("2d");
const off = document.createElement("canvas");
off.width = GRID_W;
off.height = GRID_H;
const offCtx = off.getContext("2d");
const img = offCtx.createImageData(GRID_W, GRID_H);

const sim = new Sim(GRID_W, GRID_H);

// ---------- 描画 ----------
function render(target, source, image, frame) {
  const data = image.data;
  const cells = source.cells;
  const aux = source.aux;
  for (let i = 0; i < cells.length; i++) {
    const e = cells[i];
    const c = COLORS[e];
    let r = c[0];
    let g = c[1];
    let b = c[2];
    // セルごとの固定ノイズで、のっぺりしないようにする
    const noise = ((Math.imul(i, 2654435761) >>> 0) % 21) - 10;
    if (e === E.FIRE || e === E.EMBER) {
      const flick = ((i * 31 + frame * 17) % 23) - 11;
      const life = Math.min(aux[i], 50) / 50;
      r = Math.min(255, r + flick + 20);
      g = Math.min(255, g + life * 90 + flick);
      b = Math.max(0, b + life * 30);
    } else if (e === E.STEAM) {
      const bg = COLORS[E.EMPTY];
      const k = 0.45 + (((i * 13 + frame * 7) % 11) / 11) * 0.2;
      r = bg[0] + (r - bg[0]) * k;
      g = bg[1] + (g - bg[1]) * k;
      b = bg[2] + (b - bg[2]) * k;
    } else if (e === E.WATER || e === E.OIL) {
      const shimmer = ((i * 7 + frame * 3) % 9) - 4;
      r += noise / 2 + shimmer;
      g += noise / 2 + shimmer;
      b += noise / 2 + shimmer;
    } else if (e === E.PLANT) {
      g += ((aux[i] * 3) % 40) - 20 + noise;
    } else if (e !== E.EMPTY) {
      r += noise;
      g += noise;
      b += noise;
    }
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  const octx = target.offCtx;
  octx.putImageData(image, 0, 0);
  const tctx = target.ctx;
  tctx.imageSmoothingEnabled = false;
  tctx.drawImage(target.off, 0, 0, target.canvas.width, target.canvas.height);
}

const mainTarget = { canvas, ctx, off, offCtx };

// ---------- 入力（マウス・タッチ） ----------
let drawing = false;
let last = null;

function toGrid(ev) {
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - rect.left) / rect.width) * GRID_W);
  const y = Math.floor(((ev.clientY - rect.top) / rect.height) * GRID_H);
  return [x, y];
}

function paintLine(from, to) {
  const [x0, y0] = from;
  const [x1, y1] = to;
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= steps; k++) {
    const x = Math.round(x0 + ((x1 - x0) * k) / steps);
    const y = Math.round(y0 + ((y1 - y0) * k) / steps);
    sim.paint(x, y, brush.r, selected);
  }
}

canvas.addEventListener("pointerdown", (ev) => {
  if (!features().usable) {
    showTip("ライセンスがないので、いまは見るだけです。", true);
    return;
  }
  drawing = true;
  canvas.setPointerCapture(ev.pointerId);
  last = toGrid(ev);
  paintLine(last, last);
  ev.preventDefault();
});

canvas.addEventListener("pointermove", (ev) => {
  if (!drawing) return;
  const p = toGrid(ev);
  paintLine(last, p);
  last = p;
  ev.preventDefault();
});

function endDraw() {
  drawing = false;
  last = null;
}
canvas.addEventListener("pointerup", endDraw);
canvas.addEventListener("pointercancel", endDraw);
canvas.addEventListener("pointerleave", () => {
  if (drawing) endDraw();
});

// ---------- パレット・ふで ----------
function showTip(text, warn = false) {
  const tip = $("tip");
  tip.textContent = text;
  tip.classList.toggle("warn", warn);
}

function isLocked(item) {
  const f = features();
  if (!f.usable) return true;
  return item.premium && !f.premium;
}

function renderPalette() {
  const root = $("palette");
  root.innerHTML = "";
  for (const item of PALETTE) {
    const btn = document.createElement("button");
    btn.type = "button";
    const sw = document.createElement("span");
    sw.className = "swatch";
    const c = item.e === E.EMPTY ? [240, 240, 240] : COLORS[item.e];
    sw.style.background = `rgb(${c[0]},${c[1]},${c[2]})`;
    btn.appendChild(sw);
    btn.appendChild(document.createTextNode(item.name));
    if (item.premium) btn.classList.add("premium-item");
    const locked = isLocked(item);
    btn.classList.toggle("locked", locked);
    btn.classList.toggle("selected", item.e === selected && !locked);
    btn.addEventListener("click", () => {
      if (isLocked(item)) {
        showTip(features().usable ? `「${item.name}」は有料版で使えます。` : "ライセンスがないので、いまは見るだけです。", true);
        return;
      }
      selected = item.e;
      showTip(`${item.name}: ${item.hint}`);
      renderPalette();
    });
    root.appendChild(btn);
  }
  // 選択中の材料がロックされたら、砂に戻す
  const cur = PALETTE.find((p) => p.e === selected);
  if (cur && isLocked(cur) && features().usable) {
    selected = E.SAND;
    renderPalette();
  }
}

function renderBrush() {
  const root = $("brush");
  root.innerHTML = "";
  const f = features();
  for (const b of BRUSHES) {
    const btn = document.createElement("button");
    btn.type = "button";
    const locked = b.premium && !f.premium;
    btn.textContent = (locked ? "🔒 " : "") + b.name;
    btn.classList.toggle("locked", locked);
    btn.classList.toggle("selected", b === brush);
    btn.addEventListener("click", () => {
      if (locked) {
        showTip("ふでの太さは有料版で変えられます。", true);
        return;
      }
      brush = b;
      renderBrush();
    });
    root.appendChild(btn);
  }
  if (brush.premium && !f.premium) {
    brush = BRUSHES[1];
    renderBrush();
  }
}

// ---------- 再生・コマ送り・消す・写真 ----------
$("playBtn").addEventListener("click", () => {
  if (!features().premium) {
    showTip("とめる・コマ送りは有料版で使えます。", true);
    return;
  }
  running = !running;
  $("playBtn").textContent = running ? "⏸ とめる" : "▶ うごかす";
});

$("stepBtn").addEventListener("click", () => {
  if (!features().premium) {
    showTip("とめる・コマ送りは有料版で使えます。", true);
    return;
  }
  running = false;
  $("playBtn").textContent = "▶ うごかす";
  sim.step();
});

$("clearBtn").addEventListener("click", () => {
  if (!features().usable) return;
  sim.clear();
});

$("shotBtn").addEventListener("click", () => {
  if (!features().premium) {
    showTip("写真をとるのは有料版で使えます。", true);
    return;
  }
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fushigi-lab-${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
});

// ---------- アトラクトモード（ライセンスなしで眺めるだけ） ----------
function buildAttractScene() {
  sim.clear();
  // 下にお皿、まん中にしきり
  for (let x = 20; x < GRID_W - 20; x++) sim.set(x, GRID_H - 6, E.WALL);
  for (let y = GRID_H - 30; y < GRID_H - 6; y++) {
    sim.set(20, y, E.WALL);
    sim.set(GRID_W - 21, y, E.WALL);
    sim.set(GRID_W >> 1, y, E.WALL);
  }
}

function attractEmit() {
  for (let k = 0; k < 2; k++) {
    sim.set(30 + ((Math.random() * 40) | 0), 0, E.SAND);
    sim.set(95 + ((Math.random() * 40) | 0), 0, E.WATER);
  }
  if (sim.frame % 600 === 0) {
    let filled = 0;
    for (let i = 0; i < sim.cells.length; i++) if (sim.cells[i] !== E.EMPTY) filled++;
    if (filled > sim.cells.length * 0.45) buildAttractScene();
  }
}

// ---------- ミッション ----------
function loadDone() {
  if (!features().premium) return new Set();
  try {
    return new Set(JSON.parse(load(STORAGE.missions) || "[]"));
  } catch {
    return new Set();
  }
}

function saveDone() {
  if (features().premium) store(STORAGE.missions, JSON.stringify([...done]));
}

function visibleMissions() {
  return MISSIONS;
}

function renderMissions() {
  const ul = $("missionList");
  ul.innerHTML = "";
  const f = features();
  for (const m of visibleMissions()) {
    const li = document.createElement("li");
    const locked = m.premium && !f.premium;
    const isDone = done.has(m.id);
    li.classList.toggle("done", isDone);
    li.classList.toggle("locked", locked);
    const mark = document.createElement("span");
    mark.className = "mark";
    mark.textContent = isDone ? "★" : locked ? "🔒" : "☆";
    const body = document.createElement("div");
    body.className = "body";
    const strong = document.createElement("strong");
    strong.textContent = m.title;
    const span = document.createElement("span");
    span.textContent = m.text;
    body.appendChild(strong);
    body.appendChild(span);
    li.appendChild(mark);
    li.appendChild(body);
    ul.appendChild(li);
  }
  $("preview").classList.toggle("hidden", !(f.usable && !f.premium));
  renderCertificate();
}

function checkMissions() {
  const f = features();
  if (!f.usable || attract) return;
  let changed = false;
  for (const m of visibleMissions()) {
    if (done.has(m.id)) continue;
    if (m.premium && !f.premium) continue;
    if (m.check(sim)) {
      done.add(m.id);
      changed = true;
      showTip(`ミッション「${m.title}」クリア！ ★`);
    }
  }
  if (changed) {
    saveDone();
    renderMissions();
  }
}

function renderCertificate() {
  const f = features();
  const all = f.premium && MISSIONS.every((m) => done.has(m.id));
  $("certificate").classList.toggle("hidden", !all);
  if (all) $("certDate").textContent = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
}

// ---------- 有料版プレビュー（あぶらが みずに うく様子をループ再生） ----------
const previewCanvas = $("previewCanvas");
const previewTarget = {
  canvas: previewCanvas,
  ctx: previewCanvas.getContext("2d"),
  off: document.createElement("canvas"),
};
previewTarget.off.width = 60;
previewTarget.off.height = 36;
previewTarget.offCtx = previewTarget.off.getContext("2d");
const previewImg = previewTarget.offCtx.createImageData(60, 36);
const previewSim = new Sim(60, 36);

function resetPreview() {
  previewSim.clear();
  for (let x = 0; x < 60; x++) previewSim.set(x, 35, E.WALL);
  for (let y = 22; y < 35; y++) for (let x = 0; x < 60; x++) previewSim.set(x, y, E.WATER);
  for (let y = 29; y < 35; y++) for (let x = 15; x < 45; x++) previewSim.set(x, y, E.OIL);
  for (let x = 25; x < 35; x++) previewSim.set(x, 2, E.SAND);
}
resetPreview();

// ---------- かんさつノート ----------
const noteEl = $("note");
noteEl.addEventListener("input", () => {
  if (features().premium) store(STORAGE.note, noteEl.value);
});

function renderNote() {
  const f = features();
  noteEl.classList.toggle("hidden", !f.premium);
  $("noteLocked").classList.toggle("hidden", f.premium);
  if (f.premium) noteEl.value = load(STORAGE.note) || "";
}

// ---------- プラン表示 ----------
const NOTICES = {
  checking: { text: "ライセンスを確認しています…", cls: "" },
  none: { text: "ライセンスがありません。学習プラットフォームの教材リンクから開いてください。", cls: "bad" },
  error: { text: "ライセンスを確認できませんでした。接続先が違う、この教材のオリジンがライセンスサーバーで許可されていない、ネットワークの問題、などが考えられます。", cls: "bad" },
  expired: { text: "このリンクは使えなくなりました。学習プラットフォームから開き直してください。", cls: "bad" },
  lapsed: { text: "ライセンスの期間が終了しました。先生に聞いてみてください。", cls: "bad" },
  unknown: { text: "", cls: "" },
  free: { text: "無料版: すな・みず・かべで実験できます。あぶら・ひ・こおり・たね と 6 つのミッションは有料版で使えます。", cls: "" },
  premium: { text: "有料版: ぜんぶの材料とミッション、かんさつノート、写真が使えます。", cls: "premium" },
};

const BADGES = {
  checking: ["確認中…", ""],
  none: ["ライセンスなし", "bad"],
  error: ["確認できません", "bad"],
  expired: ["無効", "bad"],
  lapsed: ["期間終了", "bad"],
  unknown: ["不明なプラン", "free"],
};

function setPlan(next) {
  plan = next;
  const f = features();
  const badge = $("planBadge");
  if (PLANS[plan]) {
    badge.textContent = PLANS[plan].label;
    badge.className = `badge ${PLANS[plan].cls}`;
  } else {
    const [label, cls] = BADGES[plan];
    badge.textContent = label;
    badge.className = `badge ${cls}`;
  }

  const n = NOTICES[plan];
  const notice = $("notice");
  let text = n.text;
  if (plan === "unknown") text = `この教材が知らないライセンスの種類「${licenseValue}」です。無料版として動きます。`;
  notice.textContent = text;
  notice.className = `notice ${n.cls}`;
  notice.classList.toggle("hidden", !text);

  const wasAttract = attract;
  attract = !f.usable;
  if (attract && !wasAttract) buildAttractScene();
  if (!attract && wasAttract) sim.clear();
  $("stage").classList.toggle("locked", attract);
  const overlay = $("overlay");
  overlay.classList.toggle("hidden", !attract);
  overlay.textContent = plan === "checking" ? "ライセンスを確認しています…" : "見るだけモード：ライセンスがあると、自分で実験できます";

  if (!f.premium) {
    running = true;
    $("playBtn").textContent = "⏸ とめる";
  }
  done = loadDone();
  renderPalette();
  renderBrush();
  renderMissions();
  renderNote();
}

$("recheckBtn").addEventListener("click", checkLicense);

// ---------- ライセンス確認の本体 ----------
async function checkLicense() {
  const token = loadSession(STORAGE.token);
  licenseValue = null;
  setPlan("checking");
  if (!token) {
    setPlan("none");
    return;
  }
  const result = await fetchLicense(LICENSE_API, token);
  if (!result.ok) {
    // CORS で拒否されると理由は JavaScript に渡らない。DevTools の Network / Console で確認する
    console.warn(`ライセンス確認に失敗: GET ${result.url}`, result.error);
    setPlan("error");
    return;
  }
  const value = result.json && typeof result.json.license === "string" ? result.json.license : null;
  licenseValue = value;
  if (value === null || RESERVED[value] === "none") setPlan("none");
  else if (RESERVED[value]) setPlan(RESERVED[value]);
  else if (PLANS[value]) setPlan(value);
  else setPlan("unknown");
}

// ---------- メインループ ----------
function frame() {
  tick++;
  if (running) {
    sim.step();
    if (attract) attractEmit();
  }
  render(mainTarget, sim, img, sim.frame);

  if (!$("preview").classList.contains("hidden")) {
    previewSim.step();
    if (previewSim.frame % 420 === 0) resetPreview();
    render(previewTarget, previewSim, previewImg, previewSim.frame);
  }

  if (tick % 20 === 0) checkMissions();
  requestAnimationFrame(frame);
}

checkLicense();
requestAnimationFrame(frame);
