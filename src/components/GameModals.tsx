import { RotateCcw, Play, Home, ShieldCheck, AlertOctagon } from 'lucide-react';
import { ENDINGS } from '../game/storyData';
import { toPersianDigits } from '../game/engine';
import type { RunSnapshot } from '../game/types';
import type { SoundtrackSnapshot } from '../game/soundtrackEngine';
import { MusicInlineControl } from './MusicControls';

interface PauseModalProps {
  music: SoundtrackSnapshot;
  onToggleMusicMute: () => void;
  onChangeMusicVolume: (volume: number) => void;
  onResume: () => void;
  onRestart: () => void;
  onBackToTitle: () => void;
}

export function PauseModal({
  music,
  onToggleMusicMute,
  onChangeMusicVolume,
  onResume,
  onRestart,
  onBackToTitle,
}: PauseModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-modal-title"
      data-testid="pause-modal"
    >
      <div className="w-full max-w-sm rounded-lg border border-white/15 bg-[#12151b] p-6 space-y-5 shadow-2xl">
        <div className="space-y-1 text-center">
          <h2 id="pause-modal-title" className="text-xl font-bold text-[#f2eee7]">
            توقف موقت شیفت
          </h2>
          <p className="text-xs text-[#9b968e]">
            مکالمه و ساعت مرکز فوریت‌ها متوقف شده است.
          </p>
        </div>

        <MusicInlineControl
          music={music}
          onToggleMute={onToggleMusicMute}
          onChangeVolume={onChangeMusicVolume}
        />

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="w-full min-h-[48px] px-4 py-2.5 rounded-md bg-[#d9943a] hover:bg-[#e5a34a] text-[#111419] font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Play className="w-4 h-4" />
            <span>ادامه شیفت</span>
          </button>

          <button
            type="button"
            onClick={onRestart}
            className="w-full min-h-[46px] px-4 py-2.5 rounded-md border border-white/12 bg-[#1a1f28] hover:bg-[#232a36] text-[#eae6df] font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>شروع مجدد از ابتدا</span>
          </button>

          <button
            type="button"
            onClick={onBackToTitle}
            className="w-full min-h-[46px] px-4 py-2.5 rounded-md border border-white/10 bg-[#141820] hover:bg-[#1d222d] text-[#a8a29a] hover:text-[#eae6df] font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Home className="w-4 h-4" />
            <span>بازگشت به صفحه اصلی</span>
          </button>
        </div>
      </div>
    </div>
  );
}

interface EndingModalProps {
  snapshot: RunSnapshot;
  onRestart: () => void;
  onBackToTitle: () => void;
}

export function EndingModal({
  snapshot,
  onRestart,
  onBackToTitle,
}: EndingModalProps) {
  const details = ENDINGS[snapshot.ending];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/88 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ending-modal-title"
      data-testid="ending-modal"
    >
      <div className="w-full max-w-lg rounded-lg border border-white/15 bg-[#12151b] p-5 sm:p-7 space-y-5 shadow-2xl my-auto">
        {/* Outcome Heading */}
        <div className="space-y-2 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2 text-xs font-semibold">
            {details.isVictory ? (
              <ShieldCheck className="w-4 h-4 text-[#2e8b6e]" />
            ) : (
              <AlertOctagon className="w-4 h-4 text-[#c83e37]" />
            )}
            <span className={details.isVictory ? 'text-[#2e8b6e]' : 'text-[#e0524a]'}>
              {details.badgeLabel} · ساعت {snapshot.finalClock}
            </span>
          </div>
          <h2 id="ending-modal-title" className="text-xl sm:text-2xl font-bold text-[#f2eee7]">
            {details.title}
          </h2>
          <p className="text-xs sm:text-sm text-[#a8a29a]">{details.subtitle}</p>
        </div>

        {/* Story Narrative & Epilogue */}
        <div className="space-y-3 text-sm leading-7 text-[#d7d2ca]">
          <p>{details.narrative}</p>
          <p className="text-xs sm:text-sm text-[#a8a29a] leading-6">{details.epilogue}</p>
        </div>

        {/* Mastery / Progress Metrics */}
        <div className="grid grid-cols-3 gap-2.5 pt-1">
          <div className="rounded-md border border-white/10 bg-[#171b23] p-3 text-center">
            <div className="text-[11px] text-[#9b968e]">امتیاز نهایی</div>
            <div className="text-lg sm:text-xl font-bold text-[#d9943a] font-numeric mt-0.5">
              {toPersianDigits(snapshot.score)}
            </div>
            <div className="text-[10px] text-[#8f8a82] font-numeric">
              بهترین: {toPersianDigits(snapshot.bestScore)}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-[#171b23] p-3 text-center">
            <div className="text-[11px] text-[#9b968e]">تناقض‌های اثبات‌شده</div>
            <div className="text-lg sm:text-xl font-bold text-[#eae6df] font-numeric mt-0.5">
              {toPersianDigits(snapshot.contradictionsFound)} از {toPersianDigits(snapshot.totalContradictions)}
            </div>
          </div>

          <div className="rounded-md border border-white/10 bg-[#171b23] p-3 text-center">
            <div className="text-[11px] text-[#9b968e]">سرنخ‌های پرونده</div>
            <div className="text-lg sm:text-xl font-bold text-[#eae6df] font-numeric mt-0.5">
              {toPersianDigits(snapshot.cluesFound)} از {toPersianDigits(snapshot.totalClues)}
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-[#c5bfb6]">
          رتبه ارزیابی شیفت:{' '}
          <span className="font-bold text-[#f2eee7]">{snapshot.rankTitle}</span>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
          <button
            type="button"
            data-start="true"
            onClick={onRestart}
            className="flex-1 min-h-[48px] px-5 py-2.5 rounded-md bg-[#c83e37] hover:bg-[#d84840] text-white font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" />
            <span>شروع شیفت جدید</span>
          </button>

          <button
            type="button"
            onClick={onBackToTitle}
            className="min-h-[48px] px-5 py-2.5 rounded-md border border-white/12 bg-[#181c24] hover:bg-[#222834] text-[#eae6df] font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
          >
            <Home className="w-4 h-4" />
            <span>صفحه اصلی</span>
          </button>
        </div>
      </div>
    </div>
  );
}
