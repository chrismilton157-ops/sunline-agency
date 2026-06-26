'use client';
import { useTransition } from 'react';
import { removeSetter } from './actions';

export function RemoveSetterButton({ userId, email }: { userId: string; email: string }) {
  const [isPending, startTransition] = useTransition();

  function handleRemove() {
    if (!confirm(`Remove setter ${email}? They will no longer be able to log in.`)) return;
    startTransition(async () => {
      await removeSetter(userId);
    });
  }

  return (
    <button
      onClick={handleRemove}
      disabled={isPending}
      className="text-xs text-muted hover:text-bad underline underline-offset-2 shrink-0 disabled:opacity-40"
    >
      {isPending ? 'Removing…' : 'Remove'}
    </button>
  );
}
