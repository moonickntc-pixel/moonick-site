/* 十二音圓形音階：點圓上的音就發出音高（Web Audio + 自架取樣） */
(function () {
  "use strict";

  var PC_NAMES = ["C", "C#/Db", "D", "D#/Eb", "E", "F", "F#/Gb", "G", "G#/Ab", "A", "A#/Bb", "B"];
  var BLACK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
  var FILE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  // 每個音約 1 秒：0.8 秒後開始指數淡出 0.25 秒，避免爆音。
  var NOTE_ATTACK = 0.005;
  var NOTE_FADE_AT = 0.8;
  var NOTE_FADE = 0.25;
  var NOTE_LEN = NOTE_FADE_AT + NOTE_FADE; // 1.05
  var CHOKE = 0.02;

  // 取樣：每個八度取 C、Eb、Gb、A 四個音，其他音用最近的取樣移調（最多一個半音）。
  // octShift：以畫面上的八度為準，實際發聲再移幾個八度（Bass 低兩個八度）。
  function grid(lo, hi) {
    var list = [];
    for (var m = lo; m <= hi; m++) if ([0, 3, 6, 9].indexOf(m % 12) >= 0) list.push(m);
    return list;
  }
  var INSTRUMENTS = {
    piano: { label: "鋼琴", dir: "piano", notes: grid(48, 84), octShift: 0 },
    acoustic: { label: "木吉他", dir: "acoustic", notes: grid(48, 84), octShift: 0 },
    electric: { label: "電吉他", dir: "electric", notes: grid(48, 84), octShift: 0 },
    bass: { label: "Bass", dir: "bass", notes: grid(24, 60), octShift: -2, hint: "Bass 實際音高比畫面上的八度低兩個八度。" },
    voice: { label: "人聲", dir: "voice", notes: grid(48, 84), octShift: 0 },
    // 小江老師：老師唱的「啊」#F3（已校正到 185.0 Hz），一個取樣移調成 12 個音。
    // 男聲，實際比畫面上的八度低一個八度：預設 C4–B4 會發出 C3–B3，都在 #F3 上下半個八度內。
    teacher: { label: "小江老師", dir: "teacher", notes: [54], files: { 54: "Fs3" }, octShift: -1, single: true,
      hint: "小江老師的聲音比顯示低一個八度。" }
  };
  var INST_ORDER = ["piano", "acoustic", "electric", "bass", "voice", "teacher"];
  // 音量：2026-11-21 離線實測（舊版 master 0.9、和弦還有 1.1/√n）。C 大調音階綜合響度約 -31.7～-26.1 LUFS，
  // 比 YouTube 常見的約 -14 LUFS 小約 12～18 dB，和弦更小聲。各音色 gain 讓 C 大調音階靠近 -14 LUFS，彼此對齊。
  // 總增益相對舊輸出（已含 0.9）：鋼琴 +16.7 dB、木吉他 +14.7、電吉他 +13.7、Bass +11.2、人聲 +12.1、小江老師 +11.1
  // （先依音階對到約 -14 LUFS；再留 1 dB 給和弦峰值）。Limiter 後面加 -1.2 dBFS 安全限幅，避免 True Peak 超過約 -1 dBTP。
  function dbToLin(db) { return Math.pow(10, db / 20); }
  var MASTER_GAIN = 1;
  INST_ORDER.forEach(function (id) {
    var boost = { piano: 16.7, acoustic: 14.7, electric: 13.7, bass: 11.2, voice: 12.1, teacher: 11.1 }[id];
    INSTRUMENTS[id].gain = 0.9 * dbToLin(boost);
  });
  var LIMITER = { threshold: -3, knee: 2, ratio: 20, attack: 0.001, release: 0.15, clipDb: -1.2 };
  // 和弦不要再大幅壓低；靠後面的 limiter 避免爆音。5 音約 0.85（舊的 5 音是 0.49）。
  function chordLevel(n) { return Math.min(1, 1 / Math.pow(Math.max(1, n), 0.1)); }

  // 12 個大調。enh：可切換的同音異名寫法。
  var KEYS = [
    { pc: 0, name: "C" },
    { pc: 1, name: "Db", enh: "C#" },
    { pc: 2, name: "D" },
    { pc: 3, name: "Eb" },
    { pc: 4, name: "E" },
    { pc: 5, name: "F" },
    { pc: 6, name: "F#", enh: "Gb" },
    { pc: 7, name: "G" },
    { pc: 8, name: "Ab" },
    { pc: 9, name: "A" },
    { pc: 10, name: "Bb" },
    { pc: 11, name: "B" }
  ];
  var MAJOR = [0, 2, 4, 5, 7, 9, 11];
  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  var LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SOLFA = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Si"];

  function spellMajor(tonicName) {
    var letter = tonicName[0];
    var acc = tonicName.slice(1) === "#" ? 1 : tonicName.slice(1) === "b" ? -1 : 0;
    var tonicPc = (LETTER_PC[letter] + acc + 12) % 12;
    var li = LETTERS.indexOf(letter);
    var out = {};
    for (var d = 0; d < 7; d++) {
      var L = LETTERS[(li + d) % 7];
      var pc = (tonicPc + MAJOR[d]) % 12;
      var diff = ((pc - LETTER_PC[L]) % 12 + 18) % 12 - 6; // -6..5
      var s = diff === 0 ? "" : diff > 0 ? new Array(diff + 1).join("#") : new Array(-diff + 1).join("b");
      out[pc] = { name: L + s, degree: d };
    }
    return out;
  }

  // 關係小調（大調音階的第 6 級），拼寫依調。例如 F → Dm、F# → D#m、Gb → Ebm。
  function relativeMinorName(tonicName) {
    var spelled = spellMajor(tonicName);
    for (var p = 0; p < 12; p++) {
      if (spelled[p] && spelled[p].degree === 5) return spelled[p].name + "m";
    }
    return "";
  }
  function keyMenuLabel(tonicName) {
    return tonicName + " Key (" + relativeMinorName(tonicName) + " Key)";
  }

  // ---------- 和弦 ----------
  // iv：根音往上的半音數；st：音名往上數幾個字母（拼寫用，例如 7 度 = 6）。
  // degIn／degSup：級數寫法，m 寫在數字旁邊，其餘用上標（例如 2m⁷、5⁷、4ᵐᵃʲ⁷）。
  var CHORDS = [
    { id: "maj", btn: "大三", suf: "", iv: [0, 4, 7], st: [0, 2, 4], degIn: "", degSup: "" },
    { id: "m", btn: "m", suf: "m", iv: [0, 3, 7], st: [0, 2, 4], degIn: "m", degSup: "", minor: true },
    { id: "7", btn: "7", suf: "7", iv: [0, 4, 7, 10], st: [0, 2, 4, 6], degIn: "", degSup: "7" },
    { id: "maj7", btn: "maj7", suf: "maj7", iv: [0, 4, 7, 11], st: [0, 2, 4, 6], degIn: "", degSup: "maj7" },
    { id: "m7", btn: "m7", suf: "m7", iv: [0, 3, 7, 10], st: [0, 2, 4, 6], degIn: "m", degSup: "7", minor: true },
    { id: "m7b5", btn: "m7b5", suf: "m7b5", iv: [0, 3, 6, 10], st: [0, 2, 4, 6], degIn: "m", degSup: "7\u266d5", minor: true },
    { id: "dim", btn: "dim", suf: "dim", iv: [0, 3, 6], st: [0, 2, 4], degIn: "", degSup: "dim", minor: true },
    { id: "dim7", btn: "dim7", suf: "dim7", iv: [0, 3, 6, 9], st: [0, 2, 4, 6], degIn: "", degSup: "dim7", minor: true },
    { id: "aug", btn: "aug", suf: "aug", iv: [0, 4, 8], st: [0, 2, 4], degIn: "", degSup: "aug" },
    { id: "sus2", btn: "sus2", suf: "sus2", iv: [0, 2, 7], st: [0, 1, 4], degIn: "", degSup: "sus2" },
    { id: "sus4", btn: "sus4", suf: "sus4", iv: [0, 5, 7], st: [0, 3, 4], degIn: "", degSup: "sus4" },
    { id: "6", btn: "6", suf: "6", iv: [0, 4, 7, 9], st: [0, 2, 4, 5], degIn: "", degSup: "6" },
    { id: "m6", btn: "m6", suf: "m6", iv: [0, 3, 7, 9], st: [0, 2, 4, 5], degIn: "m", degSup: "6", minor: true },
    { id: "69", btn: "69", suf: "69", iv: [0, 4, 7, 9, 14], st: [0, 2, 4, 5, 1], degIn: "", degSup: "69" },
    { id: "add9", btn: "add9", suf: "add9", iv: [0, 4, 7, 14], st: [0, 2, 4, 1], degIn: "", degSup: "add9" },
    { id: "9", btn: "9", suf: "9", iv: [0, 4, 7, 10, 14], st: [0, 2, 4, 6, 1], degIn: "", degSup: "9" },
    { id: "m9", btn: "m9", suf: "m9", iv: [0, 3, 7, 10, 14], st: [0, 2, 4, 6, 1], degIn: "m", degSup: "9", minor: true },
    { id: "maj9", btn: "maj9", suf: "maj9", iv: [0, 4, 7, 11, 14], st: [0, 2, 4, 6, 1], degIn: "", degSup: "maj9" }
  ];
  var CHORD_BY_ID = {};
  CHORDS.forEach(function (c) { CHORD_BY_ID[c.id] = c; });
  // 順階和弦（大調第 1–7 級）
  var DIATONIC = { auto3: ["maj", "m", "m", "maj", "maj", "m", "dim"], auto7: ["maj7", "m7", "m7", "maj7", "7", "m7", "m7b5"] };
  // 調外的根音：b2 b3 #4 b6 b7（[第幾級, 升降]）
  var CHROMATIC_DEG = { 1: [1, -1], 3: [2, -1], 6: [3, 1], 8: [5, -1], 10: [6, -1] };
  // 不選調時根音的寫法：小三類和弦用升記號（C#m、G#m），其他用降記號（Db、Ab）
  var ROOT_FLAT = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  var ROOT_MINOR = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

  function accStr(diff) { return diff === 0 ? "" : diff > 0 ? new Array(diff + 1).join("#") : new Array(-diff + 1).join("b"); }
  function spellLetter(L, pc) {
    var diff = ((pc - LETTER_PC[L]) % 12 + 18) % 12 - 6;
    return L + accStr(diff);
  }
  // 和弦資料：根音 pc、和弦種類 id、調名（例如 "F"，不選調傳空字串）
  function chordInfo(rootPc, typeId, tonicName) {
    var c = CHORD_BY_ID[typeId];
    if (!c) return null;
    var rootName = null, deg = null;
    if (tonicName) {
      var spelled = spellMajor(tonicName);
      var tonicPc = (LETTER_PC[tonicName[0]] + (tonicName.slice(1) === "#" ? 1 : tonicName.slice(1) === "b" ? -1 : 0) + 12) % 12;
      var off = (rootPc - tonicPc + 12) % 12;
      if (spelled[rootPc]) {
        rootName = spelled[rootPc].name;
        deg = String(spelled[rootPc].degree + 1);
      } else {
        var cd = CHROMATIC_DEG[off];
        var baseName = null;
        for (var p = 0; p < 12; p++) if (spelled[p] && spelled[p].degree === cd[0]) baseName = spelled[p].name;
        var cand = spellLetter(baseName[0], rootPc);
        // 太難讀的寫法（Fb、Cb、E#、B#、重升重降）改用一般寫法
        if (/^(Fb|Cb|E#|B#)$/.test(cand) || /##|bb/.test(cand)) cand = null;
        rootName = cand;
        deg = (cd[1] < 0 ? "b" : "#") + (cd[0] + 1);
      }
    }
    if (!rootName) rootName = (c.minor ? ROOT_MINOR : ROOT_FLAT)[rootPc];
    var li = LETTERS.indexOf(rootName[0]);
    var tones = c.iv.map(function (iv, i) {
      return spellLetter(LETTERS[(li + c.st[i]) % 7], (rootPc + iv) % 12);
    });
    var pcs = c.iv.map(function (iv) { return (rootPc + iv) % 12; });
    var degText = deg === null ? "" : deg + c.degIn + c.degSup;
    var degHtml = deg === null ? "" : deg + c.degIn + (c.degSup ? "<sup>" + c.degSup.replace("\u266d", '<span class="fl">\u266d</span>') + "</sup>" : "");
    return { id: c.id, root: rootPc, name: rootName + c.suf, tones: tones, pcs: pcs, iv: c.iv.slice(), degree: deg, degText: degText, degHtml: degHtml };
  }

  // ---------- 狀態 ----------
  var state = { inst: "piano", key: -1, useEnh: false, label: "num", octave: 4, chord: "", shown: null };
  var OCT_MIN = 3, OCT_MAX = 5;

  // ---------- 音訊 ----------
  var ctx = null, master = null, limiter = null, instGain = null, clip = null;
  var buffers = {}; // inst -> {midi: AudioBuffer}
  var loading = {};
  var voices = [];
  window.__noteLog = [];
  window.__sampleStatus = {};

  // 輸出鏈：音色增益 → master → DynamicsCompressor（當 limiter）→ 目的地。直播與離線同一套。
  function makeSafetyClip(audioCtx) {
    var ceil = dbToLin(LIMITER.clipDb);
    var start = dbToLin(Math.min(-3, LIMITER.clipDb - 1.5));
    var sh = audioCtx.createWaveShaper();
    var n = 65536;
    var curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1;
      var a = Math.abs(x), s = x < 0 ? -1 : 1, y;
      if (a <= start) y = a;
      else {
        var u = (a - start) / Math.max(1e-6, 1 - start);
        y = start + (ceil - start) * (1 - Math.exp(-3 * u));
        if (y > ceil) y = ceil;
      }
      curve[i] = s * y;
    }
    sh.curve = curve;
    sh.oversample = "4x";
    return sh;
  }

  function buildOutputChain(audioCtx) {
    var gains = {};
    var mast = audioCtx.createGain();
    mast.gain.value = MASTER_GAIN;
    var lim = audioCtx.createDynamicsCompressor();
    lim.threshold.value = LIMITER.threshold;
    lim.knee.value = LIMITER.knee;
    lim.ratio.value = LIMITER.ratio;
    lim.attack.value = LIMITER.attack;
    lim.release.value = LIMITER.release;
    var clip = makeSafetyClip(audioCtx);
    INST_ORDER.forEach(function (id) {
      var g = audioCtx.createGain();
      g.gain.value = INSTRUMENTS[id].gain;
      g.connect(mast);
      gains[id] = g;
    });
    mast.connect(lim);
    lim.connect(clip);
    clip.connect(audioCtx.destination);
    return { instGain: gains, master: mast, limiter: lim, clip: clip };
  }

  function ensureCtx() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC({ latencyHint: "interactive" });
      var chain = buildOutputChain(ctx);
      master = chain.master;
      limiter = chain.limiter;
      instGain = chain.instGain;
      clip = chain.clip;
    }
    return ctx;
  }
  // iOS：第一次觸碰時解鎖音訊
  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    unlocked = true;
  }
  ["pointerdown", "touchstart", "keydown", "mousedown"].forEach(function (ev) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  });

  function midiName(m) { return FILE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }

  function loadInst(id, audioCtx) {
    var ac = audioCtx || ensureCtx();
    if (!audioCtx && loading[id]) return loading[id];
    if (!audioCtx) buffers[id] = buffers[id] || {};
    var target = audioCtx ? {} : buffers[id];
    var inst = INSTRUMENTS[id];
    var ok = 0, fail = 0;
    var job = Promise.all(inst.notes.map(function (m) {
      var url = "samples/" + inst.dir + "/" + ((inst.files && inst.files[m]) || midiName(m)) + ".mp3";
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + " " + r.status);
        return r.arrayBuffer();
      }).then(function (ab) {
        return new Promise(function (res, rej) { ac.decodeAudioData(ab.slice(0), res, rej); });
      }).then(function (buf) { target[m] = buf; ok++; })
        .catch(function (e) { fail++; console.warn("取樣載入失敗", e); });
    })).then(function () {
      if (!audioCtx) window.__sampleStatus[id] = { ok: ok, fail: fail, total: inst.notes.length };
      return target;
    });
    if (!audioCtx) loading[id] = job;
    return job;
  }

  function nearestIn(bufs, midi) {
    var best = null, bd = 1e9;
    Object.keys(bufs).forEach(function (k) {
      var d = Math.abs(+k - midi);
      if (d < bd) { bd = d; best = +k; }
    });
    return best;
  }
  function nearest(id, midi) { return nearestIn(buffers[id] || {}, midi); }

  // 選了調時，以主音為這個八度的最低音：低於主音的音名往上提一個八度。
  // 例如 F Key、畫面 C4 八度：F→F4，C→C5，E→E5。不選調則維持 C–B。
  function soundingMidi(pc, instId) {
    var midi = 12 * (state.octave + 1) + pc + 12 * INSTRUMENTS[instId || state.inst].octShift;
    if (state.key >= 0 && pc < KEYS[state.key].pc) midi += 12;
    return midi;
  }

  function applyEnvelope(gain, t, rawDur, peak) {
    if (!peak) peak = 1;
    var fadeAt = NOTE_FADE_AT;
    var fade = NOTE_FADE;
    if (rawDur < fadeAt + fade) {
      fadeAt = Math.max(NOTE_ATTACK + 0.04, rawDur - fade);
      if (fadeAt + fade > rawDur) fade = Math.max(0.04, rawDur - fadeAt);
    }
    var end = fadeAt + fade;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + NOTE_ATTACK);
    gain.gain.setValueAtTime(peak, t + fadeAt);
    gain.gain.exponentialRampToValueAtTime(0.001, t + end);
    return { fadeAt: fadeAt, fade: fade, dur: end };
  }

  function startNote(audioCtx, dest, bufs, midi, when, level) {
    var s = nearestIn(bufs, midi);
    if (s === null) return null;
    var rate = Math.pow(2, (midi - s) / 12);
    var t = Math.max(audioCtx.currentTime, when || 0);
    var src = audioCtx.createBufferSource();
    src.buffer = bufs[s];
    src.playbackRate.value = rate;
    var g = audioCtx.createGain();
    var env = applyEnvelope(g, t, src.buffer.duration / rate, level);
    src.connect(g); g.connect(dest);
    src.start(t);
    src.stop(t + env.dur + 0.02);
    return { src: src, gain: g, midi: midi, start: t, sample: s, rate: rate, fadeAt: env.fadeAt, dur: env.dur };
  }

  function chokeVoices(pred, t) {
    var keep = [];
    voices.forEach(function (v) {
      if (!pred(v)) { keep.push(v); return; }
      try {
        v.gain.gain.cancelScheduledValues(t);
        var cur = v.gain.gain.value;
        v.gain.gain.setValueAtTime(Math.max(0.001, cur || 0.001), t);
        v.gain.gain.exponentialRampToValueAtTime(0.001, t + CHOKE);
        v.src.stop(t + CHOKE + 0.01);
      } catch (err) {}
    });
    voices = keep;
  }

  function playMidi(midi, when) {
    var id = state.inst;
    ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    return loadInst(id).then(function () {
      var t = Math.max(ctx.currentTime, when || 0);
      chokeVoices(function (v) { return v.midi === midi; }, t);
      var v = startNote(ctx, instGain[id], buffers[id], midi, t);
      if (!v) return;
      voices.push(v);
      var freq = 440 * Math.pow(2, (midi - 69) / 12);
      window.__noteLog.push({ inst: id, midi: midi, freq: +freq.toFixed(2), sample: v.sample, rate: +v.rate.toFixed(4), t: v.start, dur: v.dur, fadeAt: v.fadeAt });
    });
  }

  // 和弦：一起發聲（吉他快速往上刷，每弦約 25ms），先停掉上一個和弦。
  function playChord(midis, when) {
    var id = state.inst;
    ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    var strum = (id === "acoustic" || id === "electric") ? 0.025 : 0;
    var level = chordLevel(midis.length);
    return loadInst(id).then(function () {
      var t = Math.max(ctx.currentTime, when || 0);
      chokeVoices(function () { return true; }, t);
      midis.forEach(function (midi, i) {
        var v = startNote(ctx, instGain[id], buffers[id], midi, t + i * strum, level);
        if (!v) return;
        voices.push(v);
        var freq = 440 * Math.pow(2, (midi - 69) / 12);
        window.__noteLog.push({ inst: id, midi: midi, freq: +freq.toFixed(2), sample: v.sample, rate: +v.rate.toFixed(4), t: v.start, dur: v.dur, fadeAt: v.fadeAt, chord: midis.slice() });
      });
    });
  }

  // 和弦的實際音高：根音照單音的八度規則（選調時主音最低），其他音往上疊。
  // Bass 只彈根音；多取樣音色若最高音超出取樣範圍就整組降一個八度。
  function chordMidis(rootPc, typeId, instId) {
    var c = CHORD_BY_ID[typeId];
    var inst = INSTRUMENTS[instId || state.inst];
    var root = soundingMidi(rootPc, instId);
    if (instId ? instId === "bass" : state.inst === "bass") return [root];
    var list = c.iv.map(function (iv) { return root + iv; });
    var maxS = Math.max.apply(null, inst.notes);
    while (!inst.single && list[list.length - 1] > maxS + 1) list = list.map(function (m) { return m - 12; });
    return list;
  }

  // 離線渲染（試聽檔、測試音長用），套用與畫面相同的包絡與取樣移調。
  function renderOffline(events, seconds, sr) {
    sr = sr || 44100;
    seconds = seconds || 1.5;
    var Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var offline = new Offline(2, Math.ceil(seconds * sr), sr);
    var chain = buildOutputChain(offline);
    var ids = [];
    events.forEach(function (e) { if (ids.indexOf(e.inst) < 0) ids.push(e.inst); });
    return Promise.all(ids.map(function (id) { return loadInst(id, offline).then(function (bufs) { return [id, bufs]; }); })).then(function (pairs) {
      var map = {};
      pairs.forEach(function (p) { map[p[0]] = p[1]; });
      events.forEach(function (e) {
        startNote(offline, chain.instGain[e.inst], map[e.inst], e.midi, e.when, e.level);
      });
      return offline.startRendering();
    });
  }

  // ---------- 畫圓 ----------
  var svg = document.getElementById("circle");
  var NS = "http://www.w3.org/2000/svg";
  var CX = 300, CY = 300, R = 228, NR = 50;
  var noteEls = [];
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  el("circle", { cx: CX, cy: CY, r: R, "class": "ring" }, svg);
  var chordLayer = el("g", { "class": "chord-layer" }, svg);
  var centerMain = el("text", { x: CX, y: CY - 8, "class": "center-main" }, svg);
  var centerSub = el("text", { x: CX, y: CY + 30, "class": "center-sub" }, svg);

  for (var pc = 0; pc < 12; pc++) {
    var a = (pc / 12) * Math.PI * 2 - Math.PI / 2;
    var x = CX + R * Math.cos(a), y = CY + R * Math.sin(a);
    var g = el("g", { "class": "note " + (BLACK[pc] ? "black" : "white"), tabindex: "0", role: "button", "data-pc": pc }, svg);
    el("circle", { cx: x, cy: y, r: NR + 4, "class": "glow" }, g);
    el("circle", { cx: x, cy: y, r: NR, "class": "body" }, g);
    var name = el("text", { x: x, y: y, "class": "name" }, g);
    // 級數標在圓外側
    var dx = CX + (R + NR + 22) * Math.cos(a), dy = CY + (R + NR + 22) * Math.sin(a);
    var deg = el("text", { x: dx, y: dy, "class": "deg" }, g);
    noteEls.push({ g: g, name: name, deg: deg, x: x, y: y });
  }

  function setName(t, label, x, y) {
    while (t.firstChild) t.removeChild(t.firstChild);
    var parts = label.split("/");
    t.setAttribute("class", "name" + (parts.length > 1 ? " two" : ""));
    if (parts.length === 1) { t.textContent = label; t.setAttribute("y", y); return; }
    parts.forEach(function (p, i) {
      var ts = el("tspan", { x: x, dy: i === 0 ? "-0.55em" : "1.1em" }, t);
      ts.textContent = p;
    });
    t.setAttribute("y", y);
  }

  function keyName() {
    if (state.key < 0) return "";
    var k = KEYS[state.key];
    return state.useEnh && k.enh ? k.enh : k.name;
  }

  function rangeText(oct) {
    if (oct === undefined) oct = state.octave;
    if (state.key < 0) return "C" + oct + "–B" + oct;
    var tn = keyName();
    var spelled = spellMajor(tn);
    var tonicPc = KEYS[state.key].pc;
    var hiName = tn, hiOct = oct;
    for (var p = 0; p < 12; p++) {
      if (spelled[p] && spelled[p].degree === 6) {
        hiName = spelled[p].name;
        hiOct = oct + (p < tonicPc ? 1 : 0);
      }
    }
    return tn + oct + "–" + hiName + hiOct;
  }

  function render() {
    var root = document.documentElement;
    var spelled = null;
    if (state.key >= 0) spelled = spellMajor(keyName());
    root.classList.toggle("has-key", !!spelled);
    var tonicPc = state.key >= 0 ? KEYS[state.key].pc : -1;
    noteEls.forEach(function (n, pc) {
      var info = spelled && spelled[pc];
      n.g.classList.toggle("in", !!info);
      n.g.classList.toggle("out", !!spelled && !info);
      n.g.classList.toggle("tonic", pc === tonicPc);
      var label = info ? info.name : PC_NAMES[pc];
      setName(n.name, label, n.x, n.y);
      n.g.setAttribute("data-name", label);
      n.deg.textContent = info ? (state.label === "num" ? String(info.degree + 1) : SOLFA[info.degree]) : "";
      n.g.setAttribute("aria-label", label.replace("/", " 或 ") + (info ? "，第 " + (info.degree + 1) + " 級" : ""));
    });
    renderChord();
    if (spelled) {
      centerMain.textContent = keyName() + " Key";
      centerSub.textContent = "(" + relativeMinorName(keyName()) + " Key)";
    } else {
      centerMain.textContent = "12 音階";
      centerSub.textContent = "Chromatic Circle";
    }
    var k = state.key >= 0 ? KEYS[state.key] : null;
    var sb = document.getElementById("spellBtn");
    if (k && k.enh) { sb.hidden = false; sb.textContent = "改寫成 " + (state.useEnh ? k.name : k.enh); }
    else sb.hidden = true;
    KEYS.forEach(function (kk, i) {
      var nm = (state.key === i && state.useEnh && kk.enh) ? kk.enh : kk.name;
      sel.options[i + 1].textContent = keyMenuLabel(nm);
    });
    var shift = INSTRUMENTS[state.inst].octShift;
    document.getElementById("octText").textContent = rangeText();
    document.getElementById("octHint").textContent = shift ? INSTRUMENTS[state.inst].label + " 實際發出 " + rangeText(state.octave + shift) + "（低" + (shift === -1 ? "一" : "兩") + "個八度）。" : (state.octave === 4 && state.key < 0 ? "預設是中央 C（C4）這個八度。" : "按 − ＋ 換八度，中央 C 是 C4。");
    document.getElementById("octDown").disabled = state.octave <= OCT_MIN;
    document.getElementById("octUp").disabled = state.octave >= OCT_MAX;
    var ib = document.querySelectorAll("#instBtns button");
    for (var i = 0; i < ib.length; i++) ib[i].classList.toggle("on", ib[i].getAttribute("data-inst") === state.inst);
    var lb = document.querySelectorAll("#labelBtns button");
    for (var j = 0; j < lb.length; j++) lb[j].classList.toggle("on", lb[j].getAttribute("data-label") === state.label);
    document.getElementById("instHint").textContent = INSTRUMENTS[state.inst].hint || "";
    var cb = document.querySelectorAll("#chordBtns button, #autoBtns button");
    for (var c = 0; c < cb.length; c++) {
      var on = cb[c].getAttribute("data-chord") === state.chord;
      cb[c].classList.toggle("on", on);
      cb[c].setAttribute("aria-checked", on ? "true" : "false");
    }
    document.getElementById("chordHint").textContent = !state.chord ? "點圓上的音只發出一個音。" :
      DIATONIC[state.chord] ? "點調內的音，彈出它的順階" + (state.chord === "auto7" ? "七" : "三") + "和弦；調外的音只發單音。" :
      "點圓上的音當根音，彈出整個和弦。" + (state.inst === "bass" ? "Bass 只彈根音。" : "");
  }

  var chordCenter = document.getElementById("chordCenter");
  function currentChord() {
    if (!state.shown) return null;
    return chordInfo(state.shown.root, state.shown.type, keyName());
  }
  function renderChord() {
    var info = currentChord();
    while (chordLayer.firstChild) chordLayer.removeChild(chordLayer.firstChild);
    document.documentElement.classList.toggle("has-chord", !!info);
    noteEls.forEach(function (n, pc) {
      n.g.classList.toggle("chord", !!info && info.pcs.indexOf(pc) >= 0);
      n.g.classList.toggle("chord-root", !!info && pc === info.root);
    });
    if (!info) { chordCenter.hidden = true; return; }
    // 依圓上的順序連線，畫成凸多邊形
    var pcs = info.pcs.slice().sort(function (a, b) { return a - b; });
    var pts = pcs.map(function (pc) { return noteEls[pc].x.toFixed(1) + "," + noteEls[pc].y.toFixed(1); }).join(" ");
    el(pcs.length > 2 ? "polygon" : "polyline", { points: pts, "class": "chord-poly" }, chordLayer);
    // 根音到其他音的放射線，看得出誰是根音
    info.pcs.forEach(function (pc) {
      if (pc === info.root) return;
      el("line", { x1: noteEls[info.root].x, y1: noteEls[info.root].y, x2: noteEls[pc].x, y2: noteEls[pc].y, "class": "chord-spoke" }, chordLayer);
    });
    chordCenter.hidden = false;
    chordCenter.querySelector(".cc-name").textContent = info.name;
    chordCenter.querySelector(".cc-tones").textContent = info.tones.join(" ");
    var dg = chordCenter.querySelector(".cc-deg");
    dg.innerHTML = info.degHtml;
    dg.hidden = !info.degHtml;
    chordCenter.setAttribute("aria-label", info.name + "：" + info.tones.join(" ") + (info.degText ? "，級數 " + info.degText : ""));
  }

  function flash(pc) {
    var g = noteEls[pc].g;
    g.classList.remove("lit");
    void g.getBoundingClientRect();
    g.classList.add("lit");
    clearTimeout(g.__t);
    g.__t = setTimeout(function () { g.classList.remove("lit"); }, 750);
  }

  // 目前模式下，點這個音要彈哪一種和弦（單音或順階遇到調外音時回傳空字串）
  function chordTypeFor(pc) {
    if (!state.chord) return "";
    if (DIATONIC[state.chord]) {
      if (state.key < 0) return "";
      var sp = spellMajor(keyName());
      return sp[pc] ? DIATONIC[state.chord][sp[pc].degree] : "";
    }
    return state.chord;
  }

  function hit(pc) {
    if (typeof window.__notePracticeHit === "function") {
      var handled = window.__notePracticeHit(pc);
      if (handled === false) return;
    }
    unlock();
    var type = chordTypeFor(pc);
    if (!type) {
      if (state.shown) { state.shown = null; renderChord(); }
      flash(pc);
      return playMidi(soundingMidi(pc));
    }
    state.shown = { root: pc, type: type };
    renderChord();
    var info = currentChord();
    info.pcs.forEach(flash);
    return playChord(chordMidis(pc, type));
  }

  noteEls.forEach(function (n, pc) {
    n.g.addEventListener("pointerdown", function (e) { e.preventDefault(); hit(pc); });
    n.g.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); hit(pc); }
    });
  });

  // ---------- 控制 ----------
  var instBox = document.getElementById("instBtns");
  INST_ORDER.forEach(function (id) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-inst", id);
    b.setAttribute("role", "radio");
    b.textContent = INSTRUMENTS[id].label;
    b.addEventListener("click", function () {
      state.inst = id; render();
      var st = document.getElementById("status");
      st.textContent = "載入" + INSTRUMENTS[id].label + "音色中…";
      loadInst(id).then(function () { st.textContent = ""; });
    });
    instBox.appendChild(b);
  });

  var chordBox = document.getElementById("chordBtns");
  function addChordBtn(box, id, label, cls) {
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("data-chord", id);
    b.setAttribute("role", "radio");
    if (cls) b.className = cls;
    b.textContent = label;
    b.addEventListener("click", function () { state.chord = id; state.shown = null; render(); });
    box.appendChild(b);
  }
  addChordBtn(chordBox, "", "單音", "wide");
  CHORDS.forEach(function (c) { addChordBtn(chordBox, c.id, c.btn); });
  var autoBox = document.getElementById("autoBtns");
  addChordBtn(autoBox, "auto3", "順階三和弦");
  addChordBtn(autoBox, "auto7", "順階七和弦");

  var sel = document.getElementById("keySel");
  var o0 = document.createElement("option"); o0.value = "-1"; o0.textContent = "不選調（顯示全部 12 音）"; sel.appendChild(o0);
  KEYS.forEach(function (k, i) {
    var o = document.createElement("option");
    o.value = String(i);
    o.textContent = keyMenuLabel(k.name);
    sel.appendChild(o);
  });
  // 預設不選調（讓學生自己找音階）；不記住上次選的調，也不讓瀏覽器自動還原選單
  sel.value = "-1"; state.key = -1;
  window.addEventListener("pageshow", function () { if (sel.value !== String(state.key)) { sel.value = "-1"; state.key = -1; if (DIATONIC[state.chord]) { state.chord = ""; state.shown = null; } render(); } });
  sel.addEventListener("change", function () {
    state.key = +sel.value; state.useEnh = false;
    // 順階模式要有調；改成不選調就回到單音，換調就清掉上一個順階和弦
    if (DIATONIC[state.chord]) { state.shown = null; if (state.key < 0) state.chord = ""; }
    render();
  });
  document.getElementById("spellBtn").addEventListener("click", function () { state.useEnh = !state.useEnh; render(); });
  document.querySelectorAll("#labelBtns button").forEach(function (b) {
    b.addEventListener("click", function () { state.label = b.getAttribute("data-label"); render(); });
  });
  document.getElementById("octDown").addEventListener("click", function () { if (state.octave > OCT_MIN) { state.octave--; render(); } });
  document.getElementById("octUp").addEventListener("click", function () { if (state.octave < OCT_MAX) { state.octave++; render(); } });

  var scaleTimers = [];
  document.getElementById("playScale").addEventListener("click", function () {
    unlock();
    scaleTimers.forEach(clearTimeout); scaleTimers = [];
    var start = state.key >= 0 ? KEYS[state.key].pc : 0;
    var steps = state.key >= 0 ? MAJOR.concat([12]) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    var gap = state.key >= 0 ? 0.42 : 0.3;
    var base = soundingMidi(start);
    var maxS = Math.max.apply(null, INSTRUMENTS[state.inst].notes);
    // 多取樣的音色不要超出最高取樣；單一取樣（小江老師）照畫面上的八度播
    if (!INSTRUMENTS[state.inst].single && base + 12 > maxS + 1) base -= 12;
    loadInst(state.inst).then(function () {
      var t0 = ctx.currentTime + 0.05;
      chokeVoices(function () { return true; }, t0);
      steps.forEach(function (st, i) {
        var semis = start + st;
        playMidi(base + st, t0 + i * gap);
        scaleTimers.push(setTimeout(function () { flash(semis % 12); }, 50 + i * gap * 1000));
      });
    });
  });

  window.__noteCircle = {
    state: state, spellMajor: spellMajor, relativeMinorName: relativeMinorName, keyMenuLabel: keyMenuLabel,
    chordInfo: chordInfo, chordMidis: chordMidis, currentChord: currentChord, CHORDS: CHORDS, DIATONIC: DIATONIC,
    render: render, loadInst: loadInst, playMidi: playMidi, playChord: playChord, soundingMidi: soundingMidi, renderOffline: renderOffline,
    ensureCtx: ensureCtx, unlock: unlock, chokeVoices: chokeVoices, flash: flash,
    buildOutputChain: buildOutputChain, chordLevel: chordLevel, dbToLin: dbToLin,
    INSTRUMENTS: INSTRUMENTS, INST_ORDER: INST_ORDER, KEYS: KEYS, MASTER_GAIN: MASTER_GAIN, LIMITER: LIMITER,
    getMaster: function () { return master; }, getLimiter: function () { return limiter; }, getInstGain: function () { return instGain; }, getClip: function () { return clip; },
    NOTE_ATTACK: NOTE_ATTACK, NOTE_FADE_AT: NOTE_FADE_AT, NOTE_FADE: NOTE_FADE, NOTE_LEN: NOTE_LEN
  };

  render();
  // 先載入鋼琴（不需要使用者手勢；解碼可在 suspended 狀態完成）
  loadInst("piano");
})();
