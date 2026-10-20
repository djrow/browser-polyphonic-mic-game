/**
 * instrument-profile.test.js
 * Verification of instrument presets, 88-bin neural gain adapter, and fine-tuner.
 */

import { describe, it, expect } from 'vitest';
import { InstrumentProfileManager, INSTRUMENT_PRESETS } from '../../src/inference/instrument-profile.js';

describe('Instrument Profile & Fine-Tuning', () => {
  it('loads built-in instrument presets properly', () => {
    const manager = new InstrumentProfileManager();
    expect(manager.currentPresetKey).toBe('piano');

    manager.setPreset('guitar');
    expect(manager.currentPresetKey).toBe('guitar');
    expect(manager.currentProfile.octaveSuppression).toBe(INSTRUMENT_PRESETS.guitar.octaveSuppression);

    manager.setPreset('violin');
    expect(manager.currentPresetKey).toBe('violin');
  });

  it('updates 88-bin neural adapter gains across registers', () => {
    const manager = new InstrumentProfileManager();
    manager.setPreset('guitar');
    const gains = manager.getBinGains();

    expect(gains.length).toBe(88);
    // Guitar mid-range boost
    // MIDI 21 (index 0) = low register -> 0.9
    expect(gains[0]).toBeCloseTo(0.9);
    // MIDI 60 (index 39) = mid register -> 1.25
    expect(gains[39]).toBeCloseTo(1.25);
  });

  it('computes acoustic metrics in live fine-tuner', async () => {
    const manager = new InstrumentProfileManager();
    manager.fineTuneDuration = 0.05; // Fast test duration

    let completedReport = null;
    manager.startLiveFineTuning(
      () => {},
      (report) => {
        completedReport = report;
      }
    );

    // Feed synthetic audio chunk
    const chunk = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      chunk[i] = 0.01 * Math.sin(i * 0.1); // Small ambient sound
    }

    manager.pushAudioChunk(chunk);
    // Wait for duration
    await new Promise((r) => setTimeout(r, 60));
    manager.pushAudioChunk(chunk);

    expect(completedReport).not.toBeNull();
    expect(parseFloat(completedReport.noiseFloorDb)).toBeLessThan(0);
    expect(parseFloat(completedReport.adaptedGate)).toBeGreaterThan(0);
  });
});
