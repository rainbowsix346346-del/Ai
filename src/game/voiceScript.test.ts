import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeEffectiveSpeechParams,
  getAllRequiredNodeIds,
  getAllVoiceCues,
  getVoiceScriptForNode,
  NODE_VOICE_SCRIPTS,
  PATROL_VOICE_SCRIPTS,
  VOICE_PERSONAS,
} from './voiceScript';
import { clampVoiceVolume, computeAudioTrimBounds, createIdleVoiceSnapshot } from './voiceEngine';

test('every dialogue node has a complete Persian voice script with timed cues and audio URLs', () => {
  const nodeIds = getAllRequiredNodeIds();
  assert.ok(nodeIds.length >= 5);

  for (const id of nodeIds) {
    const script = getVoiceScriptForNode(id);
    if (!script) {
      assert.fail(`Missing voice script for dialogue node ${id}`);
      continue;
    }
    assert.ok(script.cues.length >= 3, `Node ${id} should have multiple dramatic phrases`);

    for (const [i, cue] of script.cues.entries()) {
      assert.ok(cue.text.trim().length > 0);
      assert.ok(cue.audioUrl.startsWith('/src/assets/audio/') && cue.audioUrl.endsWith('.wav'));
      assert.ok(cue.ttsPromptText.trim().length > 0);
      assert.ok(cue.actingDirection.trim().length > 0);
      assert.ok(cue.fallbackDurationMs >= 1000, `Fallback duration too short for ${cue.id}`);
      assert.ok(cue.pauseBeforeMs >= 0 && cue.pauseAfterMs >= 0);
      // Consecutive cues must not double-stack pauseBeforeMs on top of previous pauseAfterMs
      if (i > 0) {
        assert.equal(cue.pauseBeforeMs, 0, `Consecutive cue ${cue.id} should not stack pauseBeforeMs`);
      }
      // Inter-cue pauseAfterMs stays tight (<= 180ms; combined with 120ms edge pad -> ~200-300ms natural gap)
      assert.ok(cue.pauseAfterMs <= 180, `Transition pause too long on ${cue.id}: ${cue.pauseAfterMs}ms`);
      // Ensure zero stray English words in displayed Persian subtitles
      assert.equal(/[A-Za-z]/.test(cue.text), false, `English characters found in cue: ${cue.text}`);
    }
  }
});

test('computeAudioTrimBounds trims dead leading/trailing silence while preserving internal pauses and breath cushions', () => {
  const sr = 24000;
  // 2.0s buffer: [0..0.5s silence] [0.5..0.8s speech] [0.8..1.2s intentional internal pause] [1.2..1.4s speech] [1.4..2.0s silence]
  const samples = new Float32Array(sr * 2);
  for (let i = Math.floor(0.5 * sr); i < Math.floor(0.8 * sr); i++) {
    samples[i] = 0.25 * Math.sin(i * 0.1);
  }
  for (let i = Math.floor(1.2 * sr); i < Math.floor(1.4 * sr); i++) {
    samples[i] = 0.25 * Math.sin(i * 0.1);
  }

  const bounds = computeAudioTrimBounds(samples, sr);
  // Lead should trim to ~0.5 - 0.045 = 0.455s
  assert.ok(bounds.trimStartSec >= 0.43 && bounds.trimStartSec <= 0.48, `Unexpected trimStartSec: ${bounds.trimStartSec}`);
  // Trail should trim to ~1.4 + 0.075 = 1.475s (preserving the 0.8..1.2s internal dramatic pause intact!)
  assert.ok(bounds.trimEndSec >= 1.45 && bounds.trimEndSec <= 1.51, `Unexpected trimEndSec: ${bounds.trimEndSec}`);
});

test('distinct caller personas have distinct Gemini voices and telephone EQ profiles', () => {
  const sara = VOICE_PERSONAS.sara_tape;
  const amir = VOICE_PERSONAS.amirhossein_real;
  const patrol = VOICE_PERSONAS.patrol_radio;

  const voiceSet = new Set([sara.geminiVoiceName, amir.geminiVoiceName, patrol.geminiVoiceName]);
  assert.equal(voiceSet.size, 3, 'Each character must have a distinct Gemini voice');

  assert.equal(sara.preferredGender, 'female');
  assert.equal(amir.preferredGender, 'male');
  assert.equal(patrol.preferredGender, 'male');

  // Amirhossein's real internal line has wider bandwidth than Sara's cassette tape or Patrol VHF radio
  assert.ok(amir.telephoneProfile.lowpassHz > sara.telephoneProfile.lowpassHz);
  assert.ok(patrol.telephoneProfile.highpassHz > sara.telephoneProfile.highpassHz);
  assert.ok(patrol.staticLevel > amir.staticLevel);

  assert.equal(NODE_VOICE_SCRIPTS.n_intro.persona, 'sara_tape');
  assert.equal(NODE_VOICE_SCRIPTS.n_revelation.persona, 'amirhossein_real');
  assert.equal(PATROL_VOICE_SCRIPTS.checkin.persona, 'patrol_radio');
});

test('all 22 pre-generated Persian WAV files exist on disk with valid RIFF/WAVE headers', () => {
  const allCues = getAllVoiceCues();
  assert.equal(allCues.length, 22);

  for (const { cue } of allCues) {
    const filePath = path.resolve(process.cwd(), cue.audioUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `Missing pre-generated audio file: ${cue.audioUrl}`);
    const buf = fs.readFileSync(filePath);
    assert.ok(buf.length >= 8000, `Audio file too small (${buf.length} bytes): ${cue.id}`);
    assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF', `Invalid RIFF header: ${cue.id}`);
    assert.equal(buf.subarray(8, 12).toString('ascii'), 'WAVE', `Invalid WAVE header: ${cue.id}`);
    const sampleRate = buf.readUInt32LE(24);
    assert.equal(sampleRate, 24000, `Expected 24kHz WAV sample rate for ${cue.id}`);
  }
});

test('voiceEngine contains strictly zero browser SpeechSynthesis references', () => {
  const engineSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/game/voiceEngine.ts'),
    'utf8'
  );
  assert.equal(/speechSynthesis/i.test(engineSource), false, 'voiceEngine must not use SpeechSynthesis');
});

test('computeEffectiveSpeechParams and volume clamping stay within safe bounds', () => {
  const sara = VOICE_PERSONAS.sara_tape;
  const whisperCue = NODE_VOICE_SCRIPTS.n_intro.cues.find((c) => c.emotion === 'whisper');
  assert.ok(whisperCue);

  const params = computeEffectiveSpeechParams(sara, whisperCue);
  assert.ok(params.pitch >= 0.5 && params.pitch <= 1.8);
  assert.ok(params.rate >= 0.6 && params.rate <= 1.45);
  assert.ok(params.volume >= 0.2 && params.volume <= 1.0);
  assert.ok(params.volume < sara.baseVolume);

  assert.equal(clampVoiceVolume(-0.2), 0);
  assert.equal(clampVoiceVolume(1.5), 1);
  assert.equal(clampVoiceVolume(0.75), 0.75);
  assert.equal(clampVoiceVolume(Number.NaN), 0.9);
});

test('createIdleVoiceSnapshot produces clean initial recorded_audio state', () => {
  const snap = createIdleVoiceSnapshot(false, 0.85);
  assert.equal(snap.status, 'idle');
  assert.equal(snap.mode, 'recorded_audio');
  assert.equal(snap.voiceMuted, false);
  assert.equal(snap.voiceVolume, 0.85);
  assert.equal(snap.energyLevel, 0);
  assert.equal(snap.activeCue, null);
});
