import { useEffect, useRef, useState } from 'react';
import { Music, VolumeX } from 'lucide-react';
import { toPersianDigits } from '../game/engine';
import type { SoundtrackSnapshot } from '../game/soundtrackEngine';

interface MusicInlineControlProps {
  music: SoundtrackSnapshot;
  onToggleMute: () => void;
  onChangeVolume: (volume: number) => void;
  compact?: boolean;
}

/**
 * Compact, self-contained Persian music mute + volume slider
 * used on the Title Screen and inside the Pause Modal.
 */
export function MusicInlineControl({
  music,
  onToggleMute,
  onChangeVolume,
  compact = false,
}: MusicInlineControlProps) {
  const volumePct = music.muted ? 0 : Math.round(music.volume * 100);

  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-white/12 bg-[#12151b]/90 ${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2'
      }`}
      data-testid="music-inline-control"
      data-music-playing={music.isPlaying ? 'true' : 'false'}
      data-music-ducked={music.ducked ? 'true' : 'false'}
      data-music-gain={music.effectiveGain.toFixed(4)}
    >
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={music.muted ? 'وصل موسیقی متن' : 'قطع موسیقی متن'}
        data-testid="music-mute-toggle"
        className={`flex items-center justify-center gap-1.5 rounded border transition-colors cursor-pointer shrink-0 ${
          compact ? 'min-h-[34px] min-w-[34px] px-2 text-xs' : 'min-h-[38px] min-w-[38px] px-2.5 text-xs'
        } ${
          music.muted || volumePct === 0
            ? 'border-[#c83e37]/45 bg-[#241415] text-[#f2b8b5]'
            : 'border-white/10 bg-[#181c24] hover:bg-[#222834] text-[#eae6df]'
        }`}
      >
        {music.muted || volumePct === 0 ? (
          <VolumeX className="w-3.5 h-3.5 text-[#e0524a] shrink-0" />
        ) : (
          <Music className="w-3.5 h-3.5 text-[#d9943a] shrink-0" />
        )}
        <span className="whitespace-nowrap">موسیقی</span>
      </button>

      <label className="flex items-center gap-2 flex-1 min-w-0">
        <span className="sr-only">تنظیم حجم موسیقی متن</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={volumePct}
          onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
          aria-label="تنظیم حجم موسیقی متن"
          data-testid="music-volume-slider"
          className="w-20 sm:w-24 flex-1 h-1.5 accent-[#d9943a] cursor-pointer"
        />
        <span
          className="font-numeric text-[11px] text-[#c5bfb6] w-8 text-center shrink-0"
          data-testid="music-volume-label"
        >
          {toPersianDigits(volumePct)}٪
        </span>
      </label>
    </div>
  );
}

interface MusicHeaderControlProps {
  music: SoundtrackSnapshot;
  onToggleMute: () => void;
  onChangeVolume: (volume: number) => void;
}

/**
 * Compact header button + floating popover for independent Music volume & mute
 * inside the Dispatch Control Room — adds zero vertical height on mobile viewports.
 */
export function MusicHeaderControl({
  music,
  onToggleMute,
  onChangeVolume,
}: MusicHeaderControlProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const volumePct = music.muted ? 0 : Math.round(music.volume * 100);
  const isSilent = music.muted || volumePct === 0;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="relative"
      data-testid="music-header-control"
      data-music-playing={music.isPlaying ? 'true' : 'false'}
      data-music-ducked={music.ducked ? 'true' : 'false'}
      data-music-gain={music.effectiveGain.toFixed(4)}
      data-music-volume={String(volumePct)}
    >
      <button
        type="button"
        tabIndex={-1}
        onClick={(e) => {
          e.currentTarget.blur();
          setOpen((v) => !v);
        }}
        aria-label="تنظیمات موسیقی متن"
        aria-expanded={open}
        data-testid="music-popover-trigger"
        className={`h-9 sm:h-10 px-2 sm:px-2.5 rounded-md border flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
          isSilent
            ? 'border-[#c83e37]/40 bg-[#221416] text-[#f2b8b5]'
            : open
            ? 'border-[#d9943a]/55 bg-[#1f1a13] text-[#f3dfb8]'
            : 'border-white/10 bg-[#151921] hover:bg-[#1e2430] text-[#eae6df]'
        }`}
      >
        {isSilent ? (
          <VolumeX className="w-4 h-4 text-[#e0524a] shrink-0" />
        ) : (
          <Music className="w-4 h-4 text-[#d9943a] shrink-0" />
        )}
        <span className="hidden md:inline text-xs font-medium whitespace-nowrap">موسیقی</span>
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-2 z-50 w-64 rounded-lg border border-white/15 bg-[#12161d] p-3.5 shadow-2xl shadow-black/70 space-y-3"
          role="dialog"
          aria-label="کنترل موسیقی متن"
          data-testid="music-controls-popover"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#f2eee7]">
              <Music className="w-3.5 h-3.5 text-[#d9943a]" />
              <span>موسیقی متن</span>
            </div>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={isSilent ? 'وصل موسیقی متن' : 'قطع موسیقی متن'}
              data-testid="music-mute-toggle"
              className={`min-h-[32px] px-2.5 py-1 rounded border text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap ${
                isSilent
                  ? 'border-[#c83e37]/45 bg-[#241415] text-[#f2b8b5] hover:bg-[#2f181a]'
                  : 'border-white/12 bg-[#1a1f28] text-[#eae6df] hover:bg-[#242b38]'
              }`}
            >
              {isSilent ? 'وصل موسیقی' : 'قطع موسیقی'}
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-[#a8a29a]">
              <span>حجم صدا</span>
              <span className="font-numeric font-semibold text-[#eae6df]" data-testid="music-volume-label">
                {toPersianDigits(volumePct)}٪
              </span>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volumePct}
              onChange={(e) => onChangeVolume(Number(e.target.value) / 100)}
              aria-label="تنظیم حجم موسیقی متن"
              data-testid="music-volume-slider"
              className="w-full h-2 accent-[#d9943a] cursor-pointer"
            />
          </div>

          <p className="text-[10.5px] leading-5 text-[#8f8a82] border-t border-white/8 pt-2">
            {music.ducked
              ? 'حالت اولویت دیالوگ فعال: موسیقی هنگام صحبت شخصیت‌ها به‌طور خودکار کم شده است.'
              : 'موسیقی متن مستقل از صدای شخصیت‌ها و افکت‌های مرکز کنترل تنظیم می‌شود.'}
          </p>
        </div>
      )}
    </div>
  );
}
