import { DIALOGUE_NODES } from './storyData';

export type VoicePersonaId = 'sara_tape' | 'amirhossein_real' | 'patrol_radio';

export type GeminiVoiceName = 'Kore' | 'Charon' | 'Fenrir';

export type VoiceEmotion =
  | 'fear'
  | 'whisper'
  | 'hesitation'
  | 'frantic'
  | 'cold'
  | 'radio';

export type TelephoneEffectCue =
  | 'none'
  | 'breath'
  | 'static_burst'
  | 'signal_drop'
  | 'tape_click'
  | 'radio_squelch'
  | 'door_rattle';

export interface VoicePersonaProfile {
  id: VoicePersonaId;
  displayName: string;
  roleLabel: string;
  geminiVoiceName: GeminiVoiceName;
  preferredGender: 'female' | 'male';
  basePitch: number;
  baseRate: number;
  baseVolume: number;
  staticLevel: number;
  telephoneProfile: {
    highpassHz: number;
    lowpassHz: number;
    midBoostHz: number;
    midBoostDb: number;
    drive: number;
  };
}

export interface VoicePhraseCue {
  id: string;
  text: string;
  audioUrl: string;
  ttsPromptText: string;
  actingDirection: string;
  emotion: VoiceEmotion;
  emotionLabel: string;
  pauseBeforeMs: number;
  pauseAfterMs: number;
  rateMultiplier: number;
  pitchOffset: number;
  volumeMultiplier: number;
  effect: TelephoneEffectCue;
  fallbackDurationMs: number;
}

export interface DialogueVoiceScript {
  id: string;
  persona: VoicePersonaId;
  cues: VoicePhraseCue[];
}

const SARA_BASE_DIR =
  'Speak in natural modern Iranian Persian (Tehran accent, fa-IR — strictly Iranian Persian, never Dari or Afghan accent). Act as a terrified young Iranian woman in a realistic horror audio drama calling emergency dispatch at night.';

const AMIR_BASE_DIR =
  'Speak in natural modern Iranian Persian (Tehran accent, fa-IR — strictly Iranian Persian, never Dari or Afghan accent). Act as a chilling, ice-cold, composed Iranian male antagonist in a realistic psychological horror audio drama speaking directly into an internal intercom line.';

const PATROL_BASE_DIR =
  'Speak in natural modern Iranian Persian (Tehran accent, fa-IR — strictly Iranian Persian, never Dari or Afghan accent). Act as a seasoned, calm, authoritative Iranian police patrol sergeant speaking over a tactical VHF dispatch radio.';

export const VOICE_PERSONAS: Record<VoicePersonaId, VoicePersonaProfile> = {
  sara_tape: {
    id: 'sara_tape',
    displayName: 'سارا نادری',
    roleLabel: 'خط اضطراری ۱ · تماس ورودی',
    geminiVoiceName: 'Kore',
    preferredGender: 'female',
    basePitch: 1.18,
    baseRate: 0.94,
    baseVolume: 0.96,
    staticLevel: 0.35,
    telephoneProfile: {
      highpassHz: 320,
      lowpassHz: 3150,
      midBoostHz: 1450,
      midBoostDb: 3.5,
      drive: 1.35,
    },
  },
  amirhossein_real: {
    id: 'amirhossein_real',
    displayName: 'صدای واقعی روی خط',
    roleLabel: 'خط داخلی ساختمان · بدون فیلتر نوار',
    geminiVoiceName: 'Charon',
    preferredGender: 'male',
    basePitch: 0.72,
    baseRate: 0.84,
    baseVolume: 1.0,
    staticLevel: 0.18,
    telephoneProfile: {
      highpassHz: 150,
      lowpassHz: 4600,
      midBoostHz: 950,
      midBoostDb: 2.0,
      drive: 1.12,
    },
  },
  patrol_radio: {
    id: 'patrol_radio',
    displayName: 'سرگرد رضایی (گشت ۲۰۴)',
    roleLabel: 'بی‌سیم عملیاتی واحد ۲۰۴',
    geminiVoiceName: 'Fenrir',
    preferredGender: 'male',
    basePitch: 0.92,
    baseRate: 1.04,
    baseVolume: 0.94,
    staticLevel: 0.55,
    telephoneProfile: {
      highpassHz: 420,
      lowpassHz: 2550,
      midBoostHz: 1700,
      midBoostDb: 5.0,
      drive: 1.65,
    },
  },
};

export const NODE_VOICE_SCRIPTS: Record<string, DialogueVoiceScript> = {
  n_intro: {
    id: 'n_intro',
    persona: 'sara_tape',
    cues: [
      {
        id: 'intro_1',
        text: 'الو... صدای من رو می‌شنوید؟',
        audioUrl: '/src/assets/audio/intro_1.wav',
        ttsPromptText: '<breath> الو... صدای من رو می‌شنوید؟',
        actingDirection: `${SARA_BASE_DIR} Breathless, shaky hesitation, trembling voice, brief tense pause after الو.`,
        emotion: 'hesitation',
        emotionLabel: 'تردید و نفس‌نفس زدن',
        pauseBeforeMs: 60,
        pauseAfterMs: 80,
        rateMultiplier: 0.9,
        pitchOffset: 0.04,
        volumeMultiplier: 0.92,
        effect: 'breath',
        fallbackDurationMs: 2400,
      },
      {
        id: 'intro_2',
        text: 'خواهش می‌کنم قطع نکنید!',
        audioUrl: '/src/assets/audio/intro_2.wav',
        ttsPromptText: '<gasp> خواهش می‌کنم قطع نکنید!',
        actingDirection: `${SARA_BASE_DIR} Urgent desperate panic, voice cracking on the edge of tears, pleading intensely.`,
        emotion: 'fear',
        emotionLabel: 'هراس شدید',
        pauseBeforeMs: 0,
        pauseAfterMs: 90,
        rateMultiplier: 1.06,
        pitchOffset: 0.09,
        volumeMultiplier: 1.0,
        effect: 'static_burst',
        fallbackDurationMs: 2100,
      },
      {
        id: 'intro_3',
        text: 'من تو ویلای شماره ۱۴ جاده قدیم آبشار گیر افتادم...',
        audioUrl: '/src/assets/audio/intro_3.wav',
        ttsPromptText: 'من تو ویلای شماره چهارده جاده قدیم آبشار گیر افتادم...',
        actingDirection: `${SARA_BASE_DIR} Trembling, rushed, fearful voice trying to give the address clearly while terrified.`,
        emotion: 'fear',
        emotionLabel: 'صدای لرزان',
        pauseBeforeMs: 0,
        pauseAfterMs: 110,
        rateMultiplier: 0.96,
        pitchOffset: 0.02,
        volumeMultiplier: 0.96,
        effect: 'none',
        fallbackDurationMs: 3400,
      },
      {
        id: 'intro_4',
        text: 'یکی اومده تو خونه... برق‌ها رو قطع کرده!',
        audioUrl: '/src/assets/audio/intro_4.wav',
        ttsPromptText: '<breath> یکی اومده تو خونه... برق‌ها رو قطع کرده!',
        actingDirection: `${SARA_BASE_DIR} Terrified hushed whisper very close to the phone receiver, dread and suspense, dropping voice low so an intruder cannot hear.`,
        emotion: 'whisper',
        emotionLabel: 'زمزمه وحشت‌زده',
        pauseBeforeMs: 0,
        pauseAfterMs: 0,
        rateMultiplier: 0.88,
        pitchOffset: -0.04,
        volumeMultiplier: 0.84,
        effect: 'signal_drop',
        fallbackDurationMs: 2900,
      },
    ],
  },

  n_identity: {
    id: 'n_identity',
    persona: 'sara_tape',
    cues: [
      {
        id: 'id_1',
        text: 'اسم من... سارا نادریه.',
        audioUrl: '/src/assets/audio/id_1.wav',
        ttsPromptText: 'اسم من... <breath> سارا نادریه.',
        actingDirection: `${SARA_BASE_DIR} Fragile, hesitant, slightly unnatural pause before saying her own name, frightened and out of breath.`,
        emotion: 'hesitation',
        emotionLabel: 'مکث غیرطبیعی',
        pauseBeforeMs: 60,
        pauseAfterMs: 110,
        rateMultiplier: 0.86,
        pitchOffset: 0.0,
        volumeMultiplier: 0.92,
        effect: 'breath',
        fallbackDurationMs: 2400,
      },
      {
        id: 'id_2',
        text: 'تلفن همراه آنتن نداشت، سیم تلفن قدیمی راهرو رو وصل کردم.',
        audioUrl: '/src/assets/audio/id_2.wav',
        ttsPromptText: 'تلفن همراه آنتن نداشت، سیم تلفن قدیمی راهرو رو وصل کردم.',
        actingDirection: `${SARA_BASE_DIR} Hurried, anxious explanation with tense breathing and fast nervous cadence.`,
        emotion: 'fear',
        emotionLabel: 'توضیح شتاب‌زده',
        pauseBeforeMs: 0,
        pauseAfterMs: 90,
        rateMultiplier: 1.02,
        pitchOffset: 0.04,
        volumeMultiplier: 0.96,
        effect: 'none',
        fallbackDurationMs: 3600,
      },
      {
        id: 'id_3',
        text: 'برادرم کاوه ده دقیقه پیش رفت بنزین بیاره، الان صدای قدم‌هاش نیست...',
        audioUrl: '/src/assets/audio/id_3.wav',
        ttsPromptText: 'برادرم کاوه ده دقیقه پیش رفت بنزین بیاره، الان صدای قدم‌هاش نیست...',
        actingDirection: `${SARA_BASE_DIR} Shaking with worry and dread, voice trembling softly as she realizes something is horribly wrong.`,
        emotion: 'hesitation',
        emotionLabel: 'نگرانی و مکث',
        pauseBeforeMs: 0,
        pauseAfterMs: 110,
        rateMultiplier: 0.92,
        pitchOffset: 0.03,
        volumeMultiplier: 0.94,
        effect: 'static_burst',
        fallbackDurationMs: 3800,
      },
      {
        id: 'id_4',
        text: 'صدای چکمه سنگین میاد!',
        audioUrl: '/src/assets/audio/id_4.wav',
        ttsPromptText: '<gasp> صدای چکمه سنگین میاد!',
        actingDirection: `${SARA_BASE_DIR} Sharp fearful gasp followed by a panicked, breathless whisper full of terror.`,
        emotion: 'whisper',
        emotionLabel: 'زمزمه هراسان',
        pauseBeforeMs: 0,
        pauseAfterMs: 0,
        rateMultiplier: 0.85,
        pitchOffset: -0.05,
        volumeMultiplier: 0.82,
        effect: 'breath',
        fallbackDurationMs: 2200,
      },
    ],
  },

  n_sounds: {
    id: 'n_sounds',
    persona: 'sara_tape',
    cues: [
      {
        id: 'snd_1',
        text: 'شیشه پنجره شکسته، بارون سیل‌آسا داره می‌ریزه تو اتاق!',
        audioUrl: '/src/assets/audio/snd_1.wav',
        ttsPromptText: 'شیشه پنجره شکسته، بارون سیل‌آسا داره می‌ریزه تو اتاق!',
        actingDirection: `${SARA_BASE_DIR} Frantic, crying-edge panic, breathless and overwhelmed.`,
        emotion: 'frantic',
        emotionLabel: 'التماس و هیجان',
        pauseBeforeMs: 60,
        pauseAfterMs: 90,
        rateMultiplier: 1.08,
        pitchOffset: 0.08,
        volumeMultiplier: 0.98,
        effect: 'static_burst',
        fallbackDurationMs: 3200,
      },
      {
        id: 'snd_2',
        text: 'من رفتم تو کمد چوبی... چرا کسی نمی‌رسه؟',
        audioUrl: '/src/assets/audio/snd_2.wav',
        ttsPromptText: '<breath> من رفتم تو کمد چوبی... چرا کسی نمی‌رسه؟',
        actingDirection: `${SARA_BASE_DIR} Quiet, sobbing whisper hiding inside a closet, hopeless and trembling.`,
        emotion: 'whisper',
        emotionLabel: 'زمزمه زیر لب',
        pauseBeforeMs: 0,
        pauseAfterMs: 110,
        rateMultiplier: 0.86,
        pitchOffset: -0.03,
        volumeMultiplier: 0.84,
        effect: 'breath',
        fallbackDurationMs: 3000,
      },
      {
        id: 'snd_3',
        text: 'حس می‌کنم داره درِ کمد رو نگاه می‌کنه!',
        audioUrl: '/src/assets/audio/snd_3.wav',
        ttsPromptText: '<gasp> حس می‌کنم داره درِ کمد رو نگاه می‌کنه!',
        actingDirection: `${SARA_BASE_DIR} Choked terrified whisper, stifled cry of pure dread, barely able to breathe.`,
        emotion: 'fear',
        emotionLabel: 'ترس خفه',
        pauseBeforeMs: 0,
        pauseAfterMs: 100,
        rateMultiplier: 0.94,
        pitchOffset: 0.06,
        volumeMultiplier: 0.88,
        effect: 'signal_drop',
        fallbackDurationMs: 2800,
      },
      {
        id: 'snd_4',
        text: 'گوش کنید... صدای بارون نمی‌ذاره بشنوم کجاست!',
        audioUrl: '/src/assets/audio/snd_4.wav',
        ttsPromptText: 'گوش کنید... <breath> صدای بارون نمی‌ذاره بشنوم کجاست!',
        actingDirection: `${SARA_BASE_DIR} High-anxiety desperate plea, trembling and tense, listening in horror.`,
        emotion: 'frantic',
        emotionLabel: 'اضطراب بالا',
        pauseBeforeMs: 0,
        pauseAfterMs: 0,
        rateMultiplier: 1.04,
        pitchOffset: 0.07,
        volumeMultiplier: 0.96,
        effect: 'static_burst',
        fallbackDurationMs: 3100,
      },
    ],
  },

  n_pressure: {
    id: 'n_pressure',
    persona: 'sara_tape',
    cues: [
      {
        id: 'press_1',
        text: 'وقت نداریم! گشت ۲۰۴ رو همین الان بفرست جاده آبشار...',
        audioUrl: '/src/assets/audio/press_1.wav',
        ttsPromptText: 'وقت نداریم! گشت دویست و چهار رو همین الان بفرست جاده آبشار...',
        actingDirection: `${SARA_BASE_DIR} Sudden urgent commanding pressure masked as panic, fast and intense.`,
        emotion: 'frantic',
        emotionLabel: 'شتاب و فشار ناگهانی',
        pauseBeforeMs: 50,
        pauseAfterMs: 80,
        rateMultiplier: 1.1,
        pitchOffset: 0.06,
        volumeMultiplier: 1.0,
        effect: 'static_burst',
        fallbackDurationMs: 3200,
      },
      {
        id: 'press_2',
        text: 'راستی، مأمور پشتیبانی که قرار بود نوارهای بایگانی رو ببره پشت درب پشتی مرکز مونده...',
        audioUrl: '/src/assets/audio/press_2.wav',
        ttsPromptText: 'راستی، مأمور پشتیبانی که قرار بود نوارهای بایگانی رو ببره پشت درب پشتی مرکز مونده...',
        actingDirection: `${SARA_BASE_DIR} Eerie, subtly unnatural shift in tone—slightly rushed and rehearsed while still sounding strained and anxious.`,
        emotion: 'hesitation',
        emotionLabel: 'تغییر لحن مشکوک',
        pauseBeforeMs: 0,
        pauseAfterMs: 90,
        rateMultiplier: 0.96,
        pitchOffset: -0.05,
        volumeMultiplier: 0.96,
        effect: 'signal_drop',
        fallbackDurationMs: 4200,
      },
      {
        id: 'press_3',
        text: 'گفت قفل اضطراری درب پشتی رو از روی میزت باز کنی! سریع باش، وگرنه همه‌مون می‌میریم!',
        audioUrl: '/src/assets/audio/press_3.wav',
        ttsPromptText: '<gasp> گفت قفل اضطراری درب پشتی رو از روی میزت باز کنی! سریع باش، وگرنه همه‌مون می‌میریم!',
        actingDirection: `${SARA_BASE_DIR} Desperate frantic shouting on the edge of breakdown, intense urgency and terror.`,
        emotion: 'frantic',
        emotionLabel: 'فریاد مضطرب',
        pauseBeforeMs: 0,
        pauseAfterMs: 0,
        rateMultiplier: 1.08,
        pitchOffset: 0.04,
        volumeMultiplier: 1.0,
        effect: 'static_burst',
        fallbackDurationMs: 4100,
      },
    ],
  },

  n_revelation: {
    id: 'n_revelation',
    persona: 'amirhossein_real',
    cues: [
      {
        id: 'rev_1',
        text: '[صدای توقف نوار کاست] نوار تموم شد...',
        audioUrl: '/src/assets/audio/rev_1.wav',
        ttsPromptText: '<breath> نوار تموم شد...',
        actingDirection: `${AMIR_BASE_DIR} Slow eerie exhale followed by a very low, calm, chillingly amused deadpan statement.`,
        emotion: 'cold',
        emotionLabel: 'قطع ناگهانی نوار صوتی',
        pauseBeforeMs: 90,
        pauseAfterMs: 160,
        rateMultiplier: 0.88,
        pitchOffset: -0.04,
        volumeMultiplier: 0.92,
        effect: 'tape_click',
        fallbackDurationMs: 2000,
      },
      {
        id: 'rev_2',
        text: 'آفرین اپراتور... بالاخره فهمیدی نوار سارا بود که سه سال پیش همین‌جا ضبط کردم.',
        audioUrl: '/src/assets/audio/rev_2.wav',
        ttsPromptText: 'آفرین اپراتور... بالاخره فهمیدی نوار سارا بود که سه سال پیش همین‌جا ضبط کردم.',
        actingDirection: `${AMIR_BASE_DIR} Cold, mocking, unhurried, deeply sinister and completely in control, deliberate dramatic pause after اپراتور.`,
        emotion: 'cold',
        emotionLabel: 'لحن سرد و خونسرد',
        pauseBeforeMs: 0,
        pauseAfterMs: 140,
        rateMultiplier: 0.94,
        pitchOffset: 0.0,
        volumeMultiplier: 0.98,
        effect: 'none',
        fallbackDurationMs: 4300,
      },
      {
        id: 'rev_3',
        text: 'اون نوار لعنتی تو زیرزمینِ زیر پات نباید فردا به دادگاه برسه.',
        audioUrl: '/src/assets/audio/rev_3.wav',
        ttsPromptText: 'اون نوار لعنتی تو زیرزمینِ زیر پات نباید فردا به دادگاه برسه.',
        actingDirection: `${AMIR_BASE_DIR} Dark, quiet, razor-sharp menace, controlled anger beneath an icy calm voice.`,
        emotion: 'cold',
        emotionLabel: 'تهدید آرام',
        pauseBeforeMs: 0,
        pauseAfterMs: 150,
        rateMultiplier: 0.92,
        pitchOffset: -0.03,
        volumeMultiplier: 1.0,
        effect: 'static_burst',
        fallbackDurationMs: 3600,
      },
      {
        id: 'rev_4',
        text: 'حالا انتخاب با توئه... چراغ راهرو خاموش شد و دستگیره درب پشتی داره می‌چرخه.',
        audioUrl: '/src/assets/audio/rev_4.wav',
        ttsPromptText: '<breath> حالا انتخاب با توئه... چراغ راهرو خاموش شد و دستگیره درب پشتی داره می‌چرخه.',
        actingDirection: `${AMIR_BASE_DIR} Intimate, menacing close-mic whisper, slow horror suspense, chilling final threat.`,
        emotion: 'whisper',
        emotionLabel: 'زمزمه تهدیدآمیز نزدیک',
        pauseBeforeMs: 0,
        pauseAfterMs: 0,
        rateMultiplier: 0.84,
        pitchOffset: -0.06,
        volumeMultiplier: 0.94,
        effect: 'door_rattle',
        fallbackDurationMs: 4300,
      },
    ],
  },
};

export const PATROL_VOICE_SCRIPTS: Record<'checkin' | 'dispatch_center' | 'villa14', DialogueVoiceScript> = {
  checkin: {
    id: 'patrol_checkin',
    persona: 'patrol_radio',
    cues: [
      {
        id: 'patrol_chk_1',
        text: 'گشت ۲۰۴ به مرکز: ما نزدیک کمربندی هستیم. دستور اعزام به کجاست؟ ویلای ۱۴ یا خود مرکز دیسپچ؟',
        audioUrl: '/src/assets/audio/patrol_chk_1.wav',
        ttsPromptText: 'گشت دویست و چهار به مرکز: ما نزدیک کمربندی هستیم. دستور اعزام به کجاست؟ ویلای چهارده یا خود مرکز دیسپچ؟',
        actingDirection: `${PATROL_BASE_DIR} Crisp, steady, professional radio check-in, alert and clear.`,
        emotion: 'radio',
        emotionLabel: 'مخابره بی‌سیم',
        pauseBeforeMs: 80,
        pauseAfterMs: 0,
        rateMultiplier: 1.0,
        pitchOffset: 0.0,
        volumeMultiplier: 0.95,
        effect: 'radio_squelch',
        fallbackDurationMs: 4200,
      },
    ],
  },
  dispatch_center: {
    id: 'patrol_center',
    persona: 'patrol_radio',
    cues: [
      {
        id: 'patrol_ctr_1',
        text: 'پیام دریافت شد مرکز! با آژیر خاموش به سمت مرکز فوریت‌های شماره ۴ در حرکتیم. چهار دقیقه دیگه اونجاییم.',
        audioUrl: '/src/assets/audio/patrol_ctr_1.wav',
        ttsPromptText: 'پیام دریافت شد مرکز! با آژیر خاموش به سمت مرکز فوریت‌های شماره چهار در حرکتیم. چهار دقیقه دیگه اونجاییم.',
        actingDirection: `${PATROL_BASE_DIR} Urgent, decisive, confident tactical dispatch confirmation over police radio.`,
        emotion: 'radio',
        emotionLabel: 'تأیید اعزام فوری',
        pauseBeforeMs: 80,
        pauseAfterMs: 0,
        rateMultiplier: 1.02,
        pitchOffset: 0.02,
        volumeMultiplier: 0.98,
        effect: 'radio_squelch',
        fallbackDurationMs: 4200,
      },
    ],
  },
  villa14: {
    id: 'patrol_villa',
    persona: 'patrol_radio',
    cues: [
      {
        id: 'patrol_vil_1',
        text: 'تأیید شد مرکز، مسیر رو به سمت جاده قدیم آبشار تغییر دادیم. فاصله تا ویلای ۱۴ حدود ۲۲ دقیقه‌ست.',
        audioUrl: '/src/assets/audio/patrol_vil_1.wav',
        ttsPromptText: 'تأیید شد مرکز، مسیر رو به سمت جاده قدیم آبشار تغییر دادیم. فاصله تا ویلای چهارده حدود بیست و دو دقیقه‌ست.',
        actingDirection: `${PATROL_BASE_DIR} Professional, calm, matter-of-fact route confirmation over tactical radio.`,
        emotion: 'radio',
        emotionLabel: 'تغییر مسیر به آبشار',
        pauseBeforeMs: 80,
        pauseAfterMs: 0,
        rateMultiplier: 0.98,
        pitchOffset: -0.02,
        volumeMultiplier: 0.94,
        effect: 'radio_squelch',
        fallbackDurationMs: 4200,
      },
    ],
  },
};

export function getVoiceScriptForNode(nodeId: string): DialogueVoiceScript | null {
  return NODE_VOICE_SCRIPTS[nodeId] ?? null;
}

export function getAllVoiceCues(): Array<{
  scriptId: string;
  persona: VoicePersonaProfile;
  cue: VoicePhraseCue;
}> {
  const result: Array<{
    scriptId: string;
    persona: VoicePersonaProfile;
    cue: VoicePhraseCue;
  }> = [];

  for (const script of [...Object.values(NODE_VOICE_SCRIPTS), ...Object.values(PATROL_VOICE_SCRIPTS)]) {
    const persona = VOICE_PERSONAS[script.persona];
    for (const cue of script.cues) {
      result.push({ scriptId: script.id, persona, cue });
    }
  }
  return result;
}

export function computeEffectiveSpeechParams(
  persona: VoicePersonaProfile,
  cue: VoicePhraseCue
): { pitch: number; rate: number; volume: number } {
  const clampNum = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  return {
    pitch: Math.round(clampNum(persona.basePitch + cue.pitchOffset, 0.5, 1.8) * 100) / 100,
    rate: Math.round(clampNum(persona.baseRate * cue.rateMultiplier, 0.6, 1.45) * 100) / 100,
    volume: Math.round(clampNum(persona.baseVolume * cue.volumeMultiplier, 0.2, 1.0) * 100) / 100,
  };
}

export function getAllRequiredNodeIds(): string[] {
  return Object.keys(DIALOGUE_NODES);
}
