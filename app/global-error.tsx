'use client';
import { ErrorPage } from '@/components/ErrorPage';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: '#F6F5F1', margin: 0, fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
        <ErrorPage reset={reset} homeHref="/login" homeLabel="Back to sign in" />
      </body>
    </html>
  );
}
