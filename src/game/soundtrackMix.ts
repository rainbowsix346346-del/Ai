import type { AppPhase, CallPhase } from './types';

export const MAIN_SOUNDTRACK_URL = '/assets/aistudio/THE_LAST_CALL_Audio_7b5238ae.m4a';

/**
 * Calibrated ceiling so the soundtrack feels rich and atmospheric at 100%
 * while always preserving headroom for Priority 1 (Persian character voices)
 * and Priority 2 (telephone/radio communication).
 */
export const MUSIC_BASE_CEILING = 0.42;

/**
 * Strict Voice-First ducking ratio: during character dialogue, music drops to
 * exactly 10% (within the 8–12% target) of its normal level so voices remain
 * crystal clear on both headphones and mobile speakers.
 */
export const DIALOGUE_DUCK_RATIO = 0.1;

export const DEFAULT_MUSIC_VOLUME = 0.65;

/** Timing constants (ms) for smooth, non-abrupt transitions */
export const MUSIC_TIMING_MS = {
  fadeIn: 1400,
  duckDown: 220,
  duckReleaseHold: 550, // Prevents pumping between consecutive voice lines/pauses
  duckRestore: 1500,
  sceneTransition: 750,
  pauseAttenuate: 450,
  endingFadeOut: 1650,
  volumeAdjust: 90,
} as const;

export interface MusicMixInput {
  userVolume: number; // 0..1
  musicMuted: boolean;
  phase: AppPhase;
  callPhase: CallPhase;
  tension: number; // 0..100
  dialogueSpeaking: boolean;
}

export interface MusicMixOutput {
  normalGain: number; // Gain without dialogue ducking
  targetGain: number; // Actual target gain after Voice-First ducking
  ducked: boolean;
  intensityLevel: 'menu' | 'calm' | 'suspense' | 'critical' | 'paused' | 'ending';
  vocalCarveActive: boolean;
}

export function clampMusicVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MUSIC_VOLUME;
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

/**
 * Smooth perceptual volume curve (slightly gentler at low slider positions
 * for fine control on headphones & mobile speakers).
 */
export function perceptualVolumeCurve(linearVolume: number): number {
  const clamped = Math.max(0, Math.min(1, linearVolume));
  if (clamped === 0) return 0;
  return Math.pow(clamped, 1.35);
}

/**
 * Computes the scene intensity multiplier (0..1) from gameplay state so tension
 * rises gradually during suspicious calls and critical moments without abrupt jumps.
 */
export function computeSceneIntensity(
  phase: AppPhase,
  callPhase: CallPhase,
  tension: number
): { multiplier: number; level: MusicMixOutput['intensityLevel'] } {
  if (phase === 'gameover') {
    return { multiplier: 0, level: 'ending' };
  }
  if (phase === 'paused') {
    return { multiplier: 0.22, level: 'paused' };
  }
  if (phase === 'title') {
    return { multiplier: 0.78, level: 'menu' };
  }

  // Active gameplay ('playing')
  if (callPhase === 'ringing') {
    // Slightly restrained while ringing so the emergency line ring stays prominent
    return { multiplier: 0.68, level: 'calm' };
  }

  const clampedTension = Math.max(0, Math.min(100, Number.isFinite(tension) ? tension : 0));
  // Gentle ramp from 0.72 (low tension) up to 1.0 (critical tension)
  const multiplier = 0.72 + (clampedTension / 100) * 0.28;
  const level: MusicMixOutput['intensityLevel'] =
    clampedTension >= 70 ? 'critical' : clampedTension >= 40 ? 'suspense' : 'calm';

  return { multiplier, level };
}

/**
 * Pure Voice-First mixer calculation.
 * Guarantees that whenever dialogue is speaking, background music drops to
 * exactly 10% (DIALOGUE_DUCK_RATIO) of its normal scene gain.
 */
export function computeTargetMusicMix(input: MusicMixInput): MusicMixOutput {
  const { multiplier, level } = computeSceneIntensity(input.phase, input.callPhase, input.tension);
  const clampedVol = clampMusicVolume(input.userVolume);

  if (input.musicMuted || clampedVol <= 0 || multiplier <= 0) {
    return {
      normalGain: 0,
      targetGain: 0,
      ducked: input.dialogueSpeaking,
      intensityLevel: level,
      vocalCarveActive: input.dialogueSpeaking,
    };
  }

  const curvedVol = perceptualVolumeCurve(clampedVol);
  const normalGain = Math.round(curvedVol * MUSIC_BASE_CEILING * multiplier * 10000) / 10000;
  const ducked = input.dialogueSpeaking && input.phase === 'playing';
  const targetGain = ducked
    ? Math.round(normalGain * DIALOGUE_DUCK_RATIO * 10000) / 10000
    : normalGain;

  return {
    normalGain,
    targetGain,
    ducked,
    intensityLevel: level,
    vocalCarveActive: ducked,
  };
}

/**
 * Computes safe seamless crossfade duration & trigger point for looping.
 * Uses a 3.2s overlap tail so the quiet ending piano dissolves seamlessly into
 * the deep opening drone with zero gaps or clicks.
 */
export function computeSeamlessLoopWindow(durationSec: number): {
  crossfadeSec: number;
  triggerAtSec: number;
} {
  if (!Number.isFinite(durationSec) || durationSec <= 4) {
    return { crossfadeSec: 0, triggerAtSec: Math.max(0, durationSec || 0) };
  }
  const crossfadeSec = Math.min(3.2, Math.max(1.2, durationSec * 0.08));
  const triggerAtSec = Math.max(0.5, durationSec - crossfadeSec);
  return {
    crossfadeSec: Math.round(crossfadeSec * 100) / 100,
    triggerAtSec: Math.round(triggerAtSec * 100) / 100,
  };
}
