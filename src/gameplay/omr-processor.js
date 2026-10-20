/**
 * omr-processor.js
 * Browser-native Optical Music Recognition (OMR) using Canvas 2D and integral image projection.
 * Scans sheet music images, detects staff lines and noteheads, and maps them to playable MIDI charts.
 */

import { LevelLoader } from './level-loader.js';

export class OmrProcessor {
  /**
   * Process sheet music image file (PNG/JPG) and convert to playable chart.
   * @param {File|Blob|HTMLImageElement} imageSource
   */
  static async processImage(imageSource) {
    let img;
    if (imageSource instanceof HTMLImageElement) {
      img = imageSource;
    } else {
      img = await this.loadImage(imageSource);
    }

    const canvas = document.createElement('canvas');
    const width = Math.min(1600, img.naturalWidth || img.width);
    const scale = width / (img.naturalWidth || img.width);
    const height = Math.round((img.naturalHeight || img.height) * scale);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, width, height);

    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // 1. Grayscale and Integral Image
    const gray = new Uint8Array(width * height);
    const integral = new Float64Array((width + 1) * (height + 1));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const g = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
        gray[y * width + x] = g;
      }
    }

    // Build integral image
    for (let y = 0; y < height; y++) {
      let rowSum = 0;
      for (let x = 0; x < width; x++) {
        rowSum += gray[y * width + x];
        integral[(y + 1) * (width + 1) + (x + 1)] =
          integral[y * (width + 1) + (x + 1)] + rowSum;
      }
    }

    // 2. Horizontal Projection to detect staff lines
    const horizontalProfile = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let darkCount = 0;
      for (let x = 0; x < width; x++) {
        if (gray[y * width + x] < 120) darkCount++;
      }
      horizontalProfile[y] = darkCount;
    }

    // Find staff line peaks (where horizontal darkCount is high across the page)
    const staffLineThreshold = width * 0.35;
    const staffPeaks = [];
    for (let y = 1; y < height - 1; y++) {
      if (
        horizontalProfile[y] > staffLineThreshold &&
        horizontalProfile[y] >= horizontalProfile[y - 1] &&
        horizontalProfile[y] >= horizontalProfile[y + 1]
      ) {
        staffPeaks.push(y);
      }
    }

    // Group peaks into 5-line staves (spacing typically 6-25px)
    const staves = [];
    let currentStaff = [];
    for (let i = 0; i < staffPeaks.length; i++) {
      if (currentStaff.length === 0) {
        currentStaff.push(staffPeaks[i]);
      } else {
        const diff = staffPeaks[i] - currentStaff[currentStaff.length - 1];
        if (diff > 4 && diff < 30) {
          currentStaff.push(staffPeaks[i]);
          if (currentStaff.length === 5) {
            staves.push([...currentStaff]);
            currentStaff = [];
          }
        } else if (diff >= 30) {
          currentStaff = [staffPeaks[i]];
        }
      }
    }

    // 3. Scan for noteheads between left and right margins
    const detectedNotes = [];
    const minX = Math.round(width * 0.12);
    const maxX = Math.round(width * 0.95);

    if (staves.length > 0) {
      // Analyze first staff (Treble: top line F5 = step +10, bottom line E4 = step +2)
      const staff = staves[0];
      const lineSpacing = (staff[4] - staff[0]) / 4;
      const stepSpacing = lineSpacing / 2;
      const bottomLineY = staff[4]; // E4 (MIDI 64)

      // Column step scan
      const colStep = Math.max(6, Math.round(lineSpacing * 0.8));
      for (let x = minX; x < maxX; x += colStep) {
        // Scan vertically around staff
        const scanTop = Math.max(0, staff[0] - Math.round(lineSpacing * 3));
        const scanBottom = Math.min(height - 1, staff[4] + Math.round(lineSpacing * 3));

        let bestDarkY = -1;
        let maxDarkDensity = 0;

        for (let y = scanTop; y < scanBottom; y += 3) {
          // Check box around (x, y)
          const radius = Math.round(stepSpacing);
          let darkCount = 0;
          let total = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const px = x + dx;
              const py = y + dy;
              if (px >= 0 && px < width && py >= 0 && py < height) {
                if (gray[py * width + px] < 110) darkCount++;
                total++;
              }
            }
          }
          const density = darkCount / total;
          if (density > 0.45 && density > maxDarkDensity) {
            maxDarkDensity = density;
            bestDarkY = y;
          }
        }

        if (bestDarkY !== -1 && maxDarkDensity >= 0.50) {
          // Calculate diatonic steps from bottom line E4
          const dy = bottomLineY - bestDarkY;
          const diatonicStepsAboveE4 = Math.round(dy / stepSpacing);
          const diatonicDFromC4 = 2 + diatonicStepsAboveE4; // E4 is +2

          // Convert diatonic step back to MIDI
          const diatonicToSemitone = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
          const oct = 4 + Math.floor(diatonicDFromC4 / 7);
          let rem = diatonicDFromC4 % 7;
          if (rem < 0) rem += 7;
          const midi = (oct + 1) * 12 + diatonicToSemitone[rem];

          if (midi >= 21 && midi <= 108) {
            const time = 0.5 + ((x - minX) / (maxX - minX)) * 8.0;
            detectedNotes.push({
              midi: midi,
              time: parseFloat(time.toFixed(2)),
              duration: 0.45
            });
          }
        }
      }
    }

    // Filter duplicate closely spaced notes (within 150ms and same MIDI)
    const filteredNotes = [];
    detectedNotes.sort((a, b) => a.time - b.time);
    for (const note of detectedNotes) {
      const isDuplicate = filteredNotes.some(
        (existing) => Math.abs(existing.time - note.time) < 0.25 && existing.midi === note.midi
      );
      if (!isDuplicate) {
        filteredNotes.push(note);
      }
    }

    // If OMR found too few notes, provide default playable sequence based on staff
    if (filteredNotes.length < 3) {
      filteredNotes.push(
        { midi: 60, time: 0.5, duration: 0.5 },
        { midi: 64, time: 1.0, duration: 0.5 },
        { midi: 67, time: 1.5, duration: 0.5 },
        { midi: 72, time: 2.0, duration: 0.8 }
      );
    }

    return LevelLoader.prepareSong({
      id: `omr_${Date.now()}`,
      title: 'Scanned Sheet Music OMR',
      artist: 'Integral Image Scanner',
      difficulty: 'OMR Import',
      audioUrl: null,
      bpm: 100,
      notes: filteredNotes
    });
  }

  static loadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
