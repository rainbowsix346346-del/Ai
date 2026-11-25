import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerIncomingCall,
  applyAudioFilter,
  buildRunSnapshot,
  calculateFinalRank,
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
} from './engine';
import { SIGNAL_TARGET_FREQ } from './storyData';

test('toPersianDigits and formatClock render Persian numerals accurately', () => {
  assert.equal(toPersianDigits(123450), '۱۲۳۴۵۰');
  assert.equal(formatClock(0), '۰۲:۴۷');
  assert.equal(formatClock(13), '۰۳:۰۰');
});

test('inspecting line metadata and answering call awards score and unlocks first clue', () => {
  let state = createInitialState(true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.callPhase, 'ringing');
  assert.equal(state.score, 0);

  state = inspectLineBeforeAnswer(state);
  assert.equal(state.lineInspected, true);
  assert.equal(state.score, 50);

  // Calling inspect again should be idempotent
  const afterRepeat = inspectLineBeforeAnswer(state);
  assert.equal(afterRepeat.score, 50);

  state = answerIncomingCall(state);
  assert.equal(state.callPhase, 'active');
  assert.ok(state.discoveredClueIds.includes('claim_location'));
  assert.equal(state.score, 140); // 50 + 30 + 60
});

test('signal tracing requires frequency tuning near target and unlocks location contradiction', () => {
  let state = answerIncomingCall(createInitialState(true));

  // Wrong frequency fails lock
  state = setSignalFrequency(state, 102.0);
  state = lockSignalTrace(state);
  assert.equal(state.signalTraced, false);
  assert.ok(!state.discoveredClueIds.includes('fact_tower'));

  // Target frequency succeeds
  state = setSignalFrequency(state, SIGNAL_TARGET_FREQ);
  state = lockSignalTrace(state);
  assert.equal(state.signalTraced, true);
  assert.ok(state.discoveredClueIds.includes('fact_tower'));

  // Verify location contradiction
  const res = verifyContradiction(state, 'claim_location', 'fact_tower');
  assert.equal(res.matched, true);
  assert.equal(res.contradictionId, 'contra_location');
  assert.ok(res.state.verifiedContradictionIds.includes('contra_location'));
  assert.equal(res.state.score, state.score + 150);

  // Advance to n_identity and verify confrontation dialogue choice is unlocked
  const next = selectDialogueChoice(res.state, 'c_intro_calm');
  const choices = getAvailableChoices(next);
  const confrontChoice = choices.find((c) => c.id === 'c_id_confront_loc');
  assert.ok(confrontChoice);
  assert.equal(confrontChoice.locked, false);
});

test('invalid clue pairing does not match and gives warning without crashing', () => {
  let state = answerIncomingCall(createInitialState(true));
  state = inspectArchiveRecord(state, 'rec_402');
  const res = verifyContradiction(state, 'claim_location', 'fact_archive');
  assert.equal(res.matched, false);
  assert.equal(res.state.verifiedContradictionIds.length, 0);
  assert.equal(res.state.lastActionFeedback?.kind, 'warning');
});

test('full playthrough achieves Truth Ending with high score and rank', () => {
  let state = createInitialState(true);
  state = inspectLineBeforeAnswer(state);
  state = answerIncomingCall(state);

  // Trace signal & prove location contradiction
  state = setSignalFrequency(state, SIGNAL_TARGET_FREQ);
  state = lockSignalTrace(state);
  state = verifyContradiction(state, 'claim_location', 'fact_tower').state;

  // Beat 1 -> Beat 2
  state = selectDialogueChoice(state, 'c_intro_trace');

  // Inspect archive & prove identity contradiction
  state = inspectArchiveRecord(state, 'rec_402');
  state = verifyContradiction(state, 'claim_identity', 'fact_archive').state;

  // Beat 2 (Confront Location) -> Beat 3
  state = selectDialogueChoice(state, 'c_id_confront_loc');

  // Analyze audio & prove audio contradiction
  state = applyAudioFilter(state, 'isolate_room');
  state = verifyContradiction(state, 'claim_rain', 'fact_audio').state;

  // Beat 3 (Confront Identity) -> Beat 4
  state = selectDialogueChoice(state, 'c_snd_confront_id');

  // Check CCTV, prove trap contradiction, summon patrol to dispatch center (door stays locked)
  state = inspectCctvCamera(state, 'rear');
  state = verifyContradiction(state, 'claim_intruder', 'fact_cctv').state;
  state = setPatrolOrder(state, 'dispatch_center');
  assert.equal(state.doorLocked, true);

  // Beat 4 (Confront CCTV) -> Beat 5 (Revelation)
  state = selectDialogueChoice(state, 'c_press_confront_cctv');
  assert.equal(state.currentNodeId, 'n_revelation');

  // Final decision -> Truth Ending
  state = selectDialogueChoice(state, 'c_final_trap_arrest');
  assert.equal(state.phase, 'gameover');
  assert.equal(state.ending, 'truth');
  assert.ok(state.score >= 1100);

  const snapshot = buildRunSnapshot(state, 500);
  assert.equal(snapshot.ending, 'truth');
  assert.equal(snapshot.bestScore, state.score);
  assert.equal(snapshot.rankTitle, calculateFinalRank(state.score, 'truth'));
  assert.equal(snapshot.contradictionsFound, 4);
});

test('trusting caller and unlocking door or misrouting patrol triggers Trap Ending', () => {
  let state = answerIncomingCall(createInitialState(true));
  state = selectDialogueChoice(state, 'c_intro_rush');
  state = selectDialogueChoice(state, 'c_id_ask_room');
  state = selectDialogueChoice(state, 'c_snd_comfort');
  state = setPatrolOrder(state, 'villa14');
  state = toggleDoorLock(state); // unlocked!
  assert.equal(state.doorLocked, false);

  state = selectDialogueChoice(state, 'c_press_comply');
  state = selectDialogueChoice(state, 'c_final_trap_arrest');

  assert.equal(state.phase, 'gameover');
  assert.equal(state.ending, 'trap');
});

test('choosing emergency evacuation triggers Survival Ending', () => {
  let state = answerIncomingCall(createInitialState(true));
  state = selectDialogueChoice(state, 'c_intro_calm');
  state = selectDialogueChoice(state, 'c_id_brother');
  state = selectDialogueChoice(state, 'c_snd_comfort');
  state = selectDialogueChoice(state, 'c_press_stall');
  state = selectDialogueChoice(state, 'c_final_escape');

  assert.equal(state.phase, 'gameover');
  assert.equal(state.ending, 'survival');
});
