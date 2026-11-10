(function () {
  var S = window.RhythmScore;
  var TEACHERS = [
    { name: "小江老師", src: "/img/teachers/jiang_xiaojiang_v2.jpg" },
    { name: "小佑老師", src: "/img/teachers/xiaoyou_chen_v2.jpg" },
    { name: "安安老師", src: "/img/teachers/anan_chang_v2.jpg" },
    { name: "通哥老師", src: "/img/teachers/tongge_v2.jpg" },
    { name: "劭奇老師", src: "/img/teachers/shaohchi_chen_v2.jpg" },
    { name: "饅頭老師", src: "/img/teachers/mantou_tsai_v2.jpg" }
  ];
  var PROGRESS_KEY = "moonick-rhythm-challenge-v1";
  var SETTINGS_KEY = "moonick-rhythm-challenge-settings-v1";

  var app = document.getElementById("app");
  var levelTitle = document.getElementById("levelTitle");
  var bpmLabel = document.getElementById("bpmLabel");
  var bpmInput = document.getElementById("bpm");
  var levelBox = document.getElementById("levels");
  var cardBox = document.getElementById("cards");
  var statusEl = document.getElementById("status");
  var resultEl = document.getElementById("result");
  var startBtn = document.getElementById("start");
  var settingsBtn = document.getElementById("settings");
  var panel = document.getElementById("panel");
  var micBox = document.getElementById("micBox");
  var micSelect = document.getElementById("mic");
  var messageEl = document.getElementById("message");

  var rng = S.createRng((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  var songBpm = Math.round((90 + rng() * 40) * 10) / 10;
  var levels = [];
  for (var i = 0; i < 5; i++) levels.push(S.buildLevel(i, rng));

  var progress = loadProgress();
  var settings = loadSettings();
  var current = 0;
  var mode = settings.mode;
  var feel = settings.feel;
  var threshold = settings.threshold;
  var phase = "idle";
  var events = [];
  var round = null;
  var ctx = null;
  var noiseBuffer = null;
  var stream = null;
  var analyser = null;
  var wave = null;
  var micDevice = "";

  bpmInput.value = String(songBpm);
  paintBpm();
  renderLevels();
  renderCards();
  renderModes();
  renderSettings();
  fillMicPlaceholder();

  bpmInput.addEventListener("input", function () {
    if (isRunning()) return;
    paintBpm();
  });

  levelBox.addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button || button.disabled || isRunning()) return;
    current = Number(button.dataset.level);
    clearResult();
    renderLevels();
    renderCards();
    setStatus("按開始。先聽一遍，再換你打。");
  });

  document.getElementById("modes").addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button || isRunning()) return;
    mode = button.dataset.mode;
    saveSettings();
    renderModes();
    if (mode === "mic") {
      ensureMic().catch(showMicError);
    }
  });

  micSelect.addEventListener("change", function () {
    if (isRunning()) return;
    micDevice = micSelect.value;
    stopMic();
    if (mode === "mic") ensureMic().catch(showMicError);
  });

  settingsBtn.addEventListener("click", function () {
    var open = panel.hidden;
    panel.hidden = !open;
    settingsBtn.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.getElementById("closePanel").addEventListener("click", function () {
    panel.hidden = true;
    settingsBtn.setAttribute("aria-expanded", "false");
  });
  document.getElementById("feel").addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    feel = button.dataset.feel;
    saveSettings();
    renderSettings();
  });
  document.getElementById("sensitivity").addEventListener("click", function (event) {
    var button = event.target.closest("button");
    if (!button) return;
    threshold = Number(button.dataset.threshold);
    saveSettings();
    renderSettings();
  });

  document.getElementById("full").addEventListener("click", function () {
    var node = document.fullscreenElement || document.webkitFullscreenElement;
    if (node) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    var ask = app.requestFullscreen || app.webkitRequestFullscreen;
    if (ask) ask.call(app);
  });

  startBtn.addEventListener("click", start);

  function inRespond() {
    if (!round || round.done || !ctx) return false;
    var now = ctx.currentTime;
    return now >= round.respondStart && now < round.respondEnd;
  }

  app.addEventListener("pointerdown", function (event) {
    if (!inRespond() || mode !== "tap" || event.button > 0) return;
    events.push({
      phase: "respond",
      timeMs: audio().currentTime * 1000,
      onControl: !!event.target.closest("button, a, input, select, label"),
      mode: "tap",
      key: "",
      repeat: false,
      level: 1
    });
  });

  window.addEventListener("keydown", function (event) {
    if (event.code !== "Space" && event.key !== " ") return;
    if (!round || round.done) return;
    event.preventDefault();
    if (!inRespond() || mode !== "key") return;
    events.push({
      phase: "respond",
      timeMs: audio().currentTime * 1000,
      key: " ",
      repeat: !!event.repeat,
      onControl: false,
      mode: "key",
      level: 1
    });
  }, true);

  function isRunning() {
    return phase !== "idle" && phase !== "result";
  }

  function bpm() {
    var value = Number(bpmInput.value);
    if (!Number.isFinite(value)) return 100;
    return Math.min(200, Math.max(60, value));
  }

  function paintBpm() {
    var value = bpm();
    bpmLabel.textContent = "這首歌 " + value.toFixed(1) + " BPM";
    var pct = ((value - 60) / 140) * 100;
    bpmInput.style.setProperty("--pct", pct + "%");
  }

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function clearResult() {
    resultEl.hidden = true;
    resultEl.textContent = "";
    resultEl.removeAttribute("data-score");
    startBtn.textContent = "開始";
  }

  function renderLevels() {
    levelTitle.textContent = "第 " + (current + 1) + " 關";
    levelBox.innerHTML = "";
    for (var i = 0; i < 5; i++) {
      var button = document.createElement("button");
      button.type = "button";
      button.dataset.level = String(i);
      var open = i < progress.unlocked;
      button.disabled = !open || isRunning();
      button.setAttribute("aria-pressed", i === current ? "true" : "false");
      var stars = document.createElement("small");
    if (!open) {
      stars.textContent = "鎖住";
    } else {
      for (var s = 0; s < 3; s++) {
        var glyph = document.createElement("span");
        glyph.className = s < progress.stars[i] ? "on" : "off";
        glyph.textContent = s < progress.stars[i] ? "★" : "☆";
        stars.appendChild(glyph);
      }
    }
      button.appendChild(document.createTextNode("第 " + (i + 1) + " 關"));
      button.appendChild(stars);
      levelBox.appendChild(button);
    }
  }

  function renderCards(active, marks) {
    var level = levels[current];
    cardBox.innerHTML = "";
    for (var i = 0; i < level.ids.length; i++) {
      var card = document.createElement("div");
      card.className = "card";
      if (i === active) card.classList.add("now");
      if (marks && marks[i] === "ok") card.classList.add("ok");
      if (marks && marks[i] === "bad") card.classList.add("bad");
      if (i === level.photoIndex) {
        var teacher = TEACHERS[level.teacherIndex] || TEACHERS[0];
        card.classList.add("photo");
        card.setAttribute("aria-label", teacher.name + "的照片，請聽節奏");
        var img = document.createElement("img");
        img.src = teacher.src;
        img.alt = teacher.name;
        card.appendChild(img);
      } else {
        var pattern = S.PATTERNS[level.ids[i]];
        card.setAttribute("aria-label", pattern ? pattern.label : "節奏");
        card.innerHTML = svgFor(level.ids[i]);
      }
      cardBox.appendChild(card);
    }
  }

  function markActive(index) {
    var cards = cardBox.children;
    for (var i = 0; i < cards.length; i++) {
      cards[i].classList.toggle("now", i === index);
    }
  }

  function renderModes() {
    micBox.hidden = mode !== "mic";
    var buttons = document.querySelectorAll("#modes button");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", buttons[i].dataset.mode === mode ? "true" : "false");
      buttons[i].disabled = isRunning();
    }
  }

  function renderSettings() {
    paintPressed("#feel button", "feel", feel);
    paintPressed("#sensitivity button", "threshold", String(threshold));
  }

  function paintPressed(selector, key, value) {
    var buttons = document.querySelectorAll(selector);
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", buttons[i].dataset[key] === value ? "true" : "false");
    }
  }

  function start() {
    if (isRunning()) return;
    hideMessage();
    events = [];
    round = null;
    phase = "countin";
    startBtn.disabled = true;
    startBtn.textContent = "進行中";
    bpmInput.disabled = true;
    renderLevels();
    renderModes();
    renderCards();
    setStatus("預備拍");
    var context = audio();
    var pending = [context.resume()];
    if (mode === "mic") pending.push(ensureMic());
    Promise.all(pending).then(function () {
      if (phase === "idle") return;
      beginRound();
    }).catch(function () {
      phase = "idle";
      round = null;
      startBtn.disabled = false;
      startBtn.textContent = "開始";
      bpmInput.disabled = false;
      renderLevels();
      renderModes();
      if (mode === "mic") showMicError();
      else {
        messageEl.hidden = false;
        messageEl.textContent = "這台瀏覽器沒有把聲音打開，請再按一次開始。";
      }
    });
  }

  function beginRound() {
    var context = audio();
    var beat = 60 / bpm();
    var startAt = context.currentTime + 0.12;
    var demoStart = startAt + 4 * beat;
    var respondStart = demoStart + 9 * beat;
    var respondEnd = respondStart + 8 * beat;
    round = {
      done: false,
      beat: beat,
      demoStart: demoStart,
      respondStart: respondStart,
      respondEnd: respondEnd,
      active: -2
    };
    for (var i = 0; i < 4; i++) tick(startAt + i * beat, true);
    var onsets = S.expectedBeats(levels[current].ids);
    for (var n = 0; n < onsets.length; n++) drum(demoStart + onsets[n] * beat);
    if (mode !== "mic") {
      for (var b = 0; b < 8; b++) tick(respondStart + b * beat, false);
    }
    requestAnimationFrame(frame);
  }

  function frame() {
    if (!round || round.done) return;
    var now = audio().currentTime;
    var active = -1;
    if (now < round.demoStart) {
      phase = "countin";
      setStatus("預備拍");
    } else if (now < round.demoStart + 8 * round.beat) {
      phase = "demo";
      active = Math.floor((now - round.demoStart) / round.beat);
      setStatus("聽示範");
    } else if (now < round.respondStart) {
      phase = "gap";
      setStatus(mode === "mic" ? "換你打。麥克風現在才開始聽。" : "換你打");
    } else if (now < round.respondEnd) {
      phase = "respond";
      active = Math.floor((now - round.respondStart) / round.beat);
      setStatus(mode === "key" ? "換你打，按空白鍵" : mode === "mic" ? "換你打" : "換你打，點畫面");
      listenMic();
    } else {
      finish();
      return;
    }
    if (active !== round.active) {
      round.active = active;
      markActive(active);
    }
    requestAnimationFrame(frame);
  }

  function listenMic() {
    if (mode !== "mic" || !analyser || !round) return;
    analyser.getFloatTimeDomainData(wave);
    var peak = 0;
    for (var i = 0; i < wave.length; i++) {
      var sample = Math.abs(wave[i]);
      if (sample > peak) peak = sample;
    }
    events.push({
      phase: "respond",
      timeMs: audio().currentTime * 1000,
      level: peak,
      mode: "mic",
      key: "",
      repeat: false,
      onControl: false
    });
  }

  function finish() {
    if (!round || round.done) return;
    round.done = true;
    phase = "result";
    var graded = S.gradeRound(
      levels[current].ids,
      S.collectActualBeats({
        mode: mode,
        events: events,
        bpm: bpm(),
        respondStartMs: round.respondStart * 1000,
        respondEndMs: round.respondEnd * 1000,
        maskUntilMs: round.respondStart * 1000,
        threshold: threshold,
        cooldownMs: S.HIT_COOLDOWN_MS
      }),
      S.windowBeatsFor(bpm(), feel)
    );
    if (graded.stars > progress.stars[current]) progress.stars[current] = graded.stars;
    if (graded.unlocksNext && current < 4) {
      progress.unlocked = Math.max(progress.unlocked, current + 2);
    }
    saveProgress();
    renderLevels();
    renderCards(-1, graded.marks);
    var line = "這一輪 " + graded.score + " 分，" + graded.stars + " 顆星。";
    if (current === 4) line += graded.unlocksNext ? "這關過了。" : "這關還沒過。";
    else if (graded.unlocksNext) line += "下一關可以玩了。";
    else line += "下一關還鎖著。";
    resultEl.hidden = false;
    resultEl.textContent = line;
    resultEl.setAttribute("data-score", String(graded.score));
    resultEl.setAttribute("data-stars", String(graded.stars));
    resultEl.setAttribute("data-unlock", graded.unlocksNext ? "1" : "0");
    startBtn.disabled = false;
    startBtn.textContent = "再試一次";
    bpmInput.disabled = false;
    renderModes();
    setStatus("這一輪結束。");
  }

  function audio() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    return ctx;
  }

  function tick(time, strong) {
    var context = audio();
    var osc = context.createOscillator();
    var gain = context.createGain();
    osc.frequency.value = strong ? 1400 : 1000;
    osc.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(strong ? 0.18 : 0.1, time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    osc.start(time);
    osc.stop(time + 0.05);
  }

  function drum(time) {
    var context = audio();
    if (!noiseBuffer) {
      var length = Math.floor(context.sampleRate * 0.09);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (context.sampleRate * 0.018));
      }
    }
    var source = context.createBufferSource();
    source.buffer = noiseBuffer;
    var filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1600;
    filter.Q.value = 0.7;
    var gain = context.createGain();
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.55, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    source.start(time);
    source.stop(time + 0.09);
  }

  function ensureMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error("no-mic"));
    }
    var context = audio();
    if (stream && micSelect.value === micDevice && analyser) return Promise.resolve();
    stopMic();
    var audioConstraints = {
      echoCancellation: true,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1
    };
    if (micDevice) audioConstraints.deviceId = { exact: micDevice };
    return navigator.mediaDevices.getUserMedia({ audio: audioConstraints }).then(function (next) {
      stream = next;
      var source = context.createMediaStreamSource(next);
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      wave = new Float32Array(analyser.fftSize);
      return listMics();
    });
  }

  function listMics() {
    return navigator.mediaDevices.enumerateDevices().then(function (devices) {
      var mics = devices.filter(function (device) { return device.kind === "audioinput"; });
      var previous = micDevice;
      micSelect.innerHTML = "";
      if (!mics.length) {
        addMicOption("", "預設麥克風");
        return;
      }
      for (var i = 0; i < mics.length; i++) {
        addMicOption(mics[i].deviceId, mics[i].label || ("麥克風 " + (i + 1)));
      }
      var found = false;
      for (var n = 0; n < mics.length; n++) {
        if (mics[n].deviceId === previous) found = true;
      }
      micSelect.value = found ? previous : mics[0].deviceId;
      micDevice = micSelect.value;
    });
  }

  function addMicOption(value, label) {
    var option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    micSelect.appendChild(option);
  }

  function fillMicPlaceholder() {
    addMicOption("", "預設麥克風");
  }

  function stopMic() {
    if (stream) {
      stream.getTracks().forEach(function (track) { track.stop(); });
    }
    stream = null;
    analyser = null;
    wave = null;
  }

  function showMicError() {
    messageEl.hidden = false;
    messageEl.textContent = "沒有拿到麥克風。請改用拍打或空白鍵，或到瀏覽器允許這頁使用麥克風。";
  }

  function hideMessage() {
    messageEl.hidden = true;
    messageEl.textContent = "";
  }

  function loadProgress() {
    try {
      var raw = JSON.parse(localStorage.getItem(PROGRESS_KEY));
      if (!raw || !Array.isArray(raw.stars) || raw.stars.length !== 5) throw new Error("bad");
      return {
        stars: raw.stars.map(function (n) { return Math.max(0, Math.min(3, n | 0)); }),
        unlocked: Math.max(1, Math.min(5, raw.unlocked | 0))
      };
    } catch (error) {
      return { stars: [0, 0, 0, 0, 0], unlocked: 1 };
    }
  }

  function saveProgress() {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (error) {}
  }

  function loadSettings() {
    var fallback = { mode: "tap", feel: "standard", threshold: S.DEFAULT_THRESHOLD };
    try {
      var raw = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (!raw) return fallback;
      if (raw.mode !== "tap" && raw.mode !== "mic" && raw.mode !== "key") raw.mode = "tap";
      if (raw.feel !== "strict" && raw.feel !== "standard" && raw.feel !== "wide") raw.feel = "standard";
      var value = Number(raw.threshold);
      if (value !== 0.1 && value !== 0.2 && value !== 0.32) value = S.DEFAULT_THRESHOLD;
      return { mode: raw.mode, feel: raw.feel, threshold: value };
    } catch (error) {
      return fallback;
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ mode: mode, feel: feel, threshold: threshold }));
    } catch (error) {}
  }

  function svgFor(id) {
    if (id === "qr") return staff(restPath(58));
    if (id === "er") return staff(eighthRest(36) + note(82, 1));
    if (id === "q") return staff(note(60, 0));
    if (id === "ee") return staff(beamed([46, 82]));
    if (id === "eds") return staff(beamed([44, 86], 1, 1) + dot(58));
    if (id === "ssss") return staff(beamed([28, 48, 68, 88], 0, 3));
    if (id === "ess") return staff(beamed([36, 70, 90], 1, 2));
    if (id === "sse") return staff(beamed([32, 52, 84], 0, 1));
    return staff(note(60, 0));
  }

  function staff(inner) {
    return '<svg viewBox="0 0 120 86" aria-hidden="true"><line x1="8" y1="54" x2="112" y2="54" stroke="#111" stroke-width="2.4" stroke-linecap="round"/>' + inner + "</svg>";
  }

  function note(x, flags) {
    var head = '<ellipse cx="' + x + '" cy="54" rx="8" ry="6" fill="#111"/>';
    var stem = '<line x1="' + (x + 7) + '" y1="54" x2="' + (x + 7) + '" y2="24" stroke="#111" stroke-width="2.2"/>';
    var flag = "";
    if (flags >= 1) {
      flag += '<path d="M' + (x + 7) + ' 24c10 4 12 14 4 18" fill="none" stroke="#111" stroke-width="2.2"/>';
    }
    if (flags >= 2) {
      flag += '<path d="M' + (x + 7) + ' 32c10 4 12 12 4 16" fill="none" stroke="#111" stroke-width="2.2"/>';
    }
    return head + stem + flag;
  }

  function beamed(xs, secondFrom, secondTo) {
    var body = "";
    for (var i = 0; i < xs.length; i++) {
      body += '<ellipse cx="' + xs[i] + '" cy="54" rx="7.5" ry="5.5" fill="#111"/>';
      body += '<line x1="' + (xs[i] + 6) + '" y1="54" x2="' + (xs[i] + 6) + '" y2="26" stroke="#111" stroke-width="2.2"/>';
    }
    var x1 = xs[0] + 6;
    var x2 = xs[xs.length - 1] + 6;
    body += '<line x1="' + x1 + '" y1="26" x2="' + x2 + '" y2="26" stroke="#111" stroke-width="3.4" stroke-linecap="square"/>';
    if (secondFrom != null && secondTo != null && secondTo > secondFrom) {
      body += '<line x1="' + (xs[secondFrom] + 6) + '" y1="33" x2="' + (xs[secondTo] + 6) + '" y2="33" stroke="#111" stroke-width="3.2" stroke-linecap="square"/>';
    }
    return body;
  }

  function dot(x) {
    return '<circle cx="' + x + '" cy="50" r="2.6" fill="#111"/>';
  }

  function restPath(x) {
    return '<g transform="translate(' + (x - 12) + ' 24)">' +
      '<path fill="#111" d="M13 1.4c2.8.1 4.4 2.1 3.5 4.3-.6 1.5-2.4 1.9-2.6 3.3-.3 1.6 1.2 2.1 2.3 2.8 2 1.2 2.5 3.2.9 4.7-1 1.1-2.4 1.2-3.2 2.2-1 1.3.2 2.8 1.7 3.3-2.7.8-5.3-.3-5.3-2.7 0-1.4 1.4-1.9 1.4-3S9.4 14 9.4 12.3c0-2.3 1.2-3.5 2.4-4.6.9-.7.4-1.8-.4-2.5-1-1.1-1.5-2.3-.6-3.3.9-.7 1.6-1 2.2-.5z"/>' +
      "</g>";
  }

  function eighthRest(x) {
    return '<g transform="translate(' + (x - 14) + ' 22)">' +
      '<path fill="#111" d="M20 2c2 7-1 12-6 16c4 1 8 5 8 10c0 4-3 7-7 7c-1 0-2-.2-2-.2c3-2 4-4 3-7c-1-3-4-5-8-6c2-6 8-14 12-19z"/>' +
      '<circle cx="6" cy="38" r="3.1"/>' +
      "</g>";
  }
})();
