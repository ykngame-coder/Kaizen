/**
 * Sound Engine (Sleep Suite, cahier des charges §3.8). Royalty-free by
 * construction: colored noises and ambiences are *synthesized* with the Web
 * Audio API — no external assets, no licensing, perfect looping, offline.
 * Users can also play audio files stored locally on their machine (web file
 * picker; nothing is uploaded). Timer, fade-out and progressive volume are
 * built in.
 *
 * Web-only for now (Web Audio). On native the engine reports `isSupported=false`
 * and every method is a safe no-op; a native path (expo-audio) can come later.
 */

export type SoundPresetKey = 'white' | 'pink' | 'brown' | 'rain' | 'ocean' | 'wind' | 'fan';

export interface SoundPresetMeta {
  key: SoundPresetKey;
  label: string;
  emoji: string;
}

/** Display metadata for the UI (order defines the grid). */
export const SOUND_PRESETS: SoundPresetMeta[] = [
  { key: 'rain', label: 'Pluie', emoji: '🌧️' },
  { key: 'ocean', label: 'Vagues', emoji: '🌊' },
  { key: 'wind', label: 'Vent', emoji: '🍃' },
  { key: 'fan', label: 'Ventilateur', emoji: '🌀' },
  { key: 'white', label: 'Bruit blanc', emoji: '⚪' },
  { key: 'pink', label: 'Bruit rose', emoji: '🌸' },
  { key: 'brown', label: 'Bruit brun', emoji: '🟤' },
];

type NoiseColor = 'white' | 'pink' | 'brown';

interface PresetDef {
  noise: NoiseColor;
  gain: number;
  filter?: { type: BiquadFilterType; freq: number; q?: number };
  /** Slow modulation for lifelike ambiences (waves, gusts). */
  lfo?: { rate: number; target: 'filter' | 'gain'; depth: number; base: number };
}

const PRESETS: Record<SoundPresetKey, PresetDef> = {
  white: { noise: 'white', gain: 0.5 },
  pink: { noise: 'pink', gain: 0.6 },
  brown: { noise: 'brown', gain: 0.85 },
  rain: { noise: 'white', gain: 0.7, filter: { type: 'bandpass', freq: 1800, q: 0.4 } },
  ocean: {
    noise: 'brown',
    gain: 0.9,
    filter: { type: 'lowpass', freq: 600 },
    lfo: { rate: 0.12, target: 'filter', depth: 400, base: 500 },
  },
  wind: {
    noise: 'brown',
    gain: 0.85,
    filter: { type: 'lowpass', freq: 500 },
    lfo: { rate: 0.06, target: 'filter', depth: 250, base: 450 },
  },
  fan: { noise: 'brown', gain: 0.8, filter: { type: 'lowpass', freq: 900 } },
};

function fillWhite(d: Float32Array): void {
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

// Paul Kellet's refined pink-noise filter.
function fillPink(d: Float32Array): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
}

function fillBrown(d: Float32Array): void {
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
}

interface ActiveGraph {
  source: AudioBufferSourceNode;
  lfo: OscillatorNode | null;
  nodes: AudioNode[];
}

export interface SoundEngine {
  readonly isSupported: boolean;
  play(preset: SoundPresetKey): void;
  /** Decode and loop a local audio file (nothing is uploaded). */
  playFile(file: Blob): Promise<void>;
  stop(fadeSec?: number): void;
  setVolume(v: number): void;
  /** Auto-stop after `minutes`, fading out over the last `fadeSec` seconds. */
  startTimer(minutes: number, fadeSec?: number): void;
  clearTimer(): void;
  dispose(): void;
}

const NOOP_ENGINE: SoundEngine = {
  isSupported: false,
  play: () => {},
  playFile: async () => {},
  stop: () => {},
  setVolume: () => {},
  startTimer: () => {},
  clearTimer: () => {},
  dispose: () => {},
};

type AudioCtor = typeof AudioContext;

function getAudioCtor(): AudioCtor | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

/**
 * Create a sound engine. Returns a no-op engine (isSupported=false) when Web
 * Audio isn't available (native). Instantiate once and keep it in a ref.
 */
export function createSoundEngine(): SoundEngine {
  const maybeCtor = getAudioCtor();
  if (!maybeCtor) return NOOP_ENGINE;
  const Ctor: AudioCtor = maybeCtor;

  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let active: ActiveGraph | null = null;
  let volume = 0.6;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const noiseBuffers = new Map<NoiseColor, AudioBuffer>();

  function ensure(): { ctx: AudioContext; master: GainNode } {
    if (!ctx || !master) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    return { ctx, master };
  }

  function noiseBuffer(c: AudioContext, color: NoiseColor): AudioBuffer {
    const cached = noiseBuffers.get(color);
    if (cached) return cached;
    const buffer = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const data = buffer.getChannelData(0);
    if (color === 'white') fillWhite(data);
    else if (color === 'pink') fillPink(data);
    else fillBrown(data);
    noiseBuffers.set(color, buffer);
    return buffer;
  }

  function teardown(g: ActiveGraph): void {
    try {
      g.source.stop();
    } catch {
      /* already stopped */
    }
    try {
      g.lfo?.stop();
    } catch {
      /* already stopped */
    }
    g.source.disconnect();
    g.lfo?.disconnect();
    for (const n of g.nodes) n.disconnect();
  }

  function stopNow(): void {
    if (active) {
      teardown(active);
      active = null;
    }
  }

  function startGraph(c: AudioContext, m: GainNode, buffer: AudioBuffer, def: PresetDef): void {
    stopNow();
    if (c.state === 'suspended') void c.resume();

    const source = c.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const nodes: AudioNode[] = [];
    let node: AudioNode = source;
    let filter: BiquadFilterNode | null = null;
    if (def.filter) {
      filter = c.createBiquadFilter();
      filter.type = def.filter.type;
      filter.frequency.value = def.filter.freq;
      if (def.filter.q !== undefined) filter.Q.value = def.filter.q;
      node.connect(filter);
      node = filter;
      nodes.push(filter);
    }

    const presetGain = c.createGain();
    presetGain.gain.value = def.gain;
    node.connect(presetGain);
    presetGain.connect(m);
    nodes.push(presetGain);

    let lfo: OscillatorNode | null = null;
    if (def.lfo) {
      lfo = c.createOscillator();
      lfo.frequency.value = def.lfo.rate;
      const lfoGain = c.createGain();
      lfoGain.gain.value = def.lfo.depth;
      lfo.connect(lfoGain);
      if (def.lfo.target === 'filter' && filter) {
        filter.frequency.value = def.lfo.base;
        lfoGain.connect(filter.frequency);
      } else {
        presetGain.gain.value = def.lfo.base;
        lfoGain.connect(presetGain.gain);
      }
      lfo.start();
      nodes.push(lfoGain);
    }

    source.start();
    active = { source, lfo, nodes };

    // Smooth fade-in so switching sounds isn't jarring.
    const t = c.currentTime;
    m.gain.cancelScheduledValues(t);
    m.gain.setValueAtTime(0, t);
    m.gain.linearRampToValueAtTime(volume, t + 0.8);
  }

  return {
    isSupported: true,

    play(preset) {
      const { ctx: c, master: m } = ensure();
      startGraph(c, m, noiseBuffer(c, PRESETS[preset].noise), PRESETS[preset]);
    },

    async playFile(file) {
      const { ctx: c, master: m } = ensure();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = await c.decodeAudioData(arrayBuffer);
      startGraph(c, m, buffer, { noise: 'white', gain: 1 });
    },

    stop(fadeSec = 0.4) {
      if (!ctx || !master || !active) return;
      const g = active;
      active = null;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + fadeSec);
      setTimeout(() => teardown(g), fadeSec * 1000 + 60);
    },

    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (ctx && master && active) {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setTargetAtTime(volume, ctx.currentTime, 0.1);
      }
    },

    startTimer(minutes, fadeSec = 20) {
      this.clearTimer();
      const delayMs = Math.max(0, minutes * 60_000 - fadeSec * 1000);
      timer = setTimeout(() => this.stop(fadeSec), delayMs);
    },

    clearTimer() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },

    dispose() {
      this.clearTimer();
      stopNow();
      if (ctx) {
        void ctx.close();
        ctx = null;
        master = null;
      }
    },
  };
}

/**
 * Open the OS file picker and return the chosen audio files. Web only; returns
 * an empty array elsewhere. Files stay on the device — they are never uploaded.
 */
export function pickLocalAudio(): Promise<File[]> {
  if (typeof document === 'undefined') return Promise.resolve([]);
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.multiple = true;
    input.onchange = () => resolve(input.files ? Array.from(input.files) : []);
    // If the dialog is cancelled, resolve empty on window focus.
    input.oncancel = () => resolve([]);
    input.click();
  });
}
