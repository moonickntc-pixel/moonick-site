// 麥克風模式用的伴奏。長度、取樣率、時間軸都跟原曲一樣，只把鼓的攻擊壓小。
// 拍打和空白鍵不走這裡，所以完整混音還在。

export function softenDrums(samples, sampleRate) {
  const rate = sampleRate > 0 ? sampleRate : 48000;
  const out = new Float32Array(samples.length);
  const fastC = Math.exp(-1 / (0.004 * rate));
  const slowC = Math.exp(-1 / (0.085 * rate));
  const lowC = Math.exp((-2 * Math.PI * 140) / rate);
  let fast = 0;
  let slow = 0;
  let low = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const x = samples[i] || 0;
    low = lowC * low + (1 - lowC) * x;
    const ax = x < 0 ? -x : x;
    fast = fastC * fast + (1 - fastC) * ax;
    slow = slowC * slow + (1 - slowC) * ax;
    const punch = Math.min(1, Math.max(0, fast - 0.92 * slow) / (fast + 1e-8));
    const lowShare = Math.min(1, (low < 0 ? -low : low) / (ax + 1e-6));
    const gain = 1 - Math.min(0.9, punch * (1.35 + 0.7 * lowShare));
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
