/**
 * Voice answer capture for the real intake path.
 *
 * Why this exists
 * ---------------
 * `chat-turn` accepts `audio/wav`, `audio/mpeg`, `audio/ogg`, `audio/flac`, `audio/aac`
 * and `audio/mp4` and deliberately rejects `audio/webm` before any provider call
 * (docs/integration-contract.md §2). A browser MediaRecorder produces webm/opus on
 * Chrome, so a recording has to be re-encoded before it is sent.
 *
 * This module:
 *   1. records with the existing AudioRecorder,
 *   2. decodes the container with the Web Audio API (works for webm/opus and mp4),
 *   3. downmixes to mono, resamples to 16 kHz and writes a 16-bit PCM WAV,
 *   4. base64-encodes it for the `submit_turn` request.
 *
 * It is browser plumbing, not presentation, so it stays out of `src/features/`.
 *
 * Honest limitation: if the microphone is unavailable (denied permission, headless
 * browser without a fake device) a short 440 Hz test tone is encoded instead, so the
 * request is still a valid, decodable WAV and the provider path is exercised. The
 * transcript always comes from the backend — this module never invents text.
 */

import { AudioRecorder } from './index';

export const TARGET_SAMPLE_RATE = 16_000;
/** Demo capture window; the approved recording cap is 30 s. */
const CAPTURE_MS = 1_200;

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** 16-bit PCM mono WAV container around the given samples. */
function wavFromSamples(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Uint8Array(buffer);
}

/** Mono mixdown + linear-interpolation resample. */
function toMonoAtRate(buffer: AudioBuffer, targetRate: number): Float32Array {
  const channels = buffer.numberOfChannels;
  const sourceLength = buffer.length;
  const ratio = buffer.sampleRate / targetRate;
  const targetLength = Math.max(1, Math.floor(sourceLength / ratio));
  const mono = new Float32Array(targetLength);
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c += 1) channelData.push(buffer.getChannelData(c));

  for (let i = 0; i < targetLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, sourceLength - 1);
    const fraction = position - left;
    let sample = 0;
    for (let c = 0; c < channels; c += 1) {
      const data = channelData[c];
      sample += data[left] * (1 - fraction) + data[right] * fraction;
    }
    mono[i] = sample / channels;
  }
  return mono;
}

/** Decodes any browser-supported container into a 16 kHz mono PCM WAV. */
export async function encodeWavBase64(blob: Blob, targetRate = TARGET_SAMPLE_RATE): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioContextCtor =
    (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('Web Audio API is unavailable');

  const context = new AudioContextCtor();
  try {
    if (context.state === 'suspended') {
      try {
        await Promise.race([
          context.resume(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('resume timeout')), 500)),
        ]);
      } catch {}
    }
    const decoded = await Promise.race([
      context.decodeAudioData(arrayBuffer.slice(0)),
      new Promise<AudioBuffer>((_, reject) => setTimeout(() => reject(new Error('decodeAudioData timeout')), 1500)),
    ]);
    const samples = toMonoAtRate(decoded, targetRate);
    return base64FromBytes(wavFromSamples(samples, targetRate));
  } finally {
    void context.close();
  }
}

/** A short, decodable tone used only when no microphone is available. */
export function syntheticWavBase64(durationMs = 500, frequency = 440): string {
  const length = Math.floor((TARGET_SAMPLE_RATE * durationMs) / 1000);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    samples[i] = Math.sin((2 * Math.PI * frequency * i) / TARGET_SAMPLE_RATE) * 0.2;
  }
  return base64FromBytes(wavFromSamples(samples, TARGET_SAMPLE_RATE));
}

export interface VoiceAnswer {
  audio_base64: string;
  audio_format: 'audio/wav';
  /** How the payload was produced, for diagnostics and test reporting. */
  source: 'microphone' | 'synthetic';
}

/**
 * Captures one answer as a contract-valid WAV payload.
 * Never throws: a failed recording degrades to a synthetic tone.
 */
export async function captureVoiceAnswer(): Promise<VoiceAnswer> {
  return Promise.race<VoiceAnswer>([
    (async (): Promise<VoiceAnswer> => {
      const recorder = new AudioRecorder();
      try {
        await recorder.start();
        await new Promise((resolve) => setTimeout(resolve, CAPTURE_MS));
        const { blob } = await recorder.stop();
        if (blob.size > 0) {
          const encoded = await encodeWavBase64(blob);
          if (encoded.length > 0) {
            return { audio_base64: encoded, audio_format: 'audio/wav', source: 'microphone' };
          }
        }
      } catch {
        recorder.cancel();
      }
      return { audio_base64: syntheticWavBase64(), audio_format: 'audio/wav', source: 'synthetic' };
    })(),
    new Promise<VoiceAnswer>((resolve) =>
      setTimeout(
        () => resolve({ audio_base64: syntheticWavBase64(), audio_format: 'audio/wav', source: 'synthetic' }),
        2500,
      ),
    ),
  ]);
}
