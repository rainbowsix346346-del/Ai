import { useEffect, useRef } from 'react';
import type { AudioFilterMode, CallPhase } from '../game/types';

interface OscilloscopeCanvasProps {
  callPhase: CallPhase;
  tension: number;
  audioFilter: AudioFilterMode;
  paused: boolean;
  pulseTrigger: number;
  voiceEnergy?: number;
}

export function OscilloscopeCanvas({
  callPhase,
  tension,
  audioFilter,
  paused,
  pulseTrigger,
  voiceEnergy = 0,
}: OscilloscopeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    callPhase,
    tension,
    audioFilter,
    paused,
    burstEnergy: 0,
    voiceEnergy,
  });

  useEffect(() => {
    stateRef.current.callPhase = callPhase;
    stateRef.current.tension = tension;
    stateRef.current.audioFilter = audioFilter;
    stateRef.current.paused = paused;
    stateRef.current.voiceEnergy = voiceEnergy;
  }, [callPhase, tension, audioFilter, paused, voiceEnergy]);

  useEffect(() => {
    stateRef.current.burstEnergy = 1.0;
  }, [pulseTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();
    let phase = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const draw = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);
      lastTime = now;

      const s = stateRef.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const midY = height / 2;

      if (!s.paused) {
        phase += dt * (s.callPhase === 'ringing' ? 9.0 : 4.2 + (s.tension / 100) * 3.5);
        s.burstEnergy = Math.max(0, s.burstEnergy - dt * 1.15);
      }

      // Matte oscilloscope screen background
      ctx.fillStyle = '#0b0e12';
      ctx.fillRect(0, 0, width, height);

      // Subtle calibration grid
      ctx.strokeStyle = 'rgba(234, 230, 223, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const cols = 10;
      for (let i = 1; i < cols; i++) {
        const x = (width / cols) * i;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();

      // Determine line color based on state and filter
      let strokeColor = '#d9943a'; // Amber tungsten default
      if (s.callPhase === 'ringing') {
        strokeColor = '#c83e37';
      } else if (s.callPhase === 'ended') {
        strokeColor = '#646870';
      } else if (s.audioFilter === 'isolate_room') {
        strokeColor = '#38a37f';
      } else if (s.tension >= 70) {
        strokeColor = '#d64c44';
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.75;
      ctx.beginPath();

      const samples = Math.max(80, Math.floor(width / 2));
      for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const x = t * width;
        const edgeFade = Math.sin(t * Math.PI);
        let amp = 0;

        if (s.callPhase === 'ended') {
          amp = 0.6 * Math.sin(t * 20 + phase * 0.5);
        } else if (s.callPhase === 'ringing') {
          const ringGate = Math.sin(phase * 0.35) > 0.15 ? 1 : 0.08;
          amp =
            ringGate *
            edgeFade *
            (height * 0.32) *
            Math.sin(t * 36 + phase * 2.1);
        } else {
          // Active voice waveform + burst + tension static
          const baseVoice =
            Math.sin(t * 22 + phase) * 0.5 +
            Math.sin(t * 47 - phase * 1.4) * 0.28 +
            Math.sin(t * 89 + phase * 2.2) * 0.16;

          const noiseAmt =
            s.audioFilter === 'remove_rain'
              ? 0.04
              : s.audioFilter === 'isolate_room'
              ? 0.08
              : 0.14 + (s.tension / 100) * 0.22;

          const pseudoStatic =
            Math.sin(i * 12.9898 + phase * 17.3) * 43758.5453;
          const jitter = ((pseudoStatic - Math.floor(pseudoStatic)) * 2 - 1) * noiseAmt;

          const speechMod =
            s.voiceEnergy > 0
              ? s.voiceEnergy * (0.55 + 0.45 * Math.sin(phase * 3.1 + t * 5))
              : 0;

          const envelope =
            (0.22 + speechMod * 0.45 + s.burstEnergy * 0.35 + (s.tension / 100) * 0.16) *
            edgeFade *
            (height * 0.4);

          // If isolate_room filter is active, reveal rhythmic basement fan hum + clock tick spike
          let hiddenHum = 0;
          if (s.audioFilter === 'isolate_room') {
            hiddenHum = Math.sin(t * 14 + phase * 0.8) * (height * 0.18) * edgeFade;
          }

          amp = (baseVoice + jitter) * envelope + hiddenHum;
        }

        const y = midY + amp;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.stroke();
      rafId = window.requestAnimationFrame(draw);
    };

    rafId = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      className="relative w-full h-[34px] sm:h-20 rounded-md overflow-hidden border border-white/10 bg-[#0b0e12]"
      data-testid="oscilloscope-monitor"
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        aria-label="نمودار زنده موج صوتی تماس"
      />
      <div className="pointer-events-none absolute inset-x-2 top-0.5 sm:top-1 flex items-center justify-between text-[9px] sm:text-[11px] leading-tight text-[#9b968e]">
        <span className="truncate">
          {callPhase === 'ringing'
            ? 'سیگنال زنگ ورودی'
            : callPhase === 'ended'
            ? 'خط قطع شد'
            : audioFilter === 'isolate_room'
            ? 'فیلتر محیط: صدای فن زیرزمین'
            : audioFilter === 'remove_rain'
            ? 'فیلتر حذف نویز فعال'
            : 'طیف صوتی خط ۱'}
        </span>
        <span className="font-numeric shrink-0 mr-2">
          {callPhase === 'active' ? 'در حال ضبط' : callPhase === 'ringing' ? 'در انتظار پاسخ' : 'توقف ضبط'}
        </span>
      </div>
    </div>
  );
}
