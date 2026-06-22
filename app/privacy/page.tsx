import Link from 'next/link';

export const metadata = { title: 'Sunline — Privacy' };

// Placeholder privacy policy. MUST be finalised by a UK solicitor before
// any real homeowner data is collected. The legal wording is the
// solicitor's job; this page's job is to exist so the consent checkbox
// has somewhere to link, and to summarise the data practices the code
// actually implements.

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-4 py-10 md:py-14 flex justify-center">
      <article className="max-w-2xl w-full prose-sm">
        <header className="mb-6">
          <div className="text-amber font-semibold text-lg">Sunline</div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mt-2">
            Privacy policy
          </h1>
          <p className="text-muted text-sm mt-1">
            Last updated: this is a <strong>placeholder pending legal review</strong>.
          </p>
        </header>

        <section className="card p-5 md:p-6 space-y-5 text-sm leading-relaxed">
          <div className="bg-amber/10 border border-amber/30 rounded-md p-3 text-xs">
            <strong>Notice:</strong> this page is a working draft. The final
            wording will be reviewed and signed off by a UK GDPR solicitor
            before Sunline collects real homeowner data in production.
          </div>

          <div>
            <h2 className="font-semibold text-base">Who we are</h2>
            <p className="mt-1 text-muted">
              Sunline is a UK-based lead-generation agency that connects
              homeowners considering solar panels with vetted local installers.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-base">What we collect</h2>
            <ul className="mt-1 list-disc list-inside text-muted space-y-1">
              <li>Your name, phone number, email address and home address.</li>
              <li>
                Your answers to qualifying questions (homeownership, bill
                amount, roof suitability, finance interest).
              </li>
              <li>
                Optional notes you give us, plus the campaign you arrived from.
              </li>
              <li>
                A record that you ticked the consent box, and the timestamp at
                which you did so.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-base">Why we collect it</h2>
            <p className="mt-1 text-muted">
              To match you with one local installer who can give you a quote.
              We share your details only with the installer we route you to —
              never with any other party — and they may contact you by phone,
              SMS and email about your enquiry.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-base">Lawful basis</h2>
            <p className="mt-1 text-muted">
              We rely on your <strong>explicit consent</strong> (UK GDPR Art.
              6(1)(a) and PECR for direct marketing by SMS/phone). You give
              consent by ticking the box on the form; we never contact you
              without it.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-base">How long we keep it</h2>
            <p className="mt-1 text-muted">
              Six months from submission, after which the lead is eligible for
              automatic deletion. You can request earlier deletion at any time.
            </p>
          </div>

          <div>
            <h2 className="font-semibold text-base">Your rights</h2>
            <ul className="mt-1 list-disc list-inside text-muted space-y-1">
              <li>
                <strong>Right to be forgotten:</strong> email{' '}
                <span className="text-ink">privacy@sunline.test</span> and
                we&apos;ll delete your record.
              </li>
              <li>
                <strong>Right to withdraw consent:</strong> reply STOP to any
                SMS, or email the address above.
              </li>
              <li>
                <strong>Right to access / correct:</strong> contact us and
                we&apos;ll show you what we hold.
              </li>
              <li>
                You can complain to the ICO at{' '}
                <span className="text-ink">ico.org.uk</span> at any time.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-semibold text-base">TPS screening</h2>
            <p className="mt-1 text-muted">
              Before any live call to a number captured here, we screen against
              the Telephone Preference Service (TPS).
            </p>
          </div>
        </section>

        <footer className="text-center text-xs text-muted mt-6">
          <Link href="/apply" className="underline underline-offset-2">
            Back to the form
          </Link>
        </footer>
      </article>
    </main>
  );
}
