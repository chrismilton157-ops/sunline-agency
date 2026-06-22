import Link from 'next/link';
import { ApplyForm } from '@/components/ApplyForm';

export const dynamic = 'force-dynamic';

// Public-by-design. No auth, no PII shown back. Lives outside (app)/
// and (portal)/ groups so it has no layout guard. The multi-step UX
// lives in <ApplyForm> (client component); this page is just the
// shell + header + footer.
export default function ApplyPage({
  searchParams,
}: {
  searchParams: { campaign?: string; error?: string };
}) {
  const campaign = searchParams.campaign ?? '';
  const error = searchParams.error ?? '';

  return (
    <main className="min-h-screen px-4 py-6 md:py-12 flex justify-center">
      <div className="w-full max-w-md">
        <header className="mb-5 md:mb-7">
          <div className="text-amber font-semibold text-base tracking-tight">
            Sunline
          </div>
          <h1 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight">
            Solar quote in 60 seconds
          </h1>
          <p className="text-muted text-xs md:text-sm mt-1.5">
            We&apos;ll match you with a vetted local installer who&apos;ll be
            in touch with a no-obligation quote.
          </p>
        </header>

        <ApplyForm campaign={campaign} initialError={error} />

        <footer className="text-center text-xs text-muted mt-6">
          © Sunline. UK GDPR compliant. ·{' '}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
        </footer>
      </div>
    </main>
  );
}
