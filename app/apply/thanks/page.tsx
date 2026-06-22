import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function ThanksPage({
  searchParams,
}: {
  searchParams: { company?: string; rule?: string };
}) {
  const company = searchParams.company || '';
  return (
    <main className="min-h-screen px-4 py-14 flex items-center justify-center">
      <div className="card max-w-md w-full p-7 text-center">
        <div className="text-amber font-semibold text-lg">Sunline</div>
        <div className="mt-6 text-3xl">✓</div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Thanks — you&apos;re matched
        </h1>
        <p className="text-muted text-sm mt-3">
          {company
            ? `We've passed your enquiry to ${company}. They'll be in touch shortly to arrange a free quote.`
            : `We don't have a vetted installer in your postcode yet — we'll be in touch as soon as we do.`}
        </p>
        <p className="text-muted text-xs mt-6">
          If you change your mind, reply STOP to any SMS from us or email{' '}
          <span className="text-ink">privacy@sunline.test</span>.
        </p>
        <Link
          href="/apply"
          className="btn btn-ghost mt-6 text-xs underline underline-offset-2"
        >
          Submit another enquiry
        </Link>
      </div>
    </main>
  );
}
