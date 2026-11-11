import assert from "node:assert/strict";
import test from "node:test";
import { createClapDetector, sensitivityProfile } from "./clap-dsp.js";

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeBuffer(rate, seconds) {
  return new Float32Array(Math.floor(seconds * rate));
}

function addBurst(buffer, rate, atSecond, seconds, amplitude, random, mode) {
  const start = Math.floor(atSecond * rate);
  const count = Math.floor(seconds * rate);
  let prev = 0;
  let low = 0;
  const lowA = Math.exp((-2 * Math.PI * 2800) / rate);
  for (let i = 0; i < count; i += 1) {
    const index = start + i;
    if (index < 0 || index >= buffer.length) continue;
    const env = Math.exp(-i / (0.0032 * rate));
    const noise = random() * 2 - 1;
    let sample = noise;
    if (mode === "hp") sample = noise - prev;
    if (mode === "laptop") {
      low = lowA * low + (1 - lowA) * noise;
      sample = low - prev * 0.2;
    }
    prev = noise;
    buffer[index] += amplitude * env * sample;
  }
}

function delayGain(buffer, rate, delaySeconds, gain) {
  const out = new Float32Array(buffer.length);
  const delay = Math.round(delaySeconds * rate);
  for (let i = 0; i < buffer.length; i += 1) {
    const source = i - delay;
    if (source >= 0) out[i] += gain * buffer[source];
  }
  return out;
}

function addNoise(buffer, amplitude, random) {
  for (let i = 0; i < buffer.length; i += 1) buffer[i] += amplitude * (random() * 2 - 1);
}

function mix(into, other) {
  for (let i = 0; i < into.length; i += 1) into[i] += other[i] || 0;
}

function legacyCount(mic, rate, sensitivity) {
  const block = 128;
  let noise = 0.004;
  let prev = 0;
  let cooldown = 0;
  let count = 0;
  const sens = sensitivity;
  const minRms = 0.06 - sens * 0.008;
  const ratio = 6.4 - sens * 0.7;
  const zcrMin = 0.12 - sens * 0.012;
  for (let offset = 0; offset < mic.length; offset += block) {
    const length = Math.min(block, mic.length - offset);
    let energy = 0;
    let crossings = 0;
    for (let i = 0; i < length; i += 1) {
      const sample = mic[offset + i];
      const delta = sample - prev;
      energy += delta * delta;
      if ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0)) crossings += 1;
      prev = sample;
    }
    const rms = Math.sqrt(energy / length);
    const zcr = crossings / length;
    if (rms < noise * 3) noise = noise * 0.97 + rms * 0.03;
    else noise = noise * 0.998 + rms * 0.002;
    const threshold = Math.max(minRms, noise * ratio);
    cooldown -= length / rate;
    if (cooldown <= 0 && rms > threshold && zcr > zcrMin) {
      cooldown = 0.07;
      count += 1;
    }
  }
  return count;
}

function calibrationSignal(rate, seconds) {
  const random = rng(7);
  const ref = makeBuffer(rate, seconds);
  for (let i = 0; i < 4; i += 1) addBurst(ref, rate, 0.08 + i * 0.09, 0.016, 0.62, random, "hp");
  return ref;
}

function runDetector(ref, mic, rate, sensitivity, block = 128) {
  const detector = createClapDetector(rate);
  detector.setSensitivity(sensitivity);
  detector.startCalibration();
  const times = [];
  let calibration = null;
  let samples = 0;
  const length = Math.max(ref.length, mic.length);
  for (let offset = 0; offset < length; offset += block) {
    const n = Math.min(block, length - offset);
    const refBlock = ref.subarray(offset, Math.min(ref.length, offset + n));
    const micBlock = mic.subarray(offset, Math.min(mic.length, offset + n));
    const paddedRef = refBlock.length === n ? refBlock : pad(refBlock, n);
    const paddedMic = micBlock.length === n ? micBlock : pad(micBlock, n);
    const result = detector.push(paddedMic, paddedRef);
    samples += n;
    if (result.calibration) calibration = result.calibration;
    if (result.onset) times.push(samples / rate);
  }
  return { times, calibration, snapshot: detector.snapshot() };
}

function pad(block, n) {
  const out = new Float32Array(n);
  out.set(block);
  return out;
}

function countNear(times, targets, windowSeconds) {
  const used = new Set();
  let hits = 0;
  for (const target of targets) {
    let best = -1;
    let bestGap = windowSeconds;
    times.forEach((time, index) => {
      if (used.has(index)) return;
      const gap = Math.abs(time - target);
      if (gap <= bestGap) {
        bestGap = gap;
        best = index;
      }
    });
    if (best >= 0) {
      used.add(best);
      hits += 1;
    }
  }
  return { hits, extras: times.length - hits };
}

function scenario({
  rate = 48000,
  clapDb = null,
  clapAmp = 0,
  bleedGain = 0,
  delay = 0.05,
  clapsOnBeat = false,
  sensitivity = 1,
  reflect = false,
  removeBeeps = false,
  mode = "hp",
  block = 128,
  beats = 8,
}) {
  const random = rng(11);
  const clapRandom = rng(29);
  const beat0 = 0.9;
  const period = 0.5;
  const seconds = beat0 + beats * period + 0.3;
  const ref = makeBuffer(rate, seconds);
  mix(ref, calibrationSignal(rate, 0.6));
  const beatTimes = [];
  for (let i = 0; i < beats; i += 1) {
    const at = beat0 + i * period;
    beatTimes.push(at);
    addBurst(ref, rate, at, 0.02, 0.85, random, "hp");
  }
  let mic = delayGain(ref, rate, delay, bleedGain);
  if (reflect) mix(mic, delayGain(ref, rate, delay + 0.011, bleedGain * 0.45));
  if (removeBeeps) {
    const cut = Math.floor(0.7 * rate);
    for (let i = 0; i < cut && i < mic.length; i += 1) mic[i] = 0;
  }
  const clapTimes = [];
  for (let i = 0; i < beats; i += 1) {
    const at = beatTimes[i] + (clapsOnBeat ? delay : period * 0.5);
    if (clapAmp > 0 || clapDb != null) {
      const before = mic.slice();
      addBurst(mic, rate, at, 0.012, clapAmp > 0 ? clapAmp : 0.2, clapRandom, mode);
      if (clapDb != null) {
        const start = Math.floor(at * rate);
        const end = Math.min(mic.length, start + Math.floor(0.03 * rate));
        // Scale only the added clap, not the bleed underneath.
        let peak = 0;
        for (let s = start; s < end; s += 1) peak = Math.max(peak, Math.abs(mic[s] - before[s]));
        const target = 10 ** (clapDb / 20);
        if (peak > 1e-8) {
          const g = target / peak;
          for (let s = start; s < end; s += 1) mic[s] = before[s] + (mic[s] - before[s]) * g;
        }
      }
      clapTimes.push(at);
    }
  }
  addNoise(mic, 0.0008, rng(3));
  const detected = runDetector(ref, mic, rate, sensitivity, block);
  const afterCal = detected.times.filter((time) => time > 0.75);
  const matched = countNear(afterCal, clapTimes, 0.08);
  const musicOnly = delayGain(ref, rate, delay, bleedGain);
  if (removeBeeps) {
    const cut = Math.floor(0.7 * rate);
    for (let i = 0; i < cut && i < musicOnly.length; i += 1) musicOnly[i] = 0;
  }
  addNoise(musicOnly, 0.0008, rng(3));
  return {
    legacyMusic: legacyCount(musicOnly.subarray(Math.floor(0.75 * rate)), rate, sensitivity),
    legacyClaps: legacyCount(mic.subarray(Math.floor(0.75 * rate)), rate, sensitivity),
    detected: afterCal.length,
    hits: matched.hits,
    extras: matched.extras,
    expected: clapTimes.length,
    calibration: detected.calibration,
    times: afterCal,
    delay,
    bleedGain,
    rate,
  };
}

test("靈敏度 1 和 5 的門檻差兩倍以上", () => {
  const low = sensitivityProfile(1);
  const high = sensitivityProfile(5);
  assert.ok(low.minRms / high.minRms >= 2.4, `${low.minRms} / ${high.minRms}`);
  assert.ok(low.leak > high.leak);
  assert.equal(sensitivityProfile(1).sens, 1);
});

test("校正聲本身不算拍手", () => {
  const result = scenario({
    clapAmp: 0,
    bleedGain: 0.34,
    delay: 0.064,
    sensitivity: 1,
    beats: 0,
  });
  assert.equal(result.detected, 0);
});

test("只有喇叭、沒有拍手時，不會把鼓聲算成拍手", () => {
  const result = scenario({
    clapAmp: 0,
    bleedGain: 0.34,
    delay: 0.064,
    sensitivity: 1,
  });
  assert.ok(result.calibration?.ok, JSON.stringify(result.calibration));
  assert.ok(result.legacyMusic >= 6, `舊偵測應會把鼓聲算進去，實際 ${result.legacyMusic}`);
  assert.equal(result.detected, 0);
});

test("沒有音樂時，大聲拍手不會比舊偵測少", () => {
  const result = scenario({
    clapAmp: 0.42,
    bleedGain: 0,
    delay: 0.04,
    clapsOnBeat: false,
    sensitivity: 1,
  });
  assert.ok(result.legacyClaps >= 6, `舊偵測 ${result.legacyClaps}`);
  assert.equal(result.hits, result.expected);
  assert.equal(result.extras, 0);
  assert.ok(result.hits >= Math.min(result.expected, result.legacyClaps));
});

for (const rate of [44100, 48000]) {
  for (const db of [-30, -36]) {
    test(`沒有音樂時，${rate} Hz、${db} dBFS 的拍手在靈敏度 1 要數到`, () => {
      const result = scenario({
        rate,
        clapDb: db,
        clapAmp: 0,
        bleedGain: 0,
        delay: 0.04,
        sensitivity: 1,
        mode: "laptop",
      });
      assert.equal(result.hits, result.expected, JSON.stringify({ hits: result.hits, times: result.times }));
      assert.equal(result.extras, 0);
    });
  }
  test(`沒有音樂時，${rate} Hz、-42 dBFS 筆電拍手在靈敏度 5 要數到`, () => {
    const result = scenario({
      rate,
      clapDb: -42,
      bleedGain: 0,
      sensitivity: 5,
      mode: "laptop",
    });
    assert.ok(result.hits >= 7, JSON.stringify(result.times));
    assert.ok(result.extras <= 1);
  });
}

test("更小聲的拍手，靈敏度 1 不計、靈敏度 5 會計", () => {
  const quiet = scenario({
    clapDb: -46,
    bleedGain: 0,
    sensitivity: 1,
    mode: "laptop",
  });
  const loose = scenario({
    clapDb: -46,
    bleedGain: 0,
    sensitivity: 5,
    mode: "laptop",
  });
  assert.ok(quiet.hits <= 2, `靈敏度 1 不該把 -46 dBFS 算進去，實際 ${quiet.hits}`);
  assert.ok(loose.hits >= 6, `靈敏度 5 應該數到，實際 ${loose.hits}`);
});

test("音樂播放中照拍子拍手，計數接近實際拍數", () => {
  const result = scenario({
    clapAmp: 0.42,
    bleedGain: 0.34,
    delay: 0.072,
    clapsOnBeat: true,
    sensitivity: 1,
    reflect: true,
  });
  assert.ok(result.calibration?.ok, JSON.stringify(result.calibration));
  const delayError = Math.abs(result.calibration.delaySeconds - result.delay);
  assert.ok(delayError < 0.008, `延遲誤差 ${delayError}`);
  const gainError = Math.abs(result.calibration.gain - result.bleedGain) / result.bleedGain;
  assert.ok(gainError < 0.35, `增益誤差 ${gainError} gain=${result.calibration.gain}`);
  assert.ok(result.legacyMusic >= 6, `舊偵測在純音樂時數到 ${result.legacyMusic}`);
  assert.ok(
    Math.abs(result.hits - result.expected) <= 1,
    `對上 ${result.hits}/${result.expected}，多算 ${result.extras}，時間 ${result.times}`,
  );
  assert.ok(result.extras <= 1, `多算了 ${result.extras} 下 ${result.times}`);
});

test("音樂播放中拍在拍與拍之間，也不會把鼓聲算進去", () => {
  const result = scenario({
    clapAmp: 0.42,
    bleedGain: 0.34,
    delay: 0.05,
    clapsOnBeat: false,
    sensitivity: 1,
  });
  assert.ok(Math.abs(result.hits - result.expected) <= 1, JSON.stringify(result));
  assert.ok(result.extras <= 1, JSON.stringify(result));
});

test("小聲拍手疊在音樂之間仍數得到，純鼓聲不算", () => {
  for (const rate of [44100, 48000]) {
    const clapped = scenario({
      rate,
      clapDb: -30,
      bleedGain: 0.2,
      delay: 0.06,
      clapsOnBeat: false,
      sensitivity: 1,
      mode: "laptop",
    });
    const drums = scenario({
      rate,
      clapAmp: 0,
      bleedGain: 0.34,
      delay: 0.06,
      sensitivity: 1,
    });
    assert.ok(clapped.hits >= 6, `${rate} 對上 ${clapped.hits} ${clapped.times}`);
    assert.ok(clapped.extras <= 1, `${rate} 多算 ${clapped.extras}`);
    assert.equal(drums.detected, 0, `${rate} 純鼓聲 ${drums.detected}`);
  }
});

test("回音消除把校正聲吃掉之後，小聲拍手仍算，鼓聲不算", () => {
  for (const rate of [44100, 48000]) {
    const clapped = scenario({
      rate,
      clapDb: -36,
      bleedGain: 0,
      removeBeeps: true,
      sensitivity: 1,
      mode: "laptop",
    });
    const drums = scenario({
      rate,
      clapAmp: 0,
      bleedGain: 0.34,
      delay: 0.064,
      removeBeeps: true,
      sensitivity: 1,
    });
    assert.equal(clapped.calibration?.ok, false);
    assert.ok(clapped.calibration.gain <= 0.02, JSON.stringify(clapped.calibration));
    assert.equal(clapped.hits, clapped.expected, JSON.stringify(clapped.times));
    assert.equal(clapped.extras, 0);
    assert.equal(drums.calibration?.ok, false);
    assert.equal(drums.detected, 0, `純鼓聲 ${drums.detected} ${drums.times}`);
  }
});

test("512 取樣一塊時，48k 與 44.1k 的小聲拍手一樣數得到", () => {
  for (const rate of [44100, 48000]) {
    const result = scenario({
      rate,
      clapDb: -33,
      bleedGain: 0,
      sensitivity: 1,
      mode: "laptop",
      block: 512,
    });
    assert.ok(result.hits >= 7, JSON.stringify(result.times));
    assert.ok(result.extras <= 1);
  }
});

test("電腦喇叭延遲 6 到 25 毫秒、沒有拍手，不會被當成拍手", () => {
  for (const rate of [44100, 48000]) {
    for (const delay of [0.006, 0.012, 0.025]) {
      for (const bleedGain of [0.05, 0.2, 0.4]) {
        const result = scenario({
          rate,
          clapAmp: 0,
          bleedGain,
          delay,
          sensitivity: 1,
          beats: 6,
        });
        assert.equal(
          result.detected,
          0,
          `${rate} 延遲 ${delay} 增益 ${bleedGain} 數到 ${result.detected} ${result.times}`,
        );
      }
    }
  }
});

test("同一段喇叭聲再疊明顯更響的拍手，要聽得到", () => {
  for (const rate of [44100, 48000]) {
    const result = scenario({
      rate,
      clapAmp: 0.55,
      bleedGain: 0.2,
      delay: 0.008,
      clapsOnBeat: true,
      sensitivity: 1,
      beats: 6,
    });
    assert.ok(result.hits >= 5, `${rate} 對上 ${result.hits}/${result.expected} ${result.times}`);
    assert.ok(result.extras <= 1, `${rate} 多算 ${result.extras}`);
  }
});

test("靈敏度 5 也不會把純喇叭算成拍手", () => {
  const result = scenario({
    clapAmp: 0,
    bleedGain: 0.34,
    delay: 0.05,
    sensitivity: 5,
  });
  assert.ok(result.detected <= 1, `靈敏度 5 純音樂數到 ${result.detected}`);
});
