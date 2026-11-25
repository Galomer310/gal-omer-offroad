/**
 * The places on the map and what each one opens. The entries themselves come
 * from src/content (the same records the classic portfolio uses), so a fact is
 * written once.
 */
import type { AreaId } from './config';
import { CLASSIC_URL, LINKS } from './config';
import { about } from './content/about';
import { projects } from './content/projects';
import type { Bilingual, Entry, Lang } from './content/types';
import { ui } from './i18n';
import type { AchievementId } from './achievements';
import { mountGuestbook, mountLapBoard } from './social';

export interface AreaDef {
  id: AreaId;
  title: Bilingual;
  /** One line under the title in the card. */
  lead: Bilingual;
  /** Entry ids from about.ts / projects.ts, in display order. */
  entries: string[];
  /** Extra HTML at the end of the card (links, downloads). */
  extra?: (lang: Lang) => string;
  /** Live content (forms, data from the server), mounted after the card is drawn. */
  mount?: (root: HTMLElement, hooks: { achieve: (id: AchievementId) => void }) => void;
}

const all: Entry[] = [...about, ...projects];
export const entryById = (id: string): Entry | undefined => all.find((e) => e.id === id);

export const AREAS: AreaDef[] = [
  {
    id: 'home',
    title: { en: 'Start here', he: 'מתחילים כאן' },
    lead: {
      en: 'Who I am, in a few lines. The signposts point to everything else.',
      he: 'מי אני, בכמה שורות. השלטים מצביעים על כל השאר.',
    },
    entries: ['background', 'looking-for'],
  },
  {
    id: 'akeren',
    title: { en: 'A. Keren Psagot', he: 'א.קרן פסגות' },
    lead: {
      en: 'Where I work today: the systems the company runs on, and the team that builds them.',
      he: 'איפה שאני עובד היום: המערכות שהחברה רצה עליהן, והצוות שבונה אותן.',
    },
    entries: ['internship', 'kiryat-ata', 'shikum-psagot', 'trip-intake', 'psagot-bi'],
  },
  {
    id: 'projects',
    title: { en: 'Projects', he: 'פרויקטים' },
    lead: {
      en: 'Work for clients, things I built for myself, and where I started.',
      he: 'עבודה ללקוחות, דברים שבניתי לעצמי, ומאיפה שהתחלתי.',
    },
    entries: ['magani', 'investments', 'weekend-warrior', 'manisr', 'trip-planner', 'taxi-pricer', 'near-me', 'earlier'],
  },
  {
    id: 'career',
    title: { en: 'The road so far', he: 'הדרך עד כאן' },
    lead: {
      en: 'Chemistry, a bootcamp, two internships, and leading a team. The full CV is at the bottom.',
      he: 'כימיה, בוטקמפ, שתי התמחויות, והובלת צוות. קורות החיים המלאים בתחתית.',
    },
    entries: ['scrapers', 'how-i-work'],
    extra: (lang) => {
      const href = lang === 'he' ? 'cv/Gal-Omer-CV-he.pdf' : 'cv/Gal-Omer-CV.pdf';
      return `<a class="btn primary" href="${href}" download>${ui.downloadCv[lang]}</a>`;
    },
  },
  {
    id: 'contact',
    title: { en: 'Get in touch', he: 'יצירת קשר' },
    lead: {
      en: 'I reply to every message.',
      he: 'אני עונה לכל הודעה.',
    },
    entries: [],
    extra: (lang) => {
      const classic = CLASSIC_URL
        ? `<a class="btn" href="${CLASSIC_URL}" target="_blank" rel="noopener">${ui.classic[lang]}</a>`
        : '';
      return `
        <ul class="contact-list">
          <li><span class="k">EMAIL</span><a href="mailto:${LINKS.email}" dir="ltr">${LINKS.email}</a></li>
          <li><span class="k">LINKEDIN</span><a href="${LINKS.linkedin}" target="_blank" rel="noopener" dir="ltr">linkedin.com/in/gal-omer</a></li>
          <li><span class="k">GITHUB</span><a href="${LINKS.github}" target="_blank" rel="noopener" dir="ltr">github.com/Galomer310</a></li>
        </ul>
        ${classic}`;
    },
  },
  {
    id: 'circuit',
    title: { en: 'The circuit', he: 'המסלול' },
    lead: {
      en: 'Drive through the start gate, pass the six gates in order, and come back. Then stop here to put your time on today’s board.',
      he: 'עברו בשער ההתחלה, עברו את ששת השערים לפי הסדר, וחזרו. אחר כך עצרו כאן כדי להעלות את הזמן ללוח של היום.',
    },
    entries: [],
    mount: (root, hooks) => mountLapBoard(root, () => hooks.achieve('board')),
  },
  {
    id: 'guestbook',
    title: { en: 'Guestbook', he: 'ספר אורחים' },
    lead: {
      en: 'Leave a line for me and for whoever drives by next. The newest notes are pinned to the board here.',
      he: 'השאירו שורה בשבילי ובשביל מי שיעבור כאן אחריכם. ההודעות החדשות תלויות על הלוח כאן.',
    },
    entries: [],
    mount: (root, hooks) => mountGuestbook(root, () => hooks.achieve('guest')),
  },
  {
    id: 'playground',
    title: { en: 'The playground', he: 'מגרש המשחקים' },
    lead: {
      en: 'Nothing to read here: bowling pins, a goal and a wall of cubes, all for knocking over. Press T anywhere to put everything back.',
      he: 'אין כאן מה לקרוא: פיני באולינג, שער וקיר של קוביות, הכל כדי להפיל. לחצו T בכל מקום כדי להחזיר הכל למקום.',
    },
    entries: [],
  },
];

export const areaById = (id: AreaId): AreaDef => AREAS.find((a) => a.id === id)!;
