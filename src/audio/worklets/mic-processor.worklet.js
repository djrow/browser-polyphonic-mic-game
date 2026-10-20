/**
 * mic-processor.worklet.js
 * Isolated AudioWorkletProcessor running on high-priority audio thread.
 * Features:
 *  - Downmix multi-channel to mono ((L + R) * 0.5)
 *  - Smooth RMS noise gate (-46 dB, threshold ~0.005) with ~300ms sustain hold timer
 *  - Gentle Sustain Makeup AGC with soft peak limiter
 *  - Ring buffering / postMessage chunk transfer
 */

class MicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Noise gate settings
    // -46 dB corresponds to 10^(-46/20) ~= 0.00501
    this.gateThreshold = 0.005;
    this.gateOpen = false;
    this.holdTimeSamples = Math.floor(sampleRate * 0.30); // 300ms hold
    this.holdCounter = 0;
    this.envelope = 0.0;
    this.gainMakeup = 1.0;
    this.targetMakeupGain = 1.0;

    // AGC settings
    this.agcMaxGain = 3.5;
    this.agcMinGain = 1.0;
    this.attackAlpha = 0.01;
    this.releaseAlpha = 0.0005;

    // Output buffer chunking (e.g. 1024 or 2048 samples for analysis)
    this.chunkSize = 1024;
    this.buffer = new Float32Array(this.chunkSize);
    this.bufIndex = 0;

    this.port.onmessage = (event) => {
      const { type, payload } = event.data;
      if (type === 'SET_GATE_THRESHOLD') {
        this.gateThreshold = Math.max(0.0005, Math.min(0.05, payload));
      } else if (type === 'SET_HOLD_TIME_MS') {
        this.holdTimeSamples = Math.floor(sampleRate * (payload / 1000));
      }
    };
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const numChannels = input.length;
    const channel0 = input[0];
    const channel1 = numChannels > 1 ? input[1] : null;
    const numSamples = channel0.length;

    // 1. Downmix to mono and calculate frame RMS
    let sumSquares = 0.0;
    const mono = new Float32Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      let s = channel0[i];
      if (channel1) {
        s = (s + channel1[i]) * 0.5;
      }
      mono[i] = s;
      sumSquares += s * s;
    }

    const frameRms = Math.sqrt(sumSquares / numSamples);

    // 2. Smooth RMS Noise Gate with 300ms sustain hold timer
    if (frameRms >= this.gateThreshold) {
      this.gateOpen = true;
      this.holdCounter = this.holdTimeSamples;
    } else {
      if (this.holdCounter > 0) {
        this.holdCounter -= numSamples;
        this.gateOpen = true;
      } else {
        this.gateOpen = false;
      }
    }

    // 3. Gentle Sustain Makeup AGC
    // Fast attack on transients, slow release to bring up faint sustains
    if (frameRms > this.envelope) {
      this.envelope += this.attackAlpha * (frameRms - this.envelope);
    } else {
      this.envelope += this.releaseAlpha * (frameRms - this.envelope);
    }

    if (this.gateOpen && this.envelope > 0.001) {
      const desiredGain = Math.min(this.agcMaxGain, Math.max(this.agcMinGain, 0.15 / this.envelope));
      this.gainMakeup += 0.005 * (desiredGain - this.gainMakeup);
    } else {
      this.gainMakeup += 0.01 * (1.0 - this.gainMakeup);
    }

    // 4. Apply gate and AGC
    const gateGain = this.gateOpen ? 1.0 : 0.0;

    for (let i = 0; i < numSamples; i++) {
      let sample = mono[i] * gateGain * this.gainMakeup;

      // Soft ceiling limiter to prevent harsh clipping
      if (sample > 1.0) {
        sample = 1.0 + Math.tanh(sample - 1.0) * 0.2;
      } else if (sample < -1.0) {
        sample = -1.0 + Math.tanh(sample + 1.0) * 0.2;
      }

      this.buffer[this.bufIndex++] = sample;

      if (this.bufIndex >= this.chunkSize) {
        // Send chunk to main / inference thread
        const chunkToSend = new Float32Array(this.buffer);
        this.port.postMessage({
          type: 'AUDIO_CHUNK',
          buffer: chunkToSend.buffer,
          rms: frameRms,
          gateOpen: this.gateOpen,
          gainMakeup: this.gainMakeup,
          timestamp: currentTime
        }, [chunkToSend.buffer]);

        this.bufIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
