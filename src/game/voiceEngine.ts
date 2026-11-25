import { telephoneAudio, type ActiveVoiceChain } from './telephoneAudio';
import {
  NODE_VOICE_SCRIPTS,
  PATROL_VOICE_SCRIPTS,
  VOICE_PERSONAS,
  type DialogueVoiceScript,
  type VoicePersonaId,
  type VoicePhraseCue,
} from './voiceScript';

export type VoiceEngineMode = 'recorded_audio';

export type VoicePlaybackStatus = 'idle' | 'speaking' | 'paused' | 'completed';

export interface VoicePlaybackSnapshot {
  scriptId: string | null;
  personaId: VoicePersonaId | null;
  personaName: string;
  personaRole: string;
  status: VoicePlaybackStatus;
  mode: VoiceEngineMode;
  voiceMuted: boolean;
  voiceVolume: number; // 0..1
  cueIndex: number;
  totalCues: number;
  activeCue: VoicePhraseCue | null;
  spokenTextSoFar: string;
  energyLevel: number; // 0..1 live audio RMS energy for oscilloscope sync
}

export interface AudioTrimBounds {
  trimStartSec: number;
  trimEndSec: number;
}

interface CachedVoiceAudio extends AudioTrimBounds {
  buffer: AudioBuffer;
}

type VoiceListener = (snapshot: VoicePlaybackSnapshot) => void;

const VOICE_VOLUME_KEY = 'the_last_call_voice_volume_v1';

/**
 * Pure non-destructive edge-silence detector for decoded PCM audio.
 * Trims ONLY dead leading/trailing digital silence while keeping generous
 * acoustic cushions (45ms lead, 75ms trail) and leaving all intentional
 * dramatic pauses inside the performance completely untouched.
 */
export function computeAudioTrimBounds(
  samples: Float32Array,
  sampleRate: number,
  options?: { rmsThreshold?: number; leadPadSec?: number; trailPadSec?: number }
): AudioTrimBounds {
  const duration = sampleRate > 0 ? samples.length / sampleRate : 0;
  if (duration <= 0.15 || sampleRate <= 0) {
    return { trimStartSec: 0, trimEndSec: Math.max(0, duration) };
  }

  const rmsThreshold = options?.rmsThreshold ?? 0.011;
  const leadPadSec = options?.leadPadSec ?? 0.045;
  const trailPadSec = options?.trailPadSec ?? 0.075;
  const winSamples = Math.max(1, Math.floor(sampleRate * 0.01)); // 10ms analysis window

  let firstActiveSec = 0;
  let foundAny = false;
  for (let i = 0; i < samples.length; i += winSamples) {
    let sumSq = 0;
    const end = Math.min(i + winSamples, samples.length);
    for (let j = i; j < end; j++) {
      const v = samples[j];
      sumSq += v * v;
    }
    if (Math.sqrt(sumSq / (end - i)) >= rmsThreshold) {
      firstActiveSec = i / sampleRate;
      foundAny = true;
      break;
    }
  }

  if (!foundAny) {
    return { trimStartSec: 0, trimEndSec: duration };
  }

  let lastActiveSec = duration;
  for (let i = samples.length - winSamples; i >= 0; i -= winSamples) {
    let sumSq = 0;
    const end = Math.min(i + winSamples, samples.length);
    for (let j = i; j < end; j++) {
      const v = samples[j];
      sumSq += v * v;
    }
    if (Math.sqrt(sumSq / (end - i)) >= rmsThreshold) {
      lastActiveSec = Math.min(duration, end / sampleRate);
      break;
    }
  }

  const trimStartSec = Math.max(0, firstActiveSec - leadPadSec);
  const trimEndSec = Math.min(duration, Math.max(trimStartSec + 0.12, lastActiveSec + trailPadSec));

  return {
    trimStartSec: Math.round(trimStartSec * 1000) / 1000,
    trimEndSec: Math.round(trimEndSec * 1000) / 1000,
  };
}

export function clampVoiceVolume(value: number): number {
  if (!Number.isFinite(value)) return 0.9;
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function readStoredVolume(): number {
  if (typeof window === 'undefined') return 0.9;
  try {
    const raw = window.localStorage.getItem(VOICE_VOLUME_KEY);
    if (!raw) return 0.9;
    return clampVoiceVolume(parseFloat(raw));
  } catch {
    return 0.9;
  }
}

function writeStoredVolume(vol: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VOICE_VOLUME_KEY, String(vol));
  } catch {
    // Ignore storage errors
  }
}

export function createIdleVoiceSnapshot(
  voiceMuted = false,
  voiceVolume = 0.9
): VoicePlaybackSnapshot {
  return {
    scriptId: null,
    personaId: null,
    personaName: '',
    personaRole: '',
    status: 'idle',
    mode: 'recorded_audio',
    voiceMuted,
    voiceVolume: clampVoiceVolume(voiceVolume),
    cueIndex: 0,
    totalCues: 0,
    activeCue: null,
    spokenTextSoFar: '',
    energyLevel: 0,
  };
}

const UPCOMING_NODE_ORDER: Record<string, string[]> = {
  n_intro: ['n_identity', 'n_sounds'],
  n_identity: ['n_sounds', 'n_pressure'],
  n_sounds: ['n_pressure', 'n_revelation'],
  n_pressure: ['n_revelation'],
  n_revelation: [],
};

/**
 * Plays pre-generated Iranian Persian (.wav) studio voice acting assets
 * through Web Audio telephone bandpass filtering with:
 * - Two-stage preloading (raw ArrayBuffer fetch + eager AudioBuffer decode)
 *   for zero-latency transitions on Android & iOS mobile browsers
 * - Non-destructive leading/trailing dead-air trimming in memory
 * - Tight natural ~180–280ms speech-to-speech pacing with zero overlap
 * - Real-time RMS metering, pause/resume offset tracking, replay, skip, mute, and volume control
 *
 * Uses exclusively local pre-generated audio files.
 */
class PersianVoiceEngine {
  private listeners = new Set<VoiceListener>();
  private currentScript: DialogueVoiceScript | null = null;
  private cueIndex = 0;
  private status: VoicePlaybackStatus = 'idle';
  private voiceMuted = false;
  private voiceVolume = readStoredVolume();
  private energyLevel = 0;

  private activeTimer: number | null = null;
  private rafId: number | null = null;
  private runToken = 0;

  // Stage 1 cache: raw bytes fetched even before AudioContext user gesture unlock
  private rawBytesCache = new Map<string, ArrayBuffer>();
  private inflightFetches = new Map<string, Promise<ArrayBuffer | null>>();

  // Stage 2 cache: decoded AudioBuffers + non-destructive edge trim bounds
  private bufferCache = new Map<string, CachedVoiceAudio>();
  private inflightDecodes = new Map<string, Promise<CachedVoiceAudio | null>>();

  private activeSource: AudioBufferSourceNode | null = null;
  private activeChain: ActiveVoiceChain | null = null;
  private activeHtmlAudio: HTMLAudioElement | null = null;
  private activeStartedAtCtxTime = 0;
  private activeBaseOffsetSec = 0;
  private pausedOffsetSec = 0;
  private analyserBins = new Uint8Array(128);

  public subscribe(listener: VoiceListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): VoicePlaybackSnapshot {
    const script = this.currentScript;
    if (!script) {
      return createIdleVoiceSnapshot(this.voiceMuted, this.voiceVolume);
    }
    const persona = VOICE_PERSONAS[script.persona];
    const safeIdx = Math.min(this.cueIndex, Math.max(0, script.cues.length - 1));
    const activeCue = script.cues[safeIdx] ?? null;
    const spokenParts =
      this.status === 'completed'
        ? script.cues.map((c) => c.text)
        : script.cues.slice(0, safeIdx + 1).map((c) => c.text);

    return {
      scriptId: script.id,
      personaId: script.persona,
      personaName: persona.displayName,
      personaRole: persona.roleLabel,
      status: this.status,
      mode: 'recorded_audio',
      voiceMuted: this.voiceMuted,
      voiceVolume: this.voiceVolume,
      cueIndex: safeIdx,
      totalCues: script.cues.length,
      activeCue,
      spokenTextSoFar: spokenParts.join(' '),
      energyLevel: this.status === 'speaking' && !this.voiceMuted ? this.energyLevel : 0,
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  private clearTimers(): void {
    if (this.activeTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.activeTimer);
      this.activeTimer = null;
    }
    if (this.rafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private computeActiveGain(): number {
    if (this.voiceMuted || !this.currentScript) return 0;
    const persona = VOICE_PERSONAS[this.currentScript.persona];
    const cue = this.currentScript.cues[this.cueIndex];
    const cueMul = cue ? cue.volumeMultiplier : 1;
    // Slight makeup gain (+15%) to compensate for narrowband telephone bandpass attenuation
    return Math.max(0, Math.min(1.35, this.voiceVolume * persona.baseVolume * cueMul * 1.15));
  }

  private teardownActiveAudio(): void {
    if (this.activeSource) {
      try {
        this.activeSource.onended = null;
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // Already stopped
      }
      this.activeSource = null;
    }
    if (this.activeChain) {
      this.activeChain.cleanup();
      this.activeChain = null;
    }
    if (this.activeHtmlAudio) {
      try {
        this.activeHtmlAudio.onended = null;
        this.activeHtmlAudio.onerror = null;
        this.activeHtmlAudio.pause();
        this.activeHtmlAudio.src = '';
      } catch {
        // Ignore teardown errors
      }
      this.activeHtmlAudio = null;
    }
    this.energyLevel = 0;
  }

  private startEnergyMeter(token: number): void {
    if (typeof window === 'undefined') return;
    const tick = () => {
      if (token !== this.runToken || this.status !== 'speaking') {
        this.energyLevel = 0;
        return;
      }
      let nextEnergy = 0;
      if (!this.voiceMuted && this.activeChain) {
        const analyser = this.activeChain.analyser;
        if (this.analyserBins.length !== analyser.fftSize) {
          this.analyserBins = new Uint8Array(analyser.fftSize);
        }
        analyser.getByteTimeDomainData(this.analyserBins);
        let sumSq = 0;
        for (let i = 0; i < this.analyserBins.length; i++) {
          const norm = (this.analyserBins[i] - 128) / 128;
          sumSq += norm * norm;
        }
        const rms = Math.sqrt(sumSq / this.analyserBins.length);
        nextEnergy = Math.min(1, rms * 4.4);
      } else if (!this.voiceMuted && this.activeHtmlAudio && !this.activeHtmlAudio.paused) {
        nextEnergy = 0.55;
      }

      if (Math.abs(nextEnergy - this.energyLevel) > 0.04) {
        this.energyLevel = nextEnergy;
        this.emit();
      }
      this.rafId = window.requestAnimationFrame(tick);
    };
    this.rafId = window.requestAnimationFrame(tick);
  }

  private async fetchRawBytes(url: string): Promise<ArrayBuffer | null> {
    const cached = this.rawBytesCache.get(url);
    if (cached) return cached;

    const existing = this.inflightFetches.get(url);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const resp = await fetch(url);
        if (!resp.ok) return null;
        const arr = await resp.arrayBuffer();
        this.rawBytesCache.set(url, arr);
        return arr;
      } catch {
        return null;
      } finally {
        this.inflightFetches.delete(url);
      }
    })();

    this.inflightFetches.set(url, promise);
    return promise;
  }

  private async loadAudioBuffer(url: string): Promise<CachedVoiceAudio | null> {
    const cached = this.bufferCache.get(url);
    if (cached) return cached;

    const existing = this.inflightDecodes.get(url);
    if (existing) return existing;

    const promise = (async () => {
      const ctx = telephoneAudio.getAudioContext();
      if (!ctx) return null;
      try {
        const raw = await this.fetchRawBytes(url);
        if (!raw) return null;
        // Clone ArrayBuffer before decodeAudioData because Web Audio detaches the passed buffer
        const decoded = await ctx.decodeAudioData(raw.slice(0));
        const channel = decoded.getChannelData(0);
        const bounds = computeAudioTrimBounds(channel, decoded.sampleRate);
        const entry: CachedVoiceAudio = {
          buffer: decoded,
          trimStartSec: bounds.trimStartSec,
          trimEndSec: bounds.trimEndSec,
        };
        this.bufferCache.set(url, entry);
        // Release raw bytes once decoded to keep mobile RAM lean
        this.rawBytesCache.delete(url);
        return entry;
      } catch {
        return null;
      } finally {
        this.inflightDecodes.delete(url);
      }
    })();

    this.inflightDecodes.set(url, promise);
    return promise;
  }

  /**
   * Prefetches raw WAV bytes (safe before first user gesture on mobile) and
   * eagerly decodes into AudioBuffers once AudioContext is available.
   */
  public preloadScript(script: DialogueVoiceScript, decodeImmediately = true): void {
    for (const cue of script.cues) {
      if (this.bufferCache.has(cue.audioUrl)) continue;
      if (decodeImmediately) {
        void this.loadAudioBuffer(cue.audioUrl);
      } else {
        void this.fetchRawBytes(cue.audioUrl);
      }
    }
  }

  /**
   * Proactively preloads opening call clips while ringing (before player answers)
   * so intro_1..4 start with zero fetch latency on Android/iOS.
   */
  public warmUpInitialCall(): void {
    this.preloadScript(NODE_VOICE_SCRIPTS.n_intro, false);
    this.preloadScript(NODE_VOICE_SCRIPTS.n_identity, false);
  }

  private preloadUpcomingAfter(scriptId: string): void {
    const nextIds = UPCOMING_NODE_ORDER[scriptId] ?? [];
    for (const nextId of nextIds) {
      const nextScript = NODE_VOICE_SCRIPTS[nextId];
      if (nextScript) {
        this.preloadScript(nextScript, true);
      }
    }
    // Keep patrol radio dispatches ready in background once the call is active
    this.preloadScript(PATROL_VOICE_SCRIPTS.dispatch_center, false);
    this.preloadScript(PATROL_VOICE_SCRIPTS.villa14, false);
  }

  public setVoiceMuted(mute: boolean): void {
    this.voiceMuted = mute;
    const gain = this.computeActiveGain();
    if (this.activeChain) {
      this.activeChain.setVolume(gain);
    }
    if (this.activeHtmlAudio) {
      this.activeHtmlAudio.muted = mute;
      this.activeHtmlAudio.volume = Math.min(1, gain);
    }
    if (mute) {
      this.energyLevel = 0;
    }
    this.emit();
  }

  public toggleVoiceMute(): boolean {
    this.setVoiceMuted(!this.voiceMuted);
    return this.voiceMuted;
  }

  public setVoiceVolume(volume: number): void {
    const clamped = clampVoiceVolume(volume);
    this.voiceVolume = clamped;
    writeStoredVolume(clamped);
    if (clamped > 0 && this.voiceMuted) {
      this.voiceMuted = false;
    }
    const gain = this.computeActiveGain();
    if (this.activeChain) {
      this.activeChain.setVolume(gain);
    }
    if (this.activeHtmlAudio) {
      this.activeHtmlAudio.muted = this.voiceMuted;
      this.activeHtmlAudio.volume = Math.min(1, gain);
    }
    this.emit();
  }

  public playScript(script: DialogueVoiceScript): void {
    this.runToken += 1;
    const token = this.runToken;
    this.clearTimers();
    this.teardownActiveAudio();

    this.currentScript = script;
    this.cueIndex = 0;
    this.pausedOffsetSec = 0;
    this.status = 'speaking';

    // Eagerly decode all cues of the active script + prefetch upcoming nodes
    this.preloadScript(script, true);
    this.preloadUpcomingAfter(script.id);
    this.emit();

    this.playCueAt(0, token, 0);
  }

  public replay(): void {
    if (!this.currentScript) return;
    this.playScript(this.currentScript);
  }

  public pause(): void {
    if (this.status !== 'speaking') return;
    const ctx = telephoneAudio.getAudioContext();
    if (this.activeSource && ctx) {
      this.pausedOffsetSec = Math.max(
        0,
        this.activeBaseOffsetSec + (ctx.currentTime - this.activeStartedAtCtxTime)
      );
    } else if (this.activeHtmlAudio) {
      this.pausedOffsetSec = Math.max(0, this.activeHtmlAudio.currentTime || 0);
    }

    this.runToken += 1;
    this.clearTimers();
    this.teardownActiveAudio();
    this.status = 'paused';
    this.emit();
  }

  public resume(): void {
    if (this.status !== 'paused' || !this.currentScript) return;
    this.runToken += 1;
    const token = this.runToken;
    this.status = 'speaking';
    this.emit();
    this.playCueAt(this.cueIndex, token, this.pausedOffsetSec);
  }

  public togglePlayPause(): void {
    if (this.status === 'speaking') {
      this.pause();
    } else if (this.status === 'paused') {
      this.resume();
    } else if (this.status === 'completed' && this.currentScript) {
      this.replay();
    }
  }

  public skipToEnd(): void {
    if (!this.currentScript) return;
    this.runToken += 1;
    this.clearTimers();
    this.teardownActiveAudio();
    this.pausedOffsetSec = 0;
    this.cueIndex = Math.max(0, this.currentScript.cues.length - 1);
    this.status = 'completed';
    this.emit();
  }

  public stop(): void {
    this.runToken += 1;
    this.clearTimers();
    this.teardownActiveAudio();
    this.currentScript = null;
    this.cueIndex = 0;
    this.pausedOffsetSec = 0;
    this.status = 'idle';
    this.emit();
  }

  private playCueAt(index: number, token: number, startOffsetSec: number): void {
    if (token !== this.runToken || !this.currentScript) return;

    if (index >= this.currentScript.cues.length) {
      this.status = 'completed';
      this.pausedOffsetSec = 0;
      this.cueIndex = Math.max(0, this.currentScript.cues.length - 1);
      this.teardownActiveAudio();
      this.emit();
      return;
    }

    this.cueIndex = index;
    const script = this.currentScript;
    const cue = script.cues[index];
    const persona = VOICE_PERSONAS[script.persona];
    const nextCue = script.cues[index + 1];

    // Ensure the immediate next cue is decoded before this cue finishes
    if (nextCue && !this.bufferCache.has(nextCue.audioUrl)) {
      void this.loadAudioBuffer(nextCue.audioUrl);
    }

    this.emit();

    // Only apply brief pauseBeforeMs on the very first cue of a script; consecutive cues
    // are paced exclusively by the previous cue's short pauseAfterMs (zero double-stacking).
    const delayBefore = startOffsetSec > 0 || index > 0 ? 0 : cue.pauseBeforeMs;

    const advanceToNext = () => {
      if (token !== this.runToken) return;
      this.clearTimers();
      this.teardownActiveAudio();
      this.pausedOffsetSec = 0;

      if (index + 1 >= script.cues.length) {
        this.playCueAt(index + 1, token, 0);
        return;
      }

      const gapMs = Math.max(0, cue.pauseAfterMs);
      if (gapMs === 0) {
        this.playCueAt(index + 1, token, 0);
      } else {
        this.activeTimer = window.setTimeout(() => {
          this.playCueAt(index + 1, token, 0);
        }, gapMs);
      }
    };

    const startDecodedBuffer = (ctx: AudioContext, cached: CachedVoiceAudio): boolean => {
      const { buffer, trimStartSec, trimEndSec } = cached;
      const activeDuration = Math.max(0.12, trimEndSec - trimStartSec);
      const safeRelativeOffset = Math.min(startOffsetSec, Math.max(0, activeDuration - 0.05));
      const absoluteStartSec = trimStartSec + safeRelativeOffset;
      const playDurationSec = Math.max(0.05, trimEndSec - absoluteStartSec);

      const chain = telephoneAudio.createVoiceChain(script.persona, this.computeActiveGain());
      if (!chain) return false;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(chain.input);

      this.activeSource = source;
      this.activeChain = chain;
      this.activeBaseOffsetSec = safeRelativeOffset;
      this.activeStartedAtCtxTime = ctx.currentTime;

      let finished = false;
      const finishOnce = () => {
        if (finished || token !== this.runToken) return;
        finished = true;
        advanceToNext();
      };

      source.onended = finishOnce;
      try {
        // Gentle 12ms micro-fade right before trimEndSec prevents any splice click
        if (trimEndSec < buffer.duration - 0.015 && playDurationSec > 0.08) {
          const endCtxTime = ctx.currentTime + playDurationSec;
          const gainVal = this.computeActiveGain();
          chain.outputGain.gain.setValueAtTime(gainVal, Math.max(ctx.currentTime, endCtxTime - 0.014));
          chain.outputGain.gain.linearRampToValueAtTime(0.0001, endCtxTime);
        }

        source.start(0, absoluteStartSec, playDurationSec);
        this.startEnergyMeter(token);

        // Guard timer for suspended/headless AudioContexts that fail to fire onended
        const guardMs = Math.max(700, Math.round(playDurationSec * 1000) + 900);
        this.activeTimer = window.setTimeout(finishOnce, guardMs);
        return true;
      } catch {
        this.teardownActiveAudio();
        return false;
      }
    };

    const startPlayback = async () => {
      if (token !== this.runToken) return;

      if (startOffsetSec === 0 && !this.voiceMuted && cue.effect !== 'none') {
        telephoneAudio.playEffect(cue.effect, persona.staticLevel + 0.3);
      }

      // Fast synchronous path: AudioContext already running & buffer already decoded in RAM!
      const ctx = telephoneAudio.getAudioContext();
      if (ctx) {
        const readyCached = this.bufferCache.get(cue.audioUrl);
        if (readyCached && ctx.state === 'running') {
          if (startDecodedBuffer(ctx, readyCached)) {
            return;
          }
        }

        // Async decode path (only needed on very first uncached clip)
        const cached = readyCached ?? (await this.loadAudioBuffer(cue.audioUrl));
        if (token !== this.runToken) return;

        if (cached) {
          if (ctx.state === 'suspended') {
            await ctx.resume().catch(() => {});
          }
          if (token !== this.runToken) return;
          if (startDecodedBuffer(ctx, cached)) {
            return;
          }
        }
      }

      // Fallback Path 2: Native HTMLAudioElement directly playing the same pre-generated .wav file
      if (typeof Audio !== 'undefined') {
        try {
          const audio = new Audio(cue.audioUrl);
          audio.preload = 'auto';
          audio.muted = this.voiceMuted;
          audio.volume = Math.min(1, this.computeActiveGain());
          if (startOffsetSec > 0) {
            audio.currentTime = startOffsetSec;
          }
          this.activeHtmlAudio = audio;

          let finished = false;
          const finishOnce = () => {
            if (finished || token !== this.runToken) return;
            finished = true;
            advanceToNext();
          };

          audio.onended = finishOnce;
          audio.onerror = finishOnce;

          await audio.play();
          if (token !== this.runToken) return;
          this.startEnergyMeter(token);
          return;
        } catch {
          this.teardownActiveAudio();
        }
      }

      // Path 3: Silent subtitle cadence only if audio playback is blocked by browser autoplay policy
      this.activeTimer = window.setTimeout(advanceToNext, cue.fallbackDurationMs);
    };

    if (delayBefore > 0 && typeof window !== 'undefined') {
      this.activeTimer = window.setTimeout(() => {
        void startPlayback();
      }, delayBefore);
    } else {
      void startPlayback();
    }
  }
}

export const voiceEngine = new PersianVoiceEngine();
