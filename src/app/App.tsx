import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { BoardView } from '../features/board/BoardView';
import { mulberry32, slotDoodles } from '../shared/doodles.ts';

type Session = { role: 'viewer' | 'editor'; expiresAt: string; csrfToken: string };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/auth/session', { cache: 'no-store' }).then(async response => {
      if (response.ok) setSession(await response.json());
      else if (response.status !== 401) setError('Could not check your session. Please try again.');
    }).catch(() => setError('Connection unavailable. Please try again.')).finally(() => setLoading(false));
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (response.ok) setSession(body);
      else setError(body.error?.message ?? 'Login failed');
    } catch { setError('Connection unavailable. Please try again.'); }
    finally { setPassword(''); setBusy(false); }
  }

  async function logout() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session!.csrfToken }, body: '{}',
      });
      if (response.ok || response.status === 401) setSession(null);
      else setError('Logout failed. Please try again.');
    } catch { setError('Connection unavailable. Please try again.'); }
    finally { setBusy(false); }
  }

  const SLOTS = [
    { className: 'top-[8%] left-[6%] text-6xl md:text-8xl', size: 'w-20 md:w-32', tilt: '-8deg', delay: '0s' },
    { className: 'top-[12%] right-[8%] text-6xl md:text-8xl', size: 'w-20 md:w-32', tilt: '10deg', delay: '0.8s' },
    { className: 'bottom-[14%] left-[10%] text-6xl md:text-8xl', size: 'w-20 md:w-32', tilt: '6deg', delay: '1.6s' },
    { className: 'bottom-[10%] right-[10%] text-6xl md:text-8xl', size: 'w-20 md:w-32', tilt: '-10deg', delay: '0.4s' },
    { className: 'top-[48%] left-[3%] hidden text-7xl md:block', size: 'md:w-28', tilt: '8deg', delay: '1.2s' },
    { className: 'top-[45%] right-[4%] hidden text-7xl md:block', size: 'md:w-28', tilt: '-6deg', delay: '2s' },
    { className: 'top-[4%] left-[45%] text-4xl md:text-5xl', size: 'w-14 md:w-20', tilt: '12deg', delay: '0.6s' },
    { className: 'bottom-[4%] left-[44%] text-4xl md:text-5xl', size: 'w-14 md:w-20', tilt: '-12deg', delay: '1.4s' },
  ];
  const [decorations] = useState(() => slotDoodles(SLOTS, mulberry32(Date.now())));

  if (!loading && session) {
    return (
      <BoardView session={session} onLogout={() => void logout()} onSession={setSession} />
    );
  }

  const LINES = ["Eefje's", 'universum'];
  const LETTER_COLOURS = [
    'text-rose-500', 'text-orange-500', 'text-amber-500', 'text-emerald-600',
    'text-sky-500', 'text-violet-500', 'text-fuchsia-500',
  ];
  let letterIndex = 0;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-gradient-to-br from-rose-100 via-amber-50 to-sky-100 p-6 font-sans">
      {decorations.map((doodle, index) => (
        doodle.image ? (
          <img
            key={index}
            src={doodle.image}
            alt=""
            aria-hidden
            draggable={false}
            className={`floaty pointer-events-none absolute select-none ${doodle.size} ${doodle.className}`}
            style={{ '--tilt': doodle.tilt, transform: `rotate(${doodle.tilt})`, animationDelay: doodle.delay, opacity: 0.85 } as CSSProperties}
          />
        ) : (
          <span
            key={index}
            aria-hidden
            className={`floaty pointer-events-none absolute select-none ${doodle.className}`}
            style={{ '--tilt': doodle.tilt, transform: `rotate(${doodle.tilt})`, animationDelay: doodle.delay } as CSSProperties}
          >
            {doodle.emoji}
          </span>
        )
      ))}
      <div className="relative flex w-full max-w-xl flex-col items-center gap-8">
        <h1 aria-label="Eefje's universum" className="text-center font-black">
          {LINES.map(line => (
            <span key={line} className="block whitespace-nowrap">
              {[...line].map(letter => {
                const index = letterIndex++;
                return (
                  <span
                    key={index}
                    aria-hidden
                    className={`inline-block text-6xl sm:text-7xl md:text-8xl ${LETTER_COLOURS[index % LETTER_COLOURS.length]}`}
                    style={{ transform: `rotate(${((index % 5) - 2) * 3}deg) translateY(${((index % 3) - 1) * 5}px)`, textShadow: '2px 3px 0 rgb(0 0 0 / 0.12)' }}
                  >
                    {letter}
                  </span>
                );
              })}
            </span>
          ))}
        </h1>
        {loading ? (
          <p className="rounded-full bg-white/80 px-6 py-3 font-semibold text-neutral-700 shadow-lg">Checking session…</p>
        ) : (
          <form onSubmit={login} className="flex w-full max-w-sm flex-col gap-4 rounded-3xl border-4 border-white bg-white/80 p-6 shadow-2xl backdrop-blur">
            <label htmlFor="password" className="text-center text-lg font-bold text-neutral-700">Password</label>
            <input
              id="password" type="password" autoComplete="current-password" required maxLength={1024}
              value={password} onChange={event => setPassword(event.target.value)}
              className="rounded-full border-2 border-rose-200 bg-white px-5 py-3 text-center text-lg outline-none focus:border-fuchsia-400"
            />
            <button
              type="submit" disabled={busy}
              className="rounded-full bg-gradient-to-r from-rose-500 to-fuchsia-500 py-3 text-lg font-black text-white shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-60"
            >
              {busy ? 'Logging in…' : '🚀 Log in'}
            </button>
            {error && <p role="alert" className="text-center text-sm font-semibold text-red-700">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
