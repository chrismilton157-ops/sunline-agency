'use client';
import { ErrorPage } from '@/components/ErrorPage';

export default function SetterError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPage reset={reset} homeHref="/queue" homeLabel="Back to queue" />;
}
