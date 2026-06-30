'use client';
import { ErrorPage } from '@/components/ErrorPage';

export default function PortalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorPage reset={reset} homeHref="/portal" homeLabel="Back to portal" />;
}
