import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileSearch,
  Pause,
  PhoneCall,
  Radio,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  answerIncomingCall,
  applyAudioFilter,
  buildRunSnapshot,
  createInitialState,
  formatClock,
  getAvailableChoices,
  inspectArchiveRecord,
  inspectCctvCamera,
  inspectLineBeforeAnswer,
  lockSignalTrace,
  selectDialogueChoice,
  setPatrolOrder,
  setSignalFrequency,
  toggleDoorLock,
  toPersianDigits,
  verifyContradiction,
} from './game/engine';
import { CLUES, CONTRADICTIONS } from './game/storyData';
import { soundEngine } from './game/soundEngine';
import { soundtrackEngine, type SoundtrackSnapshot } from './game/soundtrackEngine';
import { telephoneAudio } from './game/telephoneAudio';
import {
  createIdleVoiceSnapshot,
  voiceEngine,
  type VoicePlaybackSnapshot,
} from './game/voiceEngine';
import { getVoiceScriptForNode, PATROL_VOICE_SCRIPTS } from './game/voiceScript';
import type {
  AudioFilterMode,
  GameState,
  MobileTab,
  PatrolOrder,
  RunSnapshot,
  ToolSubTab,
} from './game/types';
import { TitleScreen } from './components/TitleScreen';
import { CallConsolePanel } from './components/CallConsolePanel';
import { DispatchToolsPanel } from './components/DispatchToolsPanel';
import { ClueBoardPanel } from './components/ClueBoardPanel';
import { EndingModal, PauseModal } from './components/GameModals';
import { MusicHeaderControl } from './components/MusicControls';

const BEST_SCORE_KEY = 'the_last_call_best_score_v1';

function readBestScore(): number {
  try {
    const raw = window.localStorage.getItem(BEST_SCORE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeBestScore(score: number): void {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(score));
  } catch {
    // Ignore storage errors
  }
}

function shouldAutostart(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('autostart') === '1';
}

export default function App() {
  const [state, setState] = useState<GameState>(() =>
    createInitialState(shouldAutostart())
  );
  const [bestScore, setBestScore] = useState<number>(() =>
    typeof window !== 'undefined' ? readBestScore() : 0
  );
  const [runSnapshot, setRunSnapshot] = useState<RunSnapshot | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('call');
  const [toolSubTab, setToolSubTab] = useState<ToolSubTab>('signal');
  const [sfxMuted, setSfxMuted] = useState<boolean>(false);
  const [pulseTrigger, setPulseTrigger] = useState<number>(0);
  const [voiceSnapshot, setVoiceSnapshot] = useState<VoicePlaybackSnapshot>(() =>
    createIdleVoiceSnapshot()
  );
  const [musicSnapshot, setMusicSnapshot] = useState<SoundtrackSnapshot>(() =>
    soundtrackEngine.getSnapshot()
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const lastSpokenNodeRef = useRef<string | null>(null);

  // Subscribe to Persian voice playback engine & independent soundtrack engine
  useEffect(() => {
    const unsubVoice = voiceEngine.subscribe(setVoiceSnapshot);
    const unsubMusic = soundtrackEngine.subscribe(setMusicSnapshot);
    soundtrackEngine.ensureStarted();
    return () => {
      unsubVoice();
      unsubMusic();
    };
  }, []);

  // Sync game scene & tension into background soundtrack (continuous without restarting)
  useEffect(() => {
    soundtrackEngine.syncGameState(state.phase, state.callPhase, state.tension);
  }, [state.phase, state.callPhase, state.tension]);

  // Voice-First automatic ducking: drop background music to 10% whenever a character speaks
  useEffect(() => {
    const isSpeaking = state.phase === 'playing' && voiceSnapshot.status === 'speaking';
    soundtrackEngine.setDialogueSpeaking(isSpeaking);
  }, [state.phase, voiceSnapshot.status]);

  // Sync document.body.dataset.state for testability and state machine parity
  useEffect(() => {
    document.body.dataset.state = state.phase;
  }, [state.phase]);

  // Manage ringing, telephone line bed, and voice pause/stop (real soundtrack replaces old synth drone)
  useEffect(() => {
    if (state.phase === 'playing') {
      if (state.callPhase === 'ringing') {
        soundEngine.startRingLoop();
        telephoneAudio.stopLineBed();
        voiceEngine.warmUpInitialCall();
      } else if (state.callPhase === 'active') {
        soundEngine.stopRingLoop();
        telephoneAudio.startLineBed(state.activeAudioFilter);
      } else {
        soundEngine.stopRingLoop();
        telephoneAudio.stopLineBed();
      }
    } else if (state.phase === 'paused') {
      soundEngine.stopAllLoops();
      telephoneAudio.stopLineBed();
      voiceEngine.pause();
    } else {
      soundEngine.stopAllLoops();
      telephoneAudio.stopLineBed();
      voiceEngine.stop();
      lastSpokenNodeRef.current = null;
    }
    return () => {
      soundEngine.stopAllLoops();
      telephoneAudio.stopLineBed();
    };
  }, [state.phase, state.callPhase, state.activeAudioFilter]);

  // Trigger synchronized Persian voice acting whenever entering a new active dialogue node
  useEffect(() => {
    if (state.phase !== 'playing' || state.callPhase !== 'active') {
      return;
    }
    if (lastSpokenNodeRef.current === state.currentNodeId) {
      return;
    }
    lastSpokenNodeRef.current = state.currentNodeId;
    const script = getVoiceScriptForNode(state.currentNodeId);
    if (script) {
      voiceEngine.playScript(script);
    }
  }, [state.phase, state.callPhase, state.currentNodeId]);

  // Freeze run snapshot on entering gameover
  useEffect(() => {
    if (state.phase === 'gameover' && state.ending) {
      const snap = buildRunSnapshot(state, bestScore);
      setRunSnapshot(snap);
      if (snap.bestScore > bestScore) {
        setBestScore(snap.bestScore);
        writeBestScore(snap.bestScore);
      }
      soundEngine.playEndingSting(state.ending);
    }
  }, [state.phase, state.ending]);

  const startGame = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    soundtrackEngine.unlockFromUserGesture();
    voiceEngine.stop();
    lastSpokenNodeRef.current = null;
    setRunSnapshot(null);
    setMobileTab('call');
    setToolSubTab('signal');
    setState(createInitialState(true));
    soundEngine.playClick(1.1);
  }, []);

  const backToTitle = useCallback(() => {
    soundEngine.stopAllLoops();
    telephoneAudio.stopLineBed();
    voiceEngine.stop();
    lastSpokenNodeRef.current = null;
    setRunSnapshot(null);
    setState(createInitialState(false));
  }, []);

  const togglePause = useCallback(() => {
    setState((prev) => {
      if (prev.phase === 'playing') {
        return { ...prev, phase: 'paused' };
      }
      if (prev.phase === 'paused') {
        soundtrackEngine.unlockFromUserGesture();
        voiceEngine.resume();
        return { ...prev, phase: 'playing' };
      }
      return prev;
    });
  }, []);

  // Independent SFX & telephone ambient toggle (kept strictly separate from Music & Character Voices)
  const handleToggleSfxMute = useCallback(() => {
    const nextMuted = soundEngine.toggleMute();
    telephoneAudio.setMuted(nextMuted);
    setSfxMuted(nextMuted);
    if (!nextMuted && stateRef.current.phase === 'playing') {
      if (stateRef.current.callPhase === 'ringing') {
        soundEngine.startRingLoop();
      } else if (stateRef.current.callPhase === 'active') {
        telephoneAudio.startLineBed(stateRef.current.activeAudioFilter);
      }
    }
  }, []);

  const handleToggleMusicMute = useCallback(() => {
    soundtrackEngine.toggleMute();
  }, []);

  const handleChangeMusicVolume = useCallback((volume: number) => {
    soundtrackEngine.setVolume(volume);
  }, []);

  const handleToggleVoicePlayPause = useCallback(() => {
    soundtrackEngine.unlockFromUserGesture();
    voiceEngine.togglePlayPause();
  }, []);

  const handleReplayVoice = useCallback(() => {
    soundtrackEngine.unlockFromUserGesture();
    setPulseTrigger((n) => n + 1);
    voiceEngine.replay();
  }, []);

  const handleSkipVoice = useCallback(() => {
    voiceEngine.skipToEnd();
  }, []);

  const handleToggleVoiceMute = useCallback(() => {
    voiceEngine.toggleVoiceMute();
  }, []);

  const handleChangeVoiceVolume = useCallback((volume: number) => {
    voiceEngine.setVoiceVolume(volume);
  }, []);

  const handleInspectLine = useCallback(() => {
    soundtrackEngine.unlockFromUserGesture();
    soundEngine.playClueFound();
    setState((prev) => inspectLineBeforeAnswer(prev));
  }, []);

  const handleAnswerCall = useCallback(() => {
    soundtrackEngine.unlockFromUserGesture();
    soundEngine.stopRingLoop();
    soundEngine.playPickup();
    setPulseTrigger((n) => n + 1);
    lastSpokenNodeRef.current = null;
    setState((prev) => answerIncomingCall(prev));
  }, []);

  const handleSelectChoice = useCallback((choiceId: string) => {
    soundtrackEngine.unlockFromUserGesture();
    soundEngine.playClick(0.95);
    setPulseTrigger((n) => n + 1);
    setState((prev) => selectDialogueChoice(prev, choiceId));
  }, []);

  const handleChangeFrequency = useCallback((freq: number) => {
    setState((prev) => setSignalFrequency(prev, freq));
  }, []);

  const handleLockSignal = useCallback(() => {
    setState((prev) => {
      const next = lockSignalTrace(prev);
      if (next.signalTraced && !prev.signalTraced) {
        soundEngine.playClueFound();
      } else {
        soundEngine.playErrorBuzz();
      }
      return next;
    });
  }, []);

  const handleInspectArchive = useCallback((recordId: string) => {
    soundEngine.playClick(1.05);
    setState((prev) => {
      const next = inspectArchiveRecord(prev, recordId);
      if (next.discoveredClueIds.length > prev.discoveredClueIds.length) {
        soundEngine.playClueFound();
      }
      return next;
    });
  }, []);

  const handleApplyAudioFilter = useCallback((mode: AudioFilterMode) => {
    soundEngine.playClick(1.15);
    telephoneAudio.setFilterMode(mode);
    setPulseTrigger((n) => n + 1);
    setState((prev) => {
      const next = applyAudioFilter(prev, mode);
      if (next.audioAnalyzed && !prev.audioAnalyzed) {
        soundEngine.playClueFound();
      }
      return next;
    });
  }, []);

  const handleInspectCamera = useCallback((cameraId: 'rear' | 'villa') => {
    soundEngine.playClick(0.9);
    setState((prev) => {
      const next = inspectCctvCamera(prev, cameraId);
      if (next.discoveredClueIds.length > prev.discoveredClueIds.length) {
        soundEngine.playClueFound();
      }
      return next;
    });
  }, []);

  const handleSetPatrolOrder = useCallback((order: PatrolOrder) => {
    soundEngine.playClick(1.05);
    if (order === 'dispatch_center') {
      voiceEngine.playScript(PATROL_VOICE_SCRIPTS.dispatch_center);
    } else if (order === 'villa14') {
      voiceEngine.playScript(PATROL_VOICE_SCRIPTS.villa14);
    }
    setState((prev) => setPatrolOrder(prev, order));
  }, []);

  const handleToggleDoorLock = useCallback(() => {
    soundEngine.playClick(0.82);
    setState((prev) => toggleDoorLock(prev));
  }, []);

  const handleVerifyContradiction = useCallback((clueA: string, clueB: string) => {
    setState((prev) => {
      const res = verifyContradiction(prev, clueA, clueB);
      if (res.matched) {
        soundEngine.playContradictionVerified();
      } else {
        soundEngine.playErrorBuzz();
      }
      return res.state;
    });
  }, []);

  // Unified keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const cur = stateRef.current;

      if (cur.phase === 'title') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          startGame();
        }
        return;
      }

      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        if (cur.phase === 'playing' || cur.phase === 'paused') {
          e.preventDefault();
          togglePause();
        }
        return;
      }

      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        handleToggleMusicMute();
        return;
      }

      if (e.key.toLowerCase() === 'v' && cur.phase === 'playing' && cur.callPhase === 'active') {
        e.preventDefault();
        handleToggleVoicePlayPause();
        return;
      }

      if (cur.phase === 'playing' && cur.callPhase === 'active') {
        const digitMap: Record<string, number> = {
          '1': 0,
          '2': 1,
          '3': 2,
          '4': 3,
          '۱': 0,
          '۲': 1,
          '۳': 2,
          '۴': 3,
        };
        const idx = digitMap[e.key];
        if (idx !== undefined) {
          const choices = getAvailableChoices(cur);
          const target = choices[idx];
          if (target && !target.locked) {
            e.preventDefault();
            handleSelectChoice(target.id);
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [startGame, togglePause, handleToggleMusicMute, handleToggleVoicePlayPause, handleSelectChoice]);

  if (state.phase === 'title') {
    return (
      <TitleScreen
        bestScore={bestScore}
        sfxMuted={sfxMuted}
        music={musicSnapshot}
        onStart={startGame}
        onToggleSfxMute={handleToggleSfxMute}
        onToggleMusicMute={handleToggleMusicMute}
        onChangeMusicVolume={handleChangeMusicVolume}
      />
    );
  }

  const tensionDanger = state.tension >= 70;
  const totalClues = Object.keys(CLUES).length;

  return (
    <div
      className="relative h-dvh w-full overflow-hidden bg-[#0a0c0f] text-[#eae6df] flex flex-col"
      data-testid="dispatch-shell"
    >
      {/* Peripheral tension warning vignette when anxiety spikes */}
      {tensionDanger && (
        <div
          className="pointer-events-none fixed inset-0 z-20 tension-vignette transition-opacity duration-500"
          aria-hidden="true"
        />
      )}

      {/* Compact World-Matched Dispatch Top Telemetry Bar (h-11 on mobile) */}
      <header className="relative z-30 h-11 sm:h-14 px-2.5 sm:px-5 border-b border-white/10 bg-[#0f1217] flex items-center justify-between gap-2 shrink-0">
        {/* Right side (RTL start): Console Title + Clock */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span
            dir="ltr"
            className="font-console-mono text-xs sm:text-sm font-bold tracking-wider text-[#f2eee7] whitespace-nowrap shrink-0"
          >
            THE LAST CALL
          </span>
          <span className="text-white/20 hidden sm:inline" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline text-xs text-[#a8a29a] font-numeric whitespace-nowrap shrink-0">
            ساعت {formatClock(state.elapsedMinutes)}
          </span>
        </div>

        {/* Center live gameplay meters (unboxed tabular readouts) */}
        <div className="flex items-center gap-2.5 sm:gap-5 text-[11px] sm:text-xs shrink-0">
          <div className="flex items-center gap-1" aria-label="امتیاز فعلی">
            <span className="text-[#9b968e]">امتیاز</span>
            <span className="font-numeric font-bold text-[#d9943a]" data-testid="hud-score">
              {toPersianDigits(state.score)}
            </span>
          </div>

          <div className="flex items-center gap-1" aria-label="سطح اضطراب">
            <span className="text-[#9b968e]">اضطراب</span>
            <span
              className={`font-numeric font-bold ${
                tensionDanger ? 'text-[#e0524a]' : 'text-[#eae6df]'
              }`}
              data-testid="hud-tension"
            >
              {toPersianDigits(state.tension)}٪
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-[#9b968e]">سرنخ‌ها:</span>
            <span className="font-numeric font-semibold text-[#eae6df]">
              {toPersianDigits(state.discoveredClueIds.length)} از {toPersianDigits(totalClues)}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1.5">
            <span className="text-[#9b968e]">تناقض‌ها:</span>
            <span className="font-numeric font-semibold text-[#2e8b6e]">
              {toPersianDigits(state.verifiedContradictionIds.length)} از {toPersianDigits(CONTRADICTIONS.length)}
            </span>
          </div>
        </div>

        {/* Left side (RTL end): Utility icon controls (Independent Music + Independent SFX + Pause) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <MusicHeaderControl
            music={musicSnapshot}
            onToggleMute={handleToggleMusicMute}
            onChangeVolume={handleChangeMusicVolume}
          />

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              handleToggleSfxMute();
            }}
            aria-label={sfxMuted ? 'فعال کردن افکت‌های صوتی' : 'قطع افکت‌های صوتی'}
            data-testid="sfx-mute-toggle"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-md border border-white/10 bg-[#151921] hover:bg-[#1e2430] text-[#eae6df] flex items-center justify-center cursor-pointer transition-colors"
          >
            {sfxMuted ? (
              <VolumeX className="w-4 h-4 text-[#c83e37]" />
            ) : (
              <Volume2 className="w-4 h-4 text-[#d9943a]" />
            )}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              startGame();
            }}
            aria-label="شروع مجدد بازی"
            className="hidden sm:flex w-10 h-10 rounded-md border border-white/10 bg-[#151921] hover:bg-[#1e2430] text-[#eae6df] items-center justify-center cursor-pointer transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              togglePause();
            }}
            aria-label="توقف موقت بازی"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-md border border-white/10 bg-[#151921] hover:bg-[#1e2430] text-[#eae6df] flex items-center justify-center cursor-pointer transition-colors"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Live Action Notification Strip (inline non-blocking feedback) */}
      {state.lastActionFeedback && (
        <div
          className={`px-3 py-1 sm:px-4 sm:py-1.5 text-[11px] sm:text-xs border-b flex items-center justify-between gap-2 shrink-0 ${
            state.lastActionFeedback.kind === 'contradiction'
              ? 'bg-[#10201b] border-[#2e8b6e]/40 text-[#d4f2e7]'
              : state.lastActionFeedback.kind === 'warning'
              ? 'bg-[#221314] border-[#c83e37]/40 text-[#f5d0ce]'
              : state.lastActionFeedback.kind === 'clue'
              ? 'bg-[#1f1a11] border-[#d9943a]/35 text-[#f3dfb8]'
              : 'bg-[#141820] border-white/10 text-[#c5bfb6]'
          }`}
          role="status"
          aria-live="polite"
        >
          <div className="truncate">
            <strong className="font-semibold ml-1.5 sm:ml-2">{state.lastActionFeedback.title}:</strong>
            <span>{state.lastActionFeedback.detail}</span>
          </div>
        </div>
      )}

      {/* Main Control Room Workspace */}
      <main className="flex-1 min-h-0 p-1.5 sm:p-4 overflow-hidden">
        {/* Desktop 3-Column Unified Dispatch Desk (>= lg) */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-4 h-full max-w-[1440px] mx-auto">
          <div className="lg:col-span-5 h-full min-h-0">
            <CallConsolePanel
              state={state}
              voice={voiceSnapshot}
              paused={state.phase !== 'playing'}
              pulseTrigger={pulseTrigger}
              onInspectLine={handleInspectLine}
              onAnswerCall={handleAnswerCall}
              onSelectChoice={handleSelectChoice}
              onToggleVoicePlayPause={handleToggleVoicePlayPause}
              onReplayVoice={handleReplayVoice}
              onSkipVoice={handleSkipVoice}
              onToggleVoiceMute={handleToggleVoiceMute}
              onChangeVoiceVolume={handleChangeVoiceVolume}
            />
          </div>

          <div className="lg:col-span-4 h-full min-h-0">
            <DispatchToolsPanel
              state={state}
              activeSubTab={toolSubTab}
              onChangeSubTab={setToolSubTab}
              onChangeFrequency={handleChangeFrequency}
              onLockSignal={handleLockSignal}
              onInspectArchive={handleInspectArchive}
              onApplyAudioFilter={handleApplyAudioFilter}
              onInspectCamera={handleInspectCamera}
              onSetPatrolOrder={handleSetPatrolOrder}
              onToggleDoorLock={handleToggleDoorLock}
            />
          </div>

          <div className="lg:col-span-3 h-full min-h-0">
            <ClueBoardPanel
              state={state}
              onVerifyContradiction={handleVerifyContradiction}
            />
          </div>
        </div>

        {/* Mobile / Tablet Active Tab Workspace (< lg) */}
        <div className="lg:hidden h-full min-h-0">
          {mobileTab === 'call' && (
            <CallConsolePanel
              state={state}
              voice={voiceSnapshot}
              paused={state.phase !== 'playing'}
              pulseTrigger={pulseTrigger}
              onInspectLine={handleInspectLine}
              onAnswerCall={handleAnswerCall}
              onSelectChoice={handleSelectChoice}
              onToggleVoicePlayPause={handleToggleVoicePlayPause}
              onReplayVoice={handleReplayVoice}
              onSkipVoice={handleSkipVoice}
              onToggleVoiceMute={handleToggleVoiceMute}
              onChangeVoiceVolume={handleChangeVoiceVolume}
            />
          )}
          {mobileTab === 'tools' && (
            <DispatchToolsPanel
              state={state}
              activeSubTab={toolSubTab}
              onChangeSubTab={setToolSubTab}
              onChangeFrequency={handleChangeFrequency}
              onLockSignal={handleLockSignal}
              onInspectArchive={handleInspectArchive}
              onApplyAudioFilter={handleApplyAudioFilter}
              onInspectCamera={handleInspectCamera}
              onSetPatrolOrder={handleSetPatrolOrder}
              onToggleDoorLock={handleToggleDoorLock}
            />
          )}
          {mobileTab === 'clues' && (
            <ClueBoardPanel
              state={state}
              onVerifyContradiction={handleVerifyContradiction}
            />
          )}
        </div>
      </main>

      {/* Mobile Ergonomic Bottom Thumb-Zone Navigation Bar (< lg) */}
      <nav
        className="lg:hidden h-[52px] border-t border-white/10 bg-[#0f1217] grid grid-cols-3 shrink-0"
        aria-label="بخش‌های اصلی میز کنترل"
      >
        <button
          type="button"
          onClick={() => setMobileTab('call')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer transition-colors ${
            mobileTab === 'call' ? 'text-[#d9943a]' : 'text-[#9b968e]'
          }`}
        >
          <PhoneCall className="w-5 h-5" />
          <span>تماس و گفتگو</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('tools')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer transition-colors ${
            mobileTab === 'tools' ? 'text-[#d9943a]' : 'text-[#9b968e]'
          }`}
        >
          <Radio className="w-5 h-5" />
          <span>ابزارهای بررسی</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('clues')}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium cursor-pointer transition-colors ${
            mobileTab === 'clues' ? 'text-[#d9943a]' : 'text-[#9b968e]'
          }`}
        >
          <FileSearch className="w-5 h-5" />
          <span>
            سرنخ‌ها ({toPersianDigits(state.discoveredClueIds.length)})
          </span>
        </button>
      </nav>

      {/* Pause Modal */}
      {state.phase === 'paused' && (
        <PauseModal
          music={musicSnapshot}
          onToggleMusicMute={handleToggleMusicMute}
          onChangeMusicVolume={handleChangeMusicVolume}
          onResume={togglePause}
          onRestart={startGame}
          onBackToTitle={backToTitle}
        />
      )}

      {/* Ending / Game Over Debrief Modal */}
      {state.phase === 'gameover' && runSnapshot && (
        <EndingModal
          snapshot={runSnapshot}
          onRestart={startGame}
          onBackToTitle={backToTitle}
        />
      )}
    </div>
  );
}
