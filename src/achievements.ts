/**
 * Small goals that reward looking around. Kept in this browser only
 * (localStorage); achievements are never sent to the server.
 */
import type { Bilingual } from './content/types';

export type AchievementId =
  | 'drive' | 'airtime' | 'bigair' | 'horn' | 'visit-one' | 'visit-all'
  | 'lap' | 'fast-lap' | 'knock' | 'summit' | 'map'
  | 'strike' | 'goal' | 'demolition' | 'time' | 'guest' | 'board' | 'dj';

export interface Achievement {
  id: AchievementId;
  title: Bilingual;
  how: Bilingual;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'drive', title: { en: 'Engine on', he: 'מנוע מותנע' }, how: { en: 'Start driving', he: 'להתחיל לנסוע' } },
  { id: 'visit-one', title: { en: 'First stop', he: 'תחנה ראשונה' }, how: { en: 'Open any place', he: 'לפתוח מקום כלשהו' } },
  { id: 'visit-all', title: { en: 'The full tour', he: 'הסיור המלא' }, how: { en: 'Open every place', he: 'לפתוח את כל המקומות' } },
  { id: 'airtime', title: { en: 'Airtime', he: 'באוויר' }, how: { en: 'Leave the ground for a moment', he: 'להתנתק מהקרקע לרגע' } },
  { id: 'bigair', title: { en: 'Big air', he: 'קפיצה גדולה' }, how: { en: 'Stay airborne for a second and a half', he: 'להישאר באוויר שנייה וחצי' } },
  { id: 'horn', title: { en: 'Good morning', he: 'בוקר טוב' }, how: { en: 'Use the horn', he: 'לצפור' } },
  { id: 'knock', title: { en: 'Oops', he: 'אופס' }, how: { en: 'Knock something over', he: 'להפיל משהו' } },
  { id: 'summit', title: { en: 'Sunrise view', he: 'נוף הזריחה' }, how: { en: 'Reach the top of the big dune', he: 'להגיע לראש הדיונה הגדולה' } },
  { id: 'map', title: { en: 'Navigator', he: 'נווט' }, how: { en: 'Open the map', he: 'לפתוח את המפה' } },
  { id: 'lap', title: { en: 'Lap complete', he: 'הקפה שלמה' }, how: { en: 'Finish a lap of the circuit', he: 'לסיים הקפה במסלול' } },
  { id: 'fast-lap', title: { en: 'Under 35 seconds', he: 'מתחת ל-35 שניות' }, how: { en: 'Finish a lap in under 35 s', he: 'לסיים הקפה בפחות מ-35 שניות' } },
  { id: 'strike', title: { en: 'Strike!', he: 'סטרייק!' }, how: { en: 'Knock down all ten bowling pins', he: 'להפיל את כל עשרת פיני הבאולינג' } },
  { id: 'goal', title: { en: 'Goal!', he: 'גול!' }, how: { en: 'Push the giant ball into the net', he: 'לדחוף את הכדור הענק לרשת' } },
  { id: 'demolition', title: { en: 'Demolition', he: 'הריסה' }, how: { en: 'Knock ten cubes out of the playground wall', he: 'להפיל עשר קוביות מהקיר במגרש המשחקים' } },
  { id: 'time', title: { en: 'Golden hour', he: 'שעת הזהב' }, how: { en: 'Change the time of day (N)', he: 'לשנות את שעת היום (N)' } },
  { id: 'guest', title: { en: 'Guest', he: 'אורח' }, how: { en: 'Leave a message in the guestbook', he: 'להשאיר הודעה בספר האורחים' } },
  { id: 'board', title: { en: 'On the board', he: 'על הלוח' }, how: { en: 'Put a lap time on today’s board', he: 'להעלות זמן הקפה ללוח של היום' } },
  { id: 'dj', title: { en: 'DJ', he: 'די-ג׳יי' }, how: { en: 'Listen to all four music styles (P)', he: 'להאזין לכל ארבעת סגנונות המוזיקה (P)' } },
];

const KEY = 'offroad.achievements';

export function createAchievements(onUnlock: (a: Achievement) => void) {
  let got = new Set<AchievementId>();
  try {
    got = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
  } catch {
    /* start fresh */
  }
  return {
    has: (id: AchievementId) => got.has(id),
    unlock(id: AchievementId) {
      if (got.has(id)) return;
      got.add(id);
      try {
        localStorage.setItem(KEY, JSON.stringify([...got]));
      } catch {
        /* the toast still shows */
      }
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (a) onUnlock(a);
    },
    count: () => got.size,
    reset() {
      got.clear();
      try {
        localStorage.removeItem(KEY);
      } catch {
        /* nothing to do */
      }
    },
  };
}

export type Achievements = ReturnType<typeof createAchievements>;
