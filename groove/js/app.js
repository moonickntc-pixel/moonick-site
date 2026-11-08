import * as M from "./model.js";
import { createKit, createTransport, rememberedKit } from "./audio.js";

const kit = createKit();
const transport = createTransport(kit);

const DRAFT_KEY = "drumgrid-draft";

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return M.fromQuery(raw.startsWith("?") ? raw : `?${raw}`);
  } catch {
    return null;
  }
}

function loadInitialGroove() {
  const search = location.search || "";
  if (M.queryHasGroove(search)) return M.fromQuery(search);
  return readDraft() || M.fromQuery(search);
}

function saveDraft(query) {
  try {
    localStorage.setItem(DRAFT_KEY, query);
  } catch {
    /* private mode or a full disk; the page still works */
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

const state = {
  groove: loadInitialGroove(),
  past: [],
  future: [],
  abcDirty: false,
  abcOpen: false,
  permOpen: false,
  perm: {
    kind: "none",
    sections: new Set([0, 1, 2, 3, 4]),
    simplify: false,
    accent: false,
    diddles: false,
  },
  advanced: false,
  speed: { on: false, bpm: 5, minutes: 2, keep: true, base: null },
  rotate: "1",
  mixedWarned: {},
  suppressClick: false,
};

const $ = (id) => document.getElementById(id);
const menu = $("menu");
const popover = $("popover");
const modal = $("modal");

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.hidden = true;
  }, 2400);
}

function commit(next, { history = true } = {}) {
  if (history) {
    state.past.push(M.cloneGroove(state.groove));
    if (state.past.length > 80) state.past.shift();
    state.future = [];
  }
  state.groove = next;
  state.abcDirty = false;
  paint();
  writeUrl();
}

function undo() {
  if (!state.past.length) return;
  state.future.push(M.cloneGroove(state.groove));
  state.groove = state.past.pop();
  state.perm.kind = "none";
  state.abcDirty = false;
  paint();
  writeUrl();
}

function redo() {
  if (!state.future.length) return;
  state.past.push(M.cloneGroove(state.groove));
  state.groove = state.future.pop();
  state.abcDirty = false;
  paint();
  writeUrl();
}

function writeUrl() {
  const q = toQuery();
  history.replaceState(null, "", `${location.pathname}?${q}`);
  saveDraft(q);
}

let urlTimer = 0;
function scheduleUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(writeUrl, 180);
}

function toQuery() {
  return M.toQuery(state.groove, { viewMode: document.body.classList.contains("viewing") });
}

function sourceGroove() {
  if (state.perm.kind === "none") return state.groove;
  return M.buildPermutation(state.groove, {
    kind: state.perm.kind,
    sections: [...state.perm.sections],
    simplify: state.perm.simplify,
    accentGrid: state.perm.accent,
    diddles: state.perm.diddles,
  });
}

function paint() {
  document.body.classList.toggle("viewing", state.groove.viewMode);
  paintChrome();
  paintGrid();
  paintBanner();
  scheduleNotation();
}

function paintChrome() {
  const g = state.groove;
  $("timeFrac").innerHTML = `<sup>${g.top}</sup>/<sub>${g.bottom}</sub>`;
  document.querySelectorAll("#divisionBtns .rail-btn").forEach((btn) => {
    btn.classList.toggle("on", Number(btn.dataset.div) === g.division);
  });
  document.querySelectorAll(".metro button[data-metro]").forEach((btn) => {
    btn.classList.toggle("on", Number(btn.dataset.metro) === g.metronome);
  });
  $("advancedBtn").classList.toggle("on", state.advanced);
  $("viewBtn").innerHTML = g.viewMode ? "回到<br>編輯" : "只看<br>樂譜";
  $("undoBtn").disabled = state.past.length === 0;
  $("redoBtn").disabled = state.future.length === 0;
  if (document.activeElement !== $("tempo") && document.activeElement !== $("tempoNum")) {
    $("tempo").value = g.tempo;
    $("tempoNum").value = g.tempo;
  }
  if (document.activeElement !== $("swing")) $("swing").value = g.swing;
  $("swingOut").textContent = `${g.swing}%`;
  if (document.activeElement !== $("title")) $("title").value = g.title;
  if (document.activeElement !== $("author")) $("author").value = g.author;
  if (document.activeElement !== $("comments")) $("comments").value = g.comments;
  $("legendBtn").classList.toggle("on", g.showLegend);
  $("legend").hidden = !g.showLegend;
  if (g.showLegend) $("legend").innerHTML = legendHtml();
  const dots = "●".repeat(g.showToms) + "○".repeat(3 - g.showToms);
  $("tomDots").textContent = dots;
  const quarters = g.measures * g.top * (4 / g.bottom);
  const seconds = (quarters * 60) / g.tempo;
  $("playMeta").textContent = `${g.measures} bar${g.measures > 1 ? "s" : ""} · ${seconds.toFixed(1)}s`;
  document.querySelectorAll("[data-kit]").forEach((btn) => btn.classList.toggle("on", btn.dataset.kit === kit.current));
  $("loopBtn").classList.toggle("on", transport.looping);
  $("playBtn").classList.toggle("playing", transport.playing);
  $("playIcon").innerHTML = transport.playing
    ? '<rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/>'
    : '<path d="M8 5v14l11-7z" fill="currentColor"/>';
}

function legendHtml() {
  const items = [
    ["×", "Closed hi-hat"],
    ["×o", "開"],
    [">×", "Accent"],
    ["◉", "Ride"],
    ["◆", "Ride bell"],
    ["✱", "Crash"],
    ["⌂", "Cowbell"],
    ["●", "Snare / kick / tom"],
    [">", "Snare accent"],
    ["( )", "幽靈音"],
    ["○", "Rim-shot"],
    ["×", "Cross-stick"],
    ["z", "Buzz"],
    ["ø", "半開"],
    ["o", "開"],
    ["+", "開完後閉合 / 只關沒打到"],
    ["×o", "腳踩打開"],
    ["♫", "Flam"],
    ["××", "Drag"],
    ["x", "Hi-hat foot"],
  ];
  return items.map(([mark, name]) => `<div><b>${mark}</b> ${name}</div>`).join("");
}

function paintBanner() {
  const banner = $("banner");
  if (state.perm.kind === "none") {
    banner.hidden = true;
    return;
  }
  const exercise = sourceGroove();
  banner.hidden = false;
  banner.textContent =
    exercise.measures > M.MAX_MEASURES
      ? `This ${state.perm.kind} permutation is ${exercise.measures} measures, so the chart and playback use the full exercise while the grid keeps your groove. Turn sections off or choose Edit this exercise after it fits in ${M.MAX_MEASURES} bars.`
      : `Playback and the chart are the ${state.perm.kind} permutation (${exercise.measures} bars from your first measure). The grid is still your groove until you choose Edit this exercise.`;
}

function paintGrid() {
  const g = state.groove;
  const npm = M.notesPerMeasure(g.division, g.top, g.bottom);
  const perBeat = M.notesPerBeat(g.division, g.bottom);
  const group = M.groupSize(g.division, g.top, g.bottom);
  const showStick = g.showStickings;
  const rows = [
    ["hh", "Hi-hat", true],
    ["tom1", "通鼓 1", g.showToms >= 1],
    ["tom2", "通鼓 2", g.showToms >= 2],
    ["snare", "Snare", true],
    ["tom3", "落地通鼓", g.showToms >= 3],
    ["kick", "Kick", true],
  ].filter((row) => row[2]);
  $("grid").dataset.density = String(perBeat);
  const mixNote =
    perBeat === 12
      ? "混合 12：每拍 12 點。藍線是 16 分音符（每 3 點），金線是 8 分三連音（每 4 點）。"
      : perBeat === 24
        ? "混合 24：每拍 24 點。藍線是六連音（每 4 點），金線是八連音（每 3 點）。16 分音符每 6 點，8 分三連音每 8 點。"
        : "";
  let html = mixNote ? `<p class="mix-key">${mixNote}</p>` : "";
  html += '<div class="editor-row"><div class="measures">';
  for (let m = 0; m < g.measures; m++) {
    const labels = [`<div class="lyric-spacer">歌詞</div>`, `<div class="beat-spacer"></div>`];
    if (showStick) labels.push(`<button type="button" class="stick-label" data-label="sticking" data-m="${m}">Stickings</button>`);
    for (const [inst, name, shown] of rows) {
      const muted = g.mute[inst][m] ? " muted" : "";
      const hidden = shown ? "" : " slot-hidden";
      labels.push(`<button type="button" class="${hidden}${muted}" data-label="${inst}" data-m="${m}">${name}</button>`);
    }
    let cols = "";
    for (let s = 0; s < npm; s++) {
      const i = m * npm + s;
      const pos = s % perBeat;
      const beatHead = pos === 0 ? Math.floor(s / perBeat) + 1 : "";
      const lyric = escapeAttr((g.lyrics && g.lyrics[i]) || "");
      let cells = `<input class="lyric" data-i="${i}" value="${lyric}" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Lyric ${i + 1}" />`;
      cells += `<div class="beat-no">${beatHead}</div>`;
      if (showStick) cells += cellHtml("sticking", i, g.sticking[i], true);
      for (const [inst, , shown] of rows) {
        cells += cellHtml(inst, i, g[inst][i], shown);
      }
      cols += `<div class="col ${pipClass(perBeat, pos)}" data-col="${i}">${cells}</div>`;
      if ((s + 1) % group === 0 && s !== npm - 1) cols += '<div class="group-gap"></div>';
    }
    const lineTop = 48 + 28 + (showStick ? 40 : 0);
    const cellH = perBeat >= 24 ? 40 : perBeat >= 12 ? 48 : 58;
    const tracks = rows
      .map((_, index) => `<i class="track" style="top:${lineTop + index * cellH + cellH / 2}px"></i>`)
      .join("");
    html += `<section class="measure">
      <span class="measure-no">${m + 1}</span>
      ${g.measures > 1 ? `<button type="button" class="close-measure" data-action="close-measure" data-m="${m}" aria-label="Remove measure ${m + 1}">×</button>` : ""}
      <div class="staff-row">
        <div class="labels">${labels.join("")}</div>
        <div class="columns">
          ${tracks}
          ${cols}
        </div>
      </div>
    </section>`;
  }
  html += `</div>`;
  if (g.measures < M.MAX_MEASURES) {
    html += '<button type="button" class="add-measure" data-action="add-measure" aria-label="Add measure">+</button>';
  }
  html += `</div><p class="hint">點格子寫音符。右鍵或按「進階」可以選重音、幽靈音、Rim-shot、半開、開完後閉合、只關沒打到、腳踩打開、Buzz。每一格上方的空格可以打歌詞，中文或英文都行。混合 12 是每拍 12 點，混合 24 是每拍 24 點。</p>`;
  $("grid").innerHTML = html;
  requestAnimationFrame(fitWritingArea);
}

function fitWritingArea() {
  const grid = $("grid");
  const toolbar = $("toolbar");
  const col = grid && grid.querySelector(".col");
  if (!grid || !toolbar || !col || document.body.classList.contains("viewing")) return;
  const density = Number(grid.dataset.density || 4);
  const base = density >= 24 ? 40 : density >= 12 ? 48 : 58;
  grid.style.setProperty("--cell-h", `${base}px`);
  const rowCells = [...col.children].filter((el) => el.classList.contains("cell") && !el.classList.contains("slot-hidden"));
  if (!rowCells.length) return;
  const slack = window.innerHeight - toolbar.getBoundingClientRect().bottom;
  if (slack > 20 && window.innerWidth > 520) {
    const next = Math.min(128, base + slack / rowCells.length);
    grid.style.setProperty("--cell-h", `${Math.round(next)}px`);
  }
  grid.querySelectorAll(".columns").forEach((columns) => {
    const sample = columns.querySelector(".cell:not(.slot-hidden)");
    if (!sample) return;
    const h = sample.getBoundingClientRect().height;
    columns.querySelectorAll(".track").forEach((track, index) => {
      track.style.top = `${sample.offsetTop + index * h + h / 2}px`;
    });
  });
}

function escapeAttr(value) {
  return String(value).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
}

function pipClass(perBeat, pos) {
  if (perBeat === 12) {
    const sixteenth = pos % 3 === 0;
    const triplet = pos % 4 === 0;
    if (sixteenth && triplet) return "pip-both";
    if (sixteenth) return "pip-16";
    if (triplet) return "pip-3";
  }
  if (perBeat === 24) {
    const sextuplet = pos % 4 === 0;
    const octuplet = pos % 3 === 0;
    if (sextuplet && octuplet) return "pip-both";
    if (sextuplet) return "pip-6";
    if (octuplet) return "pip-8";
  }
  return "";
}

function cellHtml(inst, index, value, shown) {
  const on = value ? `on ${value}` : "off";
  const hidden = shown ? "" : " slot-hidden";
  return `<button type="button" class="cell ${inst} ${on}${hidden}" data-inst="${inst}" data-i="${index}" aria-label="${inst} ${value || "off"}">${markHtml(inst, value, index)}</button>`;
}

function markHtml(inst, value, index) {
  if (inst === "sticking") {
    if (!value) return "·";
    if (value === "C") return M.countSyllable(state.groove, index);
    if (value === "RL") return "R/L";
    return value;
  }
  if (inst === "hh") {
    const glyph = {
      null: "×",
      normal: "×",
      half: "×",
      open: "×",
      closed_plus: "×",
      foot_only: "+",
      accent: "›",
      crash: "✱",
      crash_tie: "✱",
      crash_roll: "✱",
      ride: "◉",
      ride_bell: "◆",
      cow_bell: "⌂",
      stacker: "≡",
      click: "○",
      click_accent: "●",
    }[value || null];
    const mod = { half: "ø", open: "o", closed_plus: "+", crash_tie: "—", crash_roll: "∿" }[value] || "";
    return `<span class="mark">${glyph || "×"}</span>${mod ? `<i class="hat-mod">${mod}</i>` : ""}`;
  }
  if (inst === "snare") {
    const glyph = { xstick: "×", buzz: "z", flam: "♫", drag: "××", accent: "›" }[value] || "";
    const paren = value === "ghost" ? `<i class="ghost-paren left">(</i><i class="ghost-paren right">)</i>` : "";
    return `<span class="head"></span><span class="mark">${glyph}</span>${paren}`;
  }
  if (inst === "kick") {
    const splash = value === "splash" || value === "both" || value === "foot_open";
    const mod = value === "foot_open" ? `<i class="hat-mod">o</i>` : "";
    return `<span class="head"></span><span class="mark">${splash ? "×" : ""}</span>${mod}`;
  }
  return `<span class="head"></span><span class="mark"></span>`;
}

let noteTimer = 0;
function scheduleNotation() {
  clearTimeout(noteTimer);
  noteTimer = setTimeout(renderNotation, 30);
}

function renderNotation() {
  const g = sourceGroove();
  const text = state.abcDirty ? $("abc").value : M.toAbc(g);
  if (!state.abcDirty) $("abc").value = text;
  const host = $("sheet");
  host.classList.add("wide");
  const width = Math.max(280, $("sheetWrap").clientWidth - 16);
  const roomy = g.division <= 16;
  const narrow = window.innerWidth <= 520;
  const scale = narrow
    ? roomy ? 1.18 : g.division >= 48 ? 0.92 : 1.02
    : roomy ? 1.72 : g.division >= 48 ? 1.2 : 1.4;
  try {
    const tunes = window.ABCJS.renderAbc("sheet", text, {
      add_classes: true,
      accentAbove: true,
      staffwidth: width,
      paddingleft: 0,
      paddingright: 0,
      scale,
      wrap: {
        minSpacing: narrow ? (roomy ? 1.5 : 1.1) : roomy ? 3.4 : 1.8,
        maxSpacing: narrow ? (roomy ? 6 : 2.8) : roomy ? 34 : 6,
        preferredMeasuresPerLine: 1,
      },
      selectionColor: "#bdebdd",
    });
    const warnings = (tunes || [])
      .flatMap((t) => t.warnings || [])
      .map((w) => String(w).replace(/<[^>]+>/g, ""));
    $("warnings").hidden = warnings.length === 0;
    $("warnings").textContent = warnings.join("\n");
  } catch (error) {
    $("warnings").hidden = false;
    $("warnings").textContent = `The chart could not be drawn. ${error.message || error}`;
  }
  enlargeNoteheads();
  if (!state.abcDirty) paintRockschoolMarks(sourceGroove());
  requestAnimationFrame(fitWritingArea);
}

function enlargeNoteheads() {
  const svg = document.querySelector("#sheet svg");
  if (!svg) return;
  svg.querySelectorAll(".abcjs-notehead").forEach((path) => {
    const box = path.getBBox();
    if (!box.width || !box.height) return;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const drawn = path.getAttribute("d") || "";
    const cross = drawn.includes("l ");
    const scale = cross ? 1.28 : 1.08;
    if (cross) path.classList.add("is-cross");
    path.setAttribute("transform", `translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`);
  });
  revealStaffTop(svg);
}

function paintRockschoolMarks(groove) {
  const svg = document.querySelector("#sheet svg");
  if (!svg) return;
  const marks = M.staffMarks(groove);
  const notes = [...svg.querySelectorAll("g.abcjs-note")].filter(
    (note) => !note.classList.contains("abcjs-grace") && !note.closest(".abcjs-grace")
  );
  if (marks.length !== notes.length) return;
  notes.forEach((note, index) => paintNoteMarks(note, marks[index]));
  revealStaffTop(svg);
}

function paintNoteMarks(note, mark) {
  const heads = [...note.querySelectorAll(".abcjs-notehead")];
  heads.forEach((head) => {
    const name = head.getAttribute("data-name");
    const spec = name && mark.heads[name];
    if (!spec) return;
    const box = headBox(head);
    if (spec.hide) {
      head.style.display = "none";
      if (heads.length === 1) {
        [...note.children].forEach((el) => {
          if (!el.classList.contains("rs-mark")) el.style.display = "none";
        });
      }
    }
    if (spec.ghost) parenthesis(note, box);
    if (spec.rim) ring(note, box.x, box.y, box.rx * 1.15, box.ry * 1.2);
    if (spec.buzz) buzzMark(note, box);
    if (spec.footOpen || spec.open) circleAbove(note, box, false);
    if (spec.half) circleAbove(note, box, true);
    if (spec.plus) plusMark(note, box.x - (spec.hide ? 0 : 0.3), spec.hide ? box.y : box.top - 3.6, spec.hide ? 2.7 : 2.35);
    if (spec.tie) tieMark(note, box);
    if (spec.roll) rollMark(note, box);
  });
  if (mark.floatPlus) {
    const anchor = heads[0] ? headBox(heads[0]) : null;
    const y = staffHatY(note);
    if (anchor && y != null) plusMark(note, anchor.x, y, 2.4);
  }
}

function headBox(head) {
  const box = head.getBBox();
  const scale = head.classList.contains("is-cross") ? 1.28 : 1.08;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  return {
    x,
    y,
    rx: (box.width / 2) * scale,
    ry: (box.height / 2) * scale,
    top: y - (box.height / 2) * scale,
  };
}

function staffHatY(note) {
  const wrap = note.closest(".abcjs-staff-wrapper");
  const staff = wrap && wrap.querySelector(".abcjs-staff");
  if (!staff) return null;
  const ys = [...staff.querySelectorAll("path")].map((path) => path.getBBox().y).sort((a, b) => a - b);
  if (ys.length < 2) return null;
  const space = (ys[ys.length - 1] - ys[0]) / (ys.length - 1);
  return ys[0] - space * 0.46;
}

function svgEl(parent, name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  el.setAttribute("class", "rs-mark");
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  parent.appendChild(el);
  return el;
}

function parenthesis(parent, box) {
  const gap = box.rx + 2.5;
  const ry = Math.max(box.ry + 2.1, 5.2);
  const bow = 3.5;
  svgEl(parent, "path", {
    d: `M ${box.x - gap} ${box.y - ry} C ${box.x - gap - bow} ${box.y - ry * 0.2} ${box.x - gap - bow} ${box.y + ry * 0.2} ${box.x - gap} ${box.y + ry}`,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.05",
    "stroke-linecap": "round",
  });
  svgEl(parent, "path", {
    d: `M ${box.x + gap} ${box.y - ry} C ${box.x + gap + bow} ${box.y - ry * 0.2} ${box.x + gap + bow} ${box.y + ry * 0.2} ${box.x + gap} ${box.y + ry}`,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "1.05",
    "stroke-linecap": "round",
  });
}

function ring(parent, cx, cy, rx, ry) {
  svgEl(parent, "ellipse", {
    cx,
    cy,
    rx,
    ry,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "0.9",
  });
}

function circleAbove(parent, box, slash) {
  const r = 3.05;
  const cx = box.x - 0.35;
  const cy = box.top - r - 0.45;
  ring(parent, cx, cy, r, r);
  if (!slash) return;
  svgEl(parent, "line", {
    x1: cx - r * 0.92,
    y1: cy + r * 0.92,
    x2: cx + r * 0.92,
    y2: cy - r * 0.92,
    stroke: "currentColor",
    "stroke-width": "1.15",
    "stroke-linecap": "round",
  });
}

function plusMark(parent, x, y, arm) {
  svgEl(parent, "line", {
    x1: x - arm,
    y1: y,
    x2: x + arm,
    y2: y,
    stroke: "currentColor",
    "stroke-width": "0.95",
    "stroke-linecap": "round",
  });
  svgEl(parent, "line", {
    x1: x,
    y1: y - arm,
    x2: x,
    y2: y + arm,
    stroke: "currentColor",
    "stroke-width": "0.95",
    "stroke-linecap": "round",
  });
}

function buzzMark(parent, box) {
  const stem = parent.querySelector(".abcjs-stem");
  let x = box.x + box.rx + 1;
  let y = box.y;
  if (stem) {
    const b = stem.getBBox();
    x = b.x + b.width + 0.4;
    y = b.y + b.height * 0.62;
  }
  const text = svgEl(parent, "text", {
    x,
    y,
    fill: "currentColor",
    "font-size": "8.5",
    "font-family": "Times New Roman, serif",
    "font-style": "italic",
  });
  text.textContent = "z";
}

function tieMark(parent, box) {
  const x = box.x + box.rx + 0.4;
  const y = box.y;
  svgEl(parent, "path", {
    d: `M ${x} ${y} C ${x + 5} ${y - 3.4} ${x + 12} ${y - 3.4} ${x + 16} ${y - 0.4}`,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "0.85",
    "stroke-linecap": "round",
  });
}

function rollMark(parent, box) {
  const x = box.x + box.rx + 1.2;
  const y = box.y - 0.4;
  let d = `M ${x} ${y}`;
  for (let i = 0; i < 3; i++) d += ` q 1.7 -2.3 3.4 0 q 1.7 2.3 3.4 0`;
  svgEl(parent, "path", {
    d,
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "0.9",
    "stroke-linecap": "round",
  });
}

function revealStaffTop(svg) {
  const box = svg.viewBox && svg.viewBox.baseVal;
  const widthAttr = parseFloat(svg.getAttribute("width")) || 0;
  const heightAttr = parseFloat(svg.getAttribute("height")) || 0;
  const x = box && box.width ? box.x : 0;
  const y = box && box.height ? box.y : 0;
  const w = box && box.width ? box.width : widthAttr;
  const h = box && box.height ? box.height : heightAttr;
  if (w && h) {
    const frame = svg.getBoundingClientRect();
    if (frame.width && frame.height) {
      const scaleY = h / frame.height;
      let above = 0;
      let below = 0;
      svg.querySelectorAll("path, text, line, rect, use").forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        above = Math.max(above, frame.top - rect.top);
        below = Math.max(below, rect.bottom - frame.bottom);
      });
      const padTop = (above + 10) * scaleY;
      const padBottom = (below + 6) * scaleY;
      if (padTop >= 0.5 || padBottom >= 0.5) {
        svg.setAttribute("viewBox", `${x} ${y - padTop} ${w} ${h + padTop + padBottom}`);
        if (heightAttr) svg.setAttribute("height", String(heightAttr * ((h + padTop + padBottom) / h)));
      }
    }
  }
  // The phone sheet scrolls sideways, so overflow-y cannot stay visible.
  // Size the box to the painted staff or the bottom lines get clipped.
  const sheet = svg.closest("#sheet");
  if (!sheet) return;
  const svgRect = svg.getBoundingClientRect();
  let bottom = svgRect.bottom;
  svg.querySelectorAll(".abcjs-staff path").forEach((line) => {
    bottom = Math.max(bottom, line.getBoundingClientRect().bottom);
  });
  const painted = Math.ceil(bottom - sheet.getBoundingClientRect().top) + 4;
  if (painted > 0) sheet.style.minHeight = `${painted}px`;
}

function buildLoop({ first, elapsed }) {
  let tempo = state.groove.tempo;
  if (state.speed.on) {
    if (state.speed.base == null) state.speed.base = tempo;
    const windowSec = Math.max(1, state.speed.minutes) * 60;
    const steps = state.speed.keep ? Math.floor(elapsed / windowSec) : elapsed >= windowSec ? 1 : 0;
    tempo = Math.min(M.MAX_TEMPO, state.speed.base + steps * state.speed.bpm);
    if (tempo !== state.groove.tempo) {
      state.groove.tempo = tempo;
      $("tempo").value = tempo;
      $("tempoNum").value = tempo;
      $("playMeta").textContent = `${state.groove.measures} bar${state.groove.measures > 1 ? "s" : ""} · ${((state.groove.measures * state.groove.top * (4 / state.groove.bottom) * 60) / tempo).toFixed(1)}s`;
    }
  }
  const g = M.cloneGroove(sourceGroove());
  g.tempo = tempo;
  let offset = g.offset;
  if (g.offset === "rotate") {
    if (!first) state.rotate = M.nextRotateOffset(g.division, state.rotate);
    offset = state.rotate;
  } else state.rotate = "1";
  const solo = g.metronomeSolo;
  let hits = M.hitsForGroove(g, { solo });
  const rate = g.metronome || (solo ? 4 : 0);
  if (rate) hits = hits.concat(M.metronomeHits(g, { offset, rate }));
  hits.sort((a, b) => a.time - b.time);
  const spq = 60 / tempo;
  const slotTimes = [];
  for (let i = 0; i < g.hh.length; i++) {
    slotTimes.push((i * (4 / g.division) + M.swingExtraQuarters(i, g.division, g.swing)) * spq);
  }
  let duration = g.measures * g.top * (4 / g.bottom) * spq;
  let countIn = 0;
  if (first && g.countIn) {
    const intro = M.emptyGroove({ top: g.top, bottom: g.bottom, division: g.division, measures: 1, tempo, swing: 0 });
    const introHits = M.metronomeHits(intro, { offset, rate: rate || 4 });
    const introDur = g.top * (4 / g.bottom) * spq;
    hits = [...introHits, ...hits.map((hit) => ({ ...hit, time: hit.time + introDur }))];
    slotTimes.forEach((_, i) => {
      slotTimes[i] += introDur;
    });
    countIn = introDur;
    duration += introDur;
  }
  return { hits, duration, countIn, slotTimes };
}

function setSampleStatus(text) {
  const el = $("sampleStatus");
  if (!el) return;
  el.hidden = !text;
  el.textContent = text || "";
}

async function togglePlay() {
  if (transport.playing) {
    transport.stop();
    paintChrome();
    return;
  }
  kit.ensure();
  if (!kit.has(kit.current)) setSampleStatus("載入音色中");
  try {
    await kit.load(kit.current);
    state.speed.base = state.groove.tempo;
    state.rotate = "1";
    await transport.toggle(buildLoop);
    setSampleStatus("");
  } catch {
    setSampleStatus("音色載入失敗");
  }
  paintChrome();
}

async function chooseKit(id) {
  if (kit.current === id && kit.has(id)) return;
  if (!kit.has(id)) setSampleStatus("載入音色中");
  paintChrome();
  try {
    await kit.select(id);
    setSampleStatus("");
  } catch {
    setSampleStatus("音色載入失敗");
  }
  paintChrome();
}

transport.onFrame(({ playing, slot }) => {
  $("playBtn").classList.toggle("playing", playing);
  $("playIcon").innerHTML = playing
    ? '<rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/>'
    : '<path d="M8 5v14l11-7z" fill="currentColor"/>';
  document.querySelectorAll(".col.now").forEach((el) => el.classList.remove("now"));
  const heard = sourceGroove();
  const sameGrid = heard.division === state.groove.division && heard.hh.length === state.groove.hh.length;
  if (slot >= 0 && sameGrid) {
    const col = document.querySelector(`.col[data-col="${slot}"]`);
    if (col) col.classList.add("now");
  }
});

async function preview(inst, value) {
  if (!value || inst === "sticking") return;
  kit.ensure();
  if (!kit.has(kit.current)) setSampleStatus("載入音色中");
  try {
    await kit.load(kit.current);
    setSampleStatus("");
  } catch {
    setSampleStatus("音色載入失敗");
    return;
  }
  const g = M.emptyGroove({ division: 16, measures: 1 });
  g.showToms = 3;
  g[inst][0] = value;
  const when = kit.ensure().currentTime + 0.04;
  for (const hit of M.hitsForGroove(g)) kit.play(hit.inst, hit.vel, when + hit.time);
}

function setCell(inst, index, mode) {
  const g = state.groove;
  let value = g[inst][index];
  if (mode === "off") value = null;
  else if (mode === "on") value = defaultOn(inst);
  else if (inst === "sticking") value = M.cycleSticking(value);
  else value = value ? null : defaultOn(inst);
  const next = M.cloneGroove(g);
  next[inst][index] = value;
  if (value && inst === "sticking") next.showStickings = true;
  if (state.perm.kind !== "none") state.perm.kind = "none";
  commit(next);
  preview(inst, value);
}

function defaultOn(inst) {
  if (inst === "snare") return "accent";
  if (inst === "sticking") return "R";
  if (inst === "hh" || inst === "kick" || inst === "tom1" || inst === "tom2" || inst === "tom3") return "normal";
  return "normal";
}

function openMenu(html, x, y) {
  popover.hidden = true;
  menu.innerHTML = html;
  menu.hidden = false;
  const pad = 8;
  menu.style.left = `${Math.min(x, window.innerWidth - menu.offsetWidth - pad)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - menu.offsetHeight - pad)}px`;
}

function openCellMenu(cell, event) {
  const inst = cell.dataset.inst;
  const index = Number(cell.dataset.i);
  const lists = {
    hh: M.HH_ARTICULATIONS,
    snare: M.SNARE_ARTICULATIONS,
    kick: M.KICK_ARTICULATIONS,
    tom1: M.TOM_ARTICULATIONS,
    tom2: M.TOM_ARTICULATIONS,
    tom3: M.TOM_ARTICULATIONS,
    sticking: M.STICK_ARTICULATIONS,
  };
  const html = (lists[inst] || [])
    .map(([id, label]) => `<button type="button" data-action="articulate" data-inst="${inst}" data-i="${index}" data-value="${id}">${label}</button>`)
    .join("");
  openMenu(html, event.clientX, event.clientY);
}

function openLabelMenu(button, event) {
  const inst = button.dataset.label;
  const measure = button.dataset.m;
  const menus = {
    sticking: [
      ["all_off", "all Off"],
      ["alternate", "alternate R/L"],
      ["all_right", "all Rs"],
      ["all_left", "all Ls"],
      ["all_count", "Counts"],
    ],
    hh: [
      ["all_off", "all Hi-hats Off"],
      ["all_on", "all Hi-hats On"],
      ["downbeats", "downbeats"],
      ["upbeats", "upbeats"],
      ["mute", "mute HH sound"],
    ],
    snare: [
      ["all_off", "all Snares Off"],
      ["all_on", "all Accented"],
      ["all_normal", "all Normal"],
      ["all_ghost", "all Ghosts"],
      ["mute", "mute snare sound"],
    ],
    kick: [
      ["all_off", "all Kicks Off"],
      ["all_on", "all Kicks On"],
      ["foot_nums", "HH foot #'s On"],
      ["foot_ands", "HH foot &'s On"],
      ["mute", "mute kick sound"],
    ],
    tom1: [
      ["all_off", "通鼓 1 全關"],
      ["all_on", "通鼓 1 全開"],
      ["mute", "靜音"],
    ],
    tom2: [
      ["all_off", "通鼓 2 全關"],
      ["all_on", "通鼓 2 全開"],
      ["mute", "靜音"],
    ],
    tom3: [
      ["all_off", "通鼓全關"],
      ["all_on", "通鼓全開"],
      ["mute", "靜音"],
    ],
  };
  const items = menus[inst] || [];
  const html =
    items.map(([id, label]) => `<button type="button" data-action="batch" data-inst="${inst}" data-m="${measure}" data-value="${id}">${label}</button>`).join("") +
    `<button type="button" data-action="close-float">cancel</button>`;
  openMenu(html, event.clientX, event.clientY);
}

function closeFloaters() {
  menu.hidden = true;
  popover.hidden = true;
}

function openModal(html) {
  $("modalBody").innerHTML = html;
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
}

function changeDivision(division) {
  const familyChanged = M.isTripletDivision(division) !== M.isTripletDivision(state.groove.division);
  const result = M.setDivision(state.groove, division);
  if (result.error) {
    toast(result.error);
    return;
  }
  commit(result.groove);
  if ((division === 48 || division === 96) && !state.mixedWarned[division]) {
    state.mixedWarned[division] = true;
    const help =
      division === 48
        ? "混合 12：每拍 12 點。16 分音符在每 3 點，8 分三連音在每 4 點。"
        : "混合 24：每拍 24 點。六連音在每 4 點，八連音在每 3 點，16 分音符每 6 點，8 分三連音每 8 點。";
    toast(help + (familyChanged ? " 直向和混合格子對不齊，這一小節已重設。" : ""));
  } else if (familyChanged) {
    toast("換成另一種節奏家族時，格子對不齊，這一小節已重設。");
  }
}

function renderDivisions() {
  $("divisionBtns").innerHTML = M.DIVISIONS.map((div) => {
    const label = div.mix
      ? `混合<br>${div.mix}`
      : `<span class="frac"><sup>${div.num}</sup>/<sub>${div.den}</sub></span>${div.name === "NOTES" ? "音符" : "三連音"}`;
    const title = div.mix ? `每拍 ${div.mix} 點` : "";
    return `<button type="button" class="rail-btn edit-only" data-action="division" data-div="${div.id}" title="${title}">${label}</button>`;
  }).join("");
}

function renderPerm() {
  const panel = $("permPanel");
  if (!state.permOpen) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const groups = [];
  for (const section of M.PERM_SECTIONS) {
    if (!groups.length || groups[groups.length - 1].name !== section.group) groups.push({ name: section.group, ids: [] });
    groups[groups.length - 1].ids.push(section.id);
  }
  panel.innerHTML = `
    <h2>Permutations</h2>
    <div class="perm-kind">
      ${["none", "kick", "snare"].map((kind) => `<button type="button" data-action="perm-kind" data-kind="${kind}" class="${state.perm.kind === kind ? "on" : ""}">${kind === "none" ? "None" : kind === "kick" ? "Kick permutation" : "Snare permutation"}</button>`).join("")}
    </div>
    <div class="perm-row">
      ${groups
        .map((group) => {
          const on = group.ids.every((id) => state.perm.sections.has(id));
          return `<label><input type="checkbox" data-action="perm-group" data-ids="${group.ids.join(",")}" ${on ? "checked" : ""}/> ${group.name}</label>`;
        })
        .join("")}
    </div>
    <div class="perm-row">
      <label><input type="checkbox" data-action="perm-flag" data-flag="simplify" ${state.perm.simplify ? "checked" : ""}/> Simplify repeated kicks</label>
      <label><input type="checkbox" data-action="perm-flag" data-flag="accent" ${state.perm.accent ? "checked" : ""}/> Use accent grid</label>
      <label><input type="checkbox" data-action="perm-flag" data-flag="diddles" ${state.perm.diddles ? "checked" : ""}/> Buzz those accents</label>
      <label><input type="checkbox" data-action="perm-count" ${state.groove.countIn ? "checked" : ""}/> Count in 1 measure</label>
      <button type="button" data-action="perm-apply">Edit this exercise</button>
    </div>
    <p class="hint">Built from the first measure. Kick permutations move the bass drum under your hi-hat and snare. Snare permutations move the snare under your hi-hat and kick. Accent grid ghosts every 16th and accents the pattern.</p>`;
}

function applyExercise() {
  const exercise = sourceGroove();
  if (state.perm.kind === "none") return;
  if (exercise.measures > M.MAX_MEASURES) {
    toast(`That exercise is ${exercise.measures} bars. The grid holds ${M.MAX_MEASURES}. Turn a section off first.`);
    return;
  }
  exercise.showLegend = state.groove.showLegend;
  exercise.metronome = state.groove.metronome;
  exercise.countIn = state.groove.countIn;
  exercise.offset = state.groove.offset;
  exercise.metronomeSolo = state.groove.metronomeSolo;
  exercise.viewMode = state.groove.viewMode;
  state.perm.kind = "none";
  commit(exercise);
  renderPerm();
  toast("The exercise is on the grid now.");
}

function openMetroOptions(event) {
  const g = state.groove;
  const offsets = M.offsetChoices(g.division);
  popover.innerHTML = `
    <button type="button" class="menu-item" data-action="solo">${g.metronomeSolo ? "✓ " : ""}Solo metronome</button>
    <button type="button" class="menu-item" data-action="speed-open">${state.speed.on ? "✓ " : ""}Auto speed up</button>
    <button type="button" class="menu-item" data-action="count-toggle">${g.countIn ? "✓ " : ""}Count it in</button>
    <div class="group-label">Offset click</div>
    ${offsets
      .map((offset) => {
        const label = { 1: 'Start on "1"', e: 'Start on "E"', "&": 'Start on "&"', a: 'Start on "A"', rotate: "Rotate through" }[offset];
        return `<button type="button" class="menu-item" data-action="offset" data-offset="${offset}">${g.offset === offset ? "✓ " : ""}${label}</button>`;
      })
      .join("")}`;
  menu.hidden = true;
  popover.hidden = false;
  popover.style.left = `${Math.min(event.clientX, window.innerWidth - 240)}px`;
  popover.style.top = `${event.clientY + 8}px`;
}

function openSpeed() {
  const s = state.speed;
  openModal(`
    <h2>Auto speed up</h2>
    <p>Increase <b id="bpmOut">${s.bpm}</b> bpm every <b id="minOut">${s.minutes}</b> min, starting from the tempo you press play at.</p>
    <label>Amount in BPM <input id="bpmRange" type="range" min="1" max="40" value="${s.bpm}"/></label>
    <label>Interval in minutes <input id="minRange" type="range" min="1" max="20" value="${s.minutes}"/></label>
    <label class="checkline"><input id="keepGoing" type="checkbox" ${s.keep ? "checked" : ""}/> Keep increasing after the first interval</label>
    <div class="modal-actions">
      <button type="button" class="ghost" data-action="speed-off">Turn off</button>
      <button type="button" class="primary" data-action="speed-done">Done</button>
    </div>`);
  $("bpmRange").addEventListener("input", () => {
    $("bpmOut").textContent = $("bpmRange").value;
  });
  $("minRange").addEventListener("input", () => {
    $("minOut").textContent = $("minRange").value;
  });
}

function openGrooves(event) {
  const html = M.PRESETS.map(
    (group) =>
      `<div class="group-label">${group.group}</div>` +
      group.items.map(([name], index) => `<button type="button" class="groove-item" data-action="preset" data-group="${group.group}" data-index="${index}">${name}</button>`).join("")
  ).join("");
  openMenu(html, Math.min(event.clientX, window.innerWidth - 280), event.clientY + 8);
}

function openHelp(which) {
  if (which === "about") {
    openModal(`
      <h2>About Drumgrid</h2>
      <p>Drumgrid is an independent drum-groove editor. Create a pattern on the grid, read it as standard drum notation, hear it, print it, and share a link.</p>
      <p>It is not affiliated with Mike Johnston or Mike's Lessons, and it does not use their name, logo, or recordings.</p>
      <p>鼓聲來自 DRSKit（CC BY 4.0）：DrumGizmo 團隊與 Jes Eiler（DRSDrums）錄音。Rock、Funk、Jazz 是同一套鼓的不同力道與麥克風平衡，保留鼓腔、小鼓鋼絲和鈸的餘音。</p>
      <p>Notation is drawn with <a href="https://abcjs.net/" target="_blank" rel="noreferrer">abcjs</a> (MIT). The ABC panel is the same text the chart is rendered from.</p>
      <div class="modal-actions"><button type="button" class="primary" data-action="close-modal">Done</button></div>`);
    return;
  }
  openModal(`
    <h2>Help</h2>
    <ul class="help-list">
      <li><b>Space</b> starts and stops playback.</li>
      <li><b>Ctrl-Z</b> undo, <b>Ctrl-Y</b> or <b>Ctrl-Shift-Z</b> redo.</li>
      <li><b>Left / right arrows</b> change the tempo when you are not typing.</li>
      <li><b>Click</b> a grid note to turn the usual voice on or off. Snare clicks land as accents, the way a backbeat is written.</li>
      <li><b>Right-click</b> a note (or Advanced edit, then tap) for open hats, ghosts, cross-stick, buzz, flam, drag, ride, crash, cowbell, and hi-hat foot.</li>
      <li><b>Ctrl and move</b> paints notes on. <b>Alt and move</b> turns them off.</li>
      <li>The <b>Hi-hat</b>, <b>Snare</b>, <b>Kick</b>, and <b>Stickings</b> names open a menu for that whole measure: all on, all off, ghosts, mute, hi-hat foot on the numbers or the &amp;s.</li>
      <li><b>MIX 12</b> is 12 dots per beat, so 16ths and 8th triplets can share a bar. <b>MIX 24</b> is 24 dots per beat, so sextuplets (六連音, every 4th dot) and octuplets (八連音, every 3rd dot) can share a bar.</li>
      <li><b>Words</b> sit on each timing point. Click the box and type English or Traditional Chinese. The syllable prints above that note and travels with the share link.</li>
      <li><b>Stickings</b> can be Off, Right, Left, R/L, or Count. Count prints the syllable (1 e &amp; a).</li>
      <li><b>Metronome</b> options: solo, count-in, auto speed up, and an offset click that moves the strong beat to the e, &amp;, or a, or rotates each loop.</li>
      <li><b>Swing</b> delays the upbeats in playback only. 33% is a triplet shuffle. 50% is a dotted-eighth and sixteenth. The printed chart stays straight.</li>
      <li><b>Share</b> copies a link. Bookmark it, or paste the query string from another groove tool that uses TimeSig, Div, H, S, and K.</li>
      <li>譜會自動留在這台電腦／手機的瀏覽器裡。</li>
      <li><b>Print</b> sends the chart to the printer. Download saves SVG, PNG, or a MIDI file.</li>
    </ul>
    <div class="modal-actions">
      <button type="button" class="ghost" data-action="about">About</button>
      <button type="button" class="primary" data-action="close-modal">Done</button>
    </div>`);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function fileStem() {
  return (state.groove.title || "drumgrid").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "drumgrid";
}

async function downloadPng() {
  const svg = $("sheet").querySelector("svg");
  if (!svg) return;
  const clone = svg.cloneNode(true);
  const box = svg.getBoundingClientRect();
  clone.setAttribute("width", String(Math.ceil(box.width)));
  clone.setAttribute("height", String(Math.ceil(box.height)));
  const xml = new XMLSerializer().serializeToString(clone);
  const img = new Image();
  const loaded = new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await loaded;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  downloadBlob(`${fileStem()}.png`, blob);
}

function handleAction(el, event) {
  const action = el.dataset.action;
  if (action === "close-float") {
    closeFloaters();
    return;
  }
  if (action === "kit") chooseKit(el.dataset.kit);
  else if (action === "division") changeDivision(Number(el.dataset.div));
  else if (action === "time") {
    const g = state.groove;
    const tops = Array.from({ length: 14 }, (_, i) => i + 2)
      .map((n) => `<option ${n === g.top ? "selected" : ""}>${n}</option>`)
      .join("");
    openModal(`<h2>選擇拍號</h2>
      <div class="sig-row"><select id="sigTop">${tops}</select><b>/</b>
      <select id="sigBottom">${[4, 8, 16].map((n) => `<option ${n === g.bottom ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="modal-actions"><button type="button" class="ghost" data-action="close-modal">Cancel</button><button type="button" class="primary" data-action="time-done">Done</button></div>`);
  } else if (action === "time-done") {
    const result = M.setTimeSignature(state.groove, Number($("sigTop").value), Number($("sigBottom").value));
    closeModal();
    if (result.error) toast(result.error);
    else commit(result.groove);
  } else if (action === "advanced") {
    state.advanced = !state.advanced;
    paintChrome();
  } else if (action === "view") {
    state.groove = M.cloneGroove(state.groove);
    state.groove.viewMode = !state.groove.viewMode;
    paint();
    writeUrl();
  } else if (action === "undo") undo();
  else if (action === "redo") redo();
  else if (action === "play") togglePlay();
  else if (action === "loop") {
    transport.looping = !transport.looping;
    paintChrome();
  } else if (action === "metro-options") openMetroOptions(event);
  else if (action === "permutations") {
    state.permOpen = !state.permOpen;
    renderPerm();
  } else if (action === "perm-kind") {
    state.perm.kind = el.dataset.kind;
    state.permOpen = true;
    renderPerm();
    paintBanner();
    scheduleNotation();
  } else if (action === "perm-group") {
    const ids = el.dataset.ids.split(",").map(Number);
    if (el.checked) ids.forEach((id) => state.perm.sections.add(id));
    else ids.forEach((id) => state.perm.sections.delete(id));
    if (state.perm.sections.size === 0) state.perm.sections.add(0);
    paintBanner();
    scheduleNotation();
  } else if (action === "perm-flag") {
    state.perm[el.dataset.flag] = el.checked;
    paintBanner();
    scheduleNotation();
  } else if (action === "perm-count") {
    const next = M.cloneGroove(state.groove);
    next.countIn = el.checked;
    commit(next, { history: false });
  } else if (action === "perm-apply") applyExercise();
  else if (action === "grooves") openGrooves(event);
  else if (action === "preset") {
    const group = M.PRESETS.find((item) => item.group === el.dataset.group);
    const query = group.items[Number(el.dataset.index)][1];
    const next = M.loadPreset(query);
    next.metronome = state.groove.metronome;
    state.perm.kind = "none";
    closeFloaters();
    commit(next);
  } else if (action === "help") openHelp("help");
  else if (action === "about") openHelp("about");
  else if (action === "clear") {
    clearDraft();
    commit(M.clearNotes(state.groove));
  }
  else if (action === "toms") {
    const next = M.cloneGroove(state.groove);
    next.showToms = (next.showToms + 1) % 4;
    commit(next);
  } else if (action === "stickings-menu") {
    openMenu(
      `<button type="button" data-action="stick-toggle"><b>Show or hide stickings</b></button>
       <button type="button" data-action="stick-reverse"><b>Reverse stickings R/L</b></button>`,
      event.clientX - 40,
      event.clientY - 20
    );
  } else if (action === "stick-toggle") {
    const next = M.cloneGroove(state.groove);
    next.showStickings = !next.showStickings;
    closeFloaters();
    commit(next);
  } else if (action === "stick-reverse") {
    closeFloaters();
    commit(M.reverseStickings(state.groove));
  } else if (action === "download-menu") {
    openMenu(
      `<button type="button" data-action="dl-svg">Download SVG image</button>
       <button type="button" data-action="dl-png">Download PNG image</button>
       <button type="button" data-action="dl-mid">Download MIDI file</button>`,
      event.clientX - 40,
      event.clientY - 20
    );
  } else if (action === "dl-svg") {
    closeFloaters();
    const svg = $("sheet").querySelector("svg");
    if (!svg) return;
    downloadBlob(`${fileStem()}.svg`, new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
  } else if (action === "dl-png") {
    closeFloaters();
    downloadPng().catch(() => toast("Could not build a PNG from this chart."));
  } else if (action === "dl-mid") {
    closeFloaters();
    const g = sourceGroove();
    const hits = M.hitsForGroove(g).concat(g.metronome ? M.metronomeHits(g, { rate: g.metronome, offset: g.offset === "rotate" ? "1" : g.offset }) : []);
    downloadBlob(`${fileStem()}.mid`, new Blob([M.encodeMidi(hits, g.tempo)], { type: "audio/midi" }));
  } else if (action === "print") window.print();
  else if (action === "share") openShare(false);
  else if (action === "share-compact") openShare(true);
  else if (action === "copy-share") {
    const field = $("shareUrl");
    field.select();
    navigator.clipboard?.writeText(field.value).then(
      () => toast("Link copied"),
      () => document.execCommand("copy")
    );
  } else if (action === "legend") {
    const next = M.cloneGroove(state.groove);
    next.showLegend = !next.showLegend;
    commit(next, { history: false });
  } else if (action === "abc-toggle") {
    state.abcOpen = !state.abcOpen;
    $("abcBody").hidden = !state.abcOpen;
    $("abcToggle").textContent = state.abcOpen ? "隱藏 ABC 記譜" : "顯示 ABC 記譜";
  } else if (action === "rerender") {
    state.abcDirty = true;
    renderNotation();
  } else if (action === "save-abc") {
    downloadBlob(`${fileStem()}.abc`, new Blob([$("abc").value], { type: "text/plain" }));
  } else if (action === "add-measure") commit(M.addMeasure(state.groove));
  else if (action === "close-measure") commit(M.removeMeasure(state.groove, Number(el.dataset.m)));
  else if (action === "close-modal") closeModal();
  else if (action === "solo") {
    const next = M.cloneGroove(state.groove);
    next.metronomeSolo = !next.metronomeSolo;
    if (next.metronomeSolo && !next.metronome) next.metronome = 4;
    closeFloaters();
    commit(next, { history: false });
  } else if (action === "count-toggle") {
    const next = M.cloneGroove(state.groove);
    next.countIn = !next.countIn;
    closeFloaters();
    commit(next, { history: false });
  } else if (action === "offset") {
    const next = M.cloneGroove(state.groove);
    next.offset = el.dataset.offset;
    closeFloaters();
    commit(next, { history: false });
  } else if (action === "speed-open") {
    closeFloaters();
    openSpeed();
  } else if (action === "speed-done") {
    state.speed.on = true;
    state.speed.bpm = Number($("bpmRange").value);
    state.speed.minutes = Number($("minRange").value);
    state.speed.keep = $("keepGoing").checked;
    state.speed.base = null;
    closeModal();
    toast(`Speed will climb ${state.speed.bpm} bpm every ${state.speed.minutes} min.`);
  } else if (action === "speed-off") {
    state.speed.on = false;
    state.speed.base = null;
    closeModal();
  } else if (action === "articulate") {
    const inst = el.dataset.inst;
    const index = Number(el.dataset.i);
    const value = el.dataset.value === "off" ? null : el.dataset.value;
    const next = M.cloneGroove(state.groove);
    next[inst][index] = value;
    if (value && inst === "sticking") next.showStickings = true;
    if (state.perm.kind !== "none") state.perm.kind = "none";
    closeFloaters();
    commit(next);
    preview(inst, value);
  } else if (action === "batch") {
    const inst = el.dataset.inst;
    const measure = Number(el.dataset.m);
    const value = el.dataset.value;
    closeFloaters();
    if (value === "mute") commit(M.toggleMute(state.groove, inst === "sticking" ? "snare" : inst, measure));
    else commit(M.fillMeasure(state.groove, inst, measure, value));
  }
}

function openShare(compact) {
  const query = compact ? `c=${encodeURIComponent(M.toCompact(state.groove))}` : toQuery();
  const url = `${location.origin}${location.pathname}?${query}`;
  const embed = `<iframe src="${url}${url.includes("Mode=view") ? "" : "&Mode=view"}" width="100%" height="460" style="border:0" title="Drumgrid groove"></iframe>`;
  openModal(`
    <h2>Share this groove</h2>
    <p>Use this URL to share or save the groove. You can also bookmark this page.</p>
    <div class="checkline">
      <label><input type="checkbox" id="compactBox" ${compact ? "checked" : ""}/> Compact link</label>
      <label><input type="checkbox" id="embedBox"/> Embed code</label>
    </div>
    <input id="shareUrl" type="text" readonly value="${compact ? url : url}"/>
    <div class="modal-actions">
      <button type="button" class="primary" data-action="copy-share">Copy</button>
    </div>`);
  const field = $("shareUrl");
  const full = `${location.origin}${location.pathname}?${toQuery()}`;
  const short = `${location.origin}${location.pathname}?c=${encodeURIComponent(M.toCompact(state.groove))}`;
  const sync = () => {
    const useShort = $("compactBox").checked;
    const base = useShort ? short : full;
    field.value = $("embedBox").checked ? embed.replace(url, base.includes("Mode=view") ? base : `${base}&Mode=view`) : base;
  };
  $("compactBox").addEventListener("change", sync);
  $("embedBox").addEventListener("change", sync);
  field.focus();
  field.select();
}

function onMetro(rate) {
  const next = M.cloneGroove(state.groove);
  next.metronome = rate;
  commit(next, { history: false });
}

let pressTimer = 0;
const SCHOOLS = {
  rhythm: {
    name: "節奏感",
    logo: "images/musicdance-logo.png",
    home: "https://www.musicdance.com.tw/",
    og: "og-rhythm.png",
    color: "#2c4a3c",
    alt: "節奏感鼓譜編寫工具：格子鼓譜與歌詞",
  },
  moonick: {
    name: "慕尼克",
    logo: "images/moonick-logo.png",
    home: "https://moonickmusic.com/",
    og: "og-moonick.png",
    color: "#111111",
    alt: "慕尼克鼓譜編寫工具：格子鼓譜與歌詞",
  },
};

function hostSchool() {
  const host = location.hostname.toLowerCase().replace(/\.$/, "");
  if (host === "musicdance.com.tw" || host.endsWith(".musicdance.com.tw")) return "rhythm";
  if (host === "moonickmusic.com" || host.endsWith(".moonickmusic.com")) return "moonick";
  return "";
}

function initialSchool() {
  const locked = hostSchool();
  if (locked) return locked;
  const query = new URLSearchParams(location.search).get("school");
  if (query === "rhythm" || query === "moonick") return query;
  return "rhythm";
}

function setMeta(id, value) {
  const el = document.getElementById(id);
  if (el) el.setAttribute("content", value);
}

function applySchool(school) {
  const info = SCHOOLS[school] || SCHOOLS.rhythm;
  document.documentElement.dataset.school = school in SCHOOLS ? school : "rhythm";
  $("brandLogo").src = info.logo;
  $("brandLogo").alt = info.name;
  $("railLogo").src = info.logo;
  $("railLogo").alt = "";
  $("brandName").textContent = info.name;
  $("brandHome").href = info.home;
  const title = `鼓譜編寫工具｜${info.name}`;
  document.title = title;
  const image = new URL(info.og, location.href).href;
  setMeta("og-image", image);
  setMeta("twitter-image", image);
  setMeta("og-title", title);
  setMeta("twitter-title", title);
  setMeta("og-url", location.href);
  setMeta("og-image-alt", info.alt);
  $("favicon").href = info.logo;
  $("appleIcon").href = info.logo;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", info.color);
}

function boot() {
  applySchool(initialSchool());
  renderDivisions();
  if (state.advanced) $("advancedBtn").classList.add("on");
  paint();
  renderPerm();
  setSampleStatus("載入音色中");
  kit.load(rememberedKit()).then(() => setSampleStatus("")).catch(() => setSampleStatus("音色載入失敗"));
  window.addEventListener("resize", fitWritingArea);

  let lyricBase = null;
  $("grid").addEventListener("focusin", (event) => {
    if (!event.target.classList || !event.target.classList.contains("lyric")) return;
    if (!lyricBase) lyricBase = M.cloneGroove(state.groove);
  });
  $("grid").addEventListener("input", (event) => {
    const input = event.target;
    if (!input.classList || !input.classList.contains("lyric")) return;
    const index = Number(input.dataset.i);
    state.groove.lyrics[index] = input.value.slice(0, 12);
    state.abcDirty = false;
    scheduleNotation();
    scheduleUrl();
  });
  $("grid").addEventListener("focusout", () => {
    setTimeout(() => {
      if (document.activeElement && document.activeElement.classList.contains("lyric")) return;
      if (!lyricBase) return;
      const changed = lyricBase.lyrics.some((text, index) => (text || "") !== (state.groove.lyrics[index] || ""));
      if (changed) {
        state.past.push(lyricBase);
        if (state.past.length > 80) state.past.shift();
        state.future = [];
        paintChrome();
      }
      lyricBase = null;
      writeUrl();
    }, 0);
  });

  document.body.addEventListener("click", (event) => {
    if (event.target.closest && event.target.closest(".lyric")) return;
    const actionEl = event.target.closest("[data-action], [data-metro]");
    if (actionEl?.dataset.metro != null && actionEl.closest(".metro")) {
      onMetro(Number(actionEl.dataset.metro));
      return;
    }
    if (actionEl?.dataset.action) {
      handleAction(actionEl, event);
      return;
    }
    const label = event.target.closest("[data-label]");
    if (label) {
      openLabelMenu(label, event);
      return;
    }
    const cell = event.target.closest(".cell");
    if (cell) {
      if (state.suppressClick) {
        state.suppressClick = false;
        return;
      }
      if (state.advanced) openCellMenu(cell, event);
      else setCell(cell.dataset.inst, Number(cell.dataset.i), "toggle");
      return;
    }
    if (!event.target.closest("#menu") && !event.target.closest("#popover") && !event.target.closest("#modal")) closeFloaters();
  });

  $("grid").addEventListener("contextmenu", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    event.preventDefault();
    openCellMenu(cell, event);
  });

  $("grid").addEventListener("pointerdown", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell || event.pointerType === "mouse") return;
    state.suppressClick = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      state.suppressClick = true;
      openCellMenu(cell, event);
    }, 480);
  });
  ["pointerup", "pointercancel", "pointermove"].forEach((type) => {
    $("grid").addEventListener(type, (event) => {
      if (type === "pointermove" && event.pointerType === "mouse") return;
      clearTimeout(pressTimer);
    });
  });
  $("grid").addEventListener("pointerover", (event) => {
    const cell = event.target.closest(".cell");
    if (!cell) return;
    if (event.altKey) setCell(cell.dataset.inst, Number(cell.dataset.i), "off");
    else if (event.ctrlKey || event.metaKey) setCell(cell.dataset.inst, Number(cell.dataset.i), "on");
  });

  $("tempo").addEventListener("input", () => {
    state.groove.tempo = Number($("tempo").value);
    $("tempoNum").value = state.groove.tempo;
    state.speed.base = null;
    state.abcDirty = false;
    paintChrome();
    scheduleNotation();
    writeUrl();
  });
  $("tempoNum").addEventListener("change", () => {
    state.groove.tempo = Math.min(M.MAX_TEMPO, Math.max(M.MIN_TEMPO, Number($("tempoNum").value) || M.DEFAULT_TEMPO));
    state.speed.base = null;
    state.abcDirty = false;
    paintChrome();
    scheduleNotation();
    writeUrl();
  });
  $("swing").addEventListener("input", () => {
    state.groove.swing = Number($("swing").value);
    state.abcDirty = false;
    paintChrome();
    writeUrl();
  });
  for (const id of ["title", "author", "comments"]) {
    $(id).addEventListener("change", () => {
      const next = M.cloneGroove(state.groove);
      next[id] = $(id).value;
      commit(next, { history: false });
    });
  }
  $("abc").addEventListener("input", () => {
    state.abcDirty = true;
  });

  window.addEventListener("keydown", (event) => {
    const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (event.key === "Enter" && event.target.classList && event.target.classList.contains("lyric") && !event.isComposing) {
      event.preventDefault();
      const inputs = [...document.querySelectorAll(".lyric")];
      const next = inputs[inputs.indexOf(event.target) + 1];
      if (next) next.focus();
      else event.target.blur();
      return;
    }
    if (event.code === "Space" && !typing) {
      event.preventDefault();
      togglePlay();
    } else if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    } else if (!typing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redo();
    } else if (!typing && event.key === "ArrowLeft") {
      const next = M.cloneGroove(state.groove);
      next.tempo = Math.max(M.MIN_TEMPO, next.tempo - 1);
      commit(next, { history: false });
    } else if (!typing && event.key === "ArrowRight") {
      const next = M.cloneGroove(state.groove);
      next.tempo = Math.min(M.MAX_TEMPO, next.tempo + 1);
      commit(next, { history: false });
    } else if (event.key === "Escape") {
      closeFloaters();
      closeModal();
    }
  });

  window.addEventListener("resize", scheduleNotation);
}

boot();
