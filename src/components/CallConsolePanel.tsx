import { useEffect, useRef } from 'react';
import { PhoneCall, PhoneIncoming, ShieldAlert, Lock, Radio } from 'lucide-react';
import { DIALOGUE_NODES } from '../game/storyData';
import { getAvailableChoices, toPersianDigits } from '../game/engine';
import type { GameState } from '../game/types';
import type { VoicePlaybackSnapshot } from '../game/voiceEngine';
import { OscilloscopeCanvas } from './OscilloscopeCanvas';
import { VoiceSubtitleStage } from './VoiceSubtitleStage';

interface CallConsolePanelProps {
  state: GameState;
  voice: VoicePlaybackSnapshot;
  paused: boolean;
  pulseTrigger: number;
  onInspectLine: () => void;
  onAnswerCall: () => void;
  onSelectChoice: (choiceId: string) => void;
  onToggleVoicePlayPause: () => void;
  onReplayVoice: () => void;
  onSkipVoice: () => void;
  onToggleVoiceMute: () => void;
  onChangeVoiceVolume: (volume: number) => void;
}

export function CallConsolePanel({
  state,
  voice,
  paused,
  pulseTrigger,
  onInspectLine,
  onAnswerCall,
  onSelectChoice,
  onToggleVoicePlayPause,
  onReplayVoice,
  onSkipVoice,
  onToggleVoiceMute,
  onChangeVoiceVolume,
}: CallConsolePanelProps) {
  const transcriptListRef = useRef<HTMLDivElement | null>(null);
  const didInitialScrollRef = useRef(false);
  const currentNode = DIALOGUE_NODES[state.currentNodeId];
  const choices = getAvailableChoices(state);

  useEffect(() => {
    const el = transcriptListRef.current;
    if (!el) return;
    const isInitial = !didInitialScrollRef.current;
    didInitialScrollRef.current = true;
    const raf = window.requestAnimationFrame(() => {
      if (isInitial) {
        el.scrollTop = el.scrollHeight;
      } else {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [state.transcript.length, state.callPhase, state.currentNodeId, voice.status]);

  return (
    <section
      className="flex flex-col h-full min-h-0 bg-[#12151b] border border-white/10 rounded-lg overflow-hidden"
      aria-label="کنسول تماس اضطراری"
    >
      {/* Compact Top Zone: Header + 34px Oscilloscope + Voice Player & Subtitle */}
      <div className="shrink-0" data-testid="call-top-zone">
        {/* Panel Header */}
        <div className="px-2.5 py-1.5 sm:px-4 sm:py-3 border-b border-white/10 flex items-center justify-between gap-2 sm:gap-3 bg-[#151921]">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <PhoneCall
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                state.callPhase === 'ringing'
                  ? 'text-[#c83e37] animate-ring-shake'
                  : state.callPhase === 'active'
                  ? 'text-[#2e8b6e]'
                  : 'text-[#8f8a82]'
              }`}
            />
            <h2 className="text-xs sm:text-sm font-semibold text-[#eae6df] whitespace-nowrap">
              {state.callPhase === 'ringing'
                ? 'تماس ورودی — خط ۱'
                : state.callPhase === 'active'
                ? 'خط اضطراری ۱'
                : 'گزارش خط ۱'}
            </h2>
          </div>

          <span className="text-[10.5px] sm:text-xs text-[#9b968e] truncate">
            {state.callPhase === 'ringing'
              ? 'شماره ناشناس'
              : currentNode?.callerEmotion ?? 'پایان تماس'}
          </span>
        </div>

        {/* Live Voice Oscilloscope + Compact Synchronized Persian Subtitle Stage */}
        <div className="px-2 pt-1.5 pb-1 sm:px-4 sm:pt-3 sm:pb-2 space-y-1 sm:space-y-2.5 border-b border-white/8 sm:border-b-0">
          <OscilloscopeCanvas
            callPhase={state.callPhase}
            tension={state.tension}
            audioFilter={state.activeAudioFilter}
            paused={paused}
            pulseTrigger={pulseTrigger}
            voiceEnergy={voice.energyLevel}
          />

          {state.callPhase === 'active' && (
            <VoiceSubtitleStage
              voice={voice}
              onTogglePlayPause={onToggleVoicePlayPause}
              onReplay={onReplayVoice}
              onSkip={onSkipVoice}
              onToggleVoiceMute={onToggleVoiceMute}
              onChangeVoiceVolume={onChangeVoiceVolume}
            />
          )}
        </div>
      </div>

      {/* Ringing Call Intercept Stage */}
      {state.callPhase === 'ringing' ? (
        <div className="flex-1 flex flex-col items-center justify-center p-5 text-center space-y-5">
          <div className="w-16 h-16 rounded-full border border-[#c83e37]/50 bg-[#c83e37]/15 flex items-center justify-center animate-ring-shake">
            <PhoneIncoming className="w-7 h-7 text-[#e0524a]" />
          </div>

          <div className="space-y-1.5 max-w-sm">
            <p className="text-base font-bold text-[#f2eee7]">تماس ورودی از شماره ناشناس</p>
            <p className="text-xs sm:text-sm text-[#a8a29a] leading-6">
              برچسب مخابراتی: دکل جاده جنگلی ۵ · خط اضطراری ۱ در حال زنگ خوردن است.
            </p>
          </div>

          {state.lineInspected && (
            <div className="w-full max-w-md rounded-md border border-[#d9943a]/35 bg-[#d9943a]/10 p-3 text-right text-xs text-[#ebd2a6] leading-6">
              نتیجه بررسی خط: ولتاژ سیگنال با خطوط دوربرد جاده آبشار همخوانی ندارد؛ تماس از رله داخلی محوطه مرکز عبور کرده است!
            </div>
          )}

          <div className="w-full max-w-sm flex flex-col gap-2.5 pt-1">
            <button
              type="button"
              onClick={onAnswerCall}
              className="w-full min-h-[48px] px-5 py-3 rounded-md bg-[#2e8b6e] hover:bg-[#359c7c] active:scale-[0.99] text-white font-semibold text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <PhoneCall className="w-4 h-4" />
              <span>پاسخ به تماس و شروع ضبط</span>
            </button>

            <button
              type="button"
              onClick={onInspectLine}
              disabled={state.lineInspected}
              className={`w-full min-h-[44px] px-4 py-2.5 rounded-md border text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                state.lineInspected
                  ? 'border-white/10 bg-[#171b23] text-[#75716a] cursor-default'
                  : 'border-[#d9943a]/40 bg-[#1a1d24] hover:bg-[#232732] text-[#e5be82] cursor-pointer'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>
                {state.lineInspected
                  ? 'بررسی فنی خط انجام شد (+۵۰ امتیاز)'
                  : 'بررسی مشخصات خط پیش از پاسخ (+۵۰ امتیاز)'}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Transcript Feed — primary scrollable reading area */}
          <div
            ref={transcriptListRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain console-scroll px-2.5 py-1.5 sm:px-4 sm:py-2 space-y-1.5 sm:space-y-3"
            data-testid="call-transcript"
          >
            {state.transcript.map((entry) => {
              const isCaller = entry.speaker === 'caller';
              const isOperator = entry.speaker === 'operator';
              const isPatrol = entry.speaker === 'patrol';

              return (
                <article
                  key={entry.id}
                  className={`rounded-md px-2.5 py-2 sm:p-3 text-[12px] sm:text-sm leading-5 sm:leading-7 border ${
                    isCaller
                      ? entry.isSuspicious
                        ? 'bg-[#1a1618] border-[#c83e37]/30 text-[#f1ece6]'
                        : 'bg-[#181b22] border-white/10 text-[#f1ece6]'
                      : isOperator
                      ? entry.isConfrontation
                        ? 'bg-[#1d1912] border-[#d9943a]/40 text-[#f5ebd9]'
                        : 'bg-[#151c22] border-white/12 text-[#e2e7ed]'
                      : isPatrol
                      ? 'bg-[#111c19] border-[#2e8b6e]/35 text-[#d7efe6]'
                      : 'bg-[#111419] border-white/8 text-[#a8a29a] text-[11px] sm:text-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5 sm:mb-1 text-[10px] sm:text-[11px] text-[#9b968e]">
                    <span className="font-semibold text-[#d2ccc3]">{entry.speakerLabel}</span>
                    <span className="font-numeric">{entry.timestamp}</span>
                  </div>
                  <p className="leading-relaxed">{entry.text}</p>
                </article>
              );
            })}
          </div>

          {/* Interactive Dialogue Choices — pinned at bottom above tab bar, compact & always visible */}
          {state.callPhase === 'active' && (
            <div
              className="px-2 py-1.5 sm:p-3.5 border-t border-white/12 bg-[#101318] space-y-1 sm:space-y-2 shrink-0 max-h-[30dvh] sm:max-h-[38%] overflow-y-auto overscroll-contain console-scroll"
              data-testid="dialogue-choices"
            >
              <div className="flex items-center justify-between text-[10.5px] sm:text-xs text-[#9b968e]">
                <span>پاسخ خود را انتخاب کنید:</span>
                <span className="hidden sm:inline">کلیدهای ۱ تا {toPersianDigits(choices.length)}</span>
              </div>

              <div className="space-y-1 sm:space-y-2">
                {choices.map((choice, idx) => {
                  const isConfront = choice.tone === 'confront' || choice.tone === 'decisive';
                  return (
                    <button
                      key={choice.id}
                      type="button"
                      disabled={choice.locked}
                      onClick={() => onSelectChoice(choice.id)}
                      className={`w-full min-h-[36px] sm:min-h-[46px] text-right px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-md border text-[11.5px] sm:text-sm leading-[1.4] sm:leading-6 transition-all flex items-start gap-1.5 sm:gap-2 ${
                        choice.locked
                          ? 'border-white/8 bg-[#14171e] text-[#6d6963] cursor-not-allowed'
                          : isConfront
                          ? 'border-[#d9943a]/55 bg-[#221b12] hover:bg-[#2c2216] text-[#f7e5c6] cursor-pointer active:scale-[0.995]'
                          : choice.tone === 'risky'
                          ? 'border-[#c83e37]/30 bg-[#1c1415] hover:bg-[#271a1c] text-[#ecd6d4] cursor-pointer active:scale-[0.995]'
                          : 'border-white/12 bg-[#181c24] hover:bg-[#212733] text-[#eae6df] cursor-pointer active:scale-[0.995]'
                      }`}
                    >
                      <span
                        className={`font-numeric text-[11px] sm:text-xs font-bold mt-0.5 shrink-0 w-4 sm:w-5 text-center ${
                          choice.locked
                            ? 'text-[#6d6963]'
                            : isConfront
                            ? 'text-[#d9943a]'
                            : 'text-[#9b968e]'
                        }`}
                      >
                        {choice.locked ? <Lock className="w-3 h-3 sm:w-3.5 sm:h-3.5 inline" /> : toPersianDigits(idx + 1)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="block">{choice.text}</span>
                        {choice.locked && choice.lockReason && (
                          <span className="block text-[9.5px] sm:text-[11px] text-[#a37d47] mt-0.5 leading-tight">
                            {choice.lockReason}
                          </span>
                        )}
                        {!choice.locked && isConfront && (
                          <span className="inline-flex items-center gap-1 text-[9.5px] sm:text-[11px] text-[#d9943a] mt-0.5">
                            <ShieldAlert className="w-3 h-3" />
                            <span>گزینه مواجهه بر پایه شواهد</span>
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
