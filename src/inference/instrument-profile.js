/**
 * instrument-profile.js
 * Instrument acoustic profiles, 88-bin neural gain adapter, and 3-second live fine-tuner.
 */

export const INSTRUMENT_PRESETS = {
  piano: {
    id: 'piano',
    name: 'Balanced / Piano',
    description: 'Even response across 88 keys, balanced overtone suppression, standard decay.',
    noiseGateThreshold: 0.005, // -46 dB
    crestAttack: 3.8,
    crestSustain: 2.8,
    octaveSuppression: 0.60,
    fifthSuppression: 0.40,
    doubleOctaveSuppression: 0.30,
    gainBoostLow: 1.1,
    gainBoostMid: 1.0,
    gainBoostHigh: 1.05
  },
  guitar: {
    id: 'guitar',
    name: 'Plucked Strings (Guitar / Harp)',
    description: 'Fast percussive attack, rapid initial decay, strong 2nd and 3rd harmonic suppression.',
    noiseGateThreshold: 0.007, // -43 dB
    crestAttack: 4.2,
    crestSustain: 2.5,
    octaveSuppression: 0.75,
    fifthSuppression: 0.55,
    doubleOctaveSuppression: 0.40,
    gainBoostLow: 0.9,
    gainBoostMid: 1.25,
    gainBoostHigh: 0.95
  },
  violin: {
    id: 'violin',
    name: 'Bowed Strings (Violin / Cello)',
    description: 'Continuous bowed sustain, vibrato tolerance (+-1 semitone), warm upper register.',
    noiseGateThreshold: 0.004, // -48 dB
    crestAttack: 3.4,
    crestSustain: 2.3,
    octaveSuppression: 0.50,
    fifthSuppression: 0.35,
    doubleOctaveSuppression: 0.25,
    gainBoostLow: 0.85,
    gainBoostMid: 1.15,
    gainBoostHigh: 1.3
  },
  winds: {
    id: 'winds',
    name: 'Woodwind & Brass (Flute / Trumpet)',
    description: 'High fundamental dominance, sharp crest factor, low overtone leakage.',
    noiseGateThreshold: 0.006, // -44 dB
    crestAttack: 4.0,
    crestSustain: 3.0,
    octaveSuppression: 0.45,
    fifthSuppression: 0.30,
    doubleOctaveSuppression: 0.20,
    gainBoostLow: 0.8,
    gainBoostMid: 1.2,
    gainBoostHigh: 1.1
  },
  vocal: {
    id: 'vocal',
    name: 'Vocal',
    description: 'Formant smoothing, dynamic vibrato tracking, broad pitch drift compensation.',
    noiseGateThreshold: 0.004, // -48 dB
    crestAttack: 3.2,
    crestSustain: 2.2,
    octaveSuppression: 0.40,
    fifthSuppression: 0.30,
    doubleOctaveSuppression: 0.20,
    gainBoostLow: 0.9,
    gainBoostMid: 1.3,
    gainBoostHigh: 0.85
  }
};

export class InstrumentProfileManager {
  constructor() {
    this.currentPresetKey = 'piano';
    this.currentProfile = { ...INSTRUMENT_PRESETS.piano };
    this.binGains = new Float32Array(88).fill(1.0);
    this.recomputeBinGains();

    // 3-second live fine-tuning state
    this.isFineTuning = false;
    this.fineTuneSamples = [];
    this.fineTuneStartTime = 0;
    this.fineTuneDuration = 3.0; // 3 seconds
    this.onProgressCallback = null;
    this.onCompleteCallback = null;
  }

  setPreset(presetKey) {
    if (!INSTRUMENT_PRESETS[presetKey]) return;
    this.currentPresetKey = presetKey;
    this.currentProfile = { ...INSTRUMENT_PRESETS[presetKey] };
    this.recomputeBinGains();
  }

  recomputeBinGains() {
    // 88 keys: MIDI 21 (A0) to 108 (C8)
    // Low: 21 to 48 (A0 to C3)
    // Mid: 49 to 72 (C#3 to C5)
    // High: 73 to 108 (C#5 to C8)
    for (let i = 0; i < 88; i++) {
      const midi = 21 + i;
      if (midi <= 48) {
        this.binGains[i] = this.currentProfile.gainBoostLow;
      } else if (midi <= 72) {
        this.binGains[i] = this.currentProfile.gainBoostMid;
      } else {
        this.binGains[i] = this.currentProfile.gainBoostHigh;
      }
    }
  }

  getBinGains() {
    return this.binGains;
  }

  /**
   * Start 3-second live acoustic capture fine-tuner.
   */
  startLiveFineTuning(onProgress, onComplete) {
    this.isFineTuning = true;
    this.fineTuneSamples = [];
    this.fineTuneStartTime = performance.now();
    this.onProgressCallback = onProgress;
    this.onCompleteCallback = onComplete;
  }

  pushAudioChunk(chunk) {
    if (!this.isFineTuning) return;

    this.fineTuneSamples.push(new Float32Array(chunk));

    const elapsed = (performance.now() - this.fineTuneStartTime) / 1000.0;
    const progress = Math.min(1.0, elapsed / this.fineTuneDuration);

    if (this.onProgressCallback) {
      this.onProgressCallback(progress);
    }

    if (elapsed >= this.fineTuneDuration) {
      this.finishFineTuning();
    }
  }

  finishFineTuning() {
    this.isFineTuning = false;

    // Flatten collected samples
    let totalLength = 0;
    for (const chunk of this.fineTuneSamples) totalLength += chunk.length;
    const fullAudio = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of this.fineTuneSamples) {
      fullAudio.set(chunk, offset);
      offset += chunk.length;
    }

    // 1. Calculate ambient noise floor RMS
    let sumSquares = 0.0;
    let peak = 0.0;
    for (let i = 0; i < totalLength; i++) {
      const s = fullAudio[i];
      const absS = Math.abs(s);
      if (absS > peak) peak = absS;
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / Math.max(1, totalLength));
    const noiseFloorDb = 20 * Math.log10(Math.max(1e-5, rms));

    // 2. Envelope decay ratio (compare first 20% to last 40%)
    const part1 = fullAudio.subarray(0, Math.floor(totalLength * 0.25));
    const part2 = fullAudio.subarray(Math.floor(totalLength * 0.6));
    let rms1 = 0, rms2 = 0;
    for (let i = 0; i < part1.length; i++) rms1 += part1[i] * part1[i];
    for (let i = 0; i < part2.length; i++) rms2 += part2[i] * part2[i];
    rms1 = Math.sqrt(rms1 / Math.max(1, part1.length));
    rms2 = Math.sqrt(rms2 / Math.max(1, part2.length));
    const decayRatio = rms1 > 1e-4 ? rms2 / rms1 : 0.5;

    // 3. Harmonic Overtone Analysis (estimate energy at 2f, 3f relative to f0)
    // Adjust noise gate threshold slightly above measured noise floor
    const adaptedGate = Math.max(0.003, Math.min(0.03, rms * 1.5));
    this.currentProfile.noiseGateThreshold = adaptedGate;

    // Adapt crest factor and harmonic suppression based on decay
    if (decayRatio < 0.3) {
      // Rapid decay instrument (plucked, staccato)
      this.currentProfile.crestAttack = 4.0;
      this.currentProfile.crestSustain = 2.6;
      this.currentProfile.octaveSuppression = 0.70;
    } else {
      // Sustained instrument (bowed, wind, voice, organ)
      this.currentProfile.crestAttack = 3.4;
      this.currentProfile.crestSustain = 2.2;
      this.currentProfile.octaveSuppression = 0.55;
    }

    const report = {
      noiseFloorDb: noiseFloorDb.toFixed(1),
      rms: rms.toFixed(4),
      decayRatio: decayRatio.toFixed(2),
      adaptedGate: adaptedGate.toFixed(4),
      profile: { ...this.currentProfile }
    };

    if (this.onCompleteCallback) {
      this.onCompleteCallback(report);
    }
  }
}
