import {
  ARCHIVE_RECORDS,
  CLUES,
  CONTRADICTIONS,
  DIALOGUE_NODES,
  ENDINGS,
  SIGNAL_TARGET_FREQ,
  SIGNAL_TOLERANCE,
} from './storyData';
import type {
  AudioFilterMode,
  DialogueChoice,
  EndingType,
  GameNotification,
  GameState,
  PatrolOrder,
  RunSnapshot,
} from './types';

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(input: number | string): string {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)] ?? d);
}

export function formatClock(elapsedMinutes: number): string {
  const baseMinutes = 2 * 60 + 47; // 02:47 AM
  const total = (baseMinutes + Math.max(0, Math.floor(elapsedMinutes))) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return toPersianDigits(`${hh}:${mm}`);
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function addNotification(
  state: GameState,
  kind: GameNotification['kind'],
  title: string,
  detail: string
): { seq: number; notification: GameNotification } {
  const seq = state.notificationSeq + 1;
  return {
    seq,
    notification: { id: seq, kind, title, detail },
  };
}

function addClueUnique(existing: string[], clueId?: string): { list: string[]; added: boolean } {
  if (!clueId || !CLUES[clueId] || existing.includes(clueId)) {
    return { list: existing, added: false };
  }
  return { list: [...existing, clueId], added: true };
}

export function createInitialState(startPlaying = false): GameState {
  return {
    phase: startPlaying ? 'playing' : 'title',
    callPhase: 'ringing',
    currentNodeId: 'n_intro',
    score: 0,
    tension: 18,
    callerTrust: 50,
    elapsedMinutes: 0,
    lineInspected: false,
    signalFrequency: 89.2,
    signalTraced: false,
    inspectedArchiveIds: [],
    activeAudioFilter: 'raw',
    audioAnalyzed: false,
    inspectedCameras: [],
    patrolOrder: 'standby',
    doorLocked: true,
    discoveredClueIds: [],
    verifiedContradictionIds: [],
    transcript: [
      {
        id: 'sys_boot',
        speaker: 'system',
        speakerLabel: 'سیستم مرکز دیسپچ',
        text: 'شیفت شب مرکز فوریت‌های شماره ۴ آغاز شد. بارش شدید در بخش شمالی. تماس ورودی ناشناس روی خط اضطراری ۱ در حال زنگ خوردن است.',
        timestamp: formatClock(0),
      },
    ],
    ending: null,
    lastActionFeedback: null,
    notificationSeq: 0,
    decisionsCount: 0,
  };
}

export function inspectLineBeforeAnswer(state: GameState): GameState {
  if (state.callPhase !== 'ringing' || state.lineInspected) {
    return state;
  }
  const { seq, notification } = addNotification(
    state,
    'info',
    'گزارش فنی خط ورودی',
    'خط ورودی شماره ندارد و مسیر آن از طریق رله داخلی ساختمان فوریت‌ها عبور کرده است! (+۵۰ امتیاز)'
  );
  return {
    ...state,
    lineInspected: true,
    score: state.score + 50,
    tension: clamp(state.tension + 4, 0, 100),
    notificationSeq: seq,
    lastActionFeedback: notification,
    transcript: [
      ...state.transcript,
      {
        id: `sys_meta_${seq}`,
        speaker: 'system',
        speakerLabel: 'تحلیلگر خط',
        text: 'هشدار فنی: تماس ورودی برچسب «جاده آبشار» دارد اما ولتاژ خط مشابه خطوط داخلی ساختمان است.',
        timestamp: formatClock(state.elapsedMinutes),
      },
    ],
  };
}

export function answerIncomingCall(state: GameState): GameState {
  if (state.callPhase !== 'ringing') {
    return state;
  }
  const introNode = DIALOGUE_NODES.n_intro;
  const { list: discoveredClueIds, added } = addClueUnique(
    state.discoveredClueIds,
    introNode.grantsClueId
  );
  const scoreGain = 30 + (added ? 60 : 0);
  const clock = formatClock(state.elapsedMinutes + introNode.timeAdvanceMinutes);
  const { seq, notification } = addNotification(
    state,
    'clue',
    'تماس وصل شد — سرنخ جدید',
    CLUES.claim_location.title
  );

  return {
    ...state,
    callPhase: 'active',
    currentNodeId: introNode.id,
    elapsedMinutes: state.elapsedMinutes + introNode.timeAdvanceMinutes,
    score: state.score + scoreGain,
    discoveredClueIds,
    notificationSeq: seq,
    lastActionFeedback: notification,
    transcript: [
      ...state.transcript,
      {
        id: 'sys_connected',
        speaker: 'system',
        speakerLabel: 'خط اضطراری ۱',
        text: 'تماس برقرار شد. ضبط خودکار مکالمه فعال است.',
        timestamp: clock,
      },
      {
        id: `caller_${introNode.id}`,
        speaker: 'caller',
        speakerLabel: 'تماس‌گیرنده ناشناس',
        text: introNode.callerLine,
        timestamp: clock,
        isSuspicious: introNode.isSuspicious,
      },
    ],
  };
}

export function getAvailableChoices(state: GameState): Array<
  DialogueChoice & { locked: boolean; lockReason?: string }
> {
  const node = DIALOGUE_NODES[state.currentNodeId];
  if (!node || state.callPhase !== 'active') {
    return [];
  }
  return node.choices.map((choice) => {
    if (
      choice.requiresContradictionId &&
      !state.verifiedContradictionIds.includes(choice.requiresContradictionId)
    ) {
      const contra = CONTRADICTIONS.find((c) => c.id === choice.requiresContradictionId);
      return {
        ...choice,
        locked: true,
        lockReason: `نیازمند اثبات «${contra?.title ?? 'تناقض'}» در تابلوی سرنخ`,
      };
    }
    if (choice.requiresClueId && !state.discoveredClueIds.includes(choice.requiresClueId)) {
      return {
        ...choice,
        locked: true,
        lockReason: 'نیازمند بررسی شواهد در میز ابزارها',
      };
    }
    return { ...choice, locked: false };
  });
}

export function evaluateFinalEnding(state: GameState): EndingType {
  // True Ending requires: door remains locked, patrol summoned to dispatch_center, and >= 2 contradictions proved.
  if (
    state.doorLocked &&
    state.patrolOrder === 'dispatch_center' &&
    state.verifiedContradictionIds.length >= 2
  ) {
    return 'truth';
  }
  // If door is unlocked OR patrol was sent away to Villa 14 without proof, the trap springs!
  if (!state.doorLocked || state.patrolOrder === 'villa14') {
    return 'trap';
  }
  // Door stayed locked & patrol didn't leave, even with fewer contradictions -> Survival Ending
  return 'survival';
}

function finalizeEnding(state: GameState, ending: EndingType): GameState {
  const info = ENDINGS[ending];
  const finalScore = Math.max(0, state.score + info.bonusScore);
  const { seq, notification } = addNotification(
    state,
    info.isVictory ? 'contradiction' : 'warning',
    info.title,
    info.subtitle
  );

  return {
    ...state,
    phase: 'gameover',
    callPhase: 'ended',
    ending,
    score: finalScore,
    notificationSeq: seq,
    lastActionFeedback: notification,
  };
}

export function selectDialogueChoice(state: GameState, choiceId: string): GameState {
  if (state.phase !== 'playing' || state.callPhase !== 'active') {
    return state;
  }
  const available = getAvailableChoices(state);
  const choice = available.find((c) => c.id === choiceId);
  if (!choice || choice.locked) {
    return state;
  }

  let nextTension = clamp(state.tension + choice.tensionDelta, 0, 100);
  const nextTrust = clamp(state.callerTrust + choice.trustDelta, 0, 100);
  let nextScore = Math.max(0, state.score + choice.scoreDelta);
  let nextMinutes = state.elapsedMinutes + 1;
  const opClock = formatClock(nextMinutes);

  const newEntries = [
    ...state.transcript,
    {
      id: `op_${choice.id}_${state.decisionsCount}`,
      speaker: 'operator' as const,
      speakerLabel: 'شما (اپراتور)',
      text: choice.operatorReply,
      timestamp: opClock,
      isConfrontation: choice.tone === 'confront' || choice.tone === 'decisive',
    },
  ];

  if (choice.systemNote) {
    newEntries.push({
      id: `sys_note_${choice.id}_${state.decisionsCount}`,
      speaker: 'system' as const,
      speakerLabel: 'یادداشت سیستم',
      text: choice.systemNote,
      timestamp: opClock,
    });
  }

  // If the player explicitly complied with the trap at n_pressure, mark door unlocked / patrol fooled only if still default
  let nextPatrol = state.patrolOrder;
  let nextDoorLocked = state.doorLocked;
  if (choice.id === 'c_press_comply' && nextPatrol === 'standby') {
    nextPatrol = 'villa14';
  }
  if (choice.id === 'c_final_bargain') {
    nextDoorLocked = false;
  }

  // Check tension overflow panic defeat
  if (nextTension >= 100 && !choice.evaluatesFinalOutcome && !choice.triggersEnding) {
    return finalizeEnding(
      {
        ...state,
        score: nextScore,
        tension: 100,
        callerTrust: nextTrust,
        elapsedMinutes: nextMinutes,
        patrolOrder: nextPatrol,
        doorLocked: nextDoorLocked,
        transcript: newEntries,
        decisionsCount: state.decisionsCount + 1,
      },
      'panic'
    );
  }

  // Check terminal choice
  if (choice.triggersEnding) {
    return finalizeEnding(
      {
        ...state,
        score: nextScore,
        tension: nextTension,
        callerTrust: nextTrust,
        elapsedMinutes: nextMinutes,
        patrolOrder: nextPatrol,
        doorLocked: nextDoorLocked,
        transcript: newEntries,
        decisionsCount: state.decisionsCount + 1,
      },
      choice.triggersEnding
    );
  }

  if (choice.evaluatesFinalOutcome) {
    const intermediate: GameState = {
      ...state,
      score: nextScore,
      tension: nextTension,
      callerTrust: nextTrust,
      elapsedMinutes: nextMinutes,
      patrolOrder: nextPatrol,
      doorLocked: nextDoorLocked,
      transcript: newEntries,
      decisionsCount: state.decisionsCount + 1,
    };
    const resolvedEnding = evaluateFinalEnding(intermediate);
    return finalizeEnding(intermediate, resolvedEnding);
  }

  // Transition to next dialogue node
  if (!choice.nextNodeId || !DIALOGUE_NODES[choice.nextNodeId]) {
    return state;
  }

  const nextNode = DIALOGUE_NODES[choice.nextNodeId];
  nextMinutes += nextNode.timeAdvanceMinutes;
  const callerClock = formatClock(nextMinutes);

  const clueRes = addClueUnique(state.discoveredClueIds, nextNode.grantsClueId);
  if (clueRes.added) {
    nextScore += 60;
  }

  newEntries.push({
    id: `caller_${nextNode.id}_${state.decisionsCount}`,
    speaker: 'caller' as const,
    speakerLabel: nextNode.id === 'n_revelation' ? 'صدای واقعی روی خط' : 'تماس‌گیرنده ناشناس',
    text: nextNode.callerLine,
    timestamp: callerClock,
    isSuspicious: nextNode.isSuspicious,
  });

  if (nextNode.patrolMessage) {
    newEntries.push({
      id: `patrol_${nextNode.id}`,
      speaker: 'patrol' as const,
      speakerLabel: 'بی‌سیم گشت ۲۰۴',
      text: nextNode.patrolMessage,
      timestamp: callerClock,
    });
  }

  // Slight natural tension bump on revelation
  if (nextNode.id === 'n_revelation') {
    nextTension = clamp(nextTension + 8, 0, 96);
  }

  const notifPayload = clueRes.added && nextNode.grantsClueId
    ? addNotification(
        state,
        'clue',
        'سرنخ جدید ثبت شد (+۶۰ امتیاز)',
        CLUES[nextNode.grantsClueId].title
      )
    : nextNode.systemAlert
    ? addNotification(state, 'info', 'به‌روزرسانی پرونده', nextNode.systemAlert)
    : { seq: state.notificationSeq, notification: state.lastActionFeedback };

  return {
    ...state,
    currentNodeId: nextNode.id,
    score: nextScore,
    tension: nextTension,
    callerTrust: nextTrust,
    elapsedMinutes: nextMinutes,
    patrolOrder: nextPatrol,
    doorLocked: nextDoorLocked,
    discoveredClueIds: clueRes.list,
    transcript: newEntries,
    decisionsCount: state.decisionsCount + 1,
    notificationSeq: notifPayload.seq,
    lastActionFeedback: notifPayload.notification,
  };
}

export function setSignalFrequency(state: GameState, frequency: number): GameState {
  return {
    ...state,
    signalFrequency: Math.round(clamp(frequency, 88.0, 108.0) * 10) / 10,
  };
}

export function lockSignalTrace(state: GameState): GameState {
  if (state.signalTraced) {
    return state;
  }
  const diff = Math.abs(state.signalFrequency - SIGNAL_TARGET_FREQ);
  if (diff > SIGNAL_TOLERANCE) {
    const { seq, notification } = addNotification(
      state,
      'warning',
      'سیگنال قفل نشد',
      `فرکانس را نزدیک ${toPersianDigits(SIGNAL_TARGET_FREQ.toFixed(1))} مگاهرتز تنظیم کنید تا دکل اصلی مشخص شود.`
    );
    return {
      ...state,
      tension: clamp(state.tension + 2, 0, 99),
      notificationSeq: seq,
      lastActionFeedback: notification,
    };
  }

  const clueRes = addClueUnique(state.discoveredClueIds, 'fact_tower');
  const { seq, notification } = addNotification(
    state,
    'clue',
    'موقعیت دکل کشف شد (+۶۰ امتیاز)',
    'منبع تماس در ۸۵ متری همین مرکز دیسپچ است — نه در ویلای جاده آبشار!'
  );

  return {
    ...state,
    signalFrequency: SIGNAL_TARGET_FREQ,
    signalTraced: true,
    score: state.score + (clueRes.added ? 60 : 0),
    discoveredClueIds: clueRes.list,
    notificationSeq: seq,
    lastActionFeedback: notification,
    transcript: [
      ...state.transcript,
      {
        id: `sys_trace_${seq}`,
        speaker: 'system',
        speakerLabel: 'ردیاب سیگنال',
        text: 'تثبیت فرکانس موفق: سیگنال از دکل داخلی محوطه مرکز فوریت‌های شماره ۴ (فاصله تخمینی ۸۵ متر) ارسال می‌شود.',
        timestamp: formatClock(state.elapsedMinutes),
      },
    ],
  };
}

export function inspectArchiveRecord(state: GameState, recordId: string): GameState {
  const record = ARCHIVE_RECORDS.find((r) => r.id === recordId);
  if (!record) {
    return state;
  }
  const alreadyRead = state.inspectedArchiveIds.includes(recordId);
  const inspectedArchiveIds = alreadyRead
    ? state.inspectedArchiveIds
    : [...state.inspectedArchiveIds, recordId];

  const clueRes = addClueUnique(state.discoveredClueIds, record.grantsClueId);
  let scoreGain = 0;
  if (!alreadyRead) scoreGain += 25;
  if (clueRes.added) scoreGain += 60;

  if (!alreadyRead || clueRes.added) {
    const { seq, notification } = addNotification(
      state,
      clueRes.added ? 'clue' : 'info',
      clueRes.added ? 'مدرک حیاتی بایگانی کشف شد (+۸۵ امتیاز)' : `مطالعه ${record.code} (+۲۵ امتیاز)`,
      clueRes.added ? CLUES.fact_archive.title : record.title
    );
    return {
      ...state,
      inspectedArchiveIds,
      discoveredClueIds: clueRes.list,
      score: state.score + scoreGain,
      notificationSeq: seq,
      lastActionFeedback: notification,
    };
  }

  return state;
}

export function applyAudioFilter(state: GameState, mode: AudioFilterMode): GameState {
  if (mode === 'isolate_room' && !state.audioAnalyzed) {
    const clueRes = addClueUnique(state.discoveredClueIds, 'fact_audio');
    const { seq, notification } = addNotification(
      state,
      'clue',
      'صدای پنهان پس‌زمینه کشف شد (+۶۰ امتیاز)',
      'در پس‌زمینه تماس بارانی نیست؛ صدای فن زیرزمین و ساعت دیواری همین مرکز شنیده می‌شود!'
    );
    return {
      ...state,
      activeAudioFilter: mode,
      audioAnalyzed: true,
      score: state.score + (clueRes.added ? 60 : 0),
      discoveredClueIds: clueRes.list,
      notificationSeq: seq,
      lastActionFeedback: notification,
      transcript: [
        ...state.transcript,
        {
          id: `sys_audio_${seq}`,
          speaker: 'system',
          speakerLabel: 'تحلیلگر طیف صوتی',
          text: 'ایزوله‌سازی محیط تکمیل شد: صدای فن تهویه زیرزمین و تیک‌تاک ساعت دیواری سالن مرکز دیسپچ در خط شناسایی شد.',
          timestamp: formatClock(state.elapsedMinutes),
        },
      ],
    };
  }

  return {
    ...state,
    activeAudioFilter: mode,
  };
}

export function inspectCctvCamera(state: GameState, cameraId: 'rear' | 'villa'): GameState {
  const alreadySeen = state.inspectedCameras.includes(cameraId);
  const inspectedCameras = alreadySeen ? state.inspectedCameras : [...state.inspectedCameras, cameraId];

  if (cameraId === 'rear') {
    const clueRes = addClueUnique(state.discoveredClueIds, 'fact_cctv');
    if (clueRes.added) {
      const { seq, notification } = addNotification(
        state,
        'warning',
        'هشدار دوربین مداربسته! (+۶۰ امتیاز)',
        'شخصی با بارانی تیره درست پشت درب فولادی ورودی پشتی همین ساختمان ایستاده است!'
      );
      return {
        ...state,
        inspectedCameras,
        discoveredClueIds: clueRes.list,
        score: state.score + 60,
        tension: clamp(state.tension + 10, 0, 96),
        notificationSeq: seq,
        lastActionFeedback: notification,
      };
    }
  }

  if (!alreadySeen && cameraId === 'villa') {
    const { seq, notification } = addNotification(
      state,
      'info',
      'تصویر آرشیوی دوربین جاده آبشار (+۲۵ امتیاز)',
      'ویلای ۱۴ کاملاً سوخته و خالی از سکنه است.'
    );
    return {
      ...state,
      inspectedCameras,
      score: state.score + 25,
      notificationSeq: seq,
      lastActionFeedback: notification,
    };
  }

  return {
    ...state,
    inspectedCameras,
  };
}

export function setPatrolOrder(state: GameState, order: PatrolOrder): GameState {
  if (state.patrolOrder === order) {
    return state;
  }
  const clock = formatClock(state.elapsedMinutes);
  let msg = 'گشت ۲۰۴ در حالت آماده‌باش قرار گرفت.';
  let scoreDelta = 0;

  if (order === 'dispatch_center') {
    msg = 'گشت ۲۰۴ پیام گرفت: در حال حرکت با آژیر خاموش به سمت مرکز فوریت‌های شماره ۴ (زمان رسیدن: ۴ دقیقه).';
    scoreDelta = state.patrolOrder === 'standby' ? 75 : 50;
  } else if (order === 'villa14') {
    msg = 'گشت ۲۰۴ پیام گرفت: در حال حرکت به سمت جاده قدیم آبشار (فاصله ۲۲ دقیقه از مرکز).';
    scoreDelta = -30;
  }

  const { seq, notification } = addNotification(
    state,
    order === 'dispatch_center' ? 'clue' : 'warning',
    order === 'dispatch_center' ? 'فراخوان گشت ۲۰۴ به مرکز' : 'اعزام گشت ۲۰۴ به جاده آبشار',
    msg
  );

  return {
    ...state,
    patrolOrder: order,
    score: Math.max(0, state.score + scoreDelta),
    notificationSeq: seq,
    lastActionFeedback: notification,
    transcript: [
      ...state.transcript,
      {
        id: `patrol_order_${seq}`,
        speaker: 'patrol',
        speakerLabel: 'بی‌سیم گشت ۲۰۴',
        text: msg,
        timestamp: clock,
      },
    ],
  };
}

export function toggleDoorLock(state: GameState): GameState {
  const nextLocked = !state.doorLocked;
  const { seq, notification } = addNotification(
    state,
    nextLocked ? 'info' : 'warning',
    nextLocked ? 'درب پشتی قفل امنیتی شد' : 'هشدار: قفل درب پشتی باز شد!',
    nextLocked
      ? 'قفل الکترومغناطیسی درب سرویس پشتی فعال است.'
      : 'درب فولادی ورودی پشتی اکنون بدون قفل است!'
  );
  return {
    ...state,
    doorLocked: nextLocked,
    tension: clamp(state.tension + (nextLocked ? -3 : 10), 0, 98),
    notificationSeq: seq,
    lastActionFeedback: notification,
  };
}

export function verifyContradiction(
  state: GameState,
  clueIdA: string,
  clueIdB: string
): { state: GameState; matched: boolean; contradictionId?: string } {
  if (
    !clueIdA ||
    !clueIdB ||
    clueIdA === clueIdB ||
    !state.discoveredClueIds.includes(clueIdA) ||
    !state.discoveredClueIds.includes(clueIdB)
  ) {
    return { state, matched: false };
  }

  const match = CONTRADICTIONS.find(
    (c) =>
      (c.clueIds[0] === clueIdA && c.clueIds[1] === clueIdB) ||
      (c.clueIds[0] === clueIdB && c.clueIds[1] === clueIdA)
  );

  if (!match) {
    const { seq, notification } = addNotification(
      state,
      'warning',
      'تطبیق ناموفق',
      'این دو سرنخ مستقیماً با هم تناقض ندارند. یک «ادعای تماس‌گیرنده» را با «شاهد فنی» مرتبط تطبیق دهید.'
    );
    return {
      matched: false,
      state: {
        ...state,
        tension: clamp(state.tension + 3, 0, 99),
        notificationSeq: seq,
        lastActionFeedback: notification,
      },
    };
  }

  if (state.verifiedContradictionIds.includes(match.id)) {
    const { seq, notification } = addNotification(
      state,
      'info',
      'قبلاً ثبت شده',
      `تناقض «${match.title}» پیش‌تر در پرونده ثبت شده است.`
    );
    return {
      matched: false,
      state: {
        ...state,
        notificationSeq: seq,
        lastActionFeedback: notification,
      },
    };
  }

  const { seq, notification } = addNotification(
    state,
    'contradiction',
    `تناقض اثبات شد (+${toPersianDigits(match.points)} امتیاز)`,
    `${match.title} — گزینه جدید مواجهه در گفتگوی تماس باز شد!`
  );

  return {
    matched: true,
    contradictionId: match.id,
    state: {
      ...state,
      verifiedContradictionIds: [...state.verifiedContradictionIds, match.id],
      score: state.score + match.points,
      tension: clamp(state.tension - 6, 0, 100),
      notificationSeq: seq,
      lastActionFeedback: notification,
      transcript: [
        ...state.transcript,
        {
          id: `contra_${match.id}`,
          speaker: 'system',
          speakerLabel: 'ثبت تناقض پرونده',
          text: `${match.title}: ${match.summary}`,
          timestamp: formatClock(state.elapsedMinutes),
        },
      ],
    },
  };
}

export function calculateFinalRank(score: number, ending: EndingType): string {
  if (ending === 'truth' && score >= 1100) return 'اپراتور افسانه‌ای شیفت شب';
  if (ending === 'truth') return 'کارآگاه هوشیار دیسپچ';
  if (ending === 'survival' && score >= 650) return 'بازمانده تیزبین';
  if (ending === 'survival') return 'بازمانده شب بارانی';
  return 'قربانی آخرین تماس';
}

export function buildRunSnapshot(state: GameState, prevBestScore: number): RunSnapshot {
  const ending: EndingType = state.ending ?? 'survival';
  const bestScore = Math.max(prevBestScore, state.score);
  return {
    ending,
    score: state.score,
    bestScore,
    rankTitle: calculateFinalRank(state.score, ending),
    cluesFound: state.discoveredClueIds.length,
    totalClues: Object.keys(CLUES).length,
    contradictionsFound: state.verifiedContradictionIds.length,
    totalContradictions: CONTRADICTIONS.length,
    finalClock: formatClock(state.elapsedMinutes),
    patrolOrder: state.patrolOrder,
    doorLocked: state.doorLocked,
  };
}
