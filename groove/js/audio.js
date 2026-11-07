// Acoustic one-shot kits. Samples load per kit and stay cached.

const VOICES = [
  "kick",
  "snare",
  "snareAccent",
  "ghost",
  "xstick",
  "buzz",
  "hat",
  "hatOpen",
  "foot",
  "ride",
  "rideBell",
  "crash",
  "stack",
  "cow",
  "click",
  "tom1",
  "tom2",
  "tom3",
];

export const KITS = [
  { id: "rock", label: "Rock 搖滾" },
  { id: "funk", label: "Funk 放克" },
  { id: "jazz", label: "Jazz 爵士" },
];

const KIT_KEY = "drumgrid-kit";

export function createKit() {
  let ctx = null;
  let master = null;
  let current = rememberedKit();
  const buffers = {};
  const pending = {};
  let statusFn = () => {};

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 8;
      comp.ratio.value = 2.4;
      comp.attack.value = 0.003;
      comp.release.value = 0.14;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function sampleUrl(kit, voice) {
    return new URL(`../samples/${kit}/${voice}.mp3`, import.meta.url).href;
  }

  async function fetchBuffer(kit, voice) {
    const url = sampleUrl(kit, voice);
    const context = ensure();
    let cache = null;
    try {
      if ("caches" in window) cache = await caches.open("drumgrid-drums-v3");
    } catch {
      cache = null;
    }
    let response = cache ? await cache.match(url) : null;
    if (!response) {
      response = await fetch(url);
      if (!response.ok) throw new Error(`Missing drum sample ${kit}/${voice}`);
      if (cache) await cache.put(url, response.clone());
    }
    const raw = await response.arrayBuffer();
    return context.decodeAudioData(raw.slice(0));
  }

  function load(id) {
    const kit = KITS.some((item) => item.id === id) ? id : "jazz";
    if (buffers[kit]) return Promise.resolve(buffers[kit]);
    if (pending[kit]) return pending[kit];
    statusFn("loading", kit);
    pending[kit] = Promise.all(VOICES.map(async (voice) => [voice, await fetchBuffer(kit, voice)]))
      .then((pairs) => {
        buffers[kit] = Object.fromEntries(pairs);
        if (current === kit) statusFn("ready", kit);
        return buffers[kit];
      })
      .catch((error) => {
        delete pending[kit];
        statusFn("error", kit);
        throw error;
      });
    return pending[kit];
  }

  function select(id) {
    const kit = KITS.some((item) => item.id === id) ? id : "jazz";
    current = kit;
    try {
      localStorage.setItem(KIT_KEY, kit);
    } catch {
      /* private mode */
    }
    return load(kit);
  }

  function voiceFor(inst, vel) {
    if (inst === "snare") {
      if (vel < 60) return "ghost";
      if (vel >= 115) return "snareAccent";
      return "snare";
    }
    if (inst === "clickSoft") return "click";
    return VOICES.includes(inst) ? inst : "snare";
  }

  function play(inst, vel = 100, when = 0) {
    const map = buffers[current];
    if (!map) return;
    const at = Math.max(ensure().currentTime, when);
    const voice = voiceFor(inst, vel);
    const buffer = map[voice];
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    const amount = Math.max(0.05, Math.min(1, vel / 127));
    const peak = inst === "clickSoft" ? 0.45 * amount : 0.42 + 0.58 * amount;
    gain.gain.setValueAtTime(peak, at);
    src.connect(gain);
    gain.connect(master);
    src.start(at);
  }

  return {
    ensure,
    play,
    load,
    select,
    onStatus(fn) {
      statusFn = fn;
    },
    has(id) {
      return Boolean(buffers[id]);
    },
    get current() {
      return current;
    },
    get context() {
      return ctx;
    },
  };
}

export function rememberedKit() {
  try {
    const saved = localStorage.getItem(KIT_KEY);
    if (KITS.some((item) => item.id === saved)) return saved;
  } catch {
    /* ignore */
  }
  return "jazz";
}

export function createTransport(kit) {
  let timer = null;
  let playing = false;
  let loop = true;
  let frame = () => {};
  let loopStart = 0;
  let loopDur = 0;
  let countIn = 0;
  let slotTimes = [];

  function stop() {
    playing = false;
    if (timer) clearInterval(timer);
    timer = null;
    frame({ playing: false, slot: -1 });
  }

  async function start(buildLoop) {
    await kit.load(kit.current);
    const ctx = kit.ensure();
    stop();
    playing = true;
    let scheduledUntil = ctx.currentTime + 0.05;
    let first = true;
    const speedStarted = ctx.currentTime;

    const pump = () => {
      if (!playing) return;
      const now = ctx.currentTime;
      if (!first && now + 0.3 < scheduledUntil) return;
      if (!first && !loop) {
        if (now >= scheduledUntil - 0.04) stop();
        return;
      }
      const plan = buildLoop({
        first,
        elapsed: now - speedStarted,
      });
      first = false;
      loopStart = scheduledUntil;
      loopDur = plan.duration;
      countIn = plan.countIn || 0;
      slotTimes = plan.slotTimes || [];
      for (const hit of plan.hits) kit.play(hit.inst, hit.vel, scheduledUntil + hit.time);
      scheduledUntil += Math.max(0.05, plan.duration);
    };

    pump();
    timer = setInterval(() => {
      if (!playing) return;
      const now = kit.context.currentTime;
      const local = now - loopStart;
      let slot = -1;
      if (local >= countIn) {
        for (let i = slotTimes.length - 1; i >= 0; i--) {
          if (local >= slotTimes[i] - 0.02) {
            slot = i;
            break;
          }
        }
      }
      frame({ playing: true, slot, local, countIn });
      pump();
    }, 40);
  }

  return {
    start,
    stop,
    toggle(buildLoop) {
      if (playing) {
        stop();
        return Promise.resolve();
      }
      return start(buildLoop);
    },
    get playing() {
      return playing;
    },
    get looping() {
      return loop;
    },
    set looping(value) {
      loop = value;
    },
    onFrame(fn) {
      frame = fn;
    },
  };
}
