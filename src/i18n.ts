/**
 * Language state and interface text. Content (projects, biography) comes from
 * src/content, copied from the classic portfolio; this file is only the chrome.
 */
import type { Bilingual, Lang } from './content/types';

const KEY = 'offroad.lang';

let current: Lang = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'he') return saved;
  } catch {
    /* storage blocked: fall through */
  }
  return navigator.language.startsWith('he') ? 'he' : 'en';
})();

const listeners = new Set<(l: Lang) => void>();

export const getLang = (): Lang => current;

export function setLang(l: Lang): void {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* not essential */
  }
  document.documentElement.lang = l;
  document.documentElement.dir = l === 'he' ? 'rtl' : 'ltr';
  listeners.forEach((f) => f(l));
}

export function onLang(f: (l: Lang) => void): void {
  listeners.add(f);
}

export const t = (b: Bilingual): string => b[current];

export const ui = {
  title: { en: 'Gal Omer', he: 'גל עומר' },
  subtitle: {
    en: 'Full stack developer · VP at A. Keren Psagot',
    he: 'מפתח פול-סטאק · סמנכ״ל בא.קרן פסגות',
  },
  intro: {
    en: 'A small desert at sunrise. Drive between the places that make up my work, stop inside a glowing ring, and press Enter to read about it.',
    he: 'מדבר קטן בזריחה. סעו בין המקומות שמרכיבים את העבודה שלי, עצרו בתוך טבעת זוהרת ולחצו Enter כדי לקרוא עליה.',
  },
  start: { en: 'Start driving', he: 'יוצאים לדרך' },
  classic: { en: 'Classic portfolio', he: 'לפורטפוליו הקלאסי' },
  classicHint: {
    en: 'In a hurry? The classic version has everything on one page.',
    he: 'ממהרים? בגרסה הקלאסית הכל בעמוד אחד.',
  },
  controls: { en: 'Controls', he: 'שליטה' },
  enterPrompt: { en: 'to open', he: 'לפתיחה' },
  close: { en: 'Close', he: 'סגירה' },
  map: { en: 'Map', he: 'מפה' },
  achievements: { en: 'Achievements', he: 'הישגים' },
  mute: { en: 'Sound', he: 'צליל' },
  help: { en: 'Help', he: 'עזרה' },
  respawn: { en: 'Respawn', he: 'חזרה לנקודה' },
  timeOfDay: { en: 'Time of day', he: 'שעת היום' },
  musicStyle: { en: 'Music style', he: 'סגנון מוזיקה' },
  resetToys: { en: 'Put things back', he: 'להחזיר למקום' },
  unlocked: { en: 'Achievement unlocked', he: 'הישג חדש' },
  youAreHere: { en: 'You', he: 'אתם' },
  lapStart: { en: 'Lap started — pass every gate in order', he: 'הסיבוב התחיל — עברו את כל השערים לפי הסדר' },
  lapDone: { en: 'Lap time', he: 'זמן הקפה' },
  best: { en: 'Best', he: 'שיא' },
  newBest: { en: 'New best!', he: 'שיא חדש!' },
  lapSubmitHint: { en: 'Stop in the circuit ring to put your time on today’s board', he: 'עצרו בטבעת של המסלול כדי להעלות את הזמן ללוח של היום' },
  gate: { en: 'Gate', he: 'שער' },
  downloadCv: { en: 'Download CV (PDF)', he: 'הורדת קורות חיים (PDF)' },
  noWebgl: {
    en: 'This browser cannot draw the 3D world. The classic portfolio has everything:',
    he: 'הדפדפן הזה לא יכול להציג את העולם התלת-ממדי. בפורטפוליו הקלאסי יש הכל:',
  },
  loading: { en: 'Preparing the desert…', he: 'מכינים את המדבר…' },
  touchJump: { en: 'Jump', he: 'קפיצה' },
  touchBoost: { en: 'Boost', he: 'טורבו' },
  touchBrake: { en: 'Brake', he: 'בלם' },
  touchHorn: { en: 'Horn', he: 'צופר' },
  touchOpen: { en: 'Open', he: 'פתיחה' },
} satisfies Record<string, Bilingual>;

/** Keyboard help, as [keys, what]. Keys are not translated. */
export const keyHelp: [string, Bilingual][] = [
  ['W A S D / ← ↑ → ↓', { en: 'Drive', he: 'נהיגה' }],
  ['Shift', { en: 'Boost', he: 'טורבו' }],
  ['Space', { en: 'Jump', he: 'קפיצה' }],
  ['B / Ctrl', { en: 'Brake', he: 'בלם' }],
  ['Enter', { en: 'Open the place you stopped at', he: 'פתיחת המקום שעצרתם בו' }],
  ['M', { en: 'Map', he: 'מפה' }],
  ['R', { en: 'Back to the nearest place', he: 'חזרה למקום הקרוב' }],
  ['H', { en: 'Horn', he: 'צופר' }],
  ['N', { en: 'Time of day: sunrise, noon, sunset', he: 'שעת היום: זריחה, צהריים, שקיעה' }],
  ['T', { en: 'Put the knocked-over things back', he: 'להחזיר למקום את מה שהופל' }],
  ['P', { en: 'Music style: dawn, lo-fi, night road, caravan', he: 'סגנון מוזיקה: שחר, לו-פיי, כביש לילה, שיירה' }],
  ['L', { en: 'Music on / off', he: 'מוזיקה פועלת / כבויה' }],
  ['Mouse drag / wheel', { en: 'Look around / zoom', he: 'להסתכל מסביב / זום' }],
];
