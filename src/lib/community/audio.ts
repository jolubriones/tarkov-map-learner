/**
 * Client-side audio validation, shared by both backends (mirror of photo.ts).
 *
 * Unlike photos, clips can't be transcoded without heavy libraries — so the
 * original bytes are kept and the guards are: plausibly audio, small enough
 * for local persistence (2MB ≈ minutes of speech-grade audio, far more than
 * an ID clip needs), actually decodable, and short. Both adapters upload the
 * validated original — local as a data URL, hosted to the Storage bucket —
 * so the user never thinks about formats.
 */

/** Clips must fit local persistence + the Storage file cap (2MB). */
const AUDIO_MAX_INPUT_BYTES = 2 * 1024 * 1024;
/** ID clips are seconds long; two minutes is generous headroom. */
const AUDIO_MAX_DURATION_SECONDS = 120;

function openAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * Validate an audio file: kind, size, decodability, duration. Returns the
 * ORIGINAL bytes (no transcode — decode is validation-only) and throws with
 * a user-facing message otherwise. Browser-only (Web Audio decode).
 */
export async function prepareAudio(input: Blob): Promise<Blob> {
  if (typeof window === 'undefined' || typeof FileReader === 'undefined') {
    throw new Error('Audio uploads need a browser.');
  }
  // Some browsers leave .wav/.ogg picked from disk untyped — decode decides.
  if (input.type && !input.type.startsWith('audio/')) {
    throw new Error('That file is not audio — pick an MP3, WAV, or OGG clip.');
  }
  if (input.size === 0) {
    throw new Error('That file is empty — pick an audio clip.');
  }
  if (input.size > AUDIO_MAX_INPUT_BYTES) {
    throw new Error('That clip is over 2MB — trim it to just the sound.');
  }
  const ctx = openAudioContext();
  if (!ctx) throw new Error('Audio processing is unavailable in this browser.');
  try {
    let decoded: AudioBuffer;
    try {
      decoded = await ctx.decodeAudioData(await input.arrayBuffer());
    } catch {
      throw new Error('Could not read that as audio — try an MP3 or WAV clip.');
    }
    if (!Number.isFinite(decoded.duration) || decoded.duration <= 0) {
      throw new Error('Could not read that as audio — try an MP3 or WAV clip.');
    }
    if (decoded.duration > AUDIO_MAX_DURATION_SECONDS) {
      throw new Error('That clip is over 2 minutes — trim it to just the sound.');
    }
    return input;
  } finally {
    void ctx.close().catch(() => {});
  }
}
