import Link from 'next/link';
import { submitDataRequest } from './actions';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Data request — Sunline' };

export default function DataRequestPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const error = searchParams.error ?? '';

  return (
    <main className="min-h-screen bg-bg px-4 py-10 md:py-16 flex justify-center">
      <div className="w-full max-w-lg">
        <header className="mb-7">
          <Link href="/" className="text-amber font-semibold text-base tracking-tight">
            Sunline
          </Link>
          <h1 className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">
            Data request
          </h1>
          <p className="mt-2 text-muted text-sm leading-relaxed">
            Under UK GDPR you have the right to access, correct, or erase
            personal data we hold about you. Use this form to submit a request
            or raise a data-protection concern. We will acknowledge your request
            and respond within the statutory timeframe (one month for access and
            erasure; 30 days for complaints).
          </p>
          <p className="mt-2 text-xs text-muted">
            See our{' '}
            <Link href="/privacy" className="text-amber underline underline-offset-2">
              privacy policy
            </Link>{' '}
            for details of what we collect and why.{' '}
            <span className="italic">
              [Solicitor review pending — not final legal copy]
            </span>
          </p>
        </header>

        <div className="card p-5 md:p-7 rounded-xl border border-hairline shadow-sm">
          {error && (
            <div className="mb-5 px-3 py-2 rounded-md bg-bad/10 border border-bad/30 text-bad text-sm">
              {error}
            </div>
          )}

          <form action={submitDataRequest} className="space-y-5">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="name">
                Your full name <span className="text-bad">*</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                autoComplete="name"
                className="w-full border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Contact — email and/or phone{' '}
                <span className="text-bad">*</span>
                <span className="text-muted font-normal"> (at least one)</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                className="w-full border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40 mb-2"
                placeholder="jane@example.com"
              />
              <input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                className="w-full border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40"
                placeholder="07700 900 000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="request_type">
                Request type <span className="text-bad">*</span>
              </label>
              <select
                id="request_type"
                name="request_type"
                required
                className="w-full border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40 bg-white"
              >
                <option value="">— Select —</option>
                <option value="access">Access my data (Subject Access Request)</option>
                <option value="erasure">Delete my data (Right to Erasure)</option>
                <option value="complaint">Data-protection complaint</option>
                <option value="other">Other data enquiry</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="message">
                Details
                <span className="text-muted font-normal"> (optional but helpful)</span>
              </label>
              <textarea
                id="message"
                name="message"
                rows={4}
                className="w-full border border-hairline rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber/40 resize-none"
                placeholder="e.g. the email address or phone number you used when you submitted your solar enquiry, approximate date, and any other details that help us locate your record."
              />
            </div>

            <button
              type="submit"
              className="w-full bg-amber text-white font-semibold rounded-md px-4 py-3 text-sm hover:bg-amber/90 transition-colors"
            >
              Submit request
            </button>
          </form>
        </div>

        <p className="mt-6 text-xs text-muted text-center">
          If you are unhappy with our response you have the right to complain to
          the{' '}
          <a
            href="https://ico.org.uk/make-a-complaint/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber underline underline-offset-2"
          >
            ICO
          </a>
          .{' '}
          <span className="italic">[Solicitor review pending]</span>
        </p>
      </div>
    </main>
  );
}
