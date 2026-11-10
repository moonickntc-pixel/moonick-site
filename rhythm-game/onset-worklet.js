class OnsetProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sensitivity = 3;
    this.noise = 0.004;
    this.prev = 0;
    this.cooldown = 0;
    this.blocks = 0;
    this.emptySince = -1;
    this.reportedSilent = false;
    this.port.onmessage = (event) => {
      const data = event.data || {};
      if (data.type === "config" && typeof data.sensitivity === "number") {
        this.sensitivity = data.sensitivity;
      }
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || channel.length === 0) {
      if (this.emptySince < 0) this.emptySince = currentTime;
      if (!this.reportedSilent && currentTime - this.emptySince > 0.4) {
        this.reportedSilent = true;
        this.port.postMessage({ type: "level", rms: 0, silent: true });
      }
      return true;
    }
    if (this.reportedSilent) {
      this.reportedSilent = false;
      this.port.postMessage({ type: "level", rms: 0, silent: false });
    }
    this.emptySince = -1;

    let energy = 0;
    let crossings = 0;
    let prev = this.prev;
    for (let i = 0; i < channel.length; i += 1) {
      const sample = channel[i];
      const delta = sample - prev;
      energy += delta * delta;
      if ((sample >= 0 && prev < 0) || (sample < 0 && prev >= 0)) crossings += 1;
      prev = sample;
    }
    this.prev = prev;

    const rms = Math.sqrt(energy / channel.length);
    const zcr = crossings / channel.length;
    if (rms < this.noise * 3) {
      this.noise = this.noise * 0.97 + rms * 0.03;
    } else {
      this.noise = this.noise * 0.998 + rms * 0.002;
    }

    const sensitivity = Math.min(5, Math.max(1, this.sensitivity));
    // A MacBook mic is quieter than a phone. These floors still sit above room noise.
    const minRms = 0.06 - sensitivity * 0.008;
    const ratio = 6.4 - sensitivity * 0.7;
    const zcrMin = 0.12 - sensitivity * 0.012;
    const threshold = Math.max(minRms, this.noise * ratio);
    this.cooldown -= channel.length / sampleRate;

    if (this.cooldown <= 0 && rms > threshold && zcr > zcrMin) {
      this.cooldown = 0.07;
      this.port.postMessage({ type: "onset", time: currentTime, rms, zcr });
    }

    this.blocks += 1;
    if (this.blocks % 12 === 0) {
      this.port.postMessage({
        type: "level",
        rms,
        hot: rms > threshold * 0.72,
      });
    }
    return true;
  }
}

registerProcessor("onset-processor", OnsetProcessor);
