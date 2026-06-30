'use client';
import { ErrorPage } from '@/components/ErrorPage';

export default function RootError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPage reset={reset} homeHref="/login" homeLabel="Back to sign in" />;
}
