/**
 * The two features that need the server: the guestbook and today's lap board.
 *
 * The server (server/) may be asleep — Render's free plan sleeps after 15
 * idle minutes and takes up to a minute to wake — or not deployed at all. So
 * every call has a timeout, the card says honestly what is happening
 * ("waking the server", "offline"), and nothing else in the game waits on it.
 */
import { API_URL } from './config';
import type { Bilingual } from './content/types';
import { getLang, t } from './i18n';
import { formatTime } from './circuit';

export interface Message {
  id: number;
  name: string;
  body: string;
  created_at: string;
}
export interface Lap {
  name: string;
  ms: number;
}

const s = {
  offline: { en: 'The guestbook server is offline right now. Everything else works.', he: 'השרת של ספר האורחים לא זמין כרגע. כל השאר עובד.' },
  notConfigured: { en: 'The guestbook is not connected on this copy of the site.', he: 'ספר האורחים לא מחובר בעותק הזה של האתר.' },
  waking: { en: 'Waking the server up — this can take up to a minute the first time…', he: 'מעירים את השרת — בפעם הראשונה זה יכול לקחת עד דקה…' },
  loading: { en: 'Loading…', he: 'טוען…' },
  empty: { en: 'No messages yet. Be the first.', he: 'עוד אין הודעות. היו הראשונים.' },
  name: { en: 'Your name', he: 'השם שלך' },
  message: { en: 'A short message (80 characters)', he: 'הודעה קצרה (80 תווים)' },
  send: { en: 'Pin it to the board', he: 'לתלות על הלוח' },
  sending: { en: 'Sending…', he: 'שולח…' },
  sent: { en: 'Pinned. Thank you!', he: 'נתלה. תודה!' },
  rules: { en: 'Everyone can read it. No links. One message every 10 minutes.', he: 'כולם יכולים לקרוא. בלי קישורים. הודעה אחת כל 10 דקות.' },
  today: { en: 'Today’s fastest laps', he: 'ההקפות המהירות של היום' },
  noLaps: { en: 'No laps on the board today yet.', he: 'עוד אין הקפות על הלוח היום.' },
  yourLap: { en: 'Your last lap', he: 'ההקפה האחרונה שלך' },
  submitLap: { en: 'Put it on the board', he: 'להעלות ללוח' },
  ranked: { en: 'On the board at place', he: 'על הלוח במקום' },
  driveFirst: { en: 'Finish a lap and you can put your time on the board.', he: 'סיימו הקפה ותוכלו להעלות את הזמן ללוח.' },
  errName: { en: 'Please write a name.', he: 'נא לכתוב שם.' },
  errBody: { en: 'Please write a message of up to 80 characters.', he: 'נא לכתוב הודעה של עד 80 תווים.' },
  errLink: { en: 'Links are not allowed.', he: 'אסור לכלול קישורים.' },
  errBlocked: { en: 'That message cannot be posted.', he: 'אי אפשר לפרסם את ההודעה הזו.' },
  errSoon: { en: 'One message every 10 minutes — try again a little later.', he: 'הודעה אחת כל 10 דקות — נסו שוב עוד מעט.' },
  errBusy: { en: 'The board is very busy right now. Try again later.', he: 'הלוח עמוס מאוד כרגע. נסו שוב מאוחר יותר.' },
  errLapSoon: { en: 'Wait a few seconds before sending another lap.', he: 'חכו כמה שניות לפני שליחת הקפה נוספת.' },
  errLap: { en: 'That lap could not be accepted.', he: 'לא ניתן לקבל את ההקפה הזו.' },
} satisfies Record<string, Bilingual>;

const esc = (x: string) =>
  x.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const NAME_KEY = 'offroad.name';
const savedName = () => {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
};
const saveName = (n: string) => {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch {
    /* not essential */
  }
};

/* ------------------------------------------------------------------ http --- */
class ApiError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

/**
 * fetch with a timeout. A slow first answer usually means Render is waking
 * the server, so `onSlow` fires after 2.5 s to let the card say so.
 */
async function api<T>(path: string, init: RequestInit = {}, onSlow?: () => void): Promise<T> {
  if (!API_URL) throw new ApiError(0, 'not-configured');
  const ctrl = new AbortController();
  const slow = onSlow ? setTimeout(onSlow, 2500) : undefined;
  const kill = setTimeout(() => ctrl.abort(), 70000);
  try {
    const r = await fetch(API_URL + path, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new ApiError(r.status, (data as { error?: string }).error ?? 'server');
    return data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(0, 'offline');
  } finally {
    clearTimeout(slow);
    clearTimeout(kill);
  }
}

const errorText = (e: unknown): string => {
  const code = e instanceof ApiError ? e.code : 'offline';
  const map: Record<string, Bilingual> = {
    name: s.errName, body: s.errBody, link: s.errLink, blocked: s.errBlocked,
    'too-soon': s.errSoon, busy: s.errBusy, 'not-configured': s.notConfigured,
  };
  return t(map[code] ?? s.offline);
};

/* --------------------------------------------------------------- state --- */
const messageListeners = new Set<(m: Message[]) => void>();
let lastLap: { ms: number; splits: number[] } | null = null;

export function onMessages(f: (m: Message[]) => void): void {
  messageListeners.add(f);
}

/** Fetch the latest messages for the board in the world. Quiet on failure. */
export async function refreshMessages(): Promise<void> {
  try {
    const { messages } = await api<{ messages: Message[] }>('/api/messages');
    messageListeners.forEach((f) => f(messages));
  } catch {
    /* the board simply stays as it was */
  }
}

export function setLastLap(ms: number, splits: number[]): void {
  lastLap = { ms: Math.round(ms), splits: splits.map((x) => Math.round(x)) };
}

/* ------------------------------------------------------- guestbook card --- */
export function mountGuestbook(root: HTMLElement, onPosted: () => void): void {
  const box = document.createElement('div');
  box.className = 'social';
  box.innerHTML = `
    <form class="social-form" novalidate>
      <label><span>${esc(t(s.name))}</span><input name="name" maxlength="24" autocomplete="nickname" required></label>
      <label><span>${esc(t(s.message))}</span><textarea name="body" maxlength="80" rows="2" required></textarea></label>
      <p class="hint">${esc(t(s.rules))}</p>
      <button class="btn primary" type="submit">${esc(t(s.send))}</button>
      <p class="status" role="status" aria-live="polite"></p>
    </form>
    <ul class="messages"><li class="muted">${esc(t(s.loading))}</li></ul>`;
  root.appendChild(box);

  const form = box.querySelector('form')!;
  const list = box.querySelector('.messages')!;
  const status = box.querySelector('.status')!;
  const nameInput = form.elements.namedItem('name') as HTMLInputElement;
  nameInput.value = savedName();

  const render = (messages: Message[]) => {
    const locale = getLang() === 'he' ? 'he-IL' : 'en-GB';
    list.innerHTML = messages.length
      ? messages
          .map(
            (m) => `<li><b dir="auto">${esc(m.name)}</b><span dir="auto">${esc(m.body)}</span>
              <time datetime="${esc(m.created_at)}">${new Date(m.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</time></li>`,
          )
          .join('')
      : `<li class="muted">${esc(t(s.empty))}</li>`;
  };

  void (async () => {
    try {
      const { messages } = await api<{ messages: Message[] }>('/api/messages', {}, () => {
        list.innerHTML = `<li class="muted">${esc(t(s.waking))}</li>`;
      });
      render(messages);
      messageListeners.forEach((f) => f(messages));
    } catch (e) {
      list.innerHTML = `<li class="muted">${esc(errorText(e))}</li>`;
      form.querySelector('button')!.disabled = e instanceof ApiError && e.code === 'not-configured';
    }
  })();

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') ?? '').trim();
    const body = String(fd.get('body') ?? '').trim();
    if (!name) return void (status.textContent = t(s.errName));
    if (!body || body.length > 80) return void (status.textContent = t(s.errBody));
    const button = form.querySelector('button')!;
    button.disabled = true;
    status.textContent = t(s.sending);
    try {
      await api('/api/messages', { method: 'POST', body: JSON.stringify({ name, body }) }, () => {
        status.textContent = t(s.waking);
      });
      saveName(name);
      (form.elements.namedItem('body') as HTMLTextAreaElement).value = '';
      status.textContent = t(s.sent);
      const { messages } = await api<{ messages: Message[] }>('/api/messages');
      render(messages);
      messageListeners.forEach((f) => f(messages));
      onPosted();
    } catch (e) {
      status.textContent = errorText(e);
    } finally {
      button.disabled = false;
    }
  });
}

/* --------------------------------------------------------- circuit card --- */
export function mountLapBoard(root: HTMLElement, onSubmitted: (rank: number) => void): void {
  const box = document.createElement('div');
  box.className = 'social';
  root.appendChild(box);

  const lapForm = lastLap
    ? `<form class="social-form lap-form" novalidate>
        <p><span class="k mono">${esc(t(s.yourLap)).toUpperCase()}</span> <b class="mono" dir="ltr">${formatTime(lastLap.ms / 1000)}</b></p>
        <label><span>${esc(t(s.name))}</span><input name="name" maxlength="16" autocomplete="nickname" required></label>
        <button class="btn primary" type="submit">${esc(t(s.submitLap))}</button>
        <p class="status" role="status" aria-live="polite"></p>
      </form>`
    : `<p class="hint">${esc(t(s.driveFirst))}</p>`;
  box.innerHTML = `${lapForm}<h3>${esc(t(s.today))}</h3><ol class="laps"><li class="muted">${esc(t(s.loading))}</li></ol>`;
  const list = box.querySelector('.laps')!;

  const load = async () => {
    try {
      const { laps } = await api<{ laps: Lap[] }>('/api/laps', {}, () => {
        list.innerHTML = `<li class="muted">${esc(t(s.waking))}</li>`;
      });
      list.innerHTML = laps.length
        ? laps.map((l) => `<li><span dir="auto">${esc(l.name)}</span><b class="mono" dir="ltr">${formatTime(l.ms / 1000)}</b></li>`).join('')
        : `<li class="muted">${esc(t(s.noLaps))}</li>`;
    } catch (e) {
      list.innerHTML = `<li class="muted">${esc(errorText(e))}</li>`;
    }
  };
  void load();

  const form = box.querySelector<HTMLFormElement>('.lap-form');
  if (!form) return;
  const nameInput = form.elements.namedItem('name') as HTMLInputElement;
  nameInput.value = savedName().slice(0, 16);
  const status = form.querySelector('.status')!;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = nameInput.value.trim();
    if (!name || !lastLap) return void (status.textContent = t(s.errName));
    const button = form.querySelector('button')!;
    button.disabled = true;
    status.textContent = t(s.sending);
    try {
      const { rank } = await api<{ rank: number }>(
        '/api/laps',
        { method: 'POST', body: JSON.stringify({ name, ms: lastLap.ms, splits: lastLap.splits }) },
        () => (status.textContent = t(s.waking)),
      );
      saveName(name);
      lastLap = null; // one lap, one submission
      // Refresh the list first, then say the rank: the two never disagree on screen.
      await load();
      status.textContent = `${t(s.ranked)} ${rank}`;
      onSubmitted(rank);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      status.textContent = code === 'too-soon' ? t(s.errLapSoon) : code === 'name' ? t(s.errName) : code ? t(s.errLap) : errorText(e);
      button.disabled = false;
    }
  });
}
