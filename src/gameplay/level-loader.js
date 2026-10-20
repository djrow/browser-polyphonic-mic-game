/**
 * level-loader.js
 * Chart loader for bundled tracks, custom MIDI (.mid), and custom JSON charts.
 */

import { Midi } from '@tonejs/midi';
import { getDiatonicStep, midiToNoteName } from './note-data.js';

export const BUNDLED_SONGS = [
  {
    id: 'piece_1_monophonic',
    title: 'Ode to Joy (Beethoven) - Monophonic',
    artist: 'L. v. Beethoven',
    difficulty: 'Beginner',
    audioUrl: '/audio/piece_1_monophonic.wav',
    bpm: 120,
    notes: [
      { midi: 64, time: 0.5, duration: 0.45 },
      { midi: 64, time: 1.0, duration: 0.45 },
      { midi: 65, time: 1.5, duration: 0.45 },
      { midi: 67, time: 2.0, duration: 0.45 },
      { midi: 67, time: 2.5, duration: 0.45 },
      { midi: 65, time: 3.0, duration: 0.45 },
      { midi: 64, time: 3.5, duration: 0.45 },
      { midi: 62, time: 4.0, duration: 0.45 },
      { midi: 60, time: 4.5, duration: 0.45 },
      { midi: 60, time: 5.0, duration: 0.45 },
      { midi: 62, time: 5.5, duration: 0.45 },
      { midi: 64, time: 6.0, duration: 0.70 },
      { midi: 62, time: 6.8, duration: 0.20 },
      { midi: 62, time: 7.1, duration: 0.80 }
    ]
  },
  {
    id: 'piece_2_harmony',
    title: 'Canon in D (Pachelbel) - 2-Voice Harmony',
    artist: 'Johann Pachelbel',
    difficulty: 'Intermediate',
    audioUrl: '/audio/piece_2_harmony.wav',
    bpm: 100,
    notes: [
      // Bass line
      { midi: 50, time: 0.5, duration: 0.95 },
      { midi: 45, time: 1.5, duration: 0.95 },
      { midi: 47, time: 2.5, duration: 0.95 },
      { midi: 42, time: 3.5, duration: 0.95 },
      { midi: 43, time: 4.5, duration: 0.95 },
      { midi: 38, time: 5.5, duration: 0.95 },
      { midi: 43, time: 6.5, duration: 0.95 },
      { midi: 45, time: 7.5, duration: 0.95 },
      // Treble line
      { midi: 74, time: 0.5, duration: 0.90 },
      { midi: 72, time: 1.5, duration: 0.90 },
      { midi: 70, time: 2.5, duration: 0.90 },
      { midi: 69, time: 3.5, duration: 0.90 },
      { midi: 67, time: 4.5, duration: 0.90 },
      { midi: 65, time: 5.5, duration: 0.90 },
      { midi: 67, time: 6.5, duration: 0.90 },
      { midi: 69, time: 7.5, duration: 0.90 }
    ]
  },
  {
    id: 'piece_3_polyphonic',
    title: 'Prelude in C Major (Bach) - Polyphonic Chords',
    artist: 'J. S. Bach',
    difficulty: 'Advanced Polyphony',
    audioUrl: '/audio/piece_3_polyphonic.wav',
    bpm: 96,
    notes: [
      // C Major arpeggio
      { midi: 48, time: 0.5, duration: 1.8 },
      { midi: 60, time: 0.5, duration: 0.7 },
      { midi: 64, time: 0.65, duration: 0.7 },
      { midi: 67, time: 0.8, duration: 0.7 },
      { midi: 72, time: 0.95, duration: 0.7 },
      { midi: 60, time: 1.4, duration: 0.7 },
      { midi: 64, time: 1.55, duration: 0.7 },
      { midi: 67, time: 1.7, duration: 0.7 },
      { midi: 72, time: 1.85, duration: 0.7 },
      // D minor arpeggio
      { midi: 50, time: 2.5, duration: 1.8 },
      { midi: 62, time: 2.5, duration: 0.7 },
      { midi: 65, time: 2.65, duration: 0.7 },
      { midi: 69, time: 2.8, duration: 0.7 },
      { midi: 74, time: 2.95, duration: 0.7 },
      { midi: 62, time: 3.4, duration: 0.7 },
      { midi: 65, time: 3.55, duration: 0.7 },
      { midi: 69, time: 3.7, duration: 0.7 },
      { midi: 74, time: 3.85, duration: 0.7 },
      // G7 arpeggio
      { midi: 47, time: 4.5, duration: 1.8 },
      { midi: 59, time: 4.5, duration: 0.7 },
      { midi: 62, time: 4.65, duration: 0.7 },
      { midi: 65, time: 4.8, duration: 0.7 },
      { midi: 67, time: 4.95, duration: 0.7 },
      { midi: 59, time: 5.4, duration: 0.7 },
      { midi: 62, time: 5.55, duration: 0.7 },
      { midi: 65, time: 5.7, duration: 0.7 },
      { midi: 67, time: 5.85, duration: 0.7 },
      // Final C Major Triad Block Strike
      { midi: 48, time: 8.8, duration: 1.8 },
      { midi: 60, time: 8.8, duration: 1.8 },
      { midi: 64, time: 8.8, duration: 1.8 },
      { midi: 67, time: 8.8, duration: 1.8 }
    ]
  }
];

export class LevelLoader {
  static prepareSong(songData) {
    const sorted = [...songData.notes].sort((a, b) => a.time - b.time);
    let noteIdCounter = 1;

    const preparedNotes = sorted.map((n) => {
      return {
        id: `note_${noteIdCounter++}`,
        midi: n.midi,
        time: n.time,
        duration: n.duration || 0.5,
        judged: false,
        name: midiToNoteName(n.midi),
        step: getDiatonicStep(n.midi)
      };
    });

    const maxTime = preparedNotes.reduce((max, n) => Math.max(max, n.time + n.duration), 0);

    return {
      id: songData.id || `custom_${Date.now()}`,
      title: songData.title || 'Custom Track',
      artist: songData.artist || 'Unknown',
      difficulty: songData.difficulty || 'Custom',
      audioUrl: songData.audioUrl || null,
      bpm: songData.bpm || 120,
      totalDuration: Math.max(5.0, maxTime + 1.5),
      notes: preparedNotes
    };
  }

  static getBundledSong(id) {
    const found = BUNDLED_SONGS.find((s) => s.id === id) || BUNDLED_SONGS[0];
    return this.prepareSong(found);
  }

  static async parseMidiFile(arrayBuffer, fileName = 'Imported MIDI') {
    const midi = new Midi(arrayBuffer);
    const notes = [];

    midi.tracks.forEach((track) => {
      track.notes.forEach((n) => {
        // Filter within playable 88-key piano range (21 to 108)
        if (n.midi >= 21 && n.midi <= 108) {
          notes.push({
            midi: n.midi,
            time: n.time,
            duration: n.duration
          });
        }
      });
    });

    const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;

    return this.prepareSong({
      id: `midi_${Date.now()}`,
      title: midi.header.name || fileName.replace(/\.[^/.]+$/, ''),
      artist: 'MIDI Import',
      difficulty: 'Custom MIDI',
      audioUrl: null,
      bpm: bpm,
      notes: notes
    });
  }

  static parseJsonChart(jsonString, fileName = 'Imported JSON') {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed.notes)) {
      throw new Error('Invalid chart JSON: missing notes array');
    }
    return this.prepareSong({
      id: parsed.id || `json_${Date.now()}`,
      title: parsed.title || fileName.replace(/\.[^/.]+$/, ''),
      artist: parsed.artist || 'Custom Chart',
      difficulty: parsed.difficulty || 'Custom JSON',
      audioUrl: parsed.audioUrl || null,
      bpm: parsed.bpm || 120,
      notes: parsed.notes
    });
  }
}
