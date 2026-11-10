// 麥克風模式的伴奏。沒有在壓 click 的取樣，輸出和原訊號同一點，不會多出延遲。
// 低頻脈動（踢鼓、貝斯）留著，歌還聽得出拍。
// 只把短促、偏高頻的 hi-hat、軍鼓裂聲、節拍器 click 壓小。
// 拍打和空白鍵不走這裡。

export function softenDrums(samples, sampleRate) {
  const rate = sampleRate > 0 ? sampleRate : 48000;
  const out = new Float32Array(samples.length);
  const lowC = Math.exp((-2 * Math.PI * 240) / rate);
  const hpC = Math.exp((-2 * Math.PI * 4200) / rate);
  const fastC = Math.exp(-1 / (0.0011 * rate));
  const slowC = Math.exp(-1 / (0.028 * rate));
  const holdSamples = Math.floor(0.01 * rate);
  let low = 0;
  let hp = 0;
  let previous = 0;
  let fast = 0;
  let slow = 0;
  let hold = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i] || 0;
    low = lowC * low + (1 - lowC) * x;
    const diff = x - previous;
    previous = x;
    hp = hpC * (hp + diff);
    const ax = x < 0 ? -x : x;
    const ah = hp < 0 ? -hp : hp;
    fast = fastC * fast + (1 - fastC) * ah;
    slow = slowC * slow + (1 - slowC) * ah;
    const click = Math.min(1, Math.max(0, fast - 0.9 * slow) / (fast + 1e-8));
    const lowShare = Math.min(1, (low < 0 ? -low : low) / (ax + 1e-6));
    // 低頻占比高的是踢鼓脈動，不壓。只有高頻 click 才壓。
    if (click > 0.58 && lowShare < 0.38) hold = holdSamples;
    const high = x - low;
    const hfGain = hold > 0 ? 0.07 : 1;
    if (hold > 0) hold -= 1;
    out[i] = low + high * hfGain;
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
