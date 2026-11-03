import { UploadPrototype } from '../features/media/UploadPrototype';

export default function App() {
  return (
    <main className="mx-auto max-w-xl p-6 font-sans">
      <h1 className="mb-2 text-2xl font-bold">Eefje's universum</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Phase 1 prototype — upload pipeline check (Vercel + Sharp + Supabase).
      </p>
      <UploadPrototype />
    </main>
  );
}
