// Drumgrid groove model: time, note grids, ABC, MIDI, URL, permutations.
// No DOM. Safe to import from Node tests and the browser app.

export const MAX_MEASURES = 32;
export const DEFAULT_TEMPO = 80;
export const MIN_TEMPO = 20;
export const MAX_TEMPO = 400;

export const DIVISIONS = [
  { id: 8, num: "1", den: "8", name: "NOTES" },
  { id: 16, num: "1", den: "16", name: "NOTES" },
  { id: 32, num: "1", den: "32", name: "NOTES" },
  { id: 12, num: "1", den: "8", name: "TRIPLETS" },
  { id: 24, num: "1", den: "16", name: "TRIPLETS" },
  { id: 48, mix: 12, name: "MIX 12" },
  { id: 96, mix: 24, name: "MIX 24" },
];

export const HH_ARTICULATIONS = [
  ["off", "Off"],
  ["normal", "Hi-hat normal"],
  ["half", "半開"],
  ["open", "開"],
  ["closed_plus", "開完後閉合"],
  ["foot_only", "只關沒打到"],
  ["accent", "Hi-hat accent"],
  ["crash", "Crash"],
  ["crash_tie", "Crash 延音"],
  ["crash_roll", "Crash 滾奏"],
  ["ride", "Ride"],
  ["ride_bell", "Ride Bell"],
  ["cow_bell", "Cow Bell"],
  ["stacker", "Stacker"],
  ["click", "Click"],
  ["click_accent", "Click - accent"],
];

export const SNARE_ARTICULATIONS = [
  ["off", "Off"],
  ["normal", "Snare Normal"],
  ["accent", "Snare Accent"],
  ["ghost", "幽靈音"],
  ["rimshot", "Rim-shot"],
  ["xstick", "Cross Stick"],
  ["buzz", "Buzz"],
  ["flam", "Flam"],
  ["drag", "Drag"],
];

export const KICK_ARTICULATIONS = [
  ["off", "Off"],
  ["normal", "Kick Normal"],
  ["splash", "Hi-hat foot"],
  ["foot_open", "腳踩打開"],
  ["both", "Kick & Hi-hat foot"],
];

export const TOM_ARTICULATIONS = [
  ["off", "Off"],
  ["normal", "Tom Normal"],
];

export const STICK_ARTICULATIONS = [
  ["off", "Off"],
  ["R", "Right"],
  ["L", "Left"],
  ["RL", "R/L"],
  ["C", "Count"],
];

export const PERM_SECTIONS = [
  { id: 0, group: "Ostinato", label: "Ostinato" },
  { id: 1, group: "Singles", label: 'Single on "1"' },
  { id: 2, group: "Singles", label: 'Single on "e"' },
  { id: 3, group: "Singles", label: 'Single on "&"' },
  { id: 4, group: "Singles", label: 'Single on "a"' },
  { id: 5, group: "Doubles", label: 'Double on "1"' },
  { id: 6, group: "Doubles", label: 'Double on "e"' },
  { id: 7, group: "Doubles", label: 'Double on "&"' },
  { id: 8, group: "Doubles", label: 'Double on "a"' },
  { id: 9, group: "Down/Up", label: "Downbeats" },
  { id: 10, group: "Down/Up", label: "Upbeats" },
  { id: 11, group: "Triples", label: 'Triple on "1"' },
  { id: 12, group: "Triples", label: 'Triple on "e"' },
  { id: 13, group: "Triples", label: 'Triple on "&"' },
  { id: 14, group: "Triples", label: 'Triple on "a"' },
  { id: 15, group: "Quads", label: "Quads" },
];

const INSTRUMENTS = ["hh", "snare", "kick", "tom1", "tom2", "tom3", "sticking", "lyrics"];

export function isTripletDivision(division) {
  return division % 12 === 0;
}

export function notesPerMeasure(division, top, bottom) {
  return (division / bottom) * top;
}

export function canUseDivision(division, top, bottom) {
  const count = notesPerMeasure(division, top, bottom);
  if (!Number.isInteger(count) || count < 1) {
    return {
      ok: false,
      reason: `1/${division} notes don't fit in ${top}/${bottom}. That split would land between beats.`,
    };
  }
  if (isTripletDivision(division) && bottom !== 4) {
    return {
      ok: false,
      reason: `Triplets are available in x/4 time. ${top}/${bottom} is not.`,
    };
  }
  return { ok: true, count };
}

/** How many grid steps sit in one visual group (a beat, or a compound group). */
export function groupSize(division, top, bottom) {
  if (isTripletDivision(division)) return division / bottom;
  if (bottom === 8 && top % 3 === 0) return 3 * (division / 8);
  return division / bottom;
}

export function emptyGroove(partial = {}) {
  const top = partial.top ?? 4;
  const bottom = partial.bottom ?? 4;
  const division = partial.division ?? 16;
  const measures = partial.measures ?? 1;
  const n = notesPerMeasure(division, top, bottom) * measures;
  const groove = {
    top,
    bottom,
    division,
    measures,
    tempo: partial.tempo ?? DEFAULT_TEMPO,
    swing: partial.swing ?? 0,
    title: partial.title ?? "",
    author: partial.author ?? "",
    comments: partial.comments ?? "",
    showToms: partial.showToms ?? 0,
    showStickings: partial.showStickings ?? false,
    showLegend: partial.showLegend ?? false,
    metronome: partial.metronome ?? 0,
    metronomeSolo: partial.metronomeSolo ?? false,
    countIn: partial.countIn ?? false,
    offset: partial.offset ?? "1",
    viewMode: partial.viewMode ?? false,
    hh: fill(n, null),
    snare: fill(n, null),
    kick: fill(n, null),
    tom1: fill(n, null),
    tom2: fill(n, null),
    tom3: fill(n, null),
    sticking: fill(n, null),
    lyrics: fill(n, ""),
    mute: {
      hh: fill(measures, false),
      snare: fill(measures, false),
      kick: fill(measures, false),
      tom1: fill(measures, false),
      tom2: fill(measures, false),
      tom3: fill(measures, false),
    },
  };
  return groove;
}

function fill(n, value) {
  return Array.from({ length: n }, () => value);
}

export function cloneGroove(g) {
  return {
    ...g,
    hh: g.hh.slice(),
    snare: g.snare.slice(),
    kick: g.kick.slice(),
    tom1: g.tom1.slice(),
    tom2: (g.tom2 || fill(stepCount(g), null)).slice(),
    tom3: (g.tom3 || g.tom4 || fill(stepCount(g), null)).slice(),
    sticking: g.sticking.slice(),
    lyrics: (g.lyrics || fill(stepCount(g), "")).slice(),
    mute: {
      hh: g.mute.hh.slice(),
      snare: g.mute.snare.slice(),
      kick: g.mute.kick.slice(),
      tom1: g.mute.tom1.slice(),
      tom2: (g.mute.tom2 || fill(g.measures, false)).slice(),
      tom3: (g.mute.tom3 || g.mute.tom4 || fill(g.measures, false)).slice(),
    },
  };
}

export function defaultGroove() {
  const g = emptyGroove();
  applyDefaults(g);
  return g;
}

function applyDefaults(g) {
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  for (let m = 0; m < g.measures; m++) {
    for (let i = 0; i < npm; i++) {
      const idx = m * npm + i;
      if (notesPerBeat(g.division, g.bottom) < 12) g.hh[idx] = "normal";
      const group = i / (npm / g.top);
      if (Number.isInteger(group) && group % 2 === 1) g.snare[idx] = "accent";
      if (Number.isInteger(group) && group % 2 === 0) g.kick[idx] = "normal";
    }
  }
}

export function stepCount(g) {
  return notesPerMeasure(g.division, g.top, g.bottom) * g.measures;
}

export function notesPerBeat(division, bottom) {
  return division / bottom;
}

function fullResolution(division, top, bottom) {
  // 96 covers MIX 24 (24 dots per quarter). 32 covers 32nd notes.
  const base = isTripletDivision(division) ? 96 : 32;
  return base * (top / bottom);
}

/** Keep sounding notes when the grid gets finer or coarser inside one family. */
export function scaleNotes(array, measures, fromNpm, toNpm, top, bottom, fromDiv, toDiv) {
  if (isTripletDivision(fromDiv) !== isTripletDivision(toDiv)) {
    return null;
  }
  const full = fullResolution(fromDiv, top, bottom);
  const expanded = fill(measures * full, null);
  const up = full / fromNpm;
  for (let i = 0; i < array.length; i++) expanded[i * up] = array[i];
  const down = full / toNpm;
  const out = [];
  for (let i = 0; i < measures * toNpm; i++) out.push(expanded[i * down] ?? null);
  return out;
}

export function setDivision(g, division) {
  const check = canUseDivision(division, g.top, g.bottom);
  if (!check.ok) return { groove: g, error: check.reason };
  if (division === g.division) return { groove: g };
  const fromNpm = notesPerMeasure(g.division, g.top, g.bottom);
  const toNpm = check.count;
  const next = cloneGroove(g);
  next.division = division;
  if (isTripletDivision(division) === isTripletDivision(g.division)) {
    for (const key of INSTRUMENTS) {
      next[key] = scaleNotes(g[key], g.measures, fromNpm, toNpm, g.top, g.bottom, g.division, division);
    }
  } else {
    for (const key of INSTRUMENTS) next[key] = fill(toNpm * g.measures, null);
    applyDefaults(next);
  }
  if (!["1", "&", "a", "e", "rotate"].includes(next.offset)) next.offset = "1";
  return { groove: next };
}

export function setTimeSignature(g, top, bottom) {
  top = clampInt(top, 2, 15, 4);
  if (![4, 8, 16].includes(bottom)) bottom = 4;
  const check = canUseDivision(g.division, top, bottom);
  if (!check.ok) return { groove: g, error: check.reason };
  const fromBeat = g.division / g.bottom;
  const toBeat = g.division / bottom;
  const next = cloneGroove(g);
  next.top = top;
  next.bottom = bottom;
  const beats = [];
  const oldNpm = notesPerMeasure(g.division, g.top, g.bottom);
  for (let m = 0; m < g.measures; m++) {
    for (let b = 0; b < g.top; b++) {
      const slice = {};
      for (const key of INSTRUMENTS) {
        slice[key] = g[key].slice(m * oldNpm + b * fromBeat, m * oldNpm + (b + 1) * fromBeat);
      }
      beats.push(slice);
    }
  }
  while (beats.length < g.measures * top) {
    const beatIndex = beats.length % top;
    beats.push(defaultBeat(toBeat, beatIndex, g.division));
  }
  beats.length = g.measures * top;
  for (const key of INSTRUMENTS) next[key] = [];
  for (const beat of beats) {
    for (const key of INSTRUMENTS) {
      let notes = beat[key];
      if (notes.length !== toBeat) notes = resampleArray(notes, toBeat);
      next[key].push(...notes);
    }
  }
  return { groove: next };
}

function defaultBeat(slots, beatIndex, division) {
  const beat = {
    hh: fill(slots, slots >= 12 ? null : "normal"),
    snare: fill(slots, null),
    kick: fill(slots, null),
    tom1: fill(slots, null),
    tom2: fill(slots, null),
    tom3: fill(slots, null),
    sticking: fill(slots, null),
    lyrics: fill(slots, ""),
  };
  if (beatIndex % 2 === 1) beat.snare[0] = "accent";
  if (beatIndex % 2 === 0) beat.kick[0] = "normal";
  return beat;
}

function resampleArray(arr, toLen) {
  if (arr.length === toLen) return arr.slice();
  const out = fill(toLen, null);
  for (let i = 0; i < toLen; i++) {
    const src = (i * arr.length) / toLen;
    if (Math.abs(src - Math.round(src)) < 1e-6) out[i] = arr[Math.round(src)] ?? null;
  }
  return out;
}

export function addMeasure(g) {
  if (g.measures >= MAX_MEASURES) return g;
  const next = cloneGroove(g);
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  const start = (g.measures - 1) * npm;
  for (const key of INSTRUMENTS) next[key].push(...g[key].slice(start, start + npm));
  for (const key of Object.keys(next.mute)) next.mute[key].push(g.mute[key][g.measures - 1]);
  next.measures += 1;
  return next;
}

export function removeMeasure(g, index) {
  if (g.measures <= 1) return g;
  const next = cloneGroove(g);
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  for (const key of INSTRUMENTS) next[key].splice(index * npm, npm);
  for (const key of Object.keys(next.mute)) next.mute[key].splice(index, 1);
  next.measures -= 1;
  return next;
}

export function clearNotes(g) {
  const next = cloneGroove(g);
  const n = stepCount(g);
  for (const key of INSTRUMENTS) next[key] = fill(n, null);
  return next;
}

export function measureRange(g, measureIndex) {
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  const start = measureIndex * npm;
  return [start, start + npm];
}

export function fillMeasure(g, instrument, measureIndex, mode) {
  const next = cloneGroove(g);
  const [start, end] = measureRange(g, measureIndex);
  const npm = end - start;
  const perBeat = g.division / g.bottom;
  for (let i = start; i < end; i++) {
    const local = i - start;
    if (mode === "all_off") next[instrument][i] = null;
    else if (instrument === "sticking") {
      if (mode === "all_right") next.sticking[i] = "R";
      else if (mode === "all_left") next.sticking[i] = "L";
      else if (mode === "alternate") next.sticking[i] = local % 2 === 0 ? "R" : "L";
      else if (mode === "all_count") next.sticking[i] = "C";
    } else if (instrument === "hh" && mode === "downbeats") {
      next.hh[i] = local % 2 === 0 ? "normal" : null;
    } else if (instrument === "hh" && mode === "upbeats") {
      next.hh[i] = local % 2 === 1 ? "normal" : null;
    } else if (instrument === "hh" && mode === "all_on") next.hh[i] = "normal";
    else if (instrument === "snare" && mode === "all_on") next.snare[i] = "accent";
    else if (instrument === "snare" && mode === "all_normal") next.snare[i] = "normal";
    else if (instrument === "snare" && mode === "all_ghost") next.snare[i] = "ghost";
    else if (instrument === "kick" && mode === "all_on") next.kick[i] = "normal";
    else if (instrument === "kick" && mode === "foot_nums") {
      next.kick[i] = withFoot(next.kick[i], local % perBeat === 0);
    } else if (instrument === "kick" && mode === "foot_ands") {
      const andAt = Math.floor(perBeat / 2);
      next.kick[i] = withFoot(next.kick[i], perBeat > 1 && local % perBeat === andAt);
    } else if (instrument === "tom1" && mode === "all_on") next.tom1[i] = "normal";
    else if (instrument === "tom2" && mode === "all_on") next.tom2[i] = "normal";
    else if (instrument === "tom3" && mode === "all_on") next.tom3[i] = "normal";
  }
  if (instrument === "sticking") next.showStickings = true;
  if (instrument === "tom1") next.showToms = Math.max(next.showToms, 1);
  if (instrument === "tom2") next.showToms = Math.max(next.showToms, 2);
  if (instrument === "tom3") next.showToms = Math.max(next.showToms, 3);
  return next;
}

function withFoot(current, on) {
  const hasKick = current === "normal" || current === "both";
  const hasFoot = current === "splash" || current === "both";
  const foot = on ? true : hasFoot;
  if (hasKick && foot) return "both";
  if (hasKick) return "normal";
  if (foot) return "splash";
  return null;
}

export function toggleMute(g, instrument, measureIndex) {
  const next = cloneGroove(g);
  next.mute[instrument][measureIndex] = !next.mute[instrument][measureIndex];
  return next;
}

export function cycleSticking(current) {
  const order = [null, "R", "L", "RL", "C"];
  const i = order.indexOf(current);
  return order[(i + 1) % order.length];
}

export function reverseStickings(g) {
  const next = cloneGroove(g);
  next.sticking = g.sticking.map((s) => (s === "R" ? "L" : s === "L" ? "R" : s));
  return next;
}

const HH_TO_CHAR = {
  normal: "x",
  open: "o",
  half: "h",
  closed_plus: "p",
  foot_only: "f",
  accent: "X",
  crash: "c",
  crash_tie: "t",
  crash_roll: "w",
  ride: "r",
  ride_bell: "B",
  cow_bell: "m",
  stacker: "s",
  click: "n",
  click_accent: "N",
};
const CHAR_TO_HH = invert(HH_TO_CHAR);
CHAR_TO_HH["+"] = "normal";

const SNARE_TO_CHAR = {
  normal: "o",
  accent: "O",
  ghost: "g",
  rimshot: "q",
  xstick: "x",
  buzz: "b",
  flam: "f",
  drag: "d",
};
const CHAR_TO_SNARE = invert(SNARE_TO_CHAR);

const KICK_TO_CHAR = { normal: "o", splash: "x", foot_open: "p", both: "X" };
const CHAR_TO_KICK = invert(KICK_TO_CHAR);

const TOM_TO_CHAR = { normal: "o" };
const CHAR_TO_TOM = { o: "normal", x: "normal" };

const STICK_TO_CHAR = { R: "R", L: "L", RL: "B", C: "c" };
const CHAR_TO_STICK = invert(STICK_TO_CHAR);

function invert(map) {
  const out = {};
  for (const [k, v] of Object.entries(map)) out[v] = k;
  return out;
}

function encodeLine(values, toChar) {
  return values.map((v) => (v && toChar[v] ? toChar[v] : "-")).join("");
}

function decodeLine(text, toValue, expected) {
  const chars = text.replace(/\|/g, "").split("");
  const out = [];
  for (let i = 0; i < expected; i++) {
    const ch = chars[i] ?? "-";
    out.push(ch === "-" ? null : toValue[ch] ?? null);
  }
  return out;
}

export function toQuery(g, { viewMode } = {}) {
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  const parts = [];
  if (viewMode || g.viewMode) parts.push("Mode=view");
  parts.push(`TimeSig=${g.top}/${g.bottom}`);
  parts.push(`Div=${g.division}`);
  if (g.title) parts.push(`Title=${encodeURIComponent(g.title)}`);
  if (g.author) parts.push(`Author=${encodeURIComponent(g.author)}`);
  if (g.comments) parts.push(`Comments=${encodeURIComponent(g.comments)}`);
  parts.push(`Tempo=${g.tempo}`);
  if (g.swing) parts.push(`Swing=${g.swing}`);
  parts.push(`Measures=${g.measures}`);
  if (g.metronome) parts.push(`MetronomeFreq=${g.metronome}`);
  if (g.countIn) parts.push("CountIn=1");
  if (g.offset && g.offset !== "1") parts.push(`Offset=${encodeURIComponent(g.offset)}`);
  if (g.metronomeSolo) parts.push("MetronomeSolo=1");
  parts.push(`H=${barWrap(encodeLine(g.hh, HH_TO_CHAR), npm)}`);
  parts.push(`S=${barWrap(encodeLine(g.snare, SNARE_TO_CHAR), npm)}`);
  parts.push(`K=${barWrap(encodeLine(g.kick, KICK_TO_CHAR), npm)}`);
  if (g.showToms >= 1) parts.push(`T1=${barWrap(encodeLine(g.tom1, TOM_TO_CHAR), npm)}`);
  if (g.showToms >= 2) parts.push(`T2=${barWrap(encodeLine(g.tom2, TOM_TO_CHAR), npm)}`);
  if (g.showToms >= 3) parts.push(`T3=${barWrap(encodeLine(g.tom3, TOM_TO_CHAR), npm)}`);
  if (g.showStickings || g.sticking.some(Boolean)) {
    parts.push(`Stickings=${barWrap(encodeLine(g.sticking, STICK_TO_CHAR), npm)}`);
  }
  const lyrics = lyricsToParam(g.lyrics);
  if (lyrics) parts.push(`Ly=${lyrics}`);
  return parts.join("&");
}

export function lyricsToParam(lyrics = []) {
  const sparse = {};
  lyrics.forEach((text, index) => {
    const clean = String(text || "").trim().slice(0, 12);
    if (clean) sparse[index] = clean;
  });
  return Object.keys(sparse).length ? encodeURIComponent(JSON.stringify(sparse)) : "";
}

export function lyricsFromParam(value, length) {
  const out = fill(length, "");
  if (!value) return out;
  try {
    const sparse = JSON.parse(value);
    for (const [key, text] of Object.entries(sparse)) {
      const index = Number(key);
      if (Number.isInteger(index) && index >= 0 && index < length && typeof text === "string") {
        out[index] = text.trim().slice(0, 12);
      }
    }
  } catch {
    return out;
  }
  return out;
}

function barWrap(flat, npm) {
  let out = "|";
  for (let i = 0; i < flat.length; i += npm) out += flat.slice(i, i + npm) + "|";
  return out;
}

function param(query, name, fallback = null) {
  const src = query.startsWith("?") ? query.slice(1) : query;
  for (const pair of src.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const key = eq === -1 ? pair : pair.slice(0, eq);
    const value = eq === -1 ? "" : pair.slice(eq + 1);
    if (key.toLowerCase() === name.toLowerCase()) return decodeURIComponent(value.replace(/\+/g, " "));
  }
  return fallback;
}

export function queryHasGroove(query) {
  if (!query) return false;
  if (param(query, "c", null)) return true;
  return param(query, "H", null) !== null || param(query, "S", null) !== null || param(query, "K", null) !== null;
}

export function fromQuery(query) {
  if (!query) return defaultGroove();
  const compact = param(query, "c", null);
  if (compact) return fromCompact(compact);
  const topBottom = (param(query, "TimeSig", "4/4") || "4/4").split("/");
  let top = clampInt(topBottom[0], 2, 15, 4);
  let bottom = [4, 8, 16].includes(Number(topBottom[1])) ? Number(topBottom[1]) : 4;
  let division = clampInt(param(query, "Div", 16), 1, 96, 16);
  if (!canUseDivision(division, top, bottom).ok) {
    division = 16;
    top = 4;
    bottom = 4;
  }
  let measures = clampInt(param(query, "measures", 1), 1, MAX_MEASURES, 1);
  const npm = notesPerMeasure(division, top, bottom);
  const g = emptyGroove({
    top,
    bottom,
    division,
    measures,
    tempo: clampInt(param(query, "tempo", DEFAULT_TEMPO), MIN_TEMPO, MAX_TEMPO, DEFAULT_TEMPO),
    swing: clampInt(param(query, "swing", 0), 0, 60, 0),
    title: param(query, "title", "") || "",
    author: param(query, "author", "") || "",
    comments: param(query, "comments", "") || "",
    metronome: clampInt(param(query, "MetronomeFreq", 0), 0, 32, 0),
    countIn: param(query, "CountIn", "") === "1",
    offset: param(query, "Offset", "1") || "1",
    metronomeSolo: param(query, "MetronomeSolo", "") === "1",
    viewMode: (param(query, "Mode", "") || "").toLowerCase() === "view",
  });
  const expected = npm * measures;
  const hh = param(query, "H", null);
  const snare = param(query, "S", null);
  const kick = param(query, "K", null);
  const lyricParam = param(query, "Ly", null);
  if (hh === null && snare === null && kick === null) {
    applyDefaults(g);
    if (lyricParam) g.lyrics = lyricsFromParam(lyricParam, expected);
    return g;
  }
  g.hh = decodeLine(hh || "", CHAR_TO_HH, expected);
  g.snare = decodeLine(snare || "", CHAR_TO_SNARE, expected);
  g.kick = decodeLine(kick || "", CHAR_TO_KICK, expected);
  const t1 = param(query, "T1", null);
  const t2 = param(query, "T2", null);
  const t3 = param(query, "T3", null);
  const t4 = param(query, "T4", null);
  let shownToms = 0;
  if (t1 !== null) {
    g.tom1 = decodeLine(t1, CHAR_TO_TOM, expected);
    shownToms = Math.max(shownToms, 1);
  }
  if (t2 !== null) {
    g.tom2 = decodeLine(t2, CHAR_TO_TOM, expected);
    shownToms = Math.max(shownToms, 2);
  }
  if (t3 !== null) {
    g.tom3 = decodeLine(t3, CHAR_TO_TOM, expected);
    shownToms = Math.max(shownToms, 3);
  }
  if (t4 !== null) {
    if (t3 === null) g.tom3 = decodeLine(t4, CHAR_TO_TOM, expected);
    shownToms = Math.max(shownToms, 3);
  }
  g.showToms = shownToms;
  const sticks = param(query, "Stickings", null);
  if (sticks !== null) {
    g.showStickings = true;
    g.sticking = decodeLine(sticks, CHAR_TO_STICK, expected);
  }
  if (lyricParam) g.lyrics = lyricsFromParam(lyricParam, expected);
  return g;
}

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function toCompact(g) {
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  const bits = [
    `${g.top}/${g.bottom}`,
    g.division,
    g.tempo,
    g.swing,
    g.measures,
    "H",
    rle(encodeLine(g.hh, HH_TO_CHAR)),
    "S",
    rle(encodeLine(g.snare, SNARE_TO_CHAR)),
    "K",
    rle(encodeLine(g.kick, KICK_TO_CHAR)),
  ];
  if (g.showToms >= 1) bits.push("T1", rle(encodeLine(g.tom1, TOM_TO_CHAR)));
  if (g.showToms >= 2) bits.push("T2", rle(encodeLine(g.tom2, TOM_TO_CHAR)));
  if (g.showToms >= 3) bits.push("T3", rle(encodeLine(g.tom3, TOM_TO_CHAR)));
  if (g.showStickings || g.sticking.some(Boolean)) {
    bits.push("ST", rle(encodeLine(g.sticking, STICK_TO_CHAR)));
  }
  if (g.title) bits.push("T", encodeURIComponent(g.title));
  if (g.author) bits.push("A", encodeURIComponent(g.author));
  if (g.comments) bits.push("N", encodeURIComponent(g.comments));
  if (g.metronome) bits.push("M", g.metronome);
  if (g.countIn) bits.push("C", 1);
  if (g.offset !== "1") bits.push("O", g.offset);
  const lyrics = lyricsToParam(g.lyrics);
  if (lyrics) bits.push("W", utf8ToB64(decodeURIComponent(lyrics)));
  return bits.join("~");
}

function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, "");
}

function b64ToUtf8(b64) {
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function rle(text) {
  return text.replace(/(.)\1+/g, (m, ch) => ch + m.length);
}

function unrle(text) {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    let j = i + 1;
    while (j < text.length && text[j] >= "0" && text[j] <= "9") j++;
    if (j > i + 1) out += ch.repeat(parseInt(text.slice(i + 1, j), 10));
    else out += ch;
    i = j - 1;
  }
  return out;
}

export function fromCompact(compact) {
  const bits = compact.split("~");
  const [sig, div, tempo, swing, measures] = bits;
  const [top, bottom] = sig.split("/").map((n) => parseInt(n, 10));
  const fields = {};
  for (let i = 5; i < bits.length; i += 2) fields[bits[i]] = bits[i + 1];
  const query = [
    `TimeSig=${top}/${bottom}`,
    `Div=${div}`,
    `Tempo=${tempo}`,
    `Swing=${swing}`,
    `Measures=${measures}`,
    `H=|${unrle(fields.H || "")}|`,
    `S=|${unrle(fields.S || "")}|`,
    `K=|${unrle(fields.K || "")}|`,
  ];
  if (fields.T1) query.push(`T1=|${unrle(fields.T1)}|`);
  if (fields.T2) query.push(`T2=|${unrle(fields.T2)}|`);
  if (fields.T3) query.push(`T3=|${unrle(fields.T3)}|`);
  if (fields.T4) query.push(`T4=|${unrle(fields.T4)}|`);
  if (fields.ST) query.push(`Stickings=|${unrle(fields.ST)}|`);
  if (fields.T) query.push(`Title=${fields.T}`);
  if (fields.A) query.push(`Author=${fields.A}`);
  if (fields.N) query.push(`Comments=${fields.N}`);
  if (fields.M) query.push(`MetronomeFreq=${fields.M}`);
  if (fields.C) query.push("CountIn=1");
  if (fields.O) query.push(`Offset=${encodeURIComponent(fields.O)}`);
  if (fields.W) query.push(`Ly=${encodeURIComponent(b64ToUtf8(fields.W))}`);
  return fromQuery(query.join("&"));
}

export function countSyllable(g, index) {
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  const local = index % npm;
  const perBeat = g.division / g.bottom;
  const beat = Math.floor(local / perBeat);
  const pos = local % perBeat;
  const beatNum = String((beat % g.top) + 1);
  if (isTripletDivision(g.division)) {
    const trip = g.division / 12;
    const names = trip === 1 ? ["", "&", "a"] : ["", "ti", "ta", "&", "ti", "ta"];
    const name = names[pos] || "";
    return name ? `${beatNum}${name}` : beatNum;
  }
  if (perBeat === 1) return beatNum;
  if (perBeat === 2) return pos === 0 ? beatNum : "&";
  if (perBeat === 4) return [beatNum, "e", "&", "a"][pos];
  if (perBeat === 8) return ["1", "e", "&", "a", "1", "e", "&", "a"][pos] === "1" && pos === 0 ? beatNum : ["", "+", "e", "+", "&", "+", "a", "+"][pos] || beatNum;
  return pos === 0 ? beatNum : String(pos);
}

const PITCH = {
  kick: "F",
  foot: "D",
  tom3: "A",
  tom2: "d",
  snare: "c",
  xstick: "^c",
  ghost: "c",
  tom1: "e",
  hat: "g",
  hatOpen: "^g",
  ride: "a",
  rideBell: "^a",
  crash: "b",
  cow: "^b",
  stack: "c'",
  click: "d'",
  clickAccent: "^d'",
};

export function abcHeader() {
  return [
    "%%percmap D pedal-hi-hat x",
    "%%percmap F acoustic-bass-drum",
    "%%percmap A low-tom",
    "%%percmap d low-mid-tom",
    "%%percmap c acoustic-snare",
    "%%percmap ^c side-stick x",
    "%%percmap e high-tom",
    "%%percmap g closed-hi-hat x",
    "%%percmap ^g open-hi-hat x",
    "%%percmap a ride-cymbal-1 x",
    "%%percmap ^a ride-bell harmonic",
    "%%percmap b crash-cymbal-1 x",
    "%%percmap ^b cowbell triangle",
    "%%percmap c' chinese-cymbal x",
    "%%percmap d' hi-wood-block triangle",
    "%%percmap ^d' low-wood-block triangle",
  ].join("\n");
}

export function toAbc(g) {
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  const unit = abcUnit(g.division);
  const lines = [
    "X:1",
    g.title ? `T:${g.title}` : null,
    g.author ? `C:${g.author}` : null,
    g.comments ? `N:${g.comments}` : null,
    `M:${g.top}/${g.bottom}`,
    `L:1/${unit}`,
    "%%stretchlast 1",
    "%%staffsep 8",
    "%%sysstaffsep 8",
    `Q:1/4=${g.tempo}`,
    "K:C perc",
    abcHeader(),
    "V:1 perc stem=up",
  ].filter(Boolean);
  const group = groupSize(g.division, g.top, g.bottom);
  const measures = [];
  for (let m = 0; m < g.measures; m++) {
    const tokens = [];
    for (let i = 0; i < npm; i++) tokens.push(abcToken(g, m * npm + i));
    measures.push(layoutBar(tokens, g.division, group));
  }
  let body = "";
  measures.forEach((bar, i) => {
    body += bar + (i % 2 === 1 || i === measures.length - 1 ? "|\n" : "|");
  });
  lines.push(body.trim());
  return lines.join("\n");
}

export function abcUnit(division) {
  if (division === 8 || division === 12) return 8;
  if (division === 16 || division === 24) return 16;
  if (division >= 96) return 64;
  return 32;
}

// Fractions of a whole note that abcjs can draw. Anything else, such as 10/64, raises
// "Duration not representable".
const ABC_DRAWABLE = new Set(
  [
    0.5, 0.75, 0.875, 0.9375, 0.96875, 0.984375, 0.25, 0.375, 0.4375, 0.46875, 0.484375, 0.4921875, 0.125,
    0.1875, 0.21875, 0.234375, 0.2421875, 0.24609375, 0.0625, 0.09375, 0.109375, 0.1171875, 0.12109375,
    0.123046875, 0.03125, 0.046875, 0.0546875, 0.05859375, 0.060546875, 0.0615234375, 0.015625, 0.0234375,
    0.02734375, 0.029296875, 0.0302734375, 0.03076171875,
  ].map((value) => value.toFixed(10))
);

function layoutBar(tokens, division, group) {
  if (!isTripletDivision(division)) {
    const parts = [];
    for (let i = 0; i < tokens.length; i += group) {
      parts.push(collapseStraight(tokens.slice(i, i + group), division));
    }
    return parts.join(" ");
  }
  // Each (3 at the current note length occupies two of those lengths.
  // An all-rest group becomes a rest so a mix bar is not a wall of empty 64ths.
  const perBeat = Math.max(1, Math.round(group / 3));
  const beats = [];
  for (let b = 0; b < tokens.length; b += group) {
    const beat = tokens.slice(b, b + group);
    const pieces = [];
    for (let i = 0; i < beat.length; i += 3) {
      const slice = beat.slice(i, i + 3);
      while (slice.length < 3) slice.push("z");
      if (slice.every((token) => token === "z")) pieces.push({ rest: 2 });
      else pieces.push({ text: "(3" + slice.join("") });
    }
    while (pieces.length < perBeat) pieces.push({ rest: 2 });
    beats.push(renderPieceRun(pieces, division, true));
  }
  return beats.join(" ");
}

function collapseStraight(tokens, division) {
  return renderPieceRun(
    tokens.map((token) => (token === "z" ? { rest: 1 } : { text: token })),
    division,
    false
  );
}

function renderPieceRun(pieces, division, separateTuplets) {
  let out = "";
  let rest = 0;
  const flush = () => {
    if (!rest) return;
    const mark = restMarks(rest, division);
    if (separateTuplets && out && !out.endsWith(" ")) out += " ";
    out += mark;
    rest = 0;
  };
  for (const piece of pieces) {
    if (piece.rest) rest += piece.rest;
    else {
      flush();
      if (separateTuplets && out && !out.endsWith(" ")) out += " ";
      out += piece.text;
    }
  }
  flush();
  return out;
}

function restMarks(units, division) {
  const abcL = abcUnit(division);
  const unit = 1 / abcL;
  const parts = [];
  let left = units;
  while (left > 0) {
    let take = 1;
    for (let size = left; size >= 1; size--) {
      const duration = size * unit;
      if (duration + 1e-9 >= 1 || ABC_DRAWABLE.has(duration.toFixed(10))) {
        take = size;
        break;
      }
    }
    parts.push(take === 1 ? "z" : "z" + take);
    left -= take;
  }
  return parts.join("");
}

function soundingParts(g, idx) {
  const parts = [];
  const kick = g.kick[idx];
  if (kick === "normal" || kick === "both") parts.push(PITCH.kick);
  if (kick === "splash" || kick === "both" || kick === "foot_open") parts.push(PITCH.foot);
  if (g.showToms >= 3 && g.tom3[idx]) parts.push(PITCH.tom3);
  const snare = g.snare[idx];
  if (snare) parts.push(snarePitch(snare));
  if (g.showToms >= 2 && g.tom2[idx]) parts.push(PITCH.tom2);
  if (g.showToms >= 1 && g.tom1[idx]) parts.push(PITCH.tom1);
  const hh = g.hh[idx];
  if (hh && hh !== "foot_only") parts.push(hhPitch(hh));
  const placeholder = hh === "foot_only" && parts.length === 0;
  if (placeholder) parts.push(PITCH.hat);
  return { parts, placeholder, floatPlus: hh === "foot_only" && !placeholder };
}

export function staffMarks(g) {
  const total = Math.min(g.hh.length, notesPerMeasure(g.division, g.top, g.bottom) * g.measures);
  const marks = [];
  for (let i = 0; i < total; i++) {
    const { parts, placeholder, floatPlus } = soundingParts(g, i);
    if (parts.length === 0) continue;
    const snare = g.snare[i];
    const kick = g.kick[i];
    const hh = g.hh[i];
    const heads = {};
    if (snare === "ghost") heads.c = { ghost: true };
    if (snare === "rimshot") heads.c = { rim: true };
    if (snare === "buzz") heads.c = { buzz: true };
    if (kick === "foot_open") heads.D = { footOpen: true };
    if (hh === "half") heads.g = { half: true };
    if (hh === "open") heads.g = { open: true };
    if (hh === "closed_plus") heads.g = { plus: true };
    if (hh === "crash_tie") heads.b = { tie: true };
    if (hh === "crash_roll") heads.b = { roll: true };
    if (placeholder) heads.g = { hide: true, plus: true };
    marks.push({ heads, floatPlus });
  }
  return marks;
}

function abcToken(g, idx) {
  const { parts } = soundingParts(g, idx);
  const snare = g.snare[idx];
  const hh = g.hh[idx];
  let token = parts.length === 0 ? "z" : parts.length === 1 ? parts[0] : `[${parts.join("")}]`;
  const decos = [];
  if (snare === "accent" || hh === "accent" || hh === "click_accent") decos.push("!accent!");
  token = decos.join("") + token;
  if (snare === "flam") token = "{/c}" + token;
  if (snare === "drag") token = "{/cc}" + token;
  const lyric = cleanAnnotation(g.lyrics && g.lyrics[idx]);
  const stick =
    g.showStickings && g.sticking[idx]
      ? g.sticking[idx] === "C"
        ? countSyllable(g, idx)
        : g.sticking[idx] === "RL"
          ? "R/L"
          : g.sticking[idx]
      : "";
  if (lyric && stick) token = `"^${lyric}""_${stick}"${token}`;
  else if (lyric) token = `"^${lyric}"${token}`;
  else if (stick) token = `"^${stick}"${token}`;
  return token;
}

function cleanAnnotation(text) {
  return String(text || "")
    .replace(/["\\\r\n]/g, "")
    .trim()
    .slice(0, 12);
}

function snarePitch(kind) {
  if (kind === "xstick") return PITCH.xstick;
  return PITCH.snare;
}

function hhPitch(kind) {
  switch (kind) {
    case "open":
    case "half":
    case "closed_plus":
    case "accent":
      return PITCH.hat;
    case "crash":
    case "crash_tie":
    case "crash_roll":
      return PITCH.crash;
    case "ride":
      return PITCH.ride;
    case "ride_bell":
      return PITCH.rideBell;
    case "cow_bell":
      return PITCH.cow;
    case "stacker":
      return PITCH.stack;
    case "click":
      return PITCH.click;
    case "click_accent":
      return PITCH.clickAccent;
    default:
      return PITCH.hat;
  }
}

export function swingExtraQuarters(slot, division, swingPct) {
  const p = (swingPct || 0) / 100;
  if (p <= 0) return 0;
  if (isTripletDivision(division)) {
    return slot % 3 === 2 ? (4 / division) * p : 0;
  }
  if (division >= 32) {
    const pos = slot % 8;
    if (pos === 2 || pos === 3 || pos === 6 || pos === 7) return 0.25 * p;
    return 0;
  }
  if (division >= 16) {
    const pos = slot % 4;
    return pos === 1 || pos === 3 ? 0.25 * p : 0;
  }
  return slot % 2 === 1 ? 0.5 * p : 0;
}

const MIDI = {
  kick: 36,
  foot: 44,
  snare: 38,
  xstick: 37,
  tom1: 50,
  tom2: 47,
  tom3: 43,
  hat: 42,
  hatOpen: 46,
  hatAccent: 42,
  crash: 49,
  ride: 51,
  rideBell: 53,
  cow: 56,
  stack: 52,
  click: 76,
  clickSoft: 77,
  wood: 76,
};

export function hitsForGroove(g, { solo = false } = {}) {
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  const secondsPerQuarter = 60 / g.tempo;
  const hits = [];
  for (let i = 0; i < g.hh.length; i++) {
    const measure = Math.floor(i / npm);
    const quarters = i * (4 / g.division) + swingExtraQuarters(i, g.division, g.swing);
    const time = quarters * secondsPerQuarter;
    const push = (inst, vel, dt = 0) => hits.push({ time: time + dt, midi: MIDI[inst] ?? 38, inst, vel });
    if (!solo) {
      if (!g.mute.kick[measure]) addKick(g.kick[i], push);
      if (!g.mute.snare[measure]) addSnare(g.snare[i], push);
      if (g.showToms >= 1 && !g.mute.tom1[measure] && g.tom1[i]) push("tom1", 108);
      if (g.showToms >= 2 && !g.mute.tom2[measure] && g.tom2[i]) push("tom2", 102);
      if (g.showToms >= 3 && !g.mute.tom3[measure] && g.tom3[i]) push("tom3", 96);
      if (!g.mute.hh[measure]) addHat(g.hh[i], push);
    }
  }
  return hits.sort((a, b) => a.time - b.time);
}

function addKick(kind, push) {
  if (kind === "normal" || kind === "both") push("kick", 112);
  if (kind === "splash" || kind === "both") push("foot", 90);
  if (kind === "foot_open") push("hatOpen", 96);
}

function addSnare(kind, push) {
  if (!kind) return;
  if (kind === "accent") push("snareAccent", 112);
  else if (kind === "ghost") push("ghost", 40);
  else if (kind === "rimshot") push("snareRim", 120);
  else if (kind === "xstick") push("xstick", 84);
  else if (kind === "buzz") {
    push("ghost", 46);
    push("ghost", 42, 0.018);
    push("snare", 78, 0.04);
  } else if (kind === "flam") {
    push("ghost", 48, -0.03);
    push("snareAccent", 108);
  } else if (kind === "drag") {
    push("ghost", 36, -0.05);
    push("ghost", 44, -0.028);
    push("snare", 96);
  } else push("snare", 92);
}

function addHat(kind, push) {
  if (!kind) return;
  switch (kind) {
    case "open":
      push("hatOpen", 100);
      break;
    case "half":
      push("hatOpen", 84);
      break;
    case "closed_plus":
      push("hat", 96);
      break;
    case "foot_only":
      push("foot", 90);
      break;
    case "accent":
      push("hat", 122);
      break;
    case "crash":
    case "crash_tie":
      push("crash", 110);
      break;
    case "crash_roll":
      push("crash", 104);
      push("crash", 88, 0.06);
      break;
    case "ride":
      push("ride", 96);
      break;
    case "ride_bell":
      push("rideBell", 108);
      break;
    case "cow_bell":
      push("cow", 110);
      break;
    case "stacker":
      push("stack", 100);
      break;
    case "click":
      push("clickSoft", 100);
      break;
    case "click_accent":
      push("click", 118);
      break;
    default:
      push("hat", 92);
  }
}

export function metronomeHits(g, { offset = "1", rate = 4 } = {}) {
  if (!rate) return [];
  const total = stepCount(g);
  const spq = 60 / g.tempo;
  const shift = offsetShiftSlots(g, offset);
  const slotsPerQuarter = g.division / 4;
  const hits = [];
  for (let i = 0; i < total; i++) {
    const local = i % notesPerMeasure(g.division, g.top, g.bottom);
    const onQuarter = slotsPerQuarter >= 1 && local % slotsPerQuarter === shift % slotsPerQuarter;
    const onEighth = rate >= 8 && eighthSlot(g, i, shift);
    const onSixteenth = rate >= 16 && sixteenthSlot(g, i, shift);
    const accent = isAccentSlot(g, i, shift);
    let sound = null;
    if (rate === 4 && onQuarter) sound = accent ? "one" : "quarter";
    if (rate === 8 && (onQuarter || onEighth)) sound = accent ? "one" : onQuarter ? "quarter" : "eighth";
    if (rate === 16 && (onQuarter || onEighth || onSixteenth)) {
      sound = accent ? "one" : onQuarter ? "quarter" : onEighth ? "eighth" : "soft";
    }
    if (!sound) continue;
    const quarters = i * (4 / g.division) + swingExtraQuarters(i, g.division, g.swing);
    const one = sound === "one";
    hits.push({
      time: quarters * spq,
      midi: one ? 56 : sound === "soft" ? 77 : 76,
      inst: one ? "cow" : sound === "soft" ? "clickSoft" : "click",
      vel: sound === "soft" ? 58 : one ? 118 : sound === "quarter" ? 96 : 78,
      metronome: true,
    });
  }
  return hits;
}

function eighthSlot(g, index, shift) {
  const per = Math.max(1, g.division / 8);
  return (index - shift + g.division * 8) % per === 0;
}

function sixteenthSlot(g, index, shift) {
  const per = Math.max(1, g.division / 16);
  return (index - shift + g.division * 8) % per === 0;
}

function isAccentSlot(g, index, shift) {
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  const local = ((index - shift) % npm + npm) % npm;
  return local === 0;
}

export function offsetChoices(division) {
  if (isTripletDivision(division)) return ["1", "&", "a", "rotate"];
  if (division <= 8) return ["1", "&", "rotate"];
  return ["1", "e", "&", "a", "rotate"];
}

export function offsetShiftSlots(g, offset) {
  const name = offset === "rotate" ? "1" : offset;
  if (isTripletDivision(g.division)) {
    const per = g.division / g.top / (g.bottom / 4);
    const map = { 1: 0, "&": Math.floor(per / 3), a: Math.floor((2 * per) / 3) };
    return map[name] || 0;
  }
  const sixteenth = Math.max(1, g.division / 16);
  const map = { 1: 0, e: sixteenth, "&": sixteenth * 2, a: sixteenth * 3 };
  return map[name] || 0;
}

export function nextRotateOffset(division, current) {
  const choices = offsetChoices(division).filter((c) => c !== "rotate");
  const idx = Math.max(0, choices.indexOf(current));
  return choices[(idx + 1) % choices.length];
}

export function encodeMidi(hits, tempo) {
  const tpq = 480;
  const events = [];
  const uspq = Math.round(60000000 / tempo);
  events.push({ tick: 0, bytes: [0xff, 0x51, 0x03, (uspq >> 16) & 0xff, (uspq >> 8) & 0xff, uspq & 0xff] });
  events.push({ tick: 0, bytes: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] });
  const secPerTick = 60 / tempo / tpq;
  for (const hit of hits) {
    const tick = Math.max(0, Math.round(hit.time / secPerTick));
    const dur = Math.max(20, Math.round((hit.inst === "hatOpen" || hit.inst === "crash" ? 0.4 : 0.12) / secPerTick));
    const note = hit.midi & 127;
    const vel = Math.max(1, Math.min(127, hit.vel | 0));
    events.push({ tick, bytes: [0x99, note, vel] });
    events.push({ tick: tick + dur, bytes: [0x89, note, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || a.bytes[0] - b.bytes[0]);
  events.push({ tick: (events[events.length - 1]?.tick || 0) + tpq, bytes: [0xff, 0x2f, 0x00] });
  const track = encodeTrack(events);
  const header = bytes(4, "MThd", [0, 0, 0, 6, 0, 0, 0, 1, (tpq >> 8) & 0xff, tpq & 0xff]);
  return concat(header, track);
}

function encodeTrack(events) {
  const data = [];
  let last = 0;
  for (const event of events) {
    data.push(...vlq(event.tick - last));
    data.push(...event.bytes);
    last = event.tick;
  }
  const len = data.length;
  return bytes(4, "MTrk", [(len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff, ...data]);
}

function vlq(value) {
  if (value < 0) value = 0;
  const chunks = [value & 0x7f];
  value >>= 7;
  while (value) {
    chunks.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return chunks;
}

function bytes(n, ascii, rest) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(ascii.charCodeAt(i));
  out.push(...rest);
  return out;
}

function concat(...arrays) {
  const out = [];
  for (const a of arrays) out.push(...a);
  return new Uint8Array(out);
}

function beatPositions(section, triplet) {
  if (triplet) {
    const map = {
      0: [],
      1: [0],
      2: [1],
      3: [2],
      4: [],
      5: [0, 1],
      6: [1, 2],
      7: [2, 0],
      8: [],
      9: [0],
      10: [1, 2],
      11: [0, 1, 2],
      12: [],
      13: [],
      14: [],
      15: [0, 1, 2],
    };
    return map[section] || [];
  }
  const map = {
    0: [],
    1: [0],
    2: [1],
    3: [2],
    4: [3],
    5: [0, 1],
    6: [1, 2],
    7: [2, 3],
    8: [3, 0],
    9: [0, 2],
    10: [1, 3],
    11: [0, 1, 2],
    12: [1, 2, 3],
    13: [2, 3, 0],
    14: [3, 0, 1],
    15: [0, 1, 2, 3],
  };
  return map[section] || [];
}

function simplifyPositions(beats, triplet) {
  const last = triplet ? 2 : 3;
  const drop = triplet ? [0] : [0, 1];
  for (let b = 0; b < beats.length; b++) {
    const prev = beats[(b + beats.length - 1) % beats.length];
    if (prev.includes(last)) beats[b] = beats[b].filter((p) => !drop.includes(p));
  }
  return beats;
}

/** Build a practice variation of the first measure. */
export function buildPermutation(g, { kind = "kick", sections = [0, 1, 2, 3, 4], simplify = false, accentGrid = false, diddles = false } = {}) {
  const triplet = isTripletDivision(g.division);
  const division = triplet ? 12 : 16;
  const usable = sections.filter((id) => beatPositions(id, triplet).length || id === 0);
  const unique = [...new Set(usable.length ? usable : [0])].sort((a, b) => a - b);
  const base = resampleMeasure(g, division);
  const perBeat = division / g.bottom;
  const beatsInBar = g.top;
  const measures = [];
  for (const section of unique) {
    let positions = beatPositions(section, triplet);
    const beatSets = Array.from({ length: beatsInBar }, () => positions.slice());
    if (simplify && kind === "kick") simplifyPositions(beatSets, triplet);
    const hh = base.hh.slice();
    const snare = base.snare.slice();
    const kick = fill(base.hh.length, null);
    const tom1 = base.tom1.slice();
    const tom2 = base.tom2.slice();
    const tom3 = base.tom3.slice();
    for (let b = 0; b < beatsInBar; b++) {
      for (let s = 0; s < perBeat; s++) {
        const idx = b * perBeat + s;
        const userKick = base.kick[idx];
        const foot = userKick === "splash" || userKick === "both";
        const on = beatSets[b].includes(s);
        if (kind === "kick") {
          if (section === 0) {
            kick[idx] = foot ? "splash" : null;
          } else if (on && foot) kick[idx] = "both";
          else if (on) kick[idx] = "normal";
          else if (foot) kick[idx] = "splash";
        } else if (section === 0) {
          kick[idx] = userKick;
        } else {
          kick[idx] = userKick;
          if (accentGrid || diddles) snare[idx] = on ? (diddles ? "buzz" : "accent") : "ghost";
          else snare[idx] = on ? "normal" : null;
        }
      }
    }
    measures.push({ hh, snare, kick, tom1, tom2, tom3 });
  }
  const out = emptyGroove({
    top: g.top,
    bottom: g.bottom,
    division,
    measures: measures.length,
    tempo: g.tempo,
    swing: g.swing,
    title: g.title ? `${g.title} (${kind} permutation)` : `${kind === "kick" ? "Kick" : "Snare"} permutation`,
    author: g.author,
    comments: g.comments,
    showToms: g.showToms,
    showStickings: false,
  });
  out.hh = measures.flatMap((m) => m.hh);
  out.snare = measures.flatMap((m) => m.snare);
  out.kick = measures.flatMap((m) => m.kick);
  out.tom1 = measures.flatMap((m) => m.tom1);
  out.tom2 = measures.flatMap((m) => m.tom2);
  out.tom3 = measures.flatMap((m) => m.tom3);
  return out;
}

function resampleMeasure(g, toDivision) {
  const npm = notesPerMeasure(g.division, g.top, g.bottom);
  const toNpm = notesPerMeasure(toDivision, g.top, g.bottom);
  const take = (arr) => {
    const out = fill(toNpm, null);
    for (let i = 0; i < toNpm; i++) {
      const src = (i * g.division) / toDivision;
      if (Math.abs(src - Math.round(src)) < 1e-6) out[i] = arr[Math.round(src)] ?? null;
    }
    return out;
  };
  return {
    hh: take(g.hh.slice(0, npm)),
    snare: take(g.snare.slice(0, npm)),
    kick: take(g.kick.slice(0, npm)),
    tom1: take(g.tom1.slice(0, npm)),
    tom2: take((g.tom2 || []).slice(0, npm)),
    tom3: take((g.tom3 || g.tom4 || []).slice(0, npm)),
  };
}

export const PRESETS = [
  {
    group: "Rock grooves",
    items: [
      ["Empty 16th note groove", "TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|----------------|&S=|----------------|&K=|----------------|"],
      ["8th note rock", "TimeSig=4/4&Div=8&Tempo=80&Measures=1&H=|xxxxxxxx|&S=|--O---O-|&K=|o---o--|"],
      ["16th note rock", "TimeSig=4/4&Div=16&Tempo=80&Measures=1&H=|xxxxxxxxxxxxxxxx|&S=|----O-------O---|&K=|o-------o-------|"],
      ["Syncopated hi-hats 1", "TimeSig=4/4&Div=16&Title=Syncopated%20hi-hats%201&Tempo=80&Measures=1&H=|x-xxx-xxx-xxx-xx|&S=|----O-------O---|&K=|o-------o-------|"],
      ["Syncopated hi-hats 2", "TimeSig=4/4&Div=16&Title=Syncopated%20hi-hats%202&Tempo=80&Measures=1&H=|xxx-xxx-xxx-xxx-|&S=|----O-------O---|&K=|o-------o-------|"],
      ["Train beat", "TimeSig=4/4&Div=16&Title=Train%20Beat&Tempo=95&Measures=1&H=|----------------|&S=|ggOgggOgggOggOOg|&K=|o-x-o-x-o-x-o-x-|"],
    ],
  },
  {
    group: "Triplet grooves",
    items: [
      ["Jazz shuffle", "TimeSig=4/4&Div=12&Title=Jazz%20Shuffle&Tempo=100&Measures=1&H=|r--r-rr--r-r|&S=|g-gO-gg-gO-g|&K=|o--X--o--X--|"],
      ["Half time shuffle", "TimeSig=4/4&Div=12&Title=Half%20Time%20Shuffle&Tempo=80&Measures=1&H=|x-xx-xx-xx-x|&S=|-g--g-Og--g-|&K=|------------|"],
      ["Half time shuffle (16th)", "TimeSig=4/4&Div=24&Tempo=85&Measures=1&H=|x-xx-xx-xx-xx-xx-xx-xx-x|&S=|-g--g-Og--g--g--g-Og--g-|&K=|------------------------|"],
      ["Purdie shuffle", "TimeSig=4/4&Div=12&Title=Purdie%20Shuffle&Tempo=120&Measures=1&H=|x-xx-xx-xx-x|&S=|-g--g-Og--g-|&K=|o----o-----o|"],
      ["Jazz ride", "TimeSig=4/4&Div=12&Tempo=80&Measures=1&H=|r--r-rr--r-r|&S=|------------|&K=|---x-----x--|"],
    ],
  },
  {
    group: "World grooves",
    items: [
      ["Bossa nova", "TimeSig=4/4&Title=Bossa%20Nova&Div=8&Tempo=140&Measures=2&H=|xxxxxxxx|xxxxxxxx|&S=|x-x--x-x|-x--x-x-|&K=|o-xoo-xo|o-xoo-xo|"],
      ["Samba", "TimeSig=4/4&Div=16&Title=Samba&Tempo=80&Measures=1&H=|r-rrr-rrr-rrr-rr|&S=|o-o--o-o-o-oo-o-|&K=|o-xoo-xoo-xoo-xo|"],
      ["Songo", "TimeSig=4/4&Div=16&Title=Songo&Tempo=80&Measures=1&H=|x---x---x---x---|&S=|--O--g-O-gg--g-g|&K=|---o--o----o--o-|"],
    ],
  },
  {
    group: "Foot ostinatos",
    items: [
      ["Samba ostinato", "TimeSig=4/4&Div=16&Title=Samba%20Ostinato&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|o-xoo-xoo-xoo-xo|"],
      ["Tumbao", "TimeSig=4/4&Div=16&Title=Tumbao&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|x--ox-o-x--ox-o-|"],
      ["Baiao", "TimeSig=4/4&Div=16&Title=Baiao&Tempo=60&Measures=1&H=|----------------|&S=|----------------|&K=|o-xo--X-o-xo--X-|"],
    ],
  },
];

export function loadPreset(query) {
  return fromQuery(query.startsWith("?") ? query : `?${query}`);
}
