/**
 * audio-manager.js
 * Central AudioContext, backing track playback sync, metronome pulses, and procedural synth.
 */

export class AudioManager {
  constructor() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass({
      latencyHint: 'interactive'
    });

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    this.masterGain.connect(this.ctx.destination);

    this.backingSource = null;
    this.backingBuffer = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.pauseOffset = 0;
    this.playbackRate = 1.0;
    this.calibrationOffsetMs = 50; // default +50ms per specification

    // Metronome state
    this.metronomeActive = false;
    this.metronomeIntervalId = null;
  }

  async ensureRunning() {
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  setCalibrationOffset(offsetMs) {
    this.calibrationOffsetMs = offsetMs;
  }

  getPlayheadTime() {
    if (!this.isPlaying) return this.pauseOffset;
    const elapsed = (this.ctx.currentTime - this.startTime) * this.playbackRate;
    const playhead = elapsed - (this.calibrationOffsetMs / 1000.0);
    return Math.max(0, playhead);
  }

  async loadBackingTrack(url) {
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      this.backingBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      return this.backingBuffer;
    } catch (err) {
      console.warn(`Could not load audio file ${url}, will use procedural audio accompaniment.`, err);
      this.backingBuffer = null;
      return null;
    }
  }

  play(startOffset = 0) {
    this.ensureRunning();
    this.stopBacking();

    this.pauseOffset = startOffset;
    this.startTime = this.ctx.currentTime - (startOffset / this.playbackRate);
    this.isPlaying = true;

    if (this.backingBuffer) {
      this.backingSource = this.ctx.createBufferSource();
      this.backingSource.buffer = this.backingBuffer;
      this.backingSource.playbackRate.value = this.playbackRate;
      this.backingSource.connect(this.masterGain);

      const offsetSeconds = Math.max(0, startOffset);
      if (offsetSeconds < this.backingBuffer.duration) {
        this.backingSource.start(0, offsetSeconds);
      }
    }
  }

  pause() {
    if (!this.isPlaying) return;
    this.pauseOffset = this.getPlayheadTime();
    this.stopBacking();
    this.isPlaying = false;
  }

  stop() {
    this.stopBacking();
    this.isPlaying = false;
    this.pauseOffset = 0;
  }

  stopBacking() {
    if (this.backingSource) {
      try {
        this.backingSource.stop();
      } catch (e) {}
      this.backingSource.disconnect();
      this.backingSource = null;
    }
  }

  setPlaybackRate(rate) {
    this.playbackRate = Math.max(0.25, Math.min(2.0, rate));
    if (this.backingSource) {
      this.backingSource.playbackRate.value = this.playbackRate;
    }
  }

  // Play a single synthesized note tone for feedback or procedural backing
  playTone(midi, duration = 0.5, velocity = 0.7, startDelay = 0) {
    const f0 = 440 * Math.pow(2, (midi - 69) / 12);
    const now = this.ctx.currentTime + startDelay;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f0, now);

    // Exponential decay envelope
    gain.gain.setValueAtTime(velocity * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  // Play crisp metronome click for the 4-beat auto-calibration wizard
  playMetronomeClick(isHigh = false, atTime = null) {
    const t = atTime || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHigh ? 1200 : 800, t);
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.06);
  }
}
