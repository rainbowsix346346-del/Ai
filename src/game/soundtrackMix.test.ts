import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  clampMusicVolume,
  computeSceneIntensity,
  computeSeamlessLoopWindow,
  computeTargetMusicMix,
  DIALOGUE_DUCK_RATIO,
  MAIN_SOUNDTRACK_URL,
  MUSIC_BASE_CEILING,
} from './soundtrackMix';

test('exact uploaded soundtrack file exists locally and has valid M4A container header', () => {
  const relPath = MAIN_SOUNDTRACK_URL.replace(/^\/+/, '');
  const fullPath = path.resolve(process.cwd(), 'public', relPath);
  assert.ok(fs.existsSync(fullPath), `Missing soundtrack file at ${fullPath}`);

  const stat = fs.statSync(fullPath);
  assert.ok(stat.size > 1_000_000, `Expected full soundtrack (>1MB), got ${stat.size} bytes`);

  const header = Buffer.alloc(12);
  const fd = fs.openSync(fullPath, 'r');
  try {
    fs.readSync(fd, header, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  assert.equal(header.toString('ascii', 4, 8), 'ftyp', 'Expected valid ISO MP4/M4A ftyp box');
});

test('Voice-First ducking reduces music to strictly 8–12% of normal level during character dialogue', () => {
  assert.ok(
    DIALOGUE_DUCK_RATIO >= 0.08 && DIALOGUE_DUCK_RATIO <= 0.12,
    `DIALOGUE_DUCK_RATIO (${DIALOGUE_DUCK_RATIO}) must stay inside 0.08..0.12`
  );

  for (const userVolume of [0.3, 0.65, 1.0]) {
    for (const tension of [18, 50, 88]) {
      const normal = computeTargetMusicMix({
        userVolume,
        musicMuted: false,
        phase: 'playing',
        callPhase: 'active',
        tension,
        dialogueSpeaking: false,
      });

      const ducked = computeTargetMusicMix({
        userVolume,
        musicMuted: false,
        phase: 'playing',
        callPhase: 'active',
        tension,
        dialogueSpeaking: true,
      });

      assert.ok(normal.targetGain > 0);
      assert.ok(normal.targetGain <= MUSIC_BASE_CEILING);
      assert.equal(ducked.ducked, true);
      assert.equal(ducked.vocalCarveActive, true);

      const ratio = ducked.targetGain / normal.targetGain;
      assert.ok(
        ratio >= 0.08 && ratio <= 0.12,
        `Ducking ratio ${ratio.toFixed(4)} outside 8-12% for vol=${userVolume}, tension=${tension}`
      );
    }
  }
});

test('independent music mute and volume clamping behave deterministically', () => {
  assert.equal(clampMusicVolume(-0.4), 0);
  assert.equal(clampMusicVolume(1.8), 1);
  assert.equal(clampMusicVolume(Number.NaN), 0.65);

  const muted = computeTargetMusicMix({
    userVolume: 0.9,
    musicMuted: true,
    phase: 'playing',
    callPhase: 'active',
    tension: 80,
    dialogueSpeaking: false,
  });
  assert.equal(muted.targetGain, 0);
  assert.equal(muted.normalGain, 0);
});

test('scene intensity escalates smoothly with tension and fades cleanly on pause and ending', () => {
  const calm = computeSceneIntensity('playing', 'active', 20);
  const suspense = computeSceneIntensity('playing', 'active', 55);
  const critical = computeSceneIntensity('playing', 'active', 85);
  const paused = computeSceneIntensity('paused', 'active', 85);
  const ending = computeSceneIntensity('gameover', 'ended', 85);

  assert.equal(calm.level, 'calm');
  assert.equal(suspense.level, 'suspense');
  assert.equal(critical.level, 'critical');
  assert.ok(calm.multiplier < suspense.multiplier);
  assert.ok(suspense.multiplier < critical.multiplier);
  assert.equal(paused.level, 'paused');
  assert.ok(paused.multiplier > 0 && paused.multiplier < calm.multiplier);
  assert.equal(ending.level, 'ending');
  assert.equal(ending.multiplier, 0);
});

test('seamless loop window schedules a clean 3.2s crossfade tail for the 175s soundtrack', () => {
  const win = computeSeamlessLoopWindow(175.4);
  assert.equal(win.crossfadeSec, 3.2);
  assert.ok(win.triggerAtSec > 171 && win.triggerAtSec < 173);
});
