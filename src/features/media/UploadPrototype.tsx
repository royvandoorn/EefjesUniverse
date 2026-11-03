import { useState } from 'react';

type CompleteResult = {
  mediaId: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
};

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export function UploadPrototype() {
  const [status, setStatus] = useState<string>('idle');
  const [result, setResult] = useState<CompleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File) {
    setError(null);
    setResult(null);

    if (!ACCEPTED.includes(file.type)) {
      setError(`Unsupported type "${file.type}". Use JPEG, PNG or WebP.`);
      return;
    }

    setStatus('requesting upload ticket…');
    const ticketRes = await fetch('/api/media/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ byteSize: file.size, mimeType: file.type }),
    });
    if (!ticketRes.ok) {
      const body = await ticketRes.json().catch(() => null);
      setStatus('idle');
      setError(body?.error?.message ?? `Ticket request failed (${ticketRes.status})`);
      return;
    }
    const ticket = await ticketRes.json();

    setStatus('uploading original…');
    const uploadRes = await fetch(ticket.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!uploadRes.ok) {
      setStatus('idle');
      setError(`Upload to storage failed (${uploadRes.status})`);
      return;
    }

    setStatus('processing (sharp)…');
    const completeRes = await fetch(`/api/media/uploads/${ticket.uploadId}/complete`, {
      method: 'POST',
    });
    const body = await completeRes.json().catch(() => null);
    if (!completeRes.ok) {
      setStatus('idle');
      setError(body?.error?.message ?? `Processing failed (${completeRes.status})`);
      return;
    }
    setResult(body);
    setStatus('done');
  }

  return (
    <section className="rounded-lg border border-neutral-300 p-4">
      <h2 className="mb-3 text-lg font-semibold">Upload prototype</h2>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      <p className="mt-3 text-sm" aria-live="polite">
        {status}
      </p>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {result && (
        <figure className="mt-4">
          <img
            src={`/api/media/${result.mediaId}/display`}
            alt="Processed upload"
            className="max-h-80 rounded border border-neutral-300"
          />
          <figcaption className="mt-1 text-xs text-neutral-600">
            {result.width}×{result.height} · {(result.byteSize / 1024).toFixed(0)} KiB ·{' '}
            {result.mimeType}
          </figcaption>
        </figure>
      )}
    </section>
  );
}
