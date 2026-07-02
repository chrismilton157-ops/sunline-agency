import Link from 'next/link';
import { InstallerAuditFunnel } from '@/components/InstallerAuditFunnel';

export const metadata = {
  title: 'For Installers — What are you really paying per sale? | Sunline',
  description:
    'A 60-second self-audit for UK solar installers. See your real cost per sale, then book a 15-minute demo to see what qualified, confirmed appointments would do to it.',
};

export default function ForInstallersPage() {
  return (
    <div className="font-sans antialiased bg-bg text-ink min-h-screen">
      {/* Nav — mirrors the main marketing site */}
      <header className="sticky top-0 z-50 bg-sidebar/95 backdrop-blur-sm border-b border-white/10">
        <div className="max-w-4xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span
              className="text-amber font-bold text-lg tracking-tight"
              aria-label="Sunline — home"
            >
              Sunline
            </span>
            <span
              className="hidden sm:block text-white/40 text-xs font-medium uppercase tracking-widest ml-1"
              aria-hidden="true"
            >
              Solar Appointments
            </span>
          </Link>
          <a href="#audit" className="btn btn-primary text-sm px-4 py-2 font-semibold">
            Start the 60-sec audit
          </a>
        </div>
      </header>

      <main id="main-content">
        {/* Hero — the value hook */}
        <section className="bg-sidebar text-white relative overflow-hidden">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 80% 60% at 60% 100%, rgba(224,123,57,0.12) 0%, transparent 70%)',
            }}
          />
          <div className="max-w-4xl mx-auto px-5 sm:px-8 pt-16 pb-14 relative">
            <div className="inline-flex items-center gap-2 bg-white/10 text-white/80 text-xs font-medium px-3 py-1.5 rounded-full mb-7 uppercase tracking-widest">
              For UK solar installers
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight mb-5">
              You know your cost per lead.
              <br />
              <span className="text-amber">Do you know your cost per sale?</span>
            </h1>
            <p className="text-white/70 text-lg leading-relaxed max-w-2xl">
              Most installers track what an appointment costs. Almost none track
              what a <em>sale</em> actually costs once no-shows and dead leads
              are stripped out. Take 60 seconds with your own numbers below — no
              sign-up, nothing saved until you ask us to call.
            </p>
          </div>
        </section>

        {/* The funnel — audit → result → demo request */}
        <section id="audit" className="py-14">
          <div className="max-w-4xl mx-auto px-5 sm:px-8">
            <InstallerAuditFunnel />
          </div>
        </section>
      </main>

      <footer className="bg-sidebar text-white/50 py-10 border-t border-white/10">
        <div className="max-w-4xl mx-auto px-5 sm:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="text-amber font-bold text-base mb-1">Sunline</div>
              <div className="text-xs">
                UK residential solar appointment-setting agency
              </div>
            </div>
            <div className="flex gap-4 text-xs">
              <Link href="/" className="hover:text-white transition-colors">
                Home
              </Link>
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy policy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
