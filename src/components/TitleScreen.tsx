import { Volume2, VolumeX } from 'lucide-react';
import { ASSETS } from '../game/storyData';
import { toPersianDigits } from '../game/engine';
import type { SoundtrackSnapshot } from '../game/soundtrackEngine';
import { MusicInlineControl } from './MusicControls';

interface TitleScreenProps {
  bestScore: number;
  sfxMuted: boolean;
  music: SoundtrackSnapshot;
  onStart: () => void;
  onToggleSfxMute: () => void;
  onToggleMusicMute: () => void;
  onChangeMusicVolume: (volume: number) => void;
}

export function TitleScreen({
  bestScore,
  sfxMuted,
  music,
  onStart,
  onToggleSfxMute,
  onToggleMusicMute,
  onChangeMusicVolume,
}: TitleScreenProps) {
  return (
    <main
      className="relative min-h-dvh w-full overflow-hidden bg-[#0a0c0f] flex flex-col justify-between"
      data-testid="title-screen"
    >
      {/* Illustrated Key-Art Backdrop */}
      <div className="absolute inset-0">
        <img
          src={ASSETS.titleDispatchRoom}
          alt="اتاق کنترل مرکز فوریت‌های اضطراری در نیمه‌شب بارانی"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-left md:object-center opacity-75"
        />
        {/* Measured scrim keeping calm negative space readable on right (RTL) */}
        <div className="absolute inset-0 bg-gradient-to-l from-[#0a0c0f]/95 via-[#0a0c0f]/70 to-[#0a0c0f]/30" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0a0c0f] via-transparent to-[#0a0c0f]/60" />
      </div>

      {/* Top subtle utility strip */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-10 pt-4 sm:pt-7">
        <div className="text-xs sm:text-sm text-[#a8a29a] flex items-center gap-2">
          <span>مرکز فوریت‌های بخش شمالی</span>
          <span aria-hidden="true">·</span>
          <span className="font-numeric">ساعت ۰۲:۴۷ بامداد</span>
        </div>

        <div className="flex items-center gap-2">
          <MusicInlineControl
            music={music}
            onToggleMute={onToggleMusicMute}
            onChangeVolume={onChangeMusicVolume}
            compact
          />

          <button
            type="button"
            onClick={onToggleSfxMute}
            aria-label={sfxMuted ? 'فعال کردن افکت‌های صوتی' : 'قطع افکت‌های صوتی'}
            data-testid="sfx-mute-toggle"
            className="min-h-[44px] min-w-[44px] px-3 rounded-md border border-white/12 bg-[#12151b]/90 hover:bg-[#1a1f28] text-[#eae6df] flex items-center justify-center gap-2 text-xs transition-colors cursor-pointer"
          >
            {sfxMuted ? (
              <VolumeX className="w-4 h-4 text-[#c83e37]" />
            ) : (
              <Volume2 className="w-4 h-4 text-[#d9943a]" />
            )}
            <span className="hidden sm:inline whitespace-nowrap">
              {sfxMuted ? 'افکت قطع' : 'افکت فعال'}
            </span>
          </button>
        </div>
      </div>

      {/* Main focal title lockup anchored in calm right-side negative space (RTL) */}
      <section className="relative z-10 w-full max-w-6xl mx-auto px-5 sm:px-10 py-8 flex flex-col items-start justify-center flex-1">
        <div className="w-full max-w-lg space-y-6">
          {/* Bespoke inline SVG Dispatch Plaque Title Lockup */}
          <div className="space-y-3">
            <svg
              viewBox="0 0 460 112"
              direction="ltr"
              className="w-full max-w-[430px] h-auto"
              role="img"
              aria-label="THE LAST CALL — آخرین تماس"
            >
              <defs>
                <linearGradient id="metalRule" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#d9943a" stopOpacity="0.9" />
                  <stop offset="65%" stopColor="#eae6df" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#eae6df" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Diegetic console hairline frame */}
              <path
                d="M 2 18 L 2 4 L 22 4 M 438 4 L 458 4 L 458 18"
                fill="none"
                stroke="#d9943a"
                strokeWidth="1.5"
                strokeOpacity="0.65"
              />
              <path
                d="M 2 94 L 2 108 L 22 108 M 438 108 L 458 108 L 458 94"
                fill="none"
                stroke="#eae6df"
                strokeWidth="1.2"
                strokeOpacity="0.25"
              />

              {/* Subtle engraved radio wave emblem */}
              <path
                d="M 18 54 L 38 54 L 45 37 L 54 71 L 63 45 L 70 60 L 79 54 L 94 54"
                fill="none"
                stroke="#c83e37"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Game Title (ONLY English allowed per requirement) */}
              <text
                x="442"
                y="62"
                textAnchor="end"
                fill="#f2eee7"
                fontSize="36"
                fontWeight="800"
                letterSpacing="3"
                fontFamily="JetBrains Mono, ui-monospace, monospace"
              >
                THE LAST CALL
              </text>

              <rect x="18" y="82" width="424" height="1.5" fill="url(#metalRule)" />
            </svg>

            <h1 className="text-2xl sm:text-3xl font-bold text-[#eae6df] tracking-tight">
              آخرین تماس
            </h1>
          </div>

          <p className="text-sm sm:text-base leading-7 text-[#c5bfb6] max-w-md">
            ساعت از دو نیمه‌شب گذشته و طوفان تمام خطوط شمال شهر را قطع کرده است. تنها اپراتور شیفت شب در مرکز فوریت‌ها شما هستید — تا وقتی خط اضطراری شماره یک به صدا درمی‌آید و صدایی آشنا اما پر از تناقض درخواست کمک می‌کند.
          </p>

          {/* Primary Start CTA + Optional Best Score readout */}
          <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <button
              type="button"
              data-start="true"
              onClick={onStart}
              className="min-h-[52px] px-7 py-3 rounded-md bg-[#c83e37] hover:bg-[#d84840] active:scale-[0.99] text-[#faf8f5] font-semibold text-base transition-all cursor-pointer flex items-center justify-center gap-3 shadow-lg shadow-black/40 whitespace-nowrap"
            >
              <span>شروع شیفت شب</span>
            </button>

            {bestScore > 0 && (
              <div className="text-sm text-[#a8a29a] flex items-center gap-2 px-1">
                <span>بالاترین امتیاز ثبت‌شده:</span>
                <span className="font-numeric font-bold text-[#d9943a]">
                  {toPersianDigits(bestScore)}
                </span>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Single flat borderless control hint line in bottom safe margin */}
      <footer className="relative z-10 px-5 sm:px-10 pb-5 sm:pb-7">
        <p className="text-xs text-[#8f8a82] leading-6">
          لمس یا کلیک برای پاسخ و بررسی ابزارها · کلیدهای ۱ تا ۴ انتخاب دیالوگ · کلید توقف برای مکث · کلید صدا برای بی‌صدا
        </p>
      </footer>
    </main>
  );
}
