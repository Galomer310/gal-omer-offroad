/**
 * Small goals that reward looking around. Kept in this browser only
 * (localStorage); there is no server and nothing is sent anywhere.
 */
import type { Bilingual } from './content/types';

export type AchievementId =
  | 'drive' | 'airtime' | 'bigair' | 'horn' | 'visit-one' | 'visit-all'
  | 'lap' | 'fast-lap' | 'knock' | 'summit' | 'map';

export interface Achievement {
  id: AchievementId;
  title: Bilingual;
  how: Bilingual;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'drive', title: { en: 'Engine on', he: 'מנוע מותנע' }, how: { en: 'Start driving', he: 'להתחיל לנסוע' } },
  { id: 'visit-one', title: { en: 'First stop', he: 'תחנה ראשונה' }, how: { en: 'Open any place', he: 'לפתוח מקום כלשהו' } },
  { id: 'visit-all', title: { en: 'The full tour', he: 'הסיור המלא' }, how: { en: 'Open all six places', he: 'לפתוח את כל ששת המקומות' } },
  { id: 'airtime', title: { en: 'Airtime', he: 'באוויר' }, how: { en: 'Leave the ground for a moment', he: 'להתנתק מהקרקע לרגע' } },
  { id: 'bigair', title: { en: 'Big air', he: 'קפיצה גדולה' }, how: { en: 'Stay airborne for a second and a half', he: 'להישאר באוויר שנייה וחצי' } },
  { id: 'horn', title: { en: 'Good morning', he: 'בוקר טוב' }, how: { en: 'Use the horn', he: 'לצפור' } },
  { id: 'knock', title: { en: 'Oops', he: 'אופס' }, how: { en: 'Knock something over', he: 'להפיל משהו' } },
  { id: 'summit', title: { en: 'Sunrise view', he: 'נוף הזריחה' }, how: { en: 'Reach the top of the big dune', he: 'להגיע לראש הדיונה הגדולה' } },
  { id: 'map', title: { en: 'Navigator', he: 'נווט' }, how: { en: 'Open the map', he: 'לפתוח את המפה' } },
  { id: 'lap', title: { en: 'Lap complete', he: 'הקפה שלמה' }, how: { en: 'Finish a lap of the circuit', he: 'לסיים הקפה במסלול' } },
  { id: 'fast-lap', title: { en: 'Under 35 seconds', he: 'מתחת ל-35 שניות' }, how: { en: 'Finish a lap in under 35 s', he: 'לסיים הקפה בפחות מ-35 שניות' } },
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
