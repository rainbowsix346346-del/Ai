import { useState } from 'react';
import {
  Radio,
  FolderOpen,
  SlidersHorizontal,
  Camera,
  Lock,
  Unlock,
  ShieldCheck,
  AlertTriangle,
  Car,
} from 'lucide-react';
import {
  ARCHIVE_RECORDS,
  ASSETS,
  SIGNAL_TARGET_FREQ,
  SIGNAL_TOLERANCE,
} from '../game/storyData';
import { toPersianDigits } from '../game/engine';
import type {
  AudioFilterMode,
  GameState,
  PatrolOrder,
  ToolSubTab,
} from '../game/types';

interface DispatchToolsPanelProps {
  state: GameState;
  activeSubTab: ToolSubTab;
  onChangeSubTab: (tab: ToolSubTab) => void;
  onChangeFrequency: (freq: number) => void;
  onLockSignal: () => void;
  onInspectArchive: (recordId: string) => void;
  onApplyAudioFilter: (mode: AudioFilterMode) => void;
  onInspectCamera: (cameraId: 'rear' | 'villa') => void;
  onSetPatrolOrder: (order: PatrolOrder) => void;
  onToggleDoorLock: () => void;
}

const AUDIO_FILTER_OPTIONS: Array<{
  mode: AudioFilterMode;
  label: string;
  desc: string;
  readout: string;
}> = [
  {
    mode: 'raw',
    label: 'صدای خام خط',
    desc: 'دریافت مستقیم بدون پردازش',
    readout: 'صدای نفس‌نفس زدن و نویز خفیف روی خط شنیده می‌شود.',
  },
  {
    mode: 'remove_rain',
    label: 'حذف نویز باران',
    desc: 'فیلتر فرکانس‌های بالای جوی',
    readout: 'هیچ فرکانس بارانی برای حذف وجود ندارد — خط تماس در فضای بسته است!',
  },
  {
    mode: 'boost_low',
    label: 'تقویت بم محیط',
    desc: 'تشدید صداهای زیر ۱۶۰ هرتز',
    readout: 'یک وزوز الکتریکی یکنواخت شبیه دستگاه تهویه صنعتی در پس‌زمینه شنیده می‌شود.',
  },
  {
    mode: 'isolate_room',
    label: 'ایزوله‌سازی پس‌زمینه',
    desc: 'حذف صدای گوینده و کشف محیط واقعی',
    readout:
      'کشف قطعی: صدای فن تهویه زیرزمین همین مرکز فوریت‌ها و تیک‌تاک ساعت دیواری سالن در پس‌زمینه خط ثبت شد!',
  },
];

export function DispatchToolsPanel({
  state,
  activeSubTab,
  onChangeSubTab,
  onChangeFrequency,
  onLockSignal,
  onInspectArchive,
  onApplyAudioFilter,
  onInspectCamera,
  onSetPatrolOrder,
  onToggleDoorLock,
}: DispatchToolsPanelProps) {
  const [selectedRecordId, setSelectedRecordId] = useState<string>('rec_402');
  const [selectedCamera, setSelectedCamera] = useState<'rear' | 'villa'>('rear');

  const signalProximity = Math.max(
    0,
    Math.min(100, Math.round(100 - Math.abs(state.signalFrequency - SIGNAL_TARGET_FREQ) * 14))
  );
  const isWithinLockWindow =
    Math.abs(state.signalFrequency - SIGNAL_TARGET_FREQ) <= SIGNAL_TOLERANCE;

  const selectedRecord =
    ARCHIVE_RECORDS.find((r) => r.id === selectedRecordId) ?? ARCHIVE_RECORDS[0];
  const activeFilterMeta =
    AUDIO_FILTER_OPTIONS.find((f) => f.mode === state.activeAudioFilter) ??
    AUDIO_FILTER_OPTIONS[0];

  return (
    <section
      className="flex flex-col h-full min-h-0 bg-[#12151b] border border-white/10 rounded-lg overflow-hidden"
      aria-label="ابزارهای بررسی مرکز دیسپچ"
    >
      {/* Tool Navigation Tabs */}
      <div
        className="grid grid-cols-4 border-b border-white/10 bg-[#151921] shrink-0"
        role="tablist"
        aria-label="بخش‌های میز کنترل"
      >
        {(
          [
            { id: 'signal', label: 'ردیاب', icon: Radio, done: state.signalTraced },
            {
              id: 'archive',
              label: 'بایگانی',
              icon: FolderOpen,
              done: state.discoveredClueIds.includes('fact_archive'),
            },
            { id: 'audio', label: 'صدا', icon: SlidersHorizontal, done: state.audioAnalyzed },
            {
              id: 'cctv',
              label: 'دوربین',
              icon: Camera,
              done: state.discoveredClueIds.includes('fact_cctv'),
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChangeSubTab(tab.id)}
              className={`min-h-[46px] px-2 py-2 text-xs font-medium flex items-center justify-center gap-1.5 border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'border-[#d9943a] text-[#f3e5cc] bg-[#1a1f28]'
                  : 'border-transparent text-[#9b968e] hover:text-[#eae6df] hover:bg-white/[0.03]'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              {tab.done && (
                <span className="text-[#2e8b6e] text-[10px]" aria-label="بررسی شده">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tool Body */}
      <div className="flex-1 min-h-0 overflow-y-auto console-scroll p-4 space-y-4">
        {/* 1. SIGNAL TRACER */}
        {activeSubTab === 'signal' && (
          <div className="space-y-4" data-testid="tool-signal">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#eae6df]">ردیابی دکل مخابراتی</h3>
              <span className="text-xs text-[#9b968e] font-numeric">
                قدرت قفل: {toPersianDigits(signalProximity)}٪
              </span>
            </div>

            {/* Tactical Sector Map SVG */}
            <div className="rounded-md border border-white/10 bg-[#0b0e12] p-3">
              <svg
                viewBox="0 0 360 190"
                direction="ltr"
                className="w-full h-auto block"
                role="img"
                aria-label="نقشه راداری ردیابی سیگنال دکل مخابراتی"
              >
                {/* Grid */}
                <g stroke="rgba(234,230,223,0.08)" strokeWidth="1">
                  <line x1="0" y1="48" x2="360" y2="48" />
                  <line x1="0" y1="95" x2="360" y2="95" />
                  <line x1="0" y1="142" x2="360" y2="142" />
                  <line x1="90" y1="0" x2="90" y2="190" />
                  <line x1="180" y1="0" x2="180" y2="190" />
                  <line x1="270" y1="0" x2="270" y2="190" />
                </g>

                {/* Mountain road path */}
                <path
                  d="M 74 142 Q 140 110 190 88 T 288 46"
                  fill="none"
                  stroke="#3b4352"
                  strokeWidth="2.5"
                  strokeDasharray="6 4"
                />

                {/* Villa 14 marker (claimed) */}
                <circle cx="288" cy="46" r="6" fill="#171b23" stroke="#9b968e" strokeWidth="1.5" />
                <text
                  x="275"
                  y="24"
                  textAnchor="middle"
                  direction="rtl"
                  fill="#b8b2a9"
                  fontSize="11"
                  fontFamily="Vazirmatn, sans-serif"
                >
                  ویلای ۱۴ (۱۲ کیلومتری)
                </text>

                {/* Dispatch Center marker (actual) */}
                <circle
                  cx="74"
                  cy="142"
                  r={state.signalTraced ? '20' : '12'}
                  fill={state.signalTraced ? 'rgba(200, 62, 55, 0.2)' : 'rgba(217, 148, 58, 0.14)'}
                  stroke={state.signalTraced ? '#c83e37' : '#d9943a'}
                  strokeWidth="1.5"
                />
                <circle cx="74" cy="142" r="5" fill={state.signalTraced ? '#e0524a' : '#d9943a'} />
                <text
                  x="112"
                  y="178"
                  textAnchor="middle"
                  direction="rtl"
                  fill="#eae6df"
                  fontSize="11"
                  fontFamily="Vazirmatn, sans-serif"
                >
                  مرکز دیسپچ ۴ (موقعیت شما)
                </text>

                {/* Signal ping line once traced */}
                {state.signalTraced && (
                  <>
                    <circle cx="83" cy="133" r="4" fill="#e0524a" />
                    <line
                      x1="87"
                      y1="130"
                      x2="132"
                      y2="114"
                      stroke="#f0756e"
                      strokeWidth="1"
                      strokeDasharray="2 2"
                    />
                    <text
                      x="202"
                      y="114"
                      textAnchor="middle"
                      direction="rtl"
                      fill="#f0756e"
                      fontSize="11.5"
                      fontWeight="700"
                      fontFamily="Vazirmatn, sans-serif"
                    >
                      منبع واقعی: ۸۵ متر از مرکز!
                    </text>
                  </>
                )}
              </svg>
            </div>

            {/* Interactive Frequency Tuner */}
            <div className="space-y-3 rounded-md border border-white/10 bg-[#161a22] p-3.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="signal-freq-slider" className="text-[#c5bfb6] font-medium">
                  تنظیم فرکانس دکل (هدف: ۹۴.۶ مگاهرتز)
                </label>
                <span className="font-numeric font-bold text-[#d9943a]">
                  {toPersianDigits(state.signalFrequency.toFixed(1))} مگاهرتز
                </span>
              </div>

              <input
                id="signal-freq-slider"
                type="range"
                min={88.0}
                max={108.0}
                step={0.2}
                value={state.signalFrequency}
                disabled={state.signalTraced}
                onChange={(e) => onChangeFrequency(parseFloat(e.target.value))}
                className="w-full accent-[#d9943a] h-2 cursor-pointer"
              />

              {/* Signal strength bar */}
              <div className="h-2 rounded-full bg-[#0b0e12] overflow-hidden border border-white/8">
                <div
                  className={`h-full transition-all duration-150 ${
                    state.signalTraced
                      ? 'bg-[#c83e37]'
                      : isWithinLockWindow
                      ? 'bg-[#2e8b6e]'
                      : 'bg-[#d9943a]'
                  }`}
                  style={{ width: `${signalProximity}%` }}
                />
              </div>

              <button
                type="button"
                onClick={onLockSignal}
                disabled={state.signalTraced}
                className={`w-full min-h-[44px] px-4 py-2.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
                  state.signalTraced
                    ? 'bg-[#1f242e] text-[#8f8a82] cursor-default border border-white/10'
                    : isWithinLockWindow
                    ? 'bg-[#2e8b6e] hover:bg-[#359c7c] text-white cursor-pointer'
                    : 'bg-[#262b36] hover:bg-[#313846] text-[#eae6df] cursor-pointer'
                }`}
              >
                {state.signalTraced
                  ? 'موقعیت دکل ثبت شد: فاصله ۸۵ متری مرکز'
                  : 'تثبیت و ردیابی منبع تماس'}
              </button>
            </div>
          </div>
        )}

        {/* 2. ARCHIVE DATABASE */}
        {activeSubTab === 'archive' && (
          <div className="space-y-3" data-testid="tool-archive">
            <h3 className="text-sm font-semibold text-[#eae6df]">بایگانی پرونده‌های بخش شمالی</h3>

            <div className="grid grid-cols-1 gap-2">
              {ARCHIVE_RECORDS.map((rec) => {
                const selected = rec.id === selectedRecord.id;
                const inspected = state.inspectedArchiveIds.includes(rec.id);
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => {
                      setSelectedRecordId(rec.id);
                      onInspectArchive(rec.id);
                    }}
                    className={`w-full min-h-[48px] text-right px-3.5 py-2.5 rounded-md border transition-colors cursor-pointer ${
                      selected
                        ? 'border-[#d9943a]/55 bg-[#201c15] text-[#f3e5cc]'
                        : 'border-white/10 bg-[#161a22] hover:bg-[#1e232e] text-[#dedad3]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold">{rec.title}</span>
                      <span className="text-[#9b968e] whitespace-nowrap">
                        {inspected ? 'مطالعه شد' : rec.code}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#9b968e] mt-1 line-clamp-1">{rec.excerpt}</p>
                  </button>
                );
              })}
            </div>

            {/* Active Dossier Reader */}
            <article className="rounded-md border border-white/10 bg-[#0e1116] p-3.5 space-y-3">
              <div className="flex items-center justify-between gap-2 text-xs text-[#a8a29a] border-b border-white/8 pb-2">
                <span className="font-semibold text-[#d9943a]">{selectedRecord.code}</span>
                <span>
                  {selectedRecord.date} · {selectedRecord.classification}
                </span>
              </div>

              {selectedRecord.hasPhoto && (
                <div className="rounded overflow-hidden border border-white/10 bg-[#090b0e]">
                  <img
                    src={ASSETS.cctvVillaRuins}
                    alt="تصویر مستند بقایای سوخته ویلای شماره ۱۴ در جاده آبشار"
                    referrerPolicy="no-referrer"
                    className="w-full h-32 object-cover"
                  />
                  <div className="px-2.5 py-1.5 text-[11px] text-[#9b968e] bg-[#12151b]">
                    تصویر پرونده ۴۰۲: بقایای سوخته و متروکه ویلای شماره ۱۴
                  </div>
                </div>
              )}

              <p className="text-xs sm:text-sm leading-7 text-[#d7d2ca]">{selectedRecord.body}</p>

              {!state.inspectedArchiveIds.includes(selectedRecord.id) && (
                <button
                  type="button"
                  onClick={() => onInspectArchive(selectedRecord.id)}
                  className="w-full min-h-[44px] px-4 py-2 rounded-md bg-[#d9943a] hover:bg-[#e5a248] text-[#111419] font-semibold text-xs transition-colors cursor-pointer"
                >
                  ثبت اطلاعات این پرونده در گزارش شیفت
                </button>
              )}
            </article>
          </div>
        )}

        {/* 3. AUDIO SPECTRUM FILTER */}
        {activeSubTab === 'audio' && (
          <div className="space-y-3" data-testid="tool-audio">
            <h3 className="text-sm font-semibold text-[#eae6df]">تحلیلگر صدای پس‌زمینه خط ۱</h3>
            <p className="text-xs text-[#9b968e] leading-6">
              فیلترهای صوتی را روی تماس فعال اعمال کنید تا صداهای محیطی واقعی تماس‌گیرنده آشکار شود.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {AUDIO_FILTER_OPTIONS.map((opt) => {
                const active = state.activeAudioFilter === opt.mode;
                return (
                  <button
                    key={opt.mode}
                    type="button"
                    onClick={() => onApplyAudioFilter(opt.mode)}
                    className={`min-h-[54px] text-right px-3 py-2.5 rounded-md border transition-colors cursor-pointer ${
                      active
                        ? 'border-[#2e8b6e] bg-[#11211d] text-[#dcf5ec]'
                        : 'border-white/10 bg-[#161a22] hover:bg-[#1e242f] text-[#dedad3]'
                    }`}
                  >
                    <div className="text-xs font-semibold">{opt.label}</div>
                    <div className="text-[11px] text-[#9b968e] mt-0.5">{opt.desc}</div>
                  </button>
                );
              })}
            </div>

            <div
              className={`rounded-md border p-3.5 text-xs sm:text-sm leading-7 ${
                state.activeAudioFilter === 'isolate_room'
                  ? 'border-[#2e8b6e]/50 bg-[#101e1a] text-[#d4f2e7]'
                  : 'border-white/10 bg-[#0e1116] text-[#c5bfb6]'
              }`}
            >
              <div className="text-[11px] text-[#9b968e] mb-1">خروجی تحلیلگر صوتی:</div>
              <p>{activeFilterMeta.readout}</p>
            </div>
          </div>
        )}

        {/* 4. CCTV & PATROL DISPATCH + SECURITY DOOR */}
        {activeSubTab === 'cctv' && (
          <div className="space-y-4" data-testid="tool-cctv">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[#eae6df]">دوربین مداربسته و فرماندهی</h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCamera('rear');
                    onInspectCamera('rear');
                  }}
                  className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${
                    selectedCamera === 'rear'
                      ? 'border-[#d9943a]/60 bg-[#231d15] text-[#f3e5cc]'
                      : 'border-white/10 bg-[#161a22] text-[#9b968e]'
                  }`}
                >
                  دوربین ۰۲ (پشتی)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCamera('villa');
                    onInspectCamera('villa');
                  }}
                  className={`min-h-[36px] px-2.5 py-1 rounded text-xs font-medium border cursor-pointer transition-colors ${
                    selectedCamera === 'villa'
                      ? 'border-[#d9943a]/60 bg-[#231d15] text-[#f3e5cc]'
                      : 'border-white/10 bg-[#161a22] text-[#9b968e]'
                  }`}
                >
                  گشت جاده آبشار
                </button>
              </div>
            </div>

            {/* Surveillance Visual Frame */}
            <div className="relative rounded-md overflow-hidden border border-white/12 bg-[#090b0e]">
              <img
                src={selectedCamera === 'rear' ? ASSETS.cctvRearEntrance : ASSETS.cctvVillaRuins}
                alt={
                  selectedCamera === 'rear'
                    ? 'دوربین مداربسته ورودی پشتی مرکز فوریت‌ها با حضور یک فرد ناشناس'
                    : 'نمای شبانه ویرانه سوخته ویلای ۱۴ در جاده آبشار'
                }
                referrerPolicy="no-referrer"
                className="w-full h-40 sm:h-44 object-cover"
              />
              <div className="pointer-events-none absolute inset-0 scanlines" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/45 to-transparent p-2.5 flex items-center justify-between text-[11px] text-[#eae6df]">
                <span>
                  {selectedCamera === 'rear'
                    ? 'دوربین ۰۲ · ورودی پشتی مرکز دیسپچ'
                    : 'گزارش تصویری · ویلای ۱۴ جاده آبشار'}
                </span>
                <span className="text-[#e0524a]">پخش زنده</span>
              </div>
            </div>

            {!state.discoveredClueIds.includes('fact_cctv') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCamera('rear');
                  onInspectCamera('rear');
                }}
                className="w-full min-h-[44px] px-4 py-2 rounded-md border border-[#d9943a]/50 bg-[#221c13] hover:bg-[#2c2418] text-[#f5dfb8] text-xs font-semibold cursor-pointer transition-colors"
              >
                بزرگ‌نمایی و ثبت تصویر شبح پشت درب ورودی (+۶۰ امتیاز)
              </button>
            )}

            {/* Patrol 204 Dispatch Control */}
            <div className="rounded-md border border-white/10 bg-[#161a22] p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#eae6df] flex items-center gap-1.5">
                  <Car className="w-4 h-4 text-[#d9943a]" />
                  <span>فرمان اعزام گشت ۲۰۴</span>
                </span>
                <span className="text-[#9b968e]">
                  {state.patrolOrder === 'dispatch_center'
                    ? 'به سمت مرکز دیسپچ'
                    : state.patrolOrder === 'villa14'
                    ? 'به سمت ویلای ۱۴'
                    : 'در انتظار دستور'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onSetPatrolOrder('dispatch_center')}
                  className={`min-h-[44px] px-3 py-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                    state.patrolOrder === 'dispatch_center'
                      ? 'border-[#2e8b6e] bg-[#122620] text-[#dcf5ec]'
                      : 'border-white/12 bg-[#1c212b] hover:bg-[#252c38] text-[#eae6df]'
                  }`}
                >
                  احضار فوری به مرکز (۴ دقیقه)
                </button>
                <button
                  type="button"
                  onClick={() => onSetPatrolOrder('villa14')}
                  className={`min-h-[44px] px-3 py-2 rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
                    state.patrolOrder === 'villa14'
                      ? 'border-[#c83e37] bg-[#291516] text-[#f5d3d1]'
                      : 'border-white/12 bg-[#1c212b] hover:bg-[#252c38] text-[#eae6df]'
                  }`}
                >
                  اعزام به ویلای ۱۴ (۲۲ دقیقه)
                </button>
              </div>
            </div>

            {/* Security Rear Door Lock */}
            <div className="rounded-md border border-white/10 bg-[#161a22] p-3 flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-[#eae6df] flex items-center gap-1.5">
                  {state.doorLocked ? (
                    <ShieldCheck className="w-4 h-4 text-[#2e8b6e]" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-[#c83e37]" />
                  )}
                  <span>قفل امنیتی درب پشتی مرکز</span>
                </div>
                <p className="text-[11px] text-[#9b968e]">
                  {state.doorLocked
                    ? 'وضعیت فعلی: کاملاً قفل و ایمن'
                    : 'هشدار: قفل درب پشتی غیرفعال است!'}
                </p>
              </div>

              <button
                type="button"
                onClick={onToggleDoorLock}
                className={`min-h-[44px] px-3.5 py-2 rounded-md border text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  state.doorLocked
                    ? 'border-[#2e8b6e]/50 bg-[#11221d] hover:bg-[#162d26] text-[#d4f2e7]'
                    : 'border-[#c83e37]/60 bg-[#2b1516] hover:bg-[#381b1c] text-[#f7d4d2]'
                }`}
              >
                {state.doorLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                <span>{state.doorLocked ? 'باز کردن قفل' : 'قفل کردن فوری'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
