// 拍手偵測。
// 沒有播放聲時，沿用舊版的「變化量＋過零率」，但地板比 0.052 低，
// 筆電和手機的普通拍手才聽得見。
// 有播放聲時，把對齊後的喇叭參考扣掉，只要求多出來一點，再加上一點高頻瞬態。
// 校正嗶聲的整段，以及播放剛開始的約 0.15 秒，都不算拍手。

export function sensitivityProfile(sensitivity) {
  const sens = Math.min(5, Math.max(1, Math.round(Number(sensitivity) || 1)));
  const t = (sens - 1) / 4;
  return {
    sens,
    minRms: 0.0035 * Math.pow(0.34, t),
    ratio: 3.3 * Math.pow(0.7, t),
    zcrMin: 0.048 - t * 0.018,
    leak: 0.3 - t * 0.12,
  };
}

export function createClapDetector(sampleRate) {
  const rate = sampleRate > 0 ? sampleRate : 48000;
  const ringSize = 1 << Math.ceil(Math.log2(rate + 16));
  const mask = ringSize - 1;
  const micRing = new Float32Array(ringSize);
  const refRing = new Float32Array(ringSize);
  const micDelta = new Float32Array(4096);
  let write = 0;
  let seen = 0;
  let sensitivity = 1;
  let noise = 0.00055;
  let prevMic = 0;
  let cooldown = 0;
  let delaySamples = 0;
  let gain = 0;
  let wide = true;
  let calibrating = false;
  let calMic = null;
  let calRef = null;
  let calAt = 0;
  let suppressUntil = 0;
  let playbackHeld = false;
  let holdUntil = 0;
  const calNeed = Math.floor(0.62 * rate);
  const alpha = Math.exp((-2 * Math.PI * 2400) / rate);

  function setSensitivity(value) {
    sensitivity = Math.min(5, Math.max(1, Math.round(Number(value) || 1)));
  }

  function startCalibration() {
    calibrating = true;
    gain = 0;
    delaySamples = 0;
    wide = true;
    calMic = new Float32Array(calNeed);
    calRef = new Float32Array(calNeed);
    calAt = 0;
    suppressUntil = seen + Math.floor(0.7 * rate);
    cooldown = 0;
  }

  function sampleAt(ring, absolute) {
    if (absolute < 0 || absolute >= seen) return 0;
    return ring[absolute & mask];
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
      const minDelay = Math.round(0.008 * rate);
      const plausible =
        found.confidence >= 0.35 &&
        found.gain >= 0.015 &&
        found.gain <= 1.2 &&
        found.delaySamples >= minDelay &&
        found.micRms >= 0.0025;
      if (plausible) {
        delaySamples = found.delaySamples;
        gain = Math.min(1.05, Math.max(0.02, found.gain));
        wide = false;
      } else {
        delaySamples = 0;
        gain = 0;
        wide = true;
      }
      cooldown = 0.04;
      calibration = {
        ok: plausible,
        delaySeconds: plausible ? delaySamples / rate : 0,
        gain: plausible ? gain : 0,
        confidence: found.confidence,
        refRms: found.refRms,
        micRms: found.micRms,
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

  function analyze(start, length) {
    let energy = 0;
    let crossings = 0;
    let prev = prevMic;
    let high = 0;
    let highPrev = 0;
    const n = Math.min(length, micDelta.length);
    for (let i = 0; i < length; i += 1) {
      const sample = sampleAt(micRing, start + i);
      const delta = sample - prev;
      if (i < n) micDelta[i] = delta;
      energy += delta * delta;
      if ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0)) crossings += 1;
      const band = alpha * (highPrev + delta);
      high += band * band;
      highPrev = band;
      prev = sample;
    }
    prevMic = prev;
    return {
      rms: Math.sqrt(energy / length),
      energy,
      zcr: crossings / length,
      high: Math.sqrt(high / length),
    };
  }

  function waveformAt(start, length, lag, micEnergy) {
    let prev = sampleAt(refRing, start - lag - 1);
    let refEnergy = 0;
    let dot = 0;
    let high = 0;
    let highPrev = 0;
    for (let i = 0; i < length; i += 1) {
      const sample = sampleAt(refRing, start - lag + i);
      const delta = sample - prev;
      prev = sample;
      refEnergy += delta * delta;
      dot += micDelta[i] * delta;
      const band = alpha * (highPrev + delta);
      high += band * band;
      highPrev = band;
    }
    if (refEnergy < 1e-8 || micEnergy < 1e-12) return null;
    return {
      corr: dot / Math.sqrt(refEnergy * micEnergy),
      gain: dot / refEnergy,
      refRms: Math.sqrt(refEnergy / length),
      refHigh: Math.sqrt(high / length),
      lag,
    };
  }

  function envelopeScore(start, length, lag, hop) {
    let dot = 0;
    let left = 0;
    let right = 0;
    for (let p = 0; p + hop <= length; p += hop) {
      let micAbs = 0;
      let refAbs = 0;
      let prev = sampleAt(refRing, start - lag + p - 1);
      for (let k = 0; k < hop; k += 1) {
        micAbs += Math.abs(micDelta[p + k] || 0);
        const sample = sampleAt(refRing, start - lag + p + k);
        const delta = sample - prev;
        prev = sample;
        refAbs += Math.abs(delta);
      }
      dot += micAbs * refAbs;
      left += micAbs * micAbs;
      right += refAbs * refAbs;
    }
    if (left < 1e-10 || right < 1e-10) return 0;
    return dot / Math.sqrt(left * right);
  }

  function refLevel(start, length, lag) {
    let prev = sampleAt(refRing, start - lag - 1);
    let energy = 0;
    for (let i = 0; i < length; i += 1) {
      const sample = sampleAt(refRing, start - lag + i);
      const delta = sample - prev;
      prev = sample;
      energy += delta * delta;
    }
    return Math.sqrt(energy / length);
  }

  function align(start, length, micEnergy) {
    const minLag = Math.round(0.01 * rate);
    const maxLag = Math.round(0.18 * rate);
    let refPeak = 0;
    const peakStep = Math.max(16, Math.round(0.004 * rate));
    for (let lag = minLag; lag <= maxLag; lag += peakStep) {
      const level = refLevel(start, length, lag);
      if (level > refPeak) refPeak = level;
    }
    let center = delaySamples > 0 ? delaySamples : minLag;
    let radius = Math.round(0.012 * rate);
    if (wide || delaySamples <= 0) {
      const hop = Math.max(8, Math.round(0.002 * rate));
      let bestEnv = 0;
      center = minLag;
      for (let lag = minLag; lag <= maxLag; lag += hop) {
        const score = envelopeScore(start, length, lag, hop);
        if (score > bestEnv) {
          bestEnv = score;
          center = lag;
        }
      }
      radius = hop + 2;
    }
    let best = null;
    const from = Math.max(minLag, center - radius);
    const to = Math.min(maxLag, center + radius);
    for (let lag = from; lag <= to; lag += 1) {
      const found = waveformAt(start, length, lag, micEnergy);
      if (!found) continue;
      if (!best || found.corr > best.corr) best = found;
    }
    if (!best || best.gain <= 0) {
      return { bleed: 0, high: 0, corr: best ? best.corr : 0, fit: 0, refPeak };
    }
    const corrNeed = wide ? 0.52 : 0.38;
    if (best.corr < corrNeed) return { bleed: 0, high: 0, corr: best.corr, fit: 0, refPeak };
    if (best.lag <= Math.round(0.008 * rate) && best.corr > 0.92 && best.gain > 0.8) {
      return { bleed: 0, high: 0, corr: best.corr, fit: 0, refPeak };
    }
    let fit = Math.min(1.05, best.gain);
    if (!wide && gain > 0) fit = Math.min(fit, Math.max(gain * 1.5, gain + 0.05));
    if (best.corr > 0.72) {
      delaySamples = best.lag;
      if (wide && best.corr > 0.8 && best.gain > 0.02 && best.gain < 1.15) wide = false;
    }
    return {
      bleed: Math.max(0, fit) * best.refRms,
      high: Math.max(0, fit) * best.refHigh,
      corr: best.corr,
      fit,
      refPeak: Math.max(refPeak, best.refRms),
    };
  }

  function judge(length) {
    const profile = sensitivityProfile(sensitivity);
    const start = seen - length;
    const mic = analyze(start, length);
    if (mic.rms < noise * 3) noise = noise * 0.97 + mic.rms * 0.03;
    else noise = noise * 0.998 + mic.rms * 0.002;
    const floor = Math.max(profile.minRms, noise * profile.ratio);
    if (calibrating || seen < suppressUntil || seen < holdUntil) {
      return { onset: false, rms: mic.rms, hot: false };
    }
    if (mic.rms < floor * 0.42) {
      return { onset: false, rms: mic.rms, hot: false };
    }

    const fit = align(start, length, mic.energy);
    const refPeak = fit.refPeak || 0;
    const playback =
      fit.bleed > floor * 0.28 &&
      fit.corr >= (wide ? 0.3 : 0.24) &&
      fit.fit > 0;
    if (playback && !playbackHeld) {
      playbackHeld = true;
      holdUntil = seen + Math.floor(0.15 * rate);
      return { onset: false, rms: mic.rms, hot: false };
    }

    // 參考聲這個當下有拍點，但還不能穩穩扣掉：先不當拍手。
    // 比喇叭參考還明顯大一截的，才可能是真的拍手。
    if (!playback && refPeak > floor * 1.4 && mic.rms < refPeak * 0.9) {
      return { onset: false, rms: mic.rms, hot: false };
    }

    // 沒有對得起來的播放聲：跟舊偵測一樣，只看變化量和過零率。
    if (!playback) {
      const onset = cooldown <= 0 && mic.rms > floor && mic.zcr > profile.zcrMin;
      return { onset, rms: mic.rms, hot: mic.rms > floor * 0.72 };
    }

    const excess = Math.sqrt(Math.max(0, mic.rms * mic.rms - fit.bleed * fit.bleed));
    const hfExcess = mic.high - fit.high;
    const line = Math.max(floor * 0.9, fit.bleed * profile.leak);
    const energyOk = excess > line;
    const hfOk = hfExcess > Math.max(0.0009, floor * 0.18);
    const strong = excess > Math.max(floor * 2.2, fit.bleed * 0.62);
    const onset =
      cooldown <= 0 &&
      mic.zcr > profile.zcrMin * 0.7 &&
      (strong || (energyOk && hfOk));
    return { onset, rms: mic.rms, hot: excess > line * 0.72 };
  }

  return {
    setSensitivity,
    startCalibration,
    push,
    snapshot() {
      return { delaySamples, gain, sensitivity, calibrating, wide };
    },
  };
}

const EMPTY = new Float32Array(0);

export function estimatePath(ref, mic, sampleRate) {
  const length = Math.min(ref.length, mic.length);
  const maxDelay = Math.min(length - 1, Math.floor(0.28 * sampleRate));
  if (length < 32 || maxDelay < 2) {
    return { delaySamples: 0, gain: 0, confidence: 0, micRms: 0, refRms: 0 };
  }
  let micEnergyAll = 0;
  let refEnergyAll = 0;
  for (let i = 0; i < length; i += 1) {
    micEnergyAll += mic[i] * mic[i];
    refEnergyAll += ref[i] * ref[i];
  }
  const micRms = Math.sqrt(micEnergyAll / length);
  const refRms = Math.sqrt(refEnergyAll / length);
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
    micRms,
    refRms,
  };
}
