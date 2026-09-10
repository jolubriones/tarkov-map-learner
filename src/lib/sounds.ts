/**
 * Lightweight Web Audio sound effects for the drill.
 *
 * Uses the Web Audio API (oscillators + gain envelopes) so no audio
 * assets need to be shipped in `public/`. All functions are safe to
 * call during SSR (they no-op when `window` is undefined) and
 * respect a persisted mute preference.
 */

const MUTE_KEY = 'tarkov-map-learner-storage_muted';

let audioCtx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!audioCtx) {
    audioCtx = new window.AudioContext();
  }
  // Browsers suspend the context until a user gesture — resume on demand.
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function isMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false; // Storage blocked — sound on, preference not remembered.
  }
}

export function setMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Ignore — sound just won't remember the preference.
  }
}

interface ToneOptions {
  frequency: number;
  endFrequency?: number;
  startAt: number; // seconds offset from now
  duration: number; // seconds
  type?: OscillatorType;
  volume?: number; // 0..1
}

function playTone(ctx: AudioContext, opts: ToneOptions): void {
  const { frequency, endFrequency, startAt, duration, type = 'sine', volume = 0.22 } = opts;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const t0 = ctx.currentTime + startAt;

  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t0);
  if (endFrequency !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(endFrequency, t0 + duration);
  }

  // Short attack/decay envelope to avoid clicks.
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

function playSequence(tones: ToneOptions[]): void {
  if (isMuted()) return;
  try {
    const ctx = getContext();
    if (!ctx) return;
    for (const tone of tones) {
      playTone(ctx, tone);
    }
  } catch {
    // Audio is best-effort — never break the drill over sound.
  }
}

/** Bright ascending two-tone chime for correct answers. */
export function playCorrectSound(): void {
  playSequence([
    { frequency: 659.25, startAt: 0, duration: 0.12, type: 'sine', volume: 0.25 }, // E5
    { frequency: 987.77, startAt: 0.1, duration: 0.22, type: 'sine', volume: 0.25 }, // B5
  ]);
}

/** Low descending buzz for wrong answers. */
export function playWrongSound(): void {
  playSequence([
    { frequency: 220, endFrequency: 130, startAt: 0, duration: 0.28, type: 'sawtooth', volume: 0.16 },
    { frequency: 110, endFrequency: 82, startAt: 0.02, duration: 0.3, type: 'square', volume: 0.08 },
  ]);
}

/** Short click for selecting an option. */
export function playSelectSound(): void {
  playSequence([{ frequency: 520, startAt: 0, duration: 0.06, type: 'triangle', volume: 0.12 }]);
}

/** Victory arpeggio when the drill is completed with lives remaining. */
export function playCompleteSound(): void {
  playSequence([
    { frequency: 523.25, startAt: 0, duration: 0.12, type: 'sine', volume: 0.22 }, // C5
    { frequency: 659.25, startAt: 0.11, duration: 0.12, type: 'sine', volume: 0.22 }, // E5
    { frequency: 783.99, startAt: 0.22, duration: 0.12, type: 'sine', volume: 0.22 }, // G5
    { frequency: 1046.5, startAt: 0.33, duration: 0.28, type: 'sine', volume: 0.24 }, // C6
  ]);
}

/** Somber descending tone when the raid fails (all lives lost). */
export function playGameOverSound(): void {
  playSequence([
    { frequency: 330, endFrequency: 196, startAt: 0, duration: 0.3, type: 'triangle', volume: 0.2 },
    { frequency: 196, endFrequency: 130, startAt: 0.28, duration: 0.45, type: 'triangle', volume: 0.2 },
  ]);
}
