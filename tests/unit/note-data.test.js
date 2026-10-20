/**
 * note-data.test.js
 * Verification of Diatonic Grand Staff mathematics, MIDI mapping, and collision offsets.
 */

import { describe, it, expect } from 'vitest';
import {
  midiToNoteName,
  midiToFreq,
  getDiatonicStep,
  getAccidental,
  calculateChordOffsets
} from '../../src/gameplay/note-data.js';

describe('Note Data & Diatonic Staff Math', () => {
  it('converts MIDI numbers to note names and frequencies accurately', () => {
    expect(midiToNoteName(60)).toBe('C4');
    expect(midiToNoteName(69)).toBe('A4');
    expect(midiToNoteName(21)).toBe('A0');
    expect(midiToNoteName(108)).toBe('C8');

    expect(Math.round(midiToFreq(69))).toBe(440);
    expect(Math.round(midiToFreq(60))).toBe(262);
  });

  it('computes correct diatonic steps relative to Middle C (C4 = 0)', () => {
    // Middle C
    expect(getDiatonicStep(60)).toBe(0);
    // Treble staff lines: E4 (+2), G4 (+4), B4 (+6), D5 (+8), F5 (+10)
    expect(getDiatonicStep(64)).toBe(2);
    expect(getDiatonicStep(67)).toBe(4);
    expect(getDiatonicStep(71)).toBe(6);
    expect(getDiatonicStep(74)).toBe(8);
    expect(getDiatonicStep(77)).toBe(10);

    // Bass staff lines: G2 (-10), B2 (-8), D3 (-6), F3 (-4), A3 (-2)
    expect(getDiatonicStep(43)).toBe(-10);
    expect(getDiatonicStep(47)).toBe(-8);
    expect(getDiatonicStep(50)).toBe(-6);
    expect(getDiatonicStep(53)).toBe(-4);
    expect(getDiatonicStep(57)).toBe(-2);
  });

  it('identifies sharp accidentals correctly', () => {
    expect(getAccidental(60)).toBeNull(); // C
    expect(getAccidental(61)).toBe('#');   // C#
    expect(getAccidental(62)).toBeNull(); // D
    expect(getAccidental(63)).toBe('#');   // D#
    expect(getAccidental(64)).toBeNull(); // E
    expect(getAccidental(65)).toBeNull(); // F
    expect(getAccidental(66)).toBe('#');   // F#
  });

  it('calculates horizontal collision offset (>= 16px) for harmonic seconds', () => {
    // C4 (step 0) and D4 (step 1) in same chord
    const chord = [
      { id: 'c4', midi: 60 },
      { id: 'd4', midi: 62 }
    ];
    const offsets = calculateChordOffsets(chord);
    expect(offsets.get('c4')).toBe(0);
    expect(offsets.get('d4')).toBeGreaterThanOrEqual(16);

    // Triad without harmonic seconds: C4 (0), E4 (2), G4 (4)
    const triad = [
      { id: 'c4', midi: 60 },
      { id: 'e4', midi: 64 },
      { id: 'g4', midi: 67 }
    ];
    const triadOffsets = calculateChordOffsets(triad);
    expect(triadOffsets.get('c4')).toBe(0);
    expect(triadOffsets.get('e4')).toBe(0);
    expect(triadOffsets.get('g4')).toBe(0);
  });
});
