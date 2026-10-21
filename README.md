# Browser-Native Polyphonic Microphone Rhythm Game

A zero-install, browser-native real-time polyphonic music rhythm game running entirely client-side using WebAssembly, HTML5 Canvas, modern JavaScript (Vite), and Web Audio API.

Players sing or play an acoustic instrument (piano, guitar, violin, flute, voice) into their microphone. The game captures microphone audio with sub-15ms input latency, performs real-time polyphonic pitch & onset detection across an 88-note range (MIDI 21 to 108), renders a Grand Staff note highway scrolling from right to left, matches detected polyphonic notes against target charts with strict timing windows, and provides interactive latency calibration & instrument fine-tuning profiles.

---

## 🌟 Key Features

- **Zero Audio Callback Glitches (`AudioWorklet`)**: Isolated `AudioWorkletProcessor` downmixes to mono, applies a smooth -46 dB RMS noise gate with a 300ms sustain hold timer, and gentle Sustain Makeup AGC.
- **Dual-Tier Hybrid Polyphonic Inference Architecture**:
  - **Tier 1 (Neural ONNX Basic Pitch)**: Runs Spotify Basic Pitch (`nmp.onnx`) inside a dedicated Web Worker via `onnxruntime-web` with WebAssembly SIMD. Post-processes 88 output bins with onset & sustain hysteresis and percussive slap rejection.
  - **Tier 2 (Ultra-Fast Goertzel DSP)**: Hamming-windowed filter bank (< 20ms attack response) with Spectral Crest Factor Guard and harmonic overtone suppression.
  - **220ms Refractory Cooldown**: Lockout per pitch prevents rapid double-triggering or noise chatter.
- **Grand Staff Visual Highway**: Canvas 2D 60/120 FPS Grand Staff note highway (Treble & Bass staves plus middle C4 ledger line) scrolling right to left to a fixed receptor at X = 160px.
- **Scoring & Judgment Engine**: PERFECT (<= 50ms), GOOD (<= 100ms), MISS (> 100ms) with combo streak multipliers and polyphonic chord evaluation.
- **Real-Time Oscilloscope & Analyzer**: CRT oscilloscope waveform display, calibrated -46 dB RMS level meter, and active detected pitch badges dock.
- **Hardware Microphone Selector**: Dropdown to seamlessly switch between built-in microphones, USB mics, headsets, and virtual inputs.
- **Latency Calibration Wizard**: 4-beat auto-calibration metronome at 120 BPM measuring median roundtrip latency, plus manual slider (-200ms to +300ms).
- **Acoustic Profile Fine-Tuner**: Built-in presets (Piano, Guitar, Violin, Woodwinds, Vocal) and a 3-second live acoustic capture tool.
- **Chart Importer**: Bundled songs (Ode to Joy, Canon in D, Bach Prelude in C Major) plus custom MIDI (`.mid`), JSON chart, and sheet music image OMR parsing.

---

## 🚀 Quick Start (Local Development)

```bash
# Clone the repository
git clone https://github.com/djrow/browser-polyphonic-mic-game.git
cd browser-polyphonic-mic-game

# Install dependencies
npm install

# Start local development server
npm run dev
```

Open `http://localhost:5173` in any modern browser.

---

## 🧪 Automated Test Suite

```bash
# Run unit & end-to-end synthetic verification tests
npm test

# Build production bundle
npm run build
```

---

## 🌐 Netlify Deployment

This repository includes [`netlify.toml`](./netlify.toml) configured with Cross-Origin Isolation (`COOP` and `COEP`) headers required for WebAssembly SIMD and Web Audio Worklets:

1. Log in to [Netlify](https://app.netlify.com).
2. Click **"Add new site" > "Import an existing project"**.
3. Select **GitHub** and choose `djrow/browser-polyphonic-mic-game`.
4. Netlify will automatically detect build settings:
   - **Build Command**: `npm run build`
   - **Publish Directory**: `dist`
5. Click **"Deploy site"**.
