/**
 * calibration-modal.js
 * Modal controller for:
 *  - Bi-directional Latency Calibration (-200ms to +300ms)
 *  - 4-Beat Metronome Auto-Calibration Wizard (120 BPM, median latency calculation)
 *  - 3-Second Live Instrument Acoustic Fine-Tuner
 */

export class CalibrationModal {
  constructor(audioManager, inferenceService) {
    this.audioManager = audioManager;
    this.inferenceService = inferenceService;
    this.container = null;
    this.isOpen = false;

    // Load persisted offset or default to +50ms per specification
    const saved = localStorage.getItem('rhythm_game_latency_offset');
    this.currentOffset = saved !== null ? parseInt(saved, 10) : 50;
    this.audioManager.setCalibrationOffset(this.currentOffset);

    // 4-beat calibration state
    this.isAutoCalibrating = false;
    this.autoCalibBeats = [];
    this.micOnsets = [];
  }

  mount(rootElement) {
    const modalHtml = `
      <div id="calibration-modal" class="modal-overlay hidden">
        <div class="modal-card">
          <div class="modal-header">
            <h3>⚙️ Latency Calibration & Instrument Tuning</h3>
            <button id="calib-close-btn" class="close-btn" title="Close">&times;</button>
          </div>

          <div class="modal-body">
            <!-- Section 1: Manual Latency Slider -->
            <div class="modal-section">
              <h4>🎯 Audio/Input Timing Latency</h4>
              <p class="section-desc">Adjust compensation for Bluetooth/USB microphone and speaker delays.</p>
              
              <div class="slider-group">
                <input type="range" id="latency-slider" min="-200" max="300" step="5" value="${this.currentOffset}">
                <div class="numeric-wrap">
                  <input type="number" id="latency-input" min="-200" max="300" step="5" value="${this.currentOffset}">
                  <span class="unit">ms</span>
                </div>
              </div>
            </div>

            <!-- Section 2: 4-Beat Auto-Calibration Wizard -->
            <div class="modal-section">
              <h4>🥁 4-Beat Auto-Calibration Wizard</h4>
              <p class="section-desc">The metronome will click 4 times at 120 BPM. Clap or play a note in sync on each beat to measure roundtrip input latency automatically.</p>
              
              <div class="auto-calib-box">
                <div id="metronome-visual-dots" class="dots-row">
                  <span class="beat-dot" data-beat="1">1</span>
                  <span class="beat-dot" data-beat="2">2</span>
                  <span class="beat-dot" data-beat="3">3</span>
                  <span class="beat-dot" data-beat="4">4</span>
                </div>
                <div id="auto-calib-status" class="status-msg">Click "Start 4-Beat Test" when ready.</div>
                <button id="start-auto-calib-btn" class="btn primary-btn">Start 4-Beat Test</button>
              </div>
            </div>

            <!-- Section 3: 3-Second Live Instrument Fine-Tuner -->
            <div class="modal-section">
              <h4>🎻 3-Second Live Acoustic Fine-Tuner</h4>
              <p class="section-desc">Hold a sustained note or chord for 3 seconds. The system analyzes your room's noise floor, acoustic decay, and overtone harmonics.</p>
              
              <div class="fine-tune-box">
                <div class="progress-bar-wrap">
                  <div id="fine-tune-progress" class="progress-bar" style="width: 0%"></div>
                </div>
                <div id="fine-tune-results" class="results-text">Ready to calibrate acoustic profile.</div>
                <button id="start-fine-tune-btn" class="btn accent-btn">Start 3s Acoustic Capture</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    rootElement.insertAdjacentHTML('beforeend', modalHtml);
    this.container = document.getElementById('calibration-modal');
    this.bindEvents();
  }

  bindEvents() {
    const slider = document.getElementById('latency-slider');
    const numInput = document.getElementById('latency-input');
    const closeBtn = document.getElementById('calib-close-btn');
    const autoCalibBtn = document.getElementById('start-auto-calib-btn');
    const fineTuneBtn = document.getElementById('start-fine-tune-btn');

    const updateOffset = (val) => {
      this.currentOffset = val;
      slider.value = val;
      numInput.value = val;
      this.audioManager.setCalibrationOffset(val);
      localStorage.setItem('rhythm_game_latency_offset', val.toString());
    };

    slider.addEventListener('input', (e) => updateOffset(parseInt(e.target.value, 10)));
    numInput.addEventListener('change', (e) => updateOffset(parseInt(e.target.value, 10)));

    closeBtn.addEventListener('click', () => this.hide());
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) this.hide();
    });

    autoCalibBtn.addEventListener('click', () => this.run4BeatAutoCalibration());
    fineTuneBtn.addEventListener('click', () => this.run3SecondLiveFineTuning());

    // Listen to mic onsets for auto-calibration
    this.inferenceService.onNoteOn((event) => {
      if (this.isAutoCalibrating) {
        this.micOnsets.push(performance.now());
      }
    });
  }

  show() {
    if (!this.container) return;
    this.container.classList.remove('hidden');
    this.isOpen = true;
  }

  hide() {
    if (!this.container) return;
    this.container.classList.add('hidden');
    this.isOpen = false;
  }

  async run4BeatAutoCalibration() {
    if (this.isAutoCalibrating) return;
    await this.audioManager.ensureRunning();

    this.isAutoCalibrating = true;
    this.micOnsets = [];
    const statusEl = document.getElementById('auto-calib-status');
    const dots = document.querySelectorAll('.beat-dot');
    const btn = document.getElementById('start-auto-calib-btn');
    btn.disabled = true;

    dots.forEach((d) => d.classList.remove('active', 'hit'));

    // Count-in: 3, 2, 1
    for (let c = 3; c >= 1; c--) {
      statusEl.textContent = `Get ready... ${c}`;
      this.audioManager.playMetronomeClick(false);
      await new Promise((r) => setTimeout(r, 500));
    }

    // 4 Metronome beats at 120 BPM (0.5s interval)
    const beatIntervalMs = 500;
    const beatTimes = [];

    for (let b = 1; b <= 4; b++) {
      const beatStartTime = performance.now();
      beatTimes.push(beatStartTime);

      statusEl.textContent = `BEAT ${b}! (Play / Clap now)`;
      this.audioManager.playMetronomeClick(b === 1);

      const dot = document.querySelector(`.beat-dot[data-beat="${b}"]`);
      if (dot) dot.classList.add('active');

      await new Promise((r) => setTimeout(r, beatIntervalMs));
      if (dot) dot.classList.remove('active');
    }

    // Calculate latency deltas
    statusEl.textContent = 'Calculating median roundtrip latency...';
    await new Promise((r) => setTimeout(r, 200));

    // Match each beat with nearest mic onset
    const deltas = [];
    for (const bTime of beatTimes) {
      // Find nearest onset within [-150ms, +350ms]
      let closestDelta = null;
      let minAbs = Infinity;

      for (const onTime of this.micOnsets) {
        const delta = onTime - bTime;
        if (delta >= -150 && delta <= 350) {
          if (Math.abs(delta) < minAbs) {
            minAbs = Math.abs(delta);
            closestDelta = delta;
          }
        }
      }

      if (closestDelta !== null) {
        deltas.push(closestDelta);
      }
    }

    this.isAutoCalibrating = false;
    btn.disabled = false;

    if (deltas.length >= 2) {
      deltas.sort((a, b) => a - b);
      const median = Math.round(deltas[Math.floor(deltas.length / 2)]);
      const bounded = Math.max(-200, Math.min(300, median));

      document.getElementById('latency-slider').value = bounded;
      document.getElementById('latency-input').value = bounded;
      this.currentOffset = bounded;
      this.audioManager.setCalibrationOffset(bounded);
      localStorage.setItem('rhythm_game_latency_offset', bounded.toString());

      statusEl.innerHTML = `✅ Calibrated! Measured <strong>${bounded > 0 ? '+' : ''}${bounded} ms</strong> (from ${deltas.length}/4 hits). Saved to settings.`;
      dots.forEach((d) => d.classList.add('hit'));
    } else {
      statusEl.textContent = '⚠️ Not enough mic onsets detected. Please check microphone and try again.';
    }
  }

  async run3SecondLiveFineTuning() {
    const progressBar = document.getElementById('fine-tune-progress');
    const resultsEl = document.getElementById('fine-tune-results');
    const btn = document.getElementById('start-fine-tune-btn');
    btn.disabled = true;

    resultsEl.textContent = 'Hold a note or chord continuously...';

    this.inferenceService.profileManager.startLiveFineTuning(
      (progress) => {
        progressBar.style.width = `${Math.round(progress * 100)}%`;
      },
      (report) => {
        progressBar.style.width = '100%';
        btn.disabled = false;
        resultsEl.innerHTML = `
          ✅ <strong>Fine-Tuning Applied!</strong><br>
          Noise Floor: <code>${report.noiseFloorDb} dB</code> | 
          Acoustic Decay: <code>${report.decayRatio}</code> | 
          Gate Adapted: <code>${report.adaptedGate}</code>
        `;
        // Apply adapted profile weights
        this.inferenceService.applyProfile();
      }
    );
  }
}
