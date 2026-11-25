import { useState } from 'react';
import { CheckCircle2, FileSearch, Link2 } from 'lucide-react';
import { CLUES, CONTRADICTIONS } from '../game/storyData';
import { toPersianDigits } from '../game/engine';
import type { GameState } from '../game/types';

interface ClueBoardPanelProps {
  state: GameState;
  onVerifyContradiction: (clueA: string, clueB: string) => void;
}

export function ClueBoardPanel({ state, onVerifyContradiction }: ClueBoardPanelProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const discoveredClues = state.discoveredClueIds
    .map((id) => CLUES[id])
    .filter(Boolean);

  const claims = discoveredClues.filter((c) => c.category === 'claim');
  const facts = discoveredClues.filter((c) => c.category === 'fact');

  const toggleClue = (clueId: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(clueId)) {
        return prev.filter((id) => id !== clueId);
      }
      if (prev.length >= 2) {
        return [prev[1], clueId];
      }
      return [...prev, clueId];
    });
  };

  const handleVerify = () => {
    if (selectedIds.length !== 2) return;
    onVerifyContradiction(selectedIds[0], selectedIds[1]);
    setSelectedIds([]);
  };

  const isClueAlreadyUsedInVerified = (clueId: string): boolean => {
    return state.verifiedContradictionIds.some((cid) => {
      const def = CONTRADICTIONS.find((c) => c.id === cid);
      return def?.clueIds.includes(clueId);
    });
  };

  return (
    <section
      className="flex flex-col h-full min-h-0 bg-[#12151b] border border-white/10 rounded-lg overflow-hidden"
      aria-label="تابلوی سرنخ‌ها و ثبت تناقض"
      data-testid="clue-board"
    >
      <div className="px-4 py-3 border-b border-white/10 bg-[#151921] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <FileSearch className="w-4 h-4 text-[#d9943a]" />
          <h2 className="text-sm font-semibold text-[#eae6df]">تابلوی سرنخ و تناقض</h2>
        </div>
        <span className="text-xs text-[#9b968e] font-numeric">
          {toPersianDigits(state.verifiedContradictionIds.length)} از {toPersianDigits(CONTRADICTIONS.length)} تناقض
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto console-scroll p-4 space-y-4">
        <p className="text-xs text-[#9b968e] leading-6">
          یک «ادعای تماس‌گیرنده» و یک «شاهد فنی» متناقض را انتخاب کنید و دکمه تطبیق را بزنید تا گزینه مواجهه در گفتگو باز شود.
        </p>

        {discoveredClues.length === 0 ? (
          <div className="rounded-md border border-white/8 bg-[#0e1116] p-5 text-center text-xs text-[#8f8a82] leading-6">
            هنوز سرنخی ثبت نشده است. به تماس پاسخ دهید و ابزارهای میز کنترل را بررسی کنید.
          </div>
        ) : (
          <div className="space-y-4">
            {/* Claims Group */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[#c5bfb6]">
                اظهارات تماس‌گیرنده ({toPersianDigits(claims.length)})
              </h3>
              {claims.length === 0 ? (
                <p className="text-[11px] text-[#75716a]">موردی ثبت نشده است.</p>
              ) : (
                <div className="space-y-2">
                  {claims.map((clue) => {
                    const selected = selectedIds.includes(clue.id);
                    const solved = isClueAlreadyUsedInVerified(clue.id);
                    return (
                      <button
                        key={clue.id}
                        type="button"
                        onClick={() => toggleClue(clue.id)}
                        aria-pressed={selected}
                        className={`w-full min-h-[48px] text-right p-3 rounded-md border transition-colors cursor-pointer ${
                          selected
                            ? 'border-[#d9943a] bg-[#241d13] text-[#f7e5c6]'
                            : solved
                            ? 'border-[#2e8b6e]/35 bg-[#101c19] text-[#cfe8df]'
                            : 'border-white/10 bg-[#171b23] hover:bg-[#1e232d] text-[#eae6df]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                          <span>{clue.title}</span>
                          {solved && <CheckCircle2 className="w-3.5 h-3.5 text-[#2e8b6e] shrink-0" />}
                        </div>
                        <p className="text-[11px] text-[#a8a29a] mt-1 leading-5">{clue.detail}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Technical Facts Group */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-[#c5bfb6]">
                شواهد فنی مرکز ({toPersianDigits(facts.length)})
              </h3>
              {facts.length === 0 ? (
                <p className="text-[11px] text-[#75716a]">
                  از بخش «ردیاب، بایگانی، صدا و دوربین» برای یافتن شواهد استفاده کنید.
                </p>
              ) : (
                <div className="space-y-2">
                  {facts.map((clue) => {
                    const selected = selectedIds.includes(clue.id);
                    const solved = isClueAlreadyUsedInVerified(clue.id);
                    return (
                      <button
                        key={clue.id}
                        type="button"
                        onClick={() => toggleClue(clue.id)}
                        aria-pressed={selected}
                        className={`w-full min-h-[48px] text-right p-3 rounded-md border transition-colors cursor-pointer ${
                          selected
                            ? 'border-[#d9943a] bg-[#241d13] text-[#f7e5c6]'
                            : solved
                            ? 'border-[#2e8b6e]/35 bg-[#101c19] text-[#cfe8df]'
                            : 'border-white/10 bg-[#171b23] hover:bg-[#1e232d] text-[#eae6df]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                          <span>{clue.title}</span>
                          {solved && <CheckCircle2 className="w-3.5 h-3.5 text-[#2e8b6e] shrink-0" />}
                        </div>
                        <p className="text-[11px] text-[#a8a29a] mt-1 leading-5">{clue.detail}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Verified Contradictions Log */}
            {state.verifiedContradictionIds.length > 0 && (
              <div className="pt-2 border-t border-white/10 space-y-2">
                <h3 className="text-xs font-semibold text-[#2e8b6e]">تناقض‌های اثبات‌شده</h3>
                {state.verifiedContradictionIds.map((cid) => {
                  const def = CONTRADICTIONS.find((c) => c.id === cid);
                  if (!def) return null;
                  return (
                    <div
                      key={cid}
                      className="rounded-md border border-[#2e8b6e]/35 bg-[#0f1c18] p-2.5 text-xs space-y-1"
                    >
                      <div className="font-semibold text-[#d4f2e7]">{def.title}</div>
                      <p className="text-[11px] text-[#9ec4b7] leading-5">{def.summary}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Cross-Reference Action Bar */}
      <div className="p-3 border-t border-white/10 bg-[#101318] shrink-0 space-y-2">
        <div className="flex items-center justify-between text-[11px] text-[#9b968e]">
          <span>سرنخ‌های انتخاب‌شده: {toPersianDigits(selectedIds.length)} از ۲</span>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-[#c5bfb6] hover:text-white underline cursor-pointer"
            >
              پاک کردن انتخاب
            </button>
          )}
        </div>
        <button
          type="button"
          disabled={selectedIds.length !== 2}
          onClick={handleVerify}
          className={`w-full min-h-[44px] px-4 py-2 rounded-md text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
            selectedIds.length === 2
              ? 'bg-[#d9943a] hover:bg-[#e4a147] text-[#111419] cursor-pointer'
              : 'bg-[#1b2029] text-[#6d6963] cursor-not-allowed border border-white/8'
          }`}
        >
          <Link2 className="w-4 h-4" />
          <span>تطبیق و ثبت تناقض</span>
        </button>
      </div>
    </section>
  );
}
