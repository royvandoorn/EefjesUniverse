import { useEffect, useRef, useState } from 'react';
import { ApiError, uploadImage, type UploadedImage } from './api.ts';

export function PhotoUpload({ csrfToken, replacing = false, onAttach, onBusy, onSessionExpired }: {
  csrfToken: string;
  replacing?: boolean;
  onAttach(image: UploadedImage): Promise<void>;
  onBusy(busy: boolean): void;
  onSessionExpired(): void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const ready = useRef<UploadedImage | null>(null);
  const [prepared, setPrepared] = useState<UploadedImage | null>(null);
  const [selectionKey, setSelectionKey] = useState(0);

  useEffect(() => {
    if (!file) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [file]);

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      ready.current ??= await uploadImage(csrfToken, file, setProgress);
      if (replacing) {
        setPrepared(ready.current);
        setProgress('Photo uploaded. Select Done to replace the original, or Cancel replacement to keep it.');
        return;
      }
      setProgress('Adding photo to board…');
      await onAttach(ready.current);
      ready.current = null;
      setFile(null);
      setProgress('Photo added.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      setError(cause instanceof Error ? cause.message : 'Could not add the photo. Please try again.');
      setProgress('');
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  const cancelReplacement = () => {
    ready.current = null;
    setPrepared(null);
    setFile(null);
    setProgress('Replacement cancelled. The original photo is unchanged.');
    setError('');
    setSelectionKey(value => value + 1);
  };

  const applyReplacement = async () => {
    if (!prepared || busy || !window.confirm('Replace this photo? The previous photo will be removed after saving.')) return;
    setBusy(true);
    onBusy(true);
    setError('');
    try {
      await onAttach(prepared);
      ready.current = null;
      setPrepared(null);
      setFile(null);
      setSelectionKey(value => value + 1);
      setProgress('Replacement queued for saving.');
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onSessionExpired();
      setError(cause instanceof Error ? cause.message : 'Could not replace the photo. Please try again.');
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-2 text-sm font-medium">
        {replacing ? '1. Choose a replacement photo' : '1. Choose a photo from your device'}
        <input key={selectionKey} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
          className="w-full min-w-0 rounded-lg border border-neutral-300 bg-neutral-50 p-2 text-sm file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-md file:border-0 file:bg-neutral-800 file:px-4 file:font-semibold file:text-white hover:file:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
          onChange={event => {
            setFile(event.target.files?.[0] ?? null);
            ready.current = null;
            setPrepared(null);
            setError('');
            setProgress('');
          }} />
      </label>
      <p className="text-xs text-neutral-600">JPEG, PNG or WebP, up to 10 MiB. For HEIC photos, export as JPEG first.</p>
      <button type="button" className="min-h-11 rounded bg-neutral-800 px-4 text-white disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!file || busy || !!prepared} onClick={() => void submit()}>
        {busy ? 'Please wait…' : prepared ? 'Photo uploaded' : !file ? 'Choose a photo first' : replacing ? '2. Upload replacement' : '2. Add photo'}
      </button>
      {replacing && <div className="flex gap-2">
        <button type="button" disabled={busy || !file} className="min-h-11 rounded border border-neutral-300 px-4 disabled:opacity-50" onClick={cancelReplacement}>Cancel replacement</button>
        <button type="button" disabled={busy || !prepared} className="min-h-11 rounded bg-neutral-800 px-4 text-white disabled:opacity-50" onClick={() => void applyReplacement()}>Done</button>
      </div>}
      {progress && <p role="status" className="text-sm">{progress}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error} {prepared ? 'Select Done to retry.' : 'Select the upload button again to retry.'}</p>}
    </div>
  );
}
