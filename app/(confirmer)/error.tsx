'use client';
import { ErrorPage } from '@/components/ErrorPage';

export default function ConfirmerError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPage reset={reset} homeHref="/cockpit" homeLabel="Back to cockpit" />;
}
