export type AppPhase = 'title' | 'playing' | 'paused' | 'gameover';

export type CallPhase = 'ringing' | 'active' | 'ended';

export type MobileTab = 'call' | 'tools' | 'clues';

export type ToolSubTab = 'signal' | 'archive' | 'audio' | 'cctv';

export type AudioFilterMode = 'raw' | 'remove_rain' | 'boost_low' | 'isolate_room';

export type PatrolOrder = 'standby' | 'villa14' | 'dispatch_center';

export type EndingType = 'truth' | 'survival' | 'trap' | 'panic';

export type ClueCategory = 'claim' | 'fact';

export interface Clue {
  id: string;
  title: string;
  detail: string;
  source: string;
  category: ClueCategory;
}

export interface ContradictionDefinition {
  id: string;
  clueIds: [string, string];
  title: string;
  summary: string;
  points: number;
}

export interface ArchiveRecord {
  id: string;
  code: string;
  title: string;
  date: string;
  classification: string;
  excerpt: string;
  body: string;
  grantsClueId?: string;
  hasPhoto?: boolean;
}

export interface TranscriptEntry {
  id: string;
  speaker: 'caller' | 'operator' | 'system' | 'patrol';
  speakerLabel: string;
  text: string;
  timestamp: string;
  isSuspicious?: boolean;
  isConfrontation?: boolean;
}

export interface DialogueChoice {
  id: string;
  text: string;
  tone: 'calm' | 'probe' | 'confront' | 'decisive' | 'risky';
  nextNodeId: string | null;
  requiresContradictionId?: string;
  requiresClueId?: string;
  scoreDelta: number;
  tensionDelta: number;
  trustDelta: number;
  operatorReply: string;
  systemNote?: string;
  triggersEnding?: EndingType;
  evaluatesFinalOutcome?: boolean;
}

export interface DialogueNode {
  id: string;
  callerLine: string;
  callerEmotion: string;
  isSuspicious?: boolean;
  grantsClueId?: string;
  systemAlert?: string;
  patrolMessage?: string;
  timeAdvanceMinutes: number;
  choices: DialogueChoice[];
}

export interface GameNotification {
  id: number;
  kind: 'clue' | 'contradiction' | 'warning' | 'info';
  title: string;
  detail: string;
}

export interface GameState {
  phase: AppPhase;
  callPhase: CallPhase;
  currentNodeId: string;
  score: number;
  tension: number; // 0 to 100
  callerTrust: number; // 0 to 100
  elapsedMinutes: number; // starts at 0 -> 02:47
  lineInspected: boolean;
  signalFrequency: number; // 88.0 to 108.0, target 94.6
  signalTraced: boolean;
  inspectedArchiveIds: string[];
  activeAudioFilter: AudioFilterMode;
  audioAnalyzed: boolean;
  inspectedCameras: string[];
  patrolOrder: PatrolOrder;
  doorLocked: boolean;
  discoveredClueIds: string[];
  verifiedContradictionIds: string[];
  transcript: TranscriptEntry[];
  ending: EndingType | null;
  lastActionFeedback: GameNotification | null;
  notificationSeq: number;
  decisionsCount: number;
}

export interface RunSnapshot {
  ending: EndingType;
  score: number;
  bestScore: number;
  rankTitle: string;
  cluesFound: number;
  totalClues: number;
  contradictionsFound: number;
  totalContradictions: number;
  finalClock: string;
  patrolOrder: PatrolOrder;
  doorLocked: boolean;
}
