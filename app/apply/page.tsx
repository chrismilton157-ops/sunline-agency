import Link from 'next/link';
import { submitLead } from './actions';

export const dynamic = 'force-dynamic';

// Public-by-design. No auth, no PII shown back. Lives outside (app)/
// and (portal)/ groups so it has no layout guard.
export default function ApplyPage({
  searchParams,
}: {
  searchParams: { campaign?: string; error?: string };
}) {
  const campaign = searchParams.campaign ?? '';
  const error = searchParams.error ?? '';

  return (
    <main className="min-h-screen px-4 py-8 md:py-14 flex justify-center">
      <div className="w-full max-w-xl">
        <header className="mb-6">
          <div className="text-amber font-semibold text-lg tracking-tight">
            Sunline
          </div>
          <h1 className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">
            Solar quote in 60 seconds
          </h1>
          <p className="text-muted text-sm mt-2">
            Tell us about your home — we&apos;ll match you with a vetted local
            installer who&apos;ll be in touch with a no-obligation quote.
          </p>
        </header>

        <form action={submitLead} className="card p-5 md:p-6 space-y-5">
          <input type="hidden" name="campaign_source" value={campaign} />

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="label" htmlFor="name">Your name</label>
              <input id="name" name="name" required autoComplete="name" className="input mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="phone">Phone</label>
                <input id="phone" name="phone" required inputMode="tel" autoComplete="tel" className="input mt-1 num" placeholder="07…" />
              </div>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required autoComplete="email" className="input mt-1" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="address">Full address</label>
              <input id="address" name="address" required autoComplete="street-address" className="input mt-1" placeholder="12 Oak Lane, Guildford" />
            </div>
            <div>
              <label className="label" htmlFor="postcode">Postcode</label>
              <input id="postcode" name="postcode" required autoComplete="postal-code" className="input mt-1 num uppercase" placeholder="GU2 8AA" />
            </div>
          </div>

          <hr className="border-hairline" />

          <fieldset className="space-y-4">
            <legend className="label">A few quick questions</legend>

            <RadioYesNo name="is_homeowner" label="Do you own your home?" />
            <RadioYesNo name="bill_payer" label="Are you the bill payer / decision maker?" />
            <div>
              <label className="label" htmlFor="monthly_bill">
                Roughly, your monthly electricity bill (£)
              </label>
              <input
                id="monthly_bill"
                name="monthly_bill"
                type="number"
                min={0}
                step={10}
                className="input mt-1 num"
                placeholder="120"
              />
            </div>
            <RadioYesNo name="roof_suitable" label="Roof south-facing & unshaded?" />
            <RadioYesNo name="finance_interest" label="Would you consider finance options?" />

            <div>
              <label className="label" htmlFor="notes">Anything else? (optional)</label>
              <textarea
                id="notes"
                name="notes"
                rows={3}
                className="input mt-1"
                placeholder="e.g. interested in a battery, hoping to install before winter…"
              />
            </div>
          </fieldset>

          <hr className="border-hairline" />

          {/* CONSENT — NOT PRE-TICKED, REQUIRED. */}
          <div>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                name="consent"
                required
                className="mt-1 w-4 h-4 accent-amber"
              />
              <span className="text-sm text-ink leading-relaxed">
                I agree that Sunline and the matched installer may contact me by
                phone, SMS and email about my solar enquiry. See our{' '}
                <Link
                  href="/privacy"
                  target="_blank"
                  className="text-amber underline underline-offset-2"
                >
                  privacy policy
                </Link>
                . You can opt out at any time.
              </span>
            </label>
          </div>

          {error && (
            <p
              role="alert"
              className="text-bad text-sm bg-bad/10 border border-bad/30 rounded-md px-3 py-2"
            >
              {error}
            </p>
          )}

          <button type="submit" className="btn btn-primary w-full text-base py-3">
            Get my quote
          </button>

          <p className="text-[11px] text-muted text-center">
            We&apos;ll never sell your details. UK residential only.
          </p>
        </form>

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

function RadioYesNo({ name, label }: { name: string; label: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex gap-2 mt-1.5">
        {(['yes', 'no'] as const).map((v) => (
          <label
            key={v}
            className="flex-1 cursor-pointer border border-hairline rounded-md
                       px-3 py-2 text-sm bg-white hover:bg-hairline/30
                       has-[:checked]:bg-amber/10 has-[:checked]:border-amber
                       has-[:checked]:text-amber"
          >
            <input
              type="radio"
              name={name}
              value={v}
              required
              className="sr-only"
            />
            <span className="capitalize">{v}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
