// 麥克風模式的伴奏。長度、取樣率、時間軸跟原曲一樣。
// 短促的鼓、hi-hat、節拍器 click 會被壓得很低；拉長的旋律留著。
// 拍打和空白鍵不走這裡。

export function softenDrums(samples, sampleRate) {
  const rate = sampleRate > 0 ? sampleRate : 48000;
  const out = new Float32Array(samples.length);
  const fastC = Math.exp(-1 / (0.0014 * rate));
  const slowC = Math.exp(-1 / (0.11 * rate));
  const lowC = Math.exp((-2 * Math.PI * 160) / rate);
  const hpC = Math.exp((-2 * Math.PI * 3200) / rate);
  const hfFastC = Math.exp(-1 / (0.0011 * rate));
  const hfSlowC = Math.exp(-1 / (0.04 * rate));
  const holdSamples = Math.floor(0.02 * rate);
  let fast = 0;
  let slow = 0;
  let low = 0;
  let hp = 0;
  let previous = 0;
  let hfFast = 0;
  let hfSlow = 0;
  let hold = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i] || 0;
    low = lowC * low + (1 - lowC) * x;
    const diff = x - previous;
    previous = x;
    hp = hpC * (hp + diff);
    const ax = x < 0 ? -x : x;
    const ah = hp < 0 ? -hp : hp;
    fast = fastC * fast + (1 - fastC) * ax;
    slow = slowC * slow + (1 - slowC) * ax;
    hfFast = hfFastC * hfFast + (1 - hfFastC) * ah;
    hfSlow = hfSlowC * hfSlow + (1 - hfSlowC) * ah;
    const punch = Math.min(1, Math.max(0, fast - 0.85 * slow) / (fast + 1e-8));
    const click = Math.min(1, Math.max(0, hfFast - 1.15 * hfSlow) / (hfFast + 1e-8));
    const lowShare = Math.min(1, (low < 0 ? -low : low) / (ax + 1e-6));
    if (punch > 0.42 || click > 0.45 || (punch > 0.28 && lowShare > 0.62)) {
      hold = holdSamples;
    }
    let gain = 1;
    if (hold > 0) {
      hold -= 1;
      gain = click > 0.4 || lowShare > 0.5 ? 0.035 : 0.08;
    } else {
      gain = 1 - Math.min(0.55, punch * 0.7 + click * 0.45);
    }
    out[i] = x * gain;
  }
  return out;
}

export function softenBuffer(buffer) {
  const out = new AudioBuffer({
    length: buffer.length,
    numberOfChannels: buffer.numberOfChannels,
    sampleRate: buffer.sampleRate,
  });
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    out.getChannelData(channel).set(softenDrums(buffer.getChannelData(channel), buffer.sampleRate));
  }
  return out;
}
