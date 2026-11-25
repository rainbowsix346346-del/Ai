import {
  clampMusicVolume,
  computeSeamlessLoopWindow,
  computeTargetMusicMix,
  DEFAULT_MUSIC_VOLUME,
  MAIN_SOUNDTRACK_URL,
  MUSIC_TIMING_MS,
  type MusicMixOutput,
} from './soundtrackMix';
import { telephoneAudio } from './telephoneAudio';
import type { AppPhase, CallPhase } from './types';

export interface SoundtrackSnapshot {
  volume: number; // 0..1 user preference
  muted: boolean;
  isPlaying: boolean;
  awaitingInteraction: boolean;
  ducked: boolean;
  effectiveGain: number;
  intensityLevel: MusicMixOutput['intensityLevel'];
  trackLoaded: boolean;
  loadError: boolean;
}

type SoundtrackListener = (snapshot: SoundtrackSnapshot) => void;

const SESSION_VOLUME_KEY = 'the_last_call_music_volume_session_v1';
const SESSION_MUTED_KEY = 'the_last_call_music_muted_session_v1';

function readSessionVolume(): number {
  if (typeof window === 'undefined') return DEFAULT_MUSIC_VOLUME;
  try {
    const raw = window.sessionStorage.getItem(SESSION_VOLUME_KEY);
    if (raw === null) return DEFAULT_MUSIC_VOLUME;
    return clampMusicVolume(parseFloat(raw));
  } catch {
    return DEFAULT_MUSIC_VOLUME;
  }
}

function readSessionMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(SESSION_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

function writeSessionSettings(volume: number, muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(SESSION_VOLUME_KEY, String(volume));
    window.sessionStorage.setItem(SESSION_MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage quota/privacy errors
  }
}

interface MusicDeck {
  audio: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode | null;
  deckGain: GainNode | null;
  fadeLevel: number; // 0..1 crossfade weight for this deck
}

/**
 * Production Voice-First Background Soundtrack Engine for THE LAST CALL.
 *
 * Architecture:
 * - Uses the exact uploaded local M4A soundtrack via streaming HTMLAudioElement
 *   (keeps Android/mobile RAM low vs decoding a 3-minute stereo PCM buffer).
 * - Routes through a dedicated independent Web Audio API music bus:
 *     [Deck A / Deck B] -> [Deck Crossfade Gain] -> [Vocal-Space Carve EQ]
 *     -> [Master Music Gain] -> destination
 * - Seamless dual-deck crossfade looping (3.2s overlap at track tail) with strict
 *   singleton ownership so duplicate copies never play simultaneously.
 * - Automatic Voice-First ducking: drops music to 10% of normal gain in 220ms
 *   plus engages a subtle vocal-frequency EQ carve whenever a character speaks,
 *   holds 550ms across natural vocal pauses, then smoothly restores over 1.5s.
 * - Automatic browser autoplay unlock on first user interaction.
 */
class SoundtrackEngine {
  private listeners = new Set<SoundtrackListener>();

  // User settings (session-persisted)
  private volume = readSessionVolume();
  private muted = readSessionMuted();

  // Game & voice context
  private phase: AppPhase = 'title';
  private callPhase: CallPhase = 'ringing';
  private tension = 18;
  private dialogueSpeaking = false;
  private effectiveDucking = false;
  private duckReleaseTimer: number | null = null;

  // Web Audio independent music bus
  private ctx: AudioContext | null = null;
  private vocalCutEq: BiquadFilterNode | null = null;
  private vocalLowpass: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private webAudioConnected = false;

  // Dual decks for gapless crossfade looping (never more than 1 deck active outside 3.2s tail)
  private decks: [MusicDeck, MusicDeck] | null = null;
  private activeDeckIndex: 0 | 1 = 0;
  private isCrossfading = false;
  private crossfadeRafId: number | null = null;
  private loopMonitorTimer: number | null = null;
  private fadeOutStopTimer: number | null = null;

  // Fallback smooth volume animation when Web Audio bus is not attached
  private fallbackGain = 0;
  private fallbackTargetGain = 0;
  private fallbackRafId: number | null = null;

  // Playback lifecycle
  private wantsPlayback = false;
  private isPlaying = false;
  private awaitingInteraction = false;
  private trackLoaded = false;
  private loadError = false;
  private unlockListenersBound = false;
  private visibilityBound = false;
  private pausedByVisibility = false;
  private lastMix: MusicMixOutput = computeTargetMusicMix({
    userVolume: DEFAULT_MUSIC_VOLUME,
    musicMuted: false,
    phase: 'title',
    callPhase: 'ringing',
    tension: 18,
    dialogueSpeaking: false,
  });

  public subscribe(listener: SoundtrackListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): SoundtrackSnapshot {
    return {
      volume: this.volume,
      muted: this.muted,
      isPlaying: this.isPlaying,
      awaitingInteraction: this.awaitingInteraction,
      ducked: this.effectiveDucking,
      effectiveGain: this.lastMix.targetGain,
      intensityLevel: this.lastMix.intensityLevel,
      trackLoaded: this.trackLoaded,
      loadError: this.loadError,
    };
  }

  private emit(): void {
    const snap = this.getSnapshot();
    this.listeners.forEach((fn) => fn(snap));
  }

  private createDeckElement(): MusicDeck {
    const audio = new Audio(MAIN_SOUNDTRACK_URL);
    audio.preload = 'auto';
    audio.loop = false; // Handled smoothly by our dual-deck crossfade looper
    audio.crossOrigin = 'anonymous';
    // Native playsInline attribute helps iOS/Android webviews avoid fullscreen media takeover
    audio.setAttribute('playsinline', 'true');

    audio.addEventListener('loadedmetadata', () => {
      this.trackLoaded = true;
      this.loadError = false;
      this.emit();
    });

    audio.addEventListener('canplay', () => {
      if (!this.trackLoaded) {
        this.trackLoaded = true;
        this.loadError = false;
        this.emit();
      }
    });

    audio.addEventListener('error', () => {
      this.loadError = true;
      this.isPlaying = false;
      this.emit();
    });

    // Safety net: if a browser throttles timers in background tab and deck finishes before crossfade
    audio.addEventListener('ended', () => {
      if (!this.wantsPlayback || this.muted || this.phase === 'gameover') return;
      const activeDeck = this.decks?.[this.activeDeckIndex];
      if (activeDeck && activeDeck.audio === audio && !this.isCrossfading) {
        audio.currentTime = 0;
        void audio.play().catch(() => {});
      }
    });

    return {
      audio,
      sourceNode: null,
      deckGain: null,
      fadeLevel: 0,
    };
  }

  private ensureDecks(): [MusicDeck, MusicDeck] | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (!this.decks) {
      const deckA = this.createDeckElement();
      const deckB = this.createDeckElement();
      deckA.fadeLevel = 1;
      deckB.fadeLevel = 0;
      this.decks = [deckA, deckB];
      this.bindVisibilityHandler();
    }
    return this.decks;
  }

  private bindVisibilityHandler(): void {
    if (this.visibilityBound || typeof document === 'undefined') return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.isPlaying && this.decks) {
          this.pausedByVisibility = true;
          this.stopCrossfade();
          this.stopLoopMonitor();
          for (const deck of this.decks) {
            try {
              deck.audio.pause();
            } catch {
              // Ignore pause errors
            }
          }
          this.isPlaying = false;
          this.emit();
        }
      } else if (this.pausedByVisibility) {
        this.pausedByVisibility = false;
        if (this.wantsPlayback && !this.muted && this.phase !== 'gameover') {
          void this.tryStartPlayback(600);
        }
      }
    });
  }

  private ensureWebAudioBus(): boolean {
    if (this.webAudioConnected && this.ctx && this.masterGain) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      return true;
    }

    const decks = this.ensureDecks();
    if (!decks) return false;

    const ctx = telephoneAudio.getAudioContext();
    if (!ctx) return false;

    try {
      // Independent music bus with subtle vocal-frequency carve filters
      const vocalCutEq = ctx.createBiquadFilter();
      vocalCutEq.type = 'peaking';
      vocalCutEq.frequency.value = 1850; // Core Persian speech formants / intelligibility band
      vocalCutEq.Q.value = 0.85;
      vocalCutEq.gain.value = 0;

      const vocalLowpass = ctx.createBiquadFilter();
      vocalLowpass.type = 'lowpass';
      vocalLowpass.frequency.value = 18000;
      vocalLowpass.Q.value = 0.5;

      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.0001;

      vocalCutEq.connect(vocalLowpass);
      vocalLowpass.connect(masterGain);
      masterGain.connect(ctx.destination);

      for (const deck of decks) {
        const sourceNode = ctx.createMediaElementSource(deck.audio);
        const deckGain = ctx.createGain();
        deckGain.gain.value = deck.fadeLevel;
        sourceNode.connect(deckGain);
        deckGain.connect(vocalCutEq);

        deck.sourceNode = sourceNode;
        deck.deckGain = deckGain;
        // Keep element volume at 1.0 when controlled via Web Audio GainNode
        deck.audio.volume = 1;
      }

      this.ctx = ctx;
      this.vocalCutEq = vocalCutEq;
      this.vocalLowpass = vocalLowpass;
      this.masterGain = masterGain;
      this.webAudioConnected = true;
      return true;
    } catch {
      // Graceful fallback to direct HTMLAudioElement volume ramping
      return false;
    }
  }

  private bindAutoplayUnlock(): void {
    if (this.unlockListenersBound || typeof window === 'undefined') return;
    this.unlockListenersBound = true;

    const handleFirstGesture = () => {
      if (!this.wantsPlayback) return;
      this.unbindAutoplayUnlock();
      void this.tryStartPlayback(MUSIC_TIMING_MS.fadeIn);
    };

    window.addEventListener('pointerdown', handleFirstGesture, { passive: true, once: true });
    window.addEventListener('touchstart', handleFirstGesture, { passive: true, once: true });
    window.addEventListener('keydown', handleFirstGesture, { passive: true, once: true });
  }

  private unbindAutoplayUnlock(): void {
    this.unlockListenersBound = false;
  }

  private clearFadeOutTimer(): void {
    if (this.fadeOutStopTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.fadeOutStopTimer);
      this.fadeOutStopTimer = null;
    }
  }

  private clearDuckReleaseTimer(): void {
    if (this.duckReleaseTimer !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.duckReleaseTimer);
      this.duckReleaseTimer = null;
    }
  }

  private stopCrossfade(): void {
    if (this.crossfadeRafId !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(this.crossfadeRafId);
      this.crossfadeRafId = null;
    }
    this.isCrossfading = false;
  }

  private applyAudioMix(transitionMs: number): void {
    const mix = computeTargetMusicMix({
      userVolume: this.volume,
      musicMuted: this.muted,
      phase: this.phase,
      callPhase: this.callPhase,
      tension: this.tension,
      dialogueSpeaking: this.effectiveDucking,
    });
    this.lastMix = mix;

    const durationSec = Math.max(0.03, transitionMs / 1000);

    if (this.webAudioConnected && this.ctx && this.masterGain && this.vocalCutEq && this.vocalLowpass) {
      const now = this.ctx.currentTime;
      const target = Math.max(0.0001, mix.targetGain);
      try {
        this.masterGain.gain.cancelScheduledValues(now);
        this.masterGain.gain.setValueAtTime(Math.max(0.0001, this.masterGain.gain.value), now);
        this.masterGain.gain.linearRampToValueAtTime(
          mix.targetGain <= 0 ? 0.0001 : target,
          now + durationSec
        );

        // Engage gentle vocal-frequency carve when dialogue is speaking so music never masks speech
        const eqGainDb = mix.vocalCarveActive ? -5.5 : 0;
        const lpHz = mix.vocalCarveActive ? 2200 : 18000;
        const filterTau = mix.vocalCarveActive ? 0.09 : 0.35;
        this.vocalCutEq.gain.setTargetAtTime(eqGainDb, now, filterTau);
        this.vocalLowpass.frequency.setTargetAtTime(lpHz, now, filterTau);
      } catch {
        // Ignore transient scheduling errors
      }
    } else {
      this.rampFallbackVolume(mix.targetGain, transitionMs);
    }

    this.emit();
  }

  private rampFallbackVolume(target: number, durationMs: number): void {
    if (typeof window === 'undefined' || !this.decks) return;
    if (this.fallbackRafId !== null) {
      window.cancelAnimationFrame(this.fallbackRafId);
      this.fallbackRafId = null;
    }
    const startVal = this.fallbackGain;
    this.fallbackTargetGain = target;
    const startTime = performance.now();
    const safeDur = Math.max(20, durationMs);

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / safeDur);
      this.fallbackGain = startVal + (this.fallbackTargetGain - startVal) * t;
      if (this.decks) {
        for (const deck of this.decks) {
          deck.audio.volume = Math.max(0, Math.min(1, this.fallbackGain * deck.fadeLevel));
        }
      }
      if (t < 1) {
        this.fallbackRafId = window.requestAnimationFrame(step);
      } else {
        this.fallbackRafId = null;
      }
    };
    this.fallbackRafId = window.requestAnimationFrame(step);
  }

  private startLoopMonitor(): void {
    if (this.loopMonitorTimer !== null || typeof window === 'undefined') return;
    this.loopMonitorTimer = window.setInterval(() => {
      if (!this.isPlaying || this.isCrossfading || !this.decks || !this.wantsPlayback) return;
      const activeDeck = this.decks[this.activeDeckIndex];
      const duration = activeDeck.audio.duration;
      if (!Number.isFinite(duration) || duration <= 4) return;

      const { crossfadeSec, triggerAtSec } = computeSeamlessLoopWindow(duration);
      if (crossfadeSec > 0 && activeDeck.audio.currentTime >= triggerAtSec) {
        this.beginSeamlessCrossfade(crossfadeSec);
      }
    }, 250);
  }

  private stopLoopMonitor(): void {
    if (this.loopMonitorTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.loopMonitorTimer);
      this.loopMonitorTimer = null;
    }
  }

  private beginSeamlessCrossfade(crossfadeSec: number): void {
    if (!this.decks || this.isCrossfading || !this.wantsPlayback) return;

    const fromIdx = this.activeDeckIndex;
    const toIdx: 0 | 1 = fromIdx === 0 ? 1 : 0;
    const fromDeck = this.decks[fromIdx];
    const toDeck = this.decks[toIdx];

    this.isCrossfading = true;
    toDeck.audio.currentTime = 0;
    toDeck.fadeLevel = 0;

    if (this.webAudioConnected && toDeck.deckGain && this.ctx) {
      toDeck.deckGain.gain.setValueAtTime(0, this.ctx.currentTime);
    } else {
      toDeck.audio.volume = 0;
    }

    void toDeck.audio
      .play()
      .then(() => {
        if (!this.isCrossfading || !this.wantsPlayback) {
          toDeck.audio.pause();
          toDeck.audio.currentTime = 0;
          return;
        }

        const startTime = performance.now();
        const durationMs = crossfadeSec * 1000;

        const tick = (now: number) => {
          if (!this.isCrossfading || !this.decks) return;
          const progress = Math.min(1, (now - startTime) / durationMs);
          // Equal-power crossfade curve prevents volume dip in the middle of the loop
          const fadeOut = Math.cos(progress * Math.PI * 0.5);
          const fadeIn = Math.sin(progress * Math.PI * 0.5);

          fromDeck.fadeLevel = fadeOut;
          toDeck.fadeLevel = fadeIn;

          if (this.webAudioConnected && this.ctx && fromDeck.deckGain && toDeck.deckGain) {
            fromDeck.deckGain.gain.setValueAtTime(fadeOut, this.ctx.currentTime);
            toDeck.deckGain.gain.setValueAtTime(fadeIn, this.ctx.currentTime);
          } else {
            fromDeck.audio.volume = Math.max(0, Math.min(1, this.fallbackGain * fadeOut));
            toDeck.audio.volume = Math.max(0, Math.min(1, this.fallbackGain * fadeIn));
          }

          if (progress < 1) {
            this.crossfadeRafId = window.requestAnimationFrame(tick);
          } else {
            // Complete handoff: strictly stop & rewind finished deck so only 1 deck plays
            fromDeck.audio.pause();
            fromDeck.audio.currentTime = 0;
            fromDeck.fadeLevel = 0;
            toDeck.fadeLevel = 1;
            if (this.webAudioConnected && this.ctx && fromDeck.deckGain && toDeck.deckGain) {
              fromDeck.deckGain.gain.setValueAtTime(0, this.ctx.currentTime);
              toDeck.deckGain.gain.setValueAtTime(1, this.ctx.currentTime);
            }
            this.activeDeckIndex = toIdx;
            this.isCrossfading = false;
            this.crossfadeRafId = null;
          }
        };

        this.crossfadeRafId = window.requestAnimationFrame(tick);
      })
      .catch(() => {
        this.isCrossfading = false;
      });
  }

  private async tryStartPlayback(fadeInMs: number): Promise<void> {
    if (!this.wantsPlayback || this.muted || this.phase === 'gameover') return;
    const decks = this.ensureDecks();
    if (!decks) return;

    this.clearFadeOutTimer();
    this.ensureWebAudioBus();

    const activeDeck = decks[this.activeDeckIndex];
    const standbyDeck = decks[this.activeDeckIndex === 0 ? 1 : 0];

    // Strict anti-duplication: ensure standby deck is paused whenever starting/resuming
    if (!this.isCrossfading && !standbyDeck.audio.paused) {
      standbyDeck.audio.pause();
      standbyDeck.audio.currentTime = 0;
      standbyDeck.fadeLevel = 0;
      if (standbyDeck.deckGain && this.ctx) {
        standbyDeck.deckGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
    }

    activeDeck.fadeLevel = 1;
    if (activeDeck.deckGain && this.ctx) {
      activeDeck.deckGain.gain.setValueAtTime(1, this.ctx.currentTime);
    }

    // Already playing smoothly — just ensure mix & loop monitor are active (no restart!)
    if (!activeDeck.audio.paused && this.isPlaying) {
      this.awaitingInteraction = false;
      this.applyAudioMix(fadeInMs);
      this.startLoopMonitor();
      return;
    }

    // Start from silence for a smooth fade-in
    if (this.webAudioConnected && this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(0.0001, now);
    } else {
      this.fallbackGain = 0;
      activeDeck.audio.volume = 0;
    }

    try {
      await activeDeck.audio.play();
      if (!this.wantsPlayback || this.muted) {
        activeDeck.audio.pause();
        return;
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => {});
      }
      this.isPlaying = true;
      this.awaitingInteraction = false;
      this.startLoopMonitor();
      this.applyAudioMix(fadeInMs);
    } catch {
      // Browser autoplay restriction: wait cleanly for first user interaction
      this.isPlaying = false;
      this.awaitingInteraction = true;
      this.bindAutoplayUnlock();
      this.emit();
    }
  }

  private pauseDecksAfterFade(fadeOutMs: number, resetToStart: boolean): void {
    this.clearFadeOutTimer();
    this.stopCrossfade();
    this.applyAudioMix(fadeOutMs);

    if (typeof window === 'undefined') return;
    this.fadeOutStopTimer = window.setTimeout(() => {
      this.fadeOutStopTimer = null;
      if (this.decks) {
        for (const deck of this.decks) {
          try {
            deck.audio.pause();
            if (resetToStart) {
              deck.audio.currentTime = 0;
            }
          } catch {
            // Ignore pause errors
          }
        }
      }
      this.stopLoopMonitor();
      this.isPlaying = false;
      this.emit();
    }, fadeOutMs + 60);
  }

  /**
   * Call once when the application mounts or enters a playable screen.
   * Safe to call repeatedly — never restarts or duplicates an already playing track.
   */
  public ensureStarted(): void {
    this.wantsPlayback = true;
    this.ensureDecks();
    if (this.muted || this.phase === 'gameover') {
      this.emit();
      return;
    }
    void this.tryStartPlayback(MUSIC_TIMING_MS.fadeIn);
  }

  /**
   * Explicit call from a user interaction (e.g. clicking "شروع شیفت شب" or answering call)
   * guarantees immediate AudioContext unlock on Android Chrome / iOS Safari without restarting
   * the soundtrack if it is already playing.
   */
  public unlockFromUserGesture(): void {
    this.wantsPlayback = true;
    if (this.muted || this.phase === 'gameover') return;
    if (!this.isPlaying) {
      void this.tryStartPlayback(MUSIC_TIMING_MS.fadeIn);
    } else if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Syncs game state into the soundtrack mixer.
   * Keeps music playing seamlessly across title -> ringing -> active gameplay -> UI tab switches,
   * gently attenuates on pause, and smoothly fades out on ending transitions.
   */
  public syncGameState(phase: AppPhase, callPhase: CallPhase, tension: number): void {
    const prevPhase = this.phase;
    this.phase = phase;
    this.callPhase = callPhase;
    this.tension = tension;

    if (phase === 'gameover') {
      this.wantsPlayback = false;
      this.clearDuckReleaseTimer();
      this.effectiveDucking = false;
      this.pauseDecksAfterFade(MUSIC_TIMING_MS.endingFadeOut, true);
      return;
    }

    this.wantsPlayback = true;

    if (prevPhase === 'gameover' && !this.muted) {
      // Returning from ending to a new shift or main menu: fresh smooth fade-in
      void this.tryStartPlayback(MUSIC_TIMING_MS.fadeIn);
      return;
    }

    if (phase === 'paused') {
      // Gently attenuate while paused without restarting or losing position
      this.applyAudioMix(MUSIC_TIMING_MS.pauseAttenuate);
      return;
    }

    if (!this.isPlaying && !this.muted) {
      void this.tryStartPlayback(MUSIC_TIMING_MS.fadeIn);
    } else {
      this.applyAudioMix(MUSIC_TIMING_MS.sceneTransition);
    }
  }

  /**
   * Syncs character voice playback state for Voice-First automatic ducking.
   * Ducks rapidly (220ms) to 10% when speech starts; holds 550ms across short
   * pauses before gradually restoring (1.5s) once dialogue finishes.
   */
  public setDialogueSpeaking(speaking: boolean): void {
    this.dialogueSpeaking = speaking;

    if (speaking) {
      this.clearDuckReleaseTimer();
      if (!this.effectiveDucking) {
        this.effectiveDucking = true;
        this.applyAudioMix(MUSIC_TIMING_MS.duckDown);
      }
      return;
    }

    // Speech stopped/paused/completed: hold briefly so natural pauses don't cause pumping
    if (this.effectiveDucking && this.duckReleaseTimer === null && typeof window !== 'undefined') {
      this.duckReleaseTimer = window.setTimeout(() => {
        this.duckReleaseTimer = null;
        if (!this.dialogueSpeaking) {
          this.effectiveDucking = false;
          this.applyAudioMix(MUSIC_TIMING_MS.duckRestore);
        }
      }, MUSIC_TIMING_MS.duckReleaseHold);
    }
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    writeSessionSettings(this.volume, this.muted);

    if (mute) {
      this.pauseDecksAfterFade(260, false);
    } else if (this.wantsPlayback && this.phase !== 'gameover') {
      void this.tryStartPlayback(550);
    } else {
      this.emit();
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public setVolume(volume: number): void {
    const clamped = clampMusicVolume(volume);
    this.volume = clamped;
    if (clamped > 0 && this.muted) {
      this.muted = false;
    }
    writeSessionSettings(this.volume, this.muted);

    if (this.muted || clamped <= 0) {
      this.applyAudioMix(MUSIC_TIMING_MS.volumeAdjust);
    } else if (this.wantsPlayback && this.phase !== 'gameover' && !this.isPlaying) {
      void this.tryStartPlayback(400);
    } else {
      this.applyAudioMix(MUSIC_TIMING_MS.volumeAdjust);
    }
  }

  /** Diagnostic helper for automated verification (read-only) */
  public getPlayingDeckCount(): number {
    if (!this.decks) return 0;
    return this.decks.filter((d) => !d.audio.paused && !d.audio.ended).length;
  }
}

export const soundtrackEngine = new SoundtrackEngine();
