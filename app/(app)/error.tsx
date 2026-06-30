'use client';
import { ErrorPage } from '@/components/ErrorPage';

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPage reset={reset} homeHref="/overview" homeLabel="Back to overview" />;
}
