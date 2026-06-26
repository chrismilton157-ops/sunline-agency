'use client';
import { useRef, useState, useTransition } from 'react';
import { addSetter } from './actions';

export function AddSetterForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd = new FormData(formRef.current!);
    startTransition(async () => {
      try {
        await addSetter(fd);
        formRef.current?.reset();
        setSuccess(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-xs text-muted mb-1">Email address</label>
        <input
          type="email"
          name="email"
          required
          placeholder="setter@example.com"
          className="input w-full"
        />
      </div>
      <div>
        <label className="block text-xs text-muted mb-1">
          Temporary password (min 8 characters)
        </label>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          placeholder="They can change it later"
          className="input w-full"
        />
      </div>
      {error && (
        <p className="text-bad text-xs">{error}</p>
      )}
      {success && (
        <p className="text-good text-xs">Setter added — they can log in now.</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="px-5 py-2 rounded-lg bg-ink text-white text-sm font-medium
                   hover:bg-ink/80 disabled:opacity-40 transition-colors"
      >
        {isPending ? 'Adding…' : 'Add setter'}
      </button>
    </form>
  );
}
