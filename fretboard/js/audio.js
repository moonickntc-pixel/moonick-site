/* 與十二音圓形音階同一套取樣、包絡（約 1 秒）與音量（含 20261121f 加大聲與 limiter） */
(function (root) {
  "use strict";
  var FILE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  var NOTE_ATTACK = 0.005, NOTE_FADE_AT = 0.8, NOTE_FADE = 0.25;
  var NOTE_LEN = NOTE_FADE_AT + NOTE_FADE, CHOKE = 0.02;
  var SAMPLE_BASE = "../note-circle/samples/";

  function grid(lo, hi) {
    var list = [];
    for (var m = lo; m <= hi; m++) if ([0, 3, 6, 9].indexOf(m % 12) >= 0) list.push(m);
    return list;
  }
  var INSTRUMENTS = {
    piano: { label: "鋼琴", dir: "piano", notes: grid(48, 84) },
    acoustic: { label: "木吉他", dir: "acoustic", notes: grid(48, 84) },
    electric: { label: "電吉他", dir: "electric", notes: grid(48, 84) },
    bass: { label: "Bass", dir: "bass", notes: grid(24, 60), hint: "Bass 音色依指板上的實際音高發聲。" },
    voice: { label: "人聲", dir: "voice", notes: grid(48, 84) },
    teacher: { label: "小江老師", dir: "teacher", notes: [54], files: { 54: "Fs3" }, single: true,
      hint: "小江老師的聲音是單一取樣移調，會依指板的實際音高發聲。" }
  };
  var INST_ORDER = ["piano", "acoustic", "electric", "bass", "voice", "teacher"];
  function dbToLin(db) { return Math.pow(10, db / 20); }
  var MASTER_GAIN = 1;
  INST_ORDER.forEach(function (id) {
    var boost = { piano: 16.7, acoustic: 14.7, electric: 13.7, bass: 11.2, voice: 12.1, teacher: 11.1 }[id];
    INSTRUMENTS[id].gain = 0.9 * dbToLin(boost);
  });
  var LIMITER = { threshold: -3, knee: 2, ratio: 20, attack: 0.001, release: 0.15, clipDb: -1.2 };

  var ctx = null, master = null, limiter = null, instGain = null, clip = null;
  var buffers = {}, loading = {}, voices = [];
  root.__noteLog = [];
  root.__sampleStatus = {};

  function makeSafetyClip(audioCtx) {
    var ceil = dbToLin(LIMITER.clipDb);
    var start = dbToLin(Math.min(-3, LIMITER.clipDb - 1.5));
    var sh = audioCtx.createWaveShaper();
    var n = 65536, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var x = (i / (n - 1)) * 2 - 1, a = Math.abs(x), s = x < 0 ? -1 : 1, y;
      if (a <= start) y = a;
      else {
        var u = (a - start) / Math.max(1e-6, 1 - start);
        y = start + (ceil - start) * (1 - Math.exp(-3 * u));
        if (y > ceil) y = ceil;
      }
      curve[i] = s * y;
    }
    sh.curve = curve; sh.oversample = "4x";
    return sh;
  }
  function buildOutputChain(audioCtx) {
    var gains = {}, mast = audioCtx.createGain();
    mast.gain.value = MASTER_GAIN;
    var lim = audioCtx.createDynamicsCompressor();
    lim.threshold.value = LIMITER.threshold; lim.knee.value = LIMITER.knee;
    lim.ratio.value = LIMITER.ratio; lim.attack.value = LIMITER.attack; lim.release.value = LIMITER.release;
    var cl = makeSafetyClip(audioCtx);
    INST_ORDER.forEach(function (id) {
      var g = audioCtx.createGain(); g.gain.value = INSTRUMENTS[id].gain; g.connect(mast); gains[id] = g;
    });
    mast.connect(lim); lim.connect(cl); cl.connect(audioCtx.destination);
    return { instGain: gains, master: mast, limiter: lim, clip: cl };
  }
  function ensureCtx() {
    if (!ctx) {
      var AC = root.AudioContext || root.webkitAudioContext;
      ctx = new AC({ latencyHint: "interactive" });
      var chain = buildOutputChain(ctx);
      master = chain.master; limiter = chain.limiter; instGain = chain.instGain; clip = chain.clip;
    }
    return ctx;
  }
  var unlocked = false;
  function unlock() {
    if (unlocked) return;
    ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    var b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
    s.buffer = b; s.connect(ctx.destination); s.start(0);
    unlocked = true;
  }
  if (typeof window !== "undefined") {
    ["pointerdown", "touchstart", "keydown", "mousedown"].forEach(function (ev) {
      window.addEventListener(ev, unlock, { capture: true, passive: true });
    });
  }
  function midiName(m) { return FILE_NAMES[m % 12] + (Math.floor(m / 12) - 1); }
  function loadInst(id, audioCtx) {
    var ac = audioCtx || ensureCtx();
    if (!audioCtx && loading[id]) return loading[id];
    if (!audioCtx) buffers[id] = buffers[id] || {};
    var target = audioCtx ? {} : buffers[id];
    var inst = INSTRUMENTS[id], ok = 0, fail = 0;
    var job = Promise.all(inst.notes.map(function (m) {
      var url = SAMPLE_BASE + inst.dir + "/" + ((inst.files && inst.files[m]) || midiName(m)) + ".mp3";
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error(url + " " + r.status);
        return r.arrayBuffer();
      }).then(function (ab) {
        return new Promise(function (res, rej) { ac.decodeAudioData(ab.slice(0), res, rej); });
      }).then(function (buf) { target[m] = buf; ok++; })
        .catch(function (e) { fail++; console.warn("取樣載入失敗", e); });
    })).then(function () {
      if (!audioCtx) root.__sampleStatus[id] = { ok: ok, fail: fail, total: inst.notes.length };
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
  function applyEnvelope(gain, t, rawDur, peak) {
    if (!peak) peak = 1;
    var fadeAt = NOTE_FADE_AT, fade = NOTE_FADE;
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
    src.buffer = bufs[s]; src.playbackRate.value = rate;
    var g = audioCtx.createGain();
    var env = applyEnvelope(g, t, src.buffer.duration / rate, level);
    src.connect(g); g.connect(dest);
    src.start(t); src.stop(t + env.dur + 0.02);
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
  function playMidi(midi, instId, when) {
    var id = instId || "acoustic";
    ensureCtx();
    if (ctx.state === "suspended") ctx.resume();
    return loadInst(id).then(function () {
      var t = Math.max(ctx.currentTime, when || 0);
      chokeVoices(function (v) { return v.midi === midi; }, t);
      var v = startNote(ctx, instGain[id], buffers[id], midi, t);
      if (!v) return;
      voices.push(v);
      var freq = 440 * Math.pow(2, (midi - 69) / 12);
      root.__noteLog.push({ inst: id, midi: midi, freq: +freq.toFixed(2), sample: v.sample, rate: +v.rate.toFixed(4), t: v.start, dur: v.dur, fadeAt: v.fadeAt });
    });
  }
  function stopAll() {
    if (!ctx) return;
    chokeVoices(function () { return true; }, ctx.currentTime);
  }

  root.__fretAudio = {
    INSTRUMENTS: INSTRUMENTS, INST_ORDER: INST_ORDER, MASTER_GAIN: MASTER_GAIN, LIMITER: LIMITER,
    NOTE_ATTACK: NOTE_ATTACK, NOTE_FADE_AT: NOTE_FADE_AT, NOTE_FADE: NOTE_FADE, NOTE_LEN: NOTE_LEN,
    ensureCtx: ensureCtx, loadInst: loadInst, playMidi: playMidi, stopAll: stopAll, unlock: unlock,
    getLimiter: function () { return limiter; }, getMaster: function () { return master; }
  };
})(typeof window !== "undefined" ? window : globalThis);
