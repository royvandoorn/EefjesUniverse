import { useEffect, useState, type FormEvent } from 'react';
import { UploadPrototype } from '../features/media/UploadPrototype';

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

  return (
    <main className="mx-auto max-w-xl p-6 font-sans">
      <h1 className="mb-2 text-2xl font-bold">Eefje's universum</h1>
      {loading ? <p>Checking session…</p> : session ? <>
        <p className="mb-4">Signed in as {session.role}.</p>
        <button onClick={() => void logout()} disabled={busy}>Log out</button>
        {session.role === 'editor' ? <UploadPrototype csrfToken={session.csrfToken} /> : <p>Read-only access is ready. The board will be added in the next phase.</p>}
      </> : <form onSubmit={login} className="flex flex-col gap-3">
        <label htmlFor="password">Password</label>
        <input id="password" type="password" autoComplete="current-password" required maxLength={1024}
          value={password} onChange={event => setPassword(event.target.value)} className="rounded border p-2" />
        <button type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>}
      {error && <p role="alert" className="mt-3 text-red-700">{error}</p>}
    </main>
  );
}
