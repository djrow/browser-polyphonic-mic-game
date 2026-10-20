/**
 * level-loader.test.js
 * Verification of bundled songs and chart parsing.
 */

import { describe, it, expect } from 'vitest';
import { LevelLoader, BUNDLED_SONGS } from '../../src/gameplay/level-loader.js';

describe('Level Loader', () => {
  it('prepares bundled songs with valid diatonic notes and IDs', () => {
    const song = LevelLoader.getBundledSong('piece_1_monophonic');
    expect(song.title).toContain('Ode to Joy');
    expect(song.notes.length).toBeGreaterThan(10);

    const firstNote = song.notes[0];
    expect(firstNote.id).toBeDefined();
    expect(firstNote.name).toBe('E4');
    expect(firstNote.step).toBe(2);
    expect(firstNote.judged).toBe(false);
  });

  it('correctly loads polyphonic piece 3 with chord structures', () => {
    const song = LevelLoader.getBundledSong('piece_3_polyphonic');
    expect(song.title).toContain('Prelude in C Major');

    // Verify presence of final C-Major triad (MIDI 48, 60, 64, 67 at 8.8s)
    const finalChordNotes = song.notes.filter((n) => Math.abs(n.time - 8.8) < 0.05);
    expect(finalChordNotes.length).toBe(4);
    const midis = finalChordNotes.map((n) => n.midi);
    expect(midis).toContain(48);
    expect(midis).toContain(60);
    expect(midis).toContain(64);
    expect(midis).toContain(67);
  });

  it('parses valid custom JSON charts', () => {
    const jsonStr = JSON.stringify({
      title: 'Custom Test Track',
      bpm: 140,
      notes: [
        { midi: 60, time: 1.0, duration: 0.5 },
        { midi: 62, time: 2.0, duration: 0.5 }
      ]
    });

    const song = LevelLoader.parseJsonChart(jsonStr);
    expect(song.title).toBe('Custom Test Track');
    expect(song.notes.length).toBe(2);
    expect(song.bpm).toBe(140);
  });

  it('throws error on invalid JSON chart', () => {
    expect(() => LevelLoader.parseJsonChart('{"bad": true}')).toThrow();
  });
});
