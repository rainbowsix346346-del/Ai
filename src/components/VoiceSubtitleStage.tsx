import { FastForward, Pause, Play, RotateCcw, Volume1, Volume2, VolumeX } from 'lucide-react';
import { toPersianDigits } from '../game/engine';
import type { VoicePlaybackSnapshot } from '../game/voiceEngine';

interface VoiceSubtitleStageProps {
  voice: VoicePlaybackSnapshot;
  onTogglePlayPause: () => void;
  onReplay: () => void;
  onSkip: () => void;
  onToggleVoiceMute: () => void;
  onChangeVoiceVolume: (volume: number) => void;
}

export function VoiceSubtitleStage({
  voice,
  onTogglePlayPause,
  onReplay,
  onSkip,
  onToggleVoiceMute,
  onChangeVoiceVolume,
}: VoiceSubtitleStageProps) {
  if (voice.status === 'idle' || !voice.activeCue) {
    return null;
  }

  const isSpeaking = voice.status === 'speaking';
  const isPaused = voice.status === 'paused';
  const isCompleted = voice.status === 'completed';
  const progressPct =
    voice.totalCues > 0
      ? Math.round(((isCompleted ? voice.totalCues : voice.cueIndex + 1) / voice.totalCues) * 100)
      : 0;

  const isImpostorVoice = voice.personaId === 'amirhossein_real';
  const isRadioVoice = voice.personaId === 'patrol_radio';
  const volumePct = voice.voiceMuted ? 0 : Math.round(voice.voiceVolume * 100);

  return (
    <div
      className={`rounded-md border px-2 py-1.5 sm:p-3 space-y-1 sm:space-y-2 transition-colors ${
        isImpostorVoice
          ? 'border-[#c83e37]/40 bg-[#181214]'
          : isRadioVoice
          ? 'border-[#2e8b6e]/40 bg-[#101a17]'
          : 'border-[#d9943a]/30 bg-[#161411]'
      }`}
      data-testid="voice-subtitle-stage"
      aria-live="polite"
    >
      {/* Top Row: Persona Name + Emotional Acting Cue + Phrase Progress */}
      <div className="flex items-center justify-between gap-2 text-[10px] sm:text-[11px] leading-tight">
        <div className="flex items-center gap-1.5 min-w-0 truncate">
          <span
            className={`font-semibold whitespace-nowrap ${
              isImpostorVoice
                ? 'text-[#f08b85]'
                : isRadioVoice
                ? 'text-[#6bd1ae]'
                : 'text-[#ebb96e]'
            }`}
          >
            {voice.personaName}
          </span>
          <span className="text-white/25" aria-hidden="true">
            ·
          </span>
          <span className="text-[#a8a29a] truncate">{voice.activeCue.emotionLabel}</span>
        </div>

        <span className="font-numeric text-[#9b968e] whitespace-nowrap shrink-0">
          {toPersianDigits(voice.cueIndex + 1)} از {toPersianDigits(voice.totalCues)}
        </span>
      </div>

      {/* Synchronized Live Persian Subtitle */}
      <p
        className="text-[11.5px] sm:text-sm leading-[1.45] sm:leading-6 text-[#f5f0e8] font-medium line-clamp-2 sm:line-clamp-none"
        data-testid="active-subtitle-text"
      >
        «{voice.activeCue.text}»
      </p>

      {/* Hairline Phrase Progress Bar */}
      <div className="h-[3px] sm:h-1 w-full rounded-full bg-white/8 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isImpostorVoice
              ? 'bg-[#c83e37]'
              : isRadioVoice
              ? 'bg-[#2e8b6e]'
              : 'bg-[#d9943a]'
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Voice Playback & Volume Controls (Compact single row on mobile & desktop) */}
      <div className="flex items-center justify-between gap-1 pt-0.5">
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-0">
          <button
            type="button"
            onClick={onTogglePlayPause}
            aria-label={isSpeaking ? 'توقف موقت صدای دیالوگ' : 'پخش یا ادامه صدای دیالوگ'}
            className="min-h-[30px] sm:min-h-[38px] px-2 sm:px-2.5 py-0.5 sm:py-1 rounded border border-white/12 bg-[#1a1f28] hover:bg-[#232a36] text-[#eae6df] text-[11px] sm:text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
          >
            {isSpeaking ? (
              <>
                <Pause className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#d9943a] shrink-0" />
                <span>توقف</span>
              </>
            ) : isPaused ? (
              <>
                <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#2e8b6e] shrink-0" />
                <span>ادامه</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#d9943a] shrink-0" />
                <span>پخش</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onReplay}
            aria-label="پخش مجدد این مکالمه از ابتدا"
            className="min-h-[30px] min-w-[30px] sm:min-h-[38px] sm:min-w-[38px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-white/10 bg-[#151921] hover:bg-[#1e2430] text-[#c5bfb6] hover:text-[#eae6df] text-[11px] sm:text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span className="hidden sm:inline">پخش مجدد</span>
          </button>

          {isSpeaking && (
            <button
              type="button"
              onClick={onSkip}
              aria-label="رد کردن به پایان جمله فعلی"
              className="min-h-[30px] min-w-[30px] sm:min-h-[38px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border border-white/10 bg-[#151921] hover:bg-[#1e2430] text-[#a8a29a] hover:text-[#eae6df] text-[11px] sm:text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap"
            >
              <FastForward className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span className="hidden sm:inline">رد کردن</span>
            </button>
          )}
        </div>

        {/* Mute Toggle + Volume Slider */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleVoiceMute}
            aria-label={voice.voiceMuted ? 'وصل صدای گوینده' : 'قطع صدای گوینده'}
            className={`min-h-[30px] min-w-[30px] sm:min-h-[38px] px-1.5 sm:px-2 py-0.5 sm:py-1 rounded border text-[11px] sm:text-xs font-medium flex items-center justify-center gap-1 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              voice.voiceMuted
                ? 'border-[#c83e37]/45 bg-[#241415] text-[#f2b8b5]'
                : 'border-white/10 bg-[#151921] hover:bg-[#1e2430] text-[#d7d2ca]'
            }`}
          >
            {voice.voiceMuted || volumePct === 0 ? (
              <VolumeX className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#e0524a] shrink-0" />
            ) : volumePct < 50 ? (
              <Volume1 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#d9943a] shrink-0" />
            ) : (
              <Volume2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#d9943a] shrink-0" />
            )}
            <span className="hidden sm:inline">
              {voice.voiceMuted ? 'بی‌صدا' : 'صدا'}
            </span>
          </button>

          <label className="flex items-center gap-1 sm:gap-1.5 px-1.5 py-0.5 sm:py-1 rounded border border-white/8 bg-[#12161d] min-h-[30px] sm:min-h-[38px]">
            <span className="sr-only">تنظیم حجم صدای گوینده</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volumePct}
              onChange={(e) => onChangeVoiceVolume(Number(e.target.value) / 100)}
              aria-label="تنظیم حجم صدای گوینده"
              className="w-14 sm:w-20 h-1.5 accent-[#d9943a] cursor-pointer"
            />
            <span
              className="font-numeric text-[10px] sm:text-[11px] text-[#a8a29a] w-6 sm:w-7 text-center shrink-0"
              data-testid="voice-volume-label"
            >
              {toPersianDigits(volumePct)}٪
            </span>
          </label>
        </div>
      </div>

      {/* Subtle status line on sm+ screens */}
      <div className="hidden sm:flex text-[10px] text-[#858079] items-center justify-between gap-2">
        <span>صدای فارسی خط اضطراری · فیلتر تلفنی فعال</span>
        <span>{voice.personaRole}</span>
      </div>
    </div>
  );
}
