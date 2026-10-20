/**
 * hud-controller.js
 * Mobile-safe responsive HUD layout, game controls, score board, and instrument profile selection.
 */

import { INSTRUMENT_PRESETS } from '../inference/instrument-profile.js';

export class HudController {
  constructor(options = {}) {
    this.options = options;
    this.container = null;
    this.listeners = {
      play: [],
      pause: [],
      restart: [],
      speedChange: [],
      presetChange: [],
      toggleMetronome: [],
      toggleMic: [],
      openCalibrate: [],
      openSongSelector: [],
      toggleVirtualKeys: []
    };
  }

  mount(rootElement) {
    const presetOptions = Object.values(INSTRUMENT_PRESETS)
      .map((p) => `<option value="${p.id}">${p.name}</option>`)
      .join('');

    const hudHtml = `
      <div id="game-hud" class="game-hud-container">
        <!-- TOP HUD BAR -->
        <header class="hud-top-bar">
          <div class="hud-brand-song">
            <span class="app-logo">🎹 MicRhythm</span>
            <div class="song-meta-box">
              <span id="hud-song-title" class="song-title">Ode to Joy</span>
              <span id="hud-song-artist" class="song-artist">L. v. Beethoven</span>
            </div>
            <button id="hud-select-song-btn" class="hud-btn pill-btn" title="Change Song / Import">🎵 Songs</button>
          </div>

          <div class="hud-score-center">
            <div class="score-card">
              <span class="hud-label">SCORE</span>
              <span id="hud-score-val" class="hud-val score-glow">0</span>
            </div>
            <div class="combo-card">
              <span class="hud-label">COMBO</span>
              <div class="combo-row">
                <span id="hud-combo-val" class="hud-val">0</span>
                <span id="hud-multiplier-badge" class="multiplier-badge">1x</span>
              </div>
            </div>
            <div class="acc-card">
              <span class="hud-label">ACCURACY</span>
              <span id="hud-acc-val" class="hud-val">100.0%</span>
            </div>
          </div>

          <div class="hud-profile-right">
            <label for="hud-preset-select" class="hud-label">PROFILE:</label>
            <select id="hud-preset-select" class="hud-select">
              ${presetOptions}
            </select>
          </div>
        </header>

        <!-- PROGRESS BAR -->
        <div class="song-progress-wrap">
          <div id="song-progress-fill" class="song-progress-fill" style="width: 0%"></div>
        </div>

        <!-- MAIN CANVAS HIGHWAY (injected separately) -->
        <div id="highway-mount-point" class="highway-container"></div>

        <!-- BOTTOM DOCK & CONTROLS -->
        <footer class="hud-bottom-dock">
          <!-- Left: Playback Controls -->
          <div class="dock-group">
            <button id="hud-play-btn" class="hud-btn primary-btn" title="Play / Pause">▶ Play</button>
            <button id="hud-restart-btn" class="hud-btn" title="Restart">↺</button>
            <div class="speed-wrap">
              <span class="dock-label">Speed:</span>
              <select id="hud-speed-select" class="hud-select-sm">
                <option value="0.5">0.5x</option>
                <option value="0.75">0.75x</option>
                <option value="1.0" selected>1.0x</option>
                <option value="1.25">1.25x</option>
                <option value="1.5">1.5x</option>
              </select>
            </div>
            <button id="hud-metronome-btn" class="hud-btn toggle-btn" title="Metronome Click">⏱ Metronome</button>
          </div>

          <!-- Center: Live Oscilloscope & Active Note Dock -->
          <div class="dock-center">
            <canvas id="oscilloscope-canvas" class="oscilloscope-canvas" width="320" height="70"></canvas>
          </div>

          <!-- Right: Audio Input, Calibrate & Virtual Keys -->
          <div class="dock-group">
            <button id="hud-mic-btn" class="hud-btn mic-btn" title="Toggle Microphone">🎤 Mic: Ready</button>
            <button id="hud-calib-btn" class="hud-btn" title="Calibrate Latency & Tone">⚙️ Calibrate</button>
            <button id="hud-vkeys-btn" class="hud-btn toggle-btn" title="Toggle On-screen / PC Keys">🎹 Virtual Keys</button>
          </div>
        </footer>

        <!-- VIRTUAL KEYBOARD PANEL (Expandable) -->
        <div id="virtual-keyboard-panel" class="virtual-keyboard-panel hidden">
          <div class="vkeys-desc">Play chords with your PC keyboard (C4=A, D4=S, E4=D, F4=F, G4=G, A4=H, B4=J, C5=K) or click below:</div>
          <div id="vkeys-container" class="vkeys-container"></div>
        </div>
      </div>
    `;

    rootElement.innerHTML = hudHtml;
    this.container = document.getElementById('game-hud');
    this.buildVirtualKeys();
    this.bindEvents();
  }

  buildVirtualKeys() {
    const keysWrap = document.getElementById('vkeys-container');
    if (!keysWrap) return;

    // Keys spanning C3 (48) to C6 (84)
    // For convenience, highlight C4 (60) to C5 (72)
    const keyMap = [
      { midi: 48, name: 'C3', black: false },
      { midi: 49, name: 'C#3', black: true },
      { midi: 50, name: 'D3', black: false },
      { midi: 51, name: 'D#3', black: true },
      { midi: 52, name: 'E3', black: false },
      { midi: 53, name: 'F3', black: false },
      { midi: 54, name: 'F#3', black: true },
      { midi: 55, name: 'G3', black: false },
      { midi: 56, name: 'G#3', black: true },
      { midi: 57, name: 'A3', black: false },
      { midi: 58, name: 'A#3', black: true },
      { midi: 59, name: 'B3', black: false },
      // Octave 4
      { midi: 60, name: 'C4', black: false, pcKey: 'A' },
      { midi: 61, name: 'C#4', black: true, pcKey: 'W' },
      { midi: 62, name: 'D4', black: false, pcKey: 'S' },
      { midi: 63, name: 'D#4', black: true, pcKey: 'E' },
      { midi: 64, name: 'E4', black: false, pcKey: 'D' },
      { midi: 65, name: 'F4', black: false, pcKey: 'F' },
      { midi: 66, name: 'F#4', black: true, pcKey: 'T' },
      { midi: 67, name: 'G4', black: false, pcKey: 'G' },
      { midi: 68, name: 'G#4', black: true, pcKey: 'Y' },
      { midi: 69, name: 'A4', black: false, pcKey: 'H' },
      { midi: 70, name: 'A#4', black: true, pcKey: 'U' },
      { midi: 71, name: 'B4', black: false, pcKey: 'J' },
      { midi: 72, name: 'C5', black: false, pcKey: 'K' },
      { midi: 74, name: 'D5', black: false },
      { midi: 76, name: 'E5', black: false },
      { midi: 77, name: 'F5', black: false },
      { midi: 79, name: 'G5', black: false }
    ];

    keysWrap.innerHTML = keyMap
      .map(
        (k) => `
      <div class="piano-key ${k.black ? 'black-key' : 'white-key'}" data-midi="${k.midi}">
        <span class="key-label">${k.name}${k.pcKey ? `<br><small>[${k.pcKey}]</small>` : ''}</span>
      </div>
    `
      )
      .join('');
  }

  bindEvents() {
    const playBtn = document.getElementById('hud-play-btn');
    const restartBtn = document.getElementById('hud-restart-btn');
    const speedSelect = document.getElementById('hud-speed-select');
    const presetSelect = document.getElementById('hud-preset-select');
    const metronomeBtn = document.getElementById('hud-metronome-btn');
    const micBtn = document.getElementById('hud-mic-btn');
    const calibBtn = document.getElementById('hud-calib-btn');
    const songBtn = document.getElementById('hud-select-song-btn');
    const vkeysBtn = document.getElementById('hud-vkeys-btn');
    const vkeysPanel = document.getElementById('virtual-keyboard-panel');

    playBtn.addEventListener('click', () => this.emit('play'));
    restartBtn.addEventListener('click', () => this.emit('restart'));
    speedSelect.addEventListener('change', (e) => this.emit('speedChange', parseFloat(e.target.value)));
    presetSelect.addEventListener('change', (e) => this.emit('presetChange', e.target.value));
    metronomeBtn.addEventListener('click', () => {
      metronomeBtn.classList.toggle('active');
      this.emit('toggleMetronome', metronomeBtn.classList.contains('active'));
    });
    micBtn.addEventListener('click', () => this.emit('toggleMic'));
    calibBtn.addEventListener('click', () => this.emit('openCalibrate'));
    songBtn.addEventListener('click', () => this.emit('openSongSelector'));
    vkeysBtn.addEventListener('click', () => {
      vkeysPanel.classList.toggle('hidden');
      vkeysBtn.classList.toggle('active');
    });

    // Virtual keyboard on-screen clicks
    const keys = document.querySelectorAll('.piano-key');
    keys.forEach((key) => {
      const midi = parseInt(key.dataset.midi, 10);
      key.addEventListener('pointerdown', (e) => {
        key.classList.add('pressed');
        this.emit('keyTrigger', { midi, type: 'down' });
      });
      key.addEventListener('pointerup', () => {
        key.classList.remove('pressed');
        this.emit('keyTrigger', { midi, type: 'up' });
      });
      key.addEventListener('pointerleave', () => {
        key.classList.remove('pressed');
        this.emit('keyTrigger', { midi, type: 'up' });
      });
    });
  }

  setSongInfo(title, artist) {
    const titleEl = document.getElementById('hud-song-title');
    const artistEl = document.getElementById('hud-song-artist');
    if (titleEl) titleEl.textContent = title;
    if (artistEl) artistEl.textContent = artist;
  }

  setPlayState(isPlaying) {
    const playBtn = document.getElementById('hud-play-btn');
    if (playBtn) {
      playBtn.textContent = isPlaying ? '⏸ Pause' : '▶ Play';
      playBtn.classList.toggle('playing', isPlaying);
    }
  }

  setMicState(statusText, isCapturing) {
    const micBtn = document.getElementById('hud-mic-btn');
    if (micBtn) {
      micBtn.textContent = `🎤 ${statusText}`;
      micBtn.classList.toggle('active', isCapturing);
    }
  }

  updateScore(data) {
    const scoreVal = document.getElementById('hud-score-val');
    const comboVal = document.getElementById('hud-combo-val');
    const multBadge = document.getElementById('hud-multiplier-badge');
    const accVal = document.getElementById('hud-acc-val');

    if (scoreVal) scoreVal.textContent = data.score.toLocaleString();
    if (comboVal) comboVal.textContent = data.combo;
    if (multBadge) {
      multBadge.textContent = `${data.multiplier}x`;
      multBadge.className = `multiplier-badge mult-${data.multiplier}x`;
    }
    if (accVal) accVal.textContent = `${data.accuracy.toFixed(1)}%`;
  }

  updateProgress(current, total) {
    const fill = document.getElementById('song-progress-fill');
    if (fill && total > 0) {
      const pct = Math.min(100, Math.max(0, (current / total) * 100));
      fill.style.width = `${pct}%`;
    }
  }

  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(fn);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach((fn) => fn(data));
    }
  }
}
