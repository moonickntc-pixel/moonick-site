// 拍手偵測。麥克風聽到的是「延遲並縮小的播放聲」加上拍手。
// 先用一小段測試聲估計喇叭到麥克風的延遲與增益，
// 之後只有比「對齊後的播放能量 × 增益」明顯更大的突增才算拍手。
// 不在拍點上挖空，因為小朋友的拍手就是打在拍子上。

export function createClapDetector(sampleRate) {
  const rate = sampleRate > 0 ? sampleRate : 48000;
  const ringSize = 1 << Math.ceil(Math.log2(rate + 16));
  const mask = ringSize - 1;
  const micRing = new Float32Array(ringSize);
  const refRing = new Float32Array(ringSize);
  let write = 0;
  let seen = 0;
  let sensitivity = 1;
  let noise = 0.004;
  let prevMic = 0;
  let cooldown = 0;
  let delaySamples = 0;
  let gain = 0;
  let calibrating = false;
  let calMic = null;
  let calRef = null;
  let calAt = 0;
  const calNeed = Math.floor(0.55 * rate);

  function setSensitivity(value) {
    sensitivity = Math.min(5, Math.max(1, Math.round(Number(value) || 1)));
  }

  function startCalibration() {
    calibrating = true;
    gain = 0;
    delaySamples = 0;
    calMic = new Float32Array(calNeed);
    calRef = new Float32Array(calNeed);
    calAt = 0;
    cooldown = 0.55;
  }

  function push(micBlock, refBlock) {
    const mic = micBlock || EMPTY;
    const ref = refBlock || EMPTY;
    const length = mic.length || ref.length;
    if (!length) return { onset: false, rms: 0, hot: false, calibration: null };

    for (let i = 0; i < length; i += 1) {
      micRing[write] = mic[i] || 0;
      refRing[write] = i < ref.length ? ref[i] || 0 : 0;
      write = (write + 1) & mask;
      seen += 1;
      if (calibrating && calAt < calNeed) {
        calMic[calAt] = mic[i] || 0;
        calRef[calAt] = i < ref.length ? ref[i] || 0 : 0;
        calAt += 1;
      }
    }

    let calibration = null;
    if (calibrating && calAt >= calNeed) {
      const found = estimatePath(calRef, calMic, rate);
      calibrating = false;
      calMic = null;
      calRef = null;
      const ok = found.confidence >= 0.35 && found.gain > 0.008 && found.gain < 4;
      if (ok) {
        delaySamples = found.delaySamples;
        gain = found.gain;
      } else {
        delaySamples = 0;
        gain = 0;
      }
      cooldown = 0.08;
      calibration = {
        ok,
        delaySeconds: delaySamples / rate,
        gain,
        confidence: found.confidence,
      };
    }

    const verdict = judge(length);
    cooldown = Math.max(0, cooldown - length / rate);
    if (verdict.onset) cooldown = 0.07;
    return {
      onset: verdict.onset,
      rms: verdict.rms,
      hot: verdict.hot,
      calibration,
    };
  }

  function sampleAt(ring, absolute) {
    if (absolute < 0 || absolute >= seen) return 0;
    return ring[absolute & mask];
  }

  function deltaStats(ring, start, length, previous) {
    let energy = 0;
    let crossings = 0;
    let prev = previous;
    let high = 0;
    let highPrev = 0;
    const alpha = Math.exp((-2 * Math.PI * 1800) / rate);
    for (let i = 0; i < length; i += 1) {
      const sample = sampleAt(ring, start + i);
      const delta = sample - prev;
      energy += delta * delta;
      if ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0)) crossings += 1;
      const band = alpha * (highPrev + sample - prev);
      high += band * band;
      highPrev = band;
      prev = sample;
    }
    return {
      rms: Math.sqrt(energy / length),
      zcr: crossings / length,
      high: Math.sqrt(high / length),
      prev,
    };
  }

  function judge(length) {
    const sens = sensitivity;
    const minRms = 0.06 - sens * 0.008;
    const ratio = 6.4 - sens * 0.7;
    const zcrMin = 0.12 - sens * 0.012;
    // 純喇叭回授的能量比大約是 1。拍手疊上去才會超過。
    // 靈敏度 1 要比較明確的突增；5 比較容易算進去。
    const headroom = 1.24 - (sens - 1) * 0.03;
    const start = seen - length;
    const micStats = deltaStats(micRing, start, length, prevMic);
    prevMic = micStats.prev;

    if (micStats.rms < noise * 3) noise = noise * 0.97 + micStats.rms * 0.03;
    else noise = noise * 0.998 + micStats.rms * 0.002;

    const floor = Math.max(minRms, noise * ratio);
    let predicted = 0;
    let bestRef = 0;
    let bestHigh = 0;
    if (gain > 0) {
      const tol = Math.round(0.012 * rate);
      const step = Math.max(1, Math.round(0.001 * rate));
      const from = Math.max(0, delaySamples - tol);
      const to = delaySamples + tol;
      for (let lag = from; lag <= to; lag += step) {
        const before = sampleAt(refRing, start - lag - 1);
        const stats = deltaStats(refRing, start - lag, length, before);
        if (stats.rms > bestRef) {
          bestRef = stats.rms;
          bestHigh = stats.high;
        }
      }
      predicted = gain * bestRef;
    }

    const threshold = Math.max(floor, predicted * headroom);
    let spectralOk = true;
    if (predicted > floor * 0.45) {
      const explained = gain * bestHigh;
      const excess = micStats.high - explained;
      spectralOk = excess > 0.28 * Math.max(minRms * 0.45, explained);
    }
    const hot = micStats.rms > threshold * 0.72;
    const onset =
      !calibrating &&
      cooldown <= 0 &&
      micStats.rms > threshold &&
      micStats.zcr > zcrMin &&
      spectralOk;
    return { onset, rms: micStats.rms, hot, predicted, threshold };
  }

  return {
    setSensitivity,
    startCalibration,
    push,
    snapshot() {
      return { delaySamples, gain, sensitivity, calibrating };
    },
  };
}

const EMPTY = new Float32Array(0);

export function estimatePath(ref, mic, sampleRate) {
  const length = Math.min(ref.length, mic.length);
  const maxDelay = Math.min(length - 1, Math.floor(0.28 * sampleRate));
  if (length < 32 || maxDelay < 2) {
    return { delaySamples: 0, gain: 0, confidence: 0 };
  }
  const coarse = Math.max(2, Math.round(sampleRate / 12000));
  let bestLag = 0;
  let bestCorr = 0;
  let bestGain = 0;
  const score = (lag, stride) => {
    let dot = 0;
    let refEnergy = 0;
    let micEnergy = 0;
    for (let i = lag; i < length; i += stride) {
      const reference = ref[i - lag];
      const heard = mic[i];
      dot += heard * reference;
      refEnergy += reference * reference;
      micEnergy += heard * heard;
    }
    if (refEnergy < 1e-6 || micEnergy < 1e-8) return null;
    return {
      corr: dot / Math.sqrt(refEnergy * micEnergy),
      gain: dot / refEnergy,
    };
  };
  for (let lag = 0; lag <= maxDelay; lag += coarse) {
    const found = score(lag, coarse);
    if (found && found.corr > bestCorr) {
      bestCorr = found.corr;
      bestLag = lag;
      bestGain = found.gain;
    }
  }
  const from = Math.max(0, bestLag - coarse);
  const to = Math.min(maxDelay, bestLag + coarse);
  for (let lag = from; lag <= to; lag += 1) {
    const found = score(lag, 2);
    if (found && found.corr > bestCorr) {
      bestCorr = found.corr;
      bestLag = lag;
      bestGain = found.gain;
    }
  }
  return {
    delaySamples: bestLag,
    gain: bestGain > 0 ? bestGain : 0,
    confidence: bestCorr,
  };
}
