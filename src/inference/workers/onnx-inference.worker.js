/**
 * onnx-inference.worker.js
 * Dedicated Web Worker executing Spotify Basic Pitch (nmp.onnx) using onnxruntime-web.
 * Feeds sliding 43,844 sample analysis windows at 22,050 Hz with 4,410 hop (~200ms).
 */

import * as ort from 'onnxruntime-web';

// Configure ONNX Runtime Web WASM paths
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
// Point WASM assets to /models/ directory where ort-wasm binaries are served
ort.env.wasm.wasmPaths = '/models/';

let session = null;
let isReady = false;

// Sliding analysis window state
const TARGET_SR = 22050;
const WINDOW_SIZE = 43844;
const HOP_SIZE = 4410; // ~200ms

let slidingBuffer = new Float32Array(WINDOW_SIZE);
let samplesSinceLastHop = 0;

// Hysteresis & thresholds
let onsetThreshold = 0.50;
let sustainThreshold = 0.32;
const MAX_CONCURRENT_PITCH_BINS = 12; // Slap / broadband noise guard

// 88-bin gain multipliers (MIDI 21 to 108)
let binGains = new Float32Array(88).fill(1.0);

// Active notes tracker for sustain hysteresis
const activePitches = new Set();
// Temporal persistence buffer (tracks onsets across consecutive frames)
const onsetHistory = new Map();

async function initSession(modelUrl) {
  try {
    self.postMessage({ type: 'STATUS', status: 'LOADING_MODEL', message: 'Fetching Spotify Basic Pitch model...' });
    
    // Fetch array buffer directly to ensure clean cross-origin worker loading
    const response = await fetch(modelUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch model from ${modelUrl}`);
    }
    const modelBuffer = await response.arrayBuffer();

    self.postMessage({ type: 'STATUS', status: 'COMPILING_WASM', message: 'Initializing ONNX WebAssembly session...' });
    session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    });

    isReady = true;
    self.postMessage({
      type: 'READY',
      info: {
        model: 'Spotify Basic Pitch (nmp.onnx)',
        inputs: session.inputNames,
        outputs: session.outputNames,
        byteSize: modelBuffer.byteLength
      }
    });
  } catch (err) {
    console.error('Failed to initialize ONNX session:', err);
    self.postMessage({ type: 'ERROR', error: err.message });
  }
}

// Resample audio from source sample rate to 22,050 Hz
function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const newLength = Math.round(input.length * ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const origIndex = i / ratio;
    const i0 = Math.floor(origIndex);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = origIndex - i0;
    result[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return result;
}

async function runInference() {
  if (!session || !isReady) return;

  const t0 = performance.now();
  try {
    // Basic Pitch expects input shape [1, 43844, 1]
    const tensor = new ort.Tensor('float32', slidingBuffer, [1, WINDOW_SIZE, 1]);
    const inputName = session.inputNames[0] || 'serving_default_input_2:0';
    const feeds = {};
    feeds[inputName] = tensor;

    const results = await session.run(feeds);
    const t1 = performance.now();
    const inferenceTimeMs = Math.round(t1 - t0);

    // Outputs:
    // StatefulPartitionedCall:2 -> onset [1, 172, 88]
    // StatefulPartitionedCall:1 -> note/frame [1, 172, 88]
    // StatefulPartitionedCall:0 -> contour [1, 172, 264]
    const onsetTensor = results['StatefulPartitionedCall:2'] || results[session.outputNames[0]];
    const frameTensor = results['StatefulPartitionedCall:1'] || results[session.outputNames[1]];

    const onsetData = onsetTensor.data;
    const frameData = frameTensor.data;

    // We analyze the most recent frames corresponding to the hop (last 18 frames out of 172)
    const totalFrames = 172;
    const hopFrames = Math.max(1, Math.round((HOP_SIZE / WINDOW_SIZE) * totalFrames));
    const startFrame = totalFrames - hopFrames;

    const detectedPitches = [];
    const latestBinProbs = new Float32Array(88);

    for (let f = startFrame; f < totalFrames; f++) {
      let elevatedCount = 0;
      const frameElevations = [];

      for (let b = 0; b < 88; b++) {
        const midi = 21 + b;
        const idx = f * 88 + b;
        const rawOnset = onsetData[idx];
        const rawFrame = frameData[idx];

        // Apply 88-bin adapter gain
        const gain = binGains[b];
        const onsetProb = Math.min(1.0, rawOnset * gain);
        const frameProb = Math.min(1.0, rawFrame * gain);

        latestBinProbs[b] = Math.max(latestBinProbs[b], frameProb);

        if (frameProb >= sustainThreshold) {
          elevatedCount++;
          frameElevations.push({ midi, onsetProb, frameProb });
        }
      }

      // Broadband Noise / Percussive Slap Rejection:
      // If elevated bins > 12, this frame contains a cough, mic knock, or broad noise spike
      if (elevatedCount > MAX_CONCURRENT_PITCH_BINS) {
        continue;
      }

      // Post-process with hysteresis and 2-frame temporal persistence
      for (const item of frameElevations) {
        const { midi, onsetProb, frameProb } = item;
        const wasActive = activePitches.has(midi);

        // Check 2-frame persistence for onset
        let count = (onsetHistory.get(midi) || 0);
        if (onsetProb >= onsetThreshold) {
          count++;
          onsetHistory.set(midi, count);
        } else {
          onsetHistory.set(midi, 0);
        }

        const validOnset = onsetProb >= onsetThreshold && count >= 2;
        const validSustain = wasActive && frameProb >= sustainThreshold;

        if (validOnset || validSustain) {
          detectedPitches.push({
            midi: midi,
            prob: frameProb,
            onsetProb: onsetProb,
            isOnset: validOnset && !wasActive
          });
          activePitches.add(midi);
        } else {
          activePitches.delete(midi);
        }
      }
    }

    self.postMessage({
      type: 'DETECTION_RESULT',
      pitches: detectedPitches,
      binProbabilities: Array.from(latestBinProbs),
      inferenceTimeMs: inferenceTimeMs,
      modelName: 'Spotify Basic Pitch (nmp.onnx)'
    });
  } catch (err) {
    console.error('Error during ONNX inference step:', err);
  }
}

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'INIT') {
    await initSession(payload.modelUrl || '/models/nmp.onnx');
  } else if (type === 'SET_BIN_GAINS') {
    if (payload.length === 88) {
      binGains.set(payload);
    }
  } else if (type === 'SET_THRESHOLDS') {
    if (payload.onsetThreshold) onsetThreshold = payload.onsetThreshold;
    if (payload.sustainThreshold) sustainThreshold = payload.sustainThreshold;
  } else if (type === 'AUDIO_BUFFER') {
    const { buffer, sampleRate } = payload;
    const inputSamples = new Float32Array(buffer);

    // Resample to 22050 Hz
    const resampled = resample(inputSamples, sampleRate, TARGET_SR);

    // Slide into ring buffer
    const n = resampled.length;
    if (n >= WINDOW_SIZE) {
      slidingBuffer.set(resampled.subarray(n - WINDOW_SIZE));
    } else {
      slidingBuffer.copyWithin(0, n);
      slidingBuffer.set(resampled, WINDOW_SIZE - n);
    }

    samplesSinceLastHop += n;

    if (samplesSinceLastHop >= HOP_SIZE) {
      samplesSinceLastHop = 0;
      await runInference();
    }
  }
};
