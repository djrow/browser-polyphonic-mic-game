/**
 * dsp-pitch-detector.js
 * Tier 2: Ultra-Fast Companion Goertzel Polyphonic Pitch Detector (< 20ms attack).
 * Features:
 *  - 2048-sample Hamming-windowed Goertzel filter bank spanning MIDI 36 (C2) to 84 (C6) [and up to 108].
 *  - Spectral Crest Factor Guard: peak-to-mean magnitude >= 3.8 on attack, >= 2.8 on sustain.
 *  - Harmonic suppression: cancels octave (+12), fifth (+19), and double-octave (+24) overtone leakage.
 *  - Multi-hop temporal persistence with +/- 1 semitone vibrato tolerance.
 */

export class DspPitchDetector {
  constructor(sampleRate = 44100, options = {}) {
    this.sampleRate = sampleRate;
    this.windowSize = options.windowSize || 2048;
    this.minMidi = options.minMidi || 36; // C2 (65.4 Hz)
    this.maxMidi = options.maxMidi || 84; // C6 (1046.5 Hz)

    // Precompute Hamming window
    this.hammingWindow = new Float32Array(this.windowSize);
    for (let i = 0; i < this.windowSize; i++) {
      this.hammingWindow[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (this.windowSize - 1));
    }

    // Precompute Goertzel coefficients for each MIDI note
    // k = round(N * freq / sampleRate)
    // coeff = 2 * cos(2 * pi * k / N)
    this.midiBins = [];
    for (let m = this.minMidi; m <= this.maxMidi; m++) {
      const freq = 440 * Math.pow(2, (m - 69) / 12);
      const k = (this.windowSize * freq) / this.sampleRate;
      const omega = (2 * Math.PI * k) / this.windowSize;
      const coeff = 2 * Math.cos(omega);
      this.midiBins.push({
        midi: m,
        freq: freq,
        k: k,
        coeff: coeff,
        cosOmega: Math.cos(omega),
        sinOmega: Math.sin(omega),
        historyConfidence: 0.0,
        activeFrames: 0
      });
    }

    // Sliding audio sample ring buffer for Goertzel
    this.audioBuffer = new Float32Array(this.windowSize);
    this.sampleCount = 0;

    // Harmonic suppression factors
    this.harmonicWeights = {
      octave: options.octaveSuppression || 0.65,      // +12 st (2f)
      fifth: options.fifthSuppression || 0.45,        // +19 st (3f)
      doubleOctave: options.doubleOctaveSuppression || 0.35 // +24 st (4f)
    };

    // Crest factor thresholds
    this.crestAttackThreshold = 3.8;
    this.crestSustainThreshold = 2.8;

    // Recent detections for vibrato tolerance and persistence
    this.previousActiveMidi = new Set();
  }

  setHarmonicWeights(weights) {
    Object.assign(this.harmonicWeights, weights);
  }

  setCrestThresholds(attack, sustain) {
    this.crestAttackThreshold = attack;
    this.crestSustainThreshold = sustain;
  }

  // Push incoming audio samples (e.g. from AudioWorklet 1024 chunks)
  pushSamples(samples) {
    const n = samples.length;
    if (n >= this.windowSize) {
      this.audioBuffer.set(samples.subarray(n - this.windowSize));
    } else {
      // Shift left and append
      this.audioBuffer.copyWithin(0, n);
      this.audioBuffer.set(samples, this.windowSize - n);
    }
    this.sampleCount += n;
  }

  // Detect polyphonic pitches from the current window buffer
  detect() {
    if (this.sampleCount < 512) return [];

    const N = this.windowSize;
    const rawMagnitudes = new Float32Array(this.midiBins.length);

    // 1. Run Goertzel for each frequency bin over Hamming-windowed buffer
    let sumMagnitude = 0.0;
    let maxMagnitude = 0.0;

    for (let b = 0; b < this.midiBins.length; b++) {
      const bin = this.midiBins[b];
      const coeff = bin.coeff;
      let s_prev = 0.0;
      let s_prev2 = 0.0;

      for (let i = 0; i < N; i++) {
        const x = this.audioBuffer[i] * this.hammingWindow[i];
        const s = x + coeff * s_prev - s_prev2;
        s_prev2 = s_prev;
        s_prev = s;
      }

      // Compute power: P = s_prev^2 + s_prev2^2 - coeff * s_prev * s_prev2
      let power = s_prev * s_prev + s_prev2 * s_prev2 - coeff * s_prev * s_prev2;
      if (power < 0) power = 0;
      const mag = Math.sqrt(power);

      rawMagnitudes[b] = mag;
      sumMagnitude += mag;
      if (mag > maxMagnitude) maxMagnitude = mag;
    }

    const meanMagnitude = sumMagnitude / this.midiBins.length;
    if (meanMagnitude < 1e-6) {
      this.previousActiveMidi.clear();
      return [];
    }

    // Crest factor = peak / mean
    const crestFactor = maxMagnitude / meanMagnitude;

    // 2. Harmonic Suppression
    // For each bin, subtract overtone leak from higher harmonics if fundamental is strong
    const suppressed = new Float32Array(rawMagnitudes);
    for (let b = 0; b < this.midiBins.length; b++) {
      const fundamentalMidi = this.midiBins[b].midi;
      const fundamentalMag = rawMagnitudes[b];

      if (fundamentalMag > meanMagnitude * 1.5) {
        // Octave (+12 st)
        const octBinIdx = this.midiBins.findIndex(item => item.midi === fundamentalMidi + 12);
        if (octBinIdx !== -1) {
          // Cap suppression to preserve intentional played octave notes in chords
          const maxSuppression = Math.min(rawMagnitudes[octBinIdx] * 0.45, fundamentalMag * this.harmonicWeights.octave);
          suppressed[octBinIdx] = Math.max(0, suppressed[octBinIdx] - maxSuppression);
        }
        // Fifth (+19 st)
        const fifthBinIdx = this.midiBins.findIndex(item => item.midi === fundamentalMidi + 19);
        if (fifthBinIdx !== -1) {
          const maxSuppression = Math.min(rawMagnitudes[fifthBinIdx] * 0.40, fundamentalMag * this.harmonicWeights.fifth);
          suppressed[fifthBinIdx] = Math.max(0, suppressed[fifthBinIdx] - maxSuppression);
        }
        // Double Octave (+24 st)
        const dOctBinIdx = this.midiBins.findIndex(item => item.midi === fundamentalMidi + 24);
        if (dOctBinIdx !== -1) {
          const maxSuppression = Math.min(rawMagnitudes[dOctBinIdx] * 0.35, fundamentalMag * this.harmonicWeights.doubleOctave);
          suppressed[dOctBinIdx] = Math.max(0, suppressed[dOctBinIdx] - maxSuppression);
        }
      }
    }

    // 3. Peak Picking with Spectral Crest Guard and Vibrato Tolerance
    const candidateNotes = [];
    const currentActiveMidi = new Set();

    for (let b = 1; b < this.midiBins.length - 1; b++) {
      const mag = suppressed[b];
      const bin = this.midiBins[b];
      const midi = bin.midi;

      // Local maximum check
      if (mag > suppressed[b - 1] && mag > suppressed[b + 1]) {
        // Check if note was previously sustained or has vibrato neighbor (+-1 semitone)
        const isSustained = this.previousActiveMidi.has(midi) ||
                            this.previousActiveMidi.has(midi - 1) ||
                            this.previousActiveMidi.has(midi + 1);

        const requiredCrest = isSustained ? this.crestSustainThreshold : this.crestAttackThreshold;
        const relativeMag = mag / meanMagnitude;

        if (relativeMag >= requiredCrest && mag > 0.02) {
          const confidence = Math.min(1.0, (relativeMag - requiredCrest) / 5.0 + 0.5);
          const isOnset = !isSustained;

          candidateNotes.push({
            midi: midi,
            freq: bin.freq,
            magnitude: mag,
            confidence: confidence,
            isOnset: isOnset,
            crestFactor: crestFactor
          });

          currentActiveMidi.add(midi);
        }
      }
    }

    this.previousActiveMidi = currentActiveMidi;
    return candidateNotes;
  }
}
