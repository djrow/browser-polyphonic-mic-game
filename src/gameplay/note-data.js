/**
 * note-data.js
 * Diatonic Grand Staff coordinate mathematics, MIDI mapping, and harmonic collision offsets.
 */

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Diatonic steps from C in one octave: C=0, D=1, E=2, F=3, G=4, A=5, B=6
const SEMITONE_TO_DIATONIC = [
  { step: 0, accidental: null },  // C
  { step: 0, accidental: '#' },   // C#
  { step: 1, accidental: null },  // D
  { step: 1, accidental: '#' },   // D#
  { step: 2, accidental: null },  // E
  { step: 3, accidental: null },  // F
  { step: 3, accidental: '#' },   // F#
  { step: 4, accidental: null },  // G
  { step: 4, accidental: '#' },   // G#
  { step: 5, accidental: null },  // A
  { step: 5, accidental: '#' },   // A#
  { step: 6, accidental: null }   // B
];

export function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

export function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Returns diatonic step relative to Middle C (C4 = 0).
 * One step = distance between a line and an adjacent space (half of staff line spacing).
 */
export function getDiatonicStep(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const semitone = midi % 12;
  const info = SEMITONE_TO_DIATONIC[semitone];
  // C4 is octave 4, semitone 0 -> (4 - 4) * 7 + 0 = 0
  return (octave - 4) * 7 + info.step;
}

export function getAccidental(midi) {
  return SEMITONE_TO_DIATONIC[midi % 12].accidental;
}

/**
 * Computes Y position on the Grand Staff canvas.
 * @param {number} midi - MIDI note number (21 to 108)
 * @param {object} staffLayout - Staff vertical geometry metrics
 */
export function getNoteY(midi, staffLayout) {
  // Middle C is right between Treble and Bass staves
  const step = getDiatonicStep(midi);
  // Each diatonic step is stepSpacing px (typically lineSpacing / 2)
  // Higher pitch = smaller Y (upwards on screen)
  return staffLayout.middleCY - (step * staffLayout.stepSpacing);
}

/**
 * Calculate horizontal offsets for chord notes to prevent collision
 * when harmonic seconds (adjacent diatonic steps) occur.
 */
export function calculateChordOffsets(notesInChord) {
  // Sort ascending by diatonic step
  const sorted = [...notesInChord].sort((a, b) => getDiatonicStep(a.midi) - getDiatonicStep(b.midi));
  const offsets = new Map();

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    let offsetX = 0;

    if (i > 0) {
      const prev = sorted[i - 1];
      const stepDiff = Math.abs(getDiatonicStep(current.midi) - getDiatonicStep(prev.midi));
      const prevOffset = offsets.get(prev.id || prev.midi) || 0;

      // Harmonic second (adjacent diatonic step)
      if (stepDiff <= 1) {
        offsetX = prevOffset === 0 ? 18 : 0;
      }
    }
    offsets.set(current.id || current.midi, offsetX);
  }

  return offsets;
}
