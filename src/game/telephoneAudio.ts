import type { AudioFilterMode } from './types';
import { VOICE_PERSONAS, type TelephoneEffectCue, type VoicePersonaId } from './voiceScript';

export interface ActiveVoiceChain {
  input: GainNode;
  outputGain: GainNode;
  analyser: AnalyserNode;
  setVolume: (vol: number) => void;
  cleanup: () => void;
}

function createSoftClipCurve(drive: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const buffer = new ArrayBuffer(samples * 4);
  const curve = new Float32Array(buffer);
  const k = Math.max(0.5, drive);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * k) / Math.tanh(k);
  }
  return curve;
}

/**
 * Web Audio API telephone & radio processor for:
 * 1) Real-time narrowband bandpass filtering & warmth on pre-generated Persian voice clips
 * 2) Subtle telephone line background static & occasional interference
 * 3) Live dispatch audio filter DSP (revealing basement ventilation fan + wall clock tick)
 * 4) Diegetic line SFX (breath, static burst, signal drop, tape stop click, radio squelch, door rattle)
 */
class TelephoneAudioProcessor {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lineSource: AudioBufferSourceNode | null = null;
  private lineGain: GainNode | null = null;
  private highpass: BiquadFilterNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private fanOsc: OscillatorNode | null = null;
  private fanGain: GainNode | null = null;
  private clockTimer: number | null = null;
  private interferenceTimer: number | null = null;
  private activeFilter: AudioFilterMode = 'raw';
  private muted = false;
  private lineActive = false;

  // Live voice filter nodes so switching dispatch audio filter updates active speech immediately
  private activeVoiceFilterNodes: {
    personaId: VoicePersonaId;
    hp: BiquadFilterNode;
    lp: BiquadFilterNode;
  } | null = null;

  public getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    return this.getAudioContext();
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      data[i] = (b0 + b1 + b2 + white * 0.14) * 0.55;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  public createVoiceChain(personaId: VoicePersonaId, initialVolume: number): ActiveVoiceChain | null {
    const ctx = this.getAudioContext();
    if (!ctx) return null;

    const profile = VOICE_PERSONAS[personaId].telephoneProfile;
    const input = ctx.createGain();
    input.gain.value = 1.0;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = profile.highpassHz;
    hp.Q.value = 0.7;

    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = profile.midBoostHz;
    mid.Q.value = 1.1;
    mid.gain.value = profile.midBoostDb;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = profile.lowpassHz;
    lp.Q.value = 0.7;

    const shaper = ctx.createWaveShaper();
    shaper.curve = createSoftClipCurve(profile.drive);
    shaper.oversample = '2x';

    const outputGain = ctx.createGain();
    outputGain.gain.value = Math.max(0, Math.min(1.4, initialVolume));

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.65;

    input.connect(hp);
    hp.connect(mid);
    mid.connect(lp);
    lp.connect(shaper);
    shaper.connect(outputGain);
    outputGain.connect(analyser);
    analyser.connect(ctx.destination);

    const tracker = { personaId, hp, lp };
    this.activeVoiceFilterNodes = tracker;
    this.applyVoiceFilterTuning();

    return {
      input,
      outputGain,
      analyser,
      setVolume: (vol: number) => {
        const now = ctx.currentTime;
        outputGain.gain.setTargetAtTime(Math.max(0, Math.min(1.4, vol)), now, 0.03);
      },
      cleanup: () => {
        if (this.activeVoiceFilterNodes === tracker) {
          this.activeVoiceFilterNodes = null;
        }
        try {
          input.disconnect();
          hp.disconnect();
          mid.disconnect();
          lp.disconnect();
          shaper.disconnect();
          outputGain.disconnect();
          analyser.disconnect();
        } catch {
          // Ignore teardown errors
        }
      },
    };
  }

  private applyVoiceFilterTuning(): void {
    if (!this.ctx || !this.activeVoiceFilterNodes) return;
    const { personaId, hp, lp } = this.activeVoiceFilterNodes;
    const base = VOICE_PERSONAS[personaId].telephoneProfile;
    const now = this.ctx.currentTime;

    // Only modulate Sara's incoming emergency line with the dispatch audio analyzer filter
    if (personaId !== 'sara_tape') {
      hp.frequency.setTargetAtTime(base.highpassHz, now, 0.08);
      lp.frequency.setTargetAtTime(base.lowpassHz, now, 0.08);
      return;
    }

    if (this.activeFilter === 'raw') {
      hp.frequency.setTargetAtTime(base.highpassHz, now, 0.08);
      lp.frequency.setTargetAtTime(base.lowpassHz, now, 0.08);
    } else if (this.activeFilter === 'remove_rain') {
      hp.frequency.setTargetAtTime(280, now, 0.08);
      lp.frequency.setTargetAtTime(2350, now, 0.08);
    } else if (this.activeFilter === 'boost_low') {
      hp.frequency.setTargetAtTime(140, now, 0.08);
      lp.frequency.setTargetAtTime(1650, now, 0.08);
    } else if (this.activeFilter === 'isolate_room') {
      hp.frequency.setTargetAtTime(180, now, 0.08);
      lp.frequency.setTargetAtTime(2100, now, 0.08);
    }
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (mute) {
      this.stopLineBed();
    } else if (this.lineActive) {
      this.startLineBed(this.activeFilter);
    }
  }

  public setFilterMode(mode: AudioFilterMode): void {
    this.activeFilter = mode;
    this.applyVoiceFilterTuning();
    if (!this.ctx || !this.lineActive || this.muted) return;
    this.applyFilterTuning();
  }

  private applyFilterTuning(): void {
    if (!this.ctx || !this.highpass || !this.lowpass || !this.lineGain || !this.fanGain) return;
    const now = this.ctx.currentTime;

    if (this.activeFilter === 'raw') {
      this.highpass.frequency.setTargetAtTime(340, now, 0.12);
      this.lowpass.frequency.setTargetAtTime(3100, now, 0.12);
      this.lineGain.gain.setTargetAtTime(0.015, now, 0.12);
      this.fanGain.gain.setTargetAtTime(0.004, now, 0.15);
      this.stopClockTick();
    } else if (this.activeFilter === 'remove_rain') {
      this.highpass.frequency.setTargetAtTime(280, now, 0.12);
      this.lowpass.frequency.setTargetAtTime(1650, now, 0.12);
      this.lineGain.gain.setTargetAtTime(0.008, now, 0.12);
      this.fanGain.gain.setTargetAtTime(0.01, now, 0.15);
      this.stopClockTick();
    } else if (this.activeFilter === 'boost_low') {
      this.highpass.frequency.setTargetAtTime(75, now, 0.12);
      this.lowpass.frequency.setTargetAtTime(620, now, 0.12);
      this.lineGain.gain.setTargetAtTime(0.012, now, 0.12);
      this.fanGain.gain.setTargetAtTime(0.026, now, 0.15);
      this.stopClockTick();
    } else if (this.activeFilter === 'isolate_room') {
      this.highpass.frequency.setTargetAtTime(90, now, 0.12);
      this.lowpass.frequency.setTargetAtTime(1100, now, 0.12);
      this.lineGain.gain.setTargetAtTime(0.007, now, 0.12);
      this.fanGain.gain.setTargetAtTime(0.022, now, 0.15);
      this.startClockTick();
    }
  }

  public startLineBed(filterMode: AudioFilterMode = 'raw'): void {
    this.lineActive = true;
    this.activeFilter = filterMode;
    if (this.muted || this.lineSource) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer(ctx);
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 340;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3100;

    const gain = ctx.createGain();
    gain.gain.value = 0.001;

    src.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);
    src.start();

    const fanOsc = ctx.createOscillator();
    const fanFilter = ctx.createBiquadFilter();
    const fanGain = ctx.createGain();
    fanOsc.type = 'sawtooth';
    fanOsc.frequency.value = 108;
    fanFilter.type = 'bandpass';
    fanFilter.frequency.value = 112;
    fanFilter.Q.value = 2.4;
    fanGain.gain.value = 0.004;

    fanOsc.connect(fanFilter);
    fanFilter.connect(fanGain);
    fanGain.connect(ctx.destination);
    fanOsc.start();

    this.lineSource = src;
    this.highpass = hp;
    this.lowpass = lp;
    this.lineGain = gain;
    this.fanOsc = fanOsc;
    this.fanGain = fanGain;

    this.applyFilterTuning();
    this.startInterferenceScheduler();
  }

  public stopLineBed(): void {
    this.lineActive = false;
    this.stopClockTick();
    this.stopInterferenceScheduler();

    if (this.lineSource) {
      try {
        this.lineSource.stop();
        this.lineSource.disconnect();
      } catch {
        // Ignore teardown errors
      }
      this.lineSource = null;
    }
    if (this.fanOsc) {
      try {
        this.fanOsc.stop();
        this.fanOsc.disconnect();
      } catch {
        // Ignore teardown errors
      }
      this.fanOsc = null;
    }
    this.highpass = null;
    this.lowpass = null;
    this.lineGain = null;
    this.fanGain = null;
  }

  private startClockTick(): void {
    if (this.clockTimer !== null || typeof window === 'undefined') return;
    let toggle = false;
    this.clockTimer = window.setInterval(() => {
      if (this.muted || !this.lineActive) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = toggle ? 1180 : 940;
      toggle = !toggle;

      gain.gain.setValueAtTime(0.02, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.035);
    }, 1000);
  }

  private stopClockTick(): void {
    if (this.clockTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.clockTimer);
      this.clockTimer = null;
    }
  }

  private startInterferenceScheduler(): void {
    if (this.interferenceTimer !== null || typeof window === 'undefined') return;
    this.interferenceTimer = window.setInterval(() => {
      if (this.muted || !this.lineActive) return;
      if (Math.random() < 0.3) {
        this.playEffect('static_burst', 0.38);
      }
    }, 7000);
  }

  private stopInterferenceScheduler(): void {
    if (this.interferenceTimer !== null && typeof window !== 'undefined') {
      window.clearInterval(this.interferenceTimer);
      this.interferenceTimer = null;
    }
  }

  public playEffect(effect: TelephoneEffectCue, intensity = 0.7): void {
    if (effect === 'none' || this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (effect === 'static_burst' || effect === 'signal_drop') {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = effect === 'signal_drop' ? 1450 : 2100;
      bp.Q.value = 1.6;
      const gain = ctx.createGain();
      const dur = effect === 'signal_drop' ? 0.22 : 0.13;

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.038 * intensity, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      src.start(now, Math.random() * 1.5, dur + 0.02);
      return;
    }

    if (effect === 'breath') {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(980, now);
      bp.frequency.linearRampToValueAtTime(720, now + 0.26);
      bp.Q.value = 3.2;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.014 * intensity, now + 0.09);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

      src.connect(bp);
      bp.connect(gain);
      gain.connect(ctx.destination);
      src.start(now, Math.random(), 0.3);
      return;
    }

    if (effect === 'tape_click') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.055);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.065);
      return;
    }

    if (effect === 'radio_squelch') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1680, now);
      osc.frequency.setValueAtTime(1320, now + 0.045);
      gain.gain.setValueAtTime(0.036, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
      this.playEffect('static_burst', 0.55);
      return;
    }

    if (effect === 'door_rattle') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(92, now);
      osc.frequency.linearRampToValueAtTime(64, now + 0.28);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.32);
    }
  }
}

export const telephoneAudio = new TelephoneAudioProcessor();
