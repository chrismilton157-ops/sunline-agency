import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSupabase } from '@/lib/supabase/server';
import { EnquiryForm } from '@/components/EnquiryForm';

export const metadata = {
  title: 'Sunline — Qualified Solar Appointments for UK Installers',
  description:
    'Sunline sets qualified, confirmed solar appointments for UK residential installers. Not leads — booked, qualified homeowners with a decision-maker present.',
};

async function getRole() {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: row } = await supabase
      .from('users').select('role').eq('id', user.id).single();
    return row?.role ?? null;
  } catch {
    return null;
  }
}

export default async function LandingPage() {
  const role = await getRole();
  if (role === 'owner') redirect('/today');
  if (role === 'client') redirect('/portal');
  if (role === 'setter') redirect('/queue');

  return (
    <div className="font-sans antialiased bg-bg text-ink">
      <Nav />
      <main id="main-content">
        <Hero />
        <PainSection />
        <PillarsSection />
        <HowItWorksSection />
        <PortalPreviewSection />
        <TestimonialsSection />
        <EnquirySection />
      </main>
      <Footer />
    </div>
  );
}

/* ─── NAV ─────────────────────────────────────────────────────────────────── */

function Nav() {
  return (
    <header className="sticky top-0 z-50 bg-sidebar/95 backdrop-blur-sm border-b border-white/10">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-amber font-bold text-lg tracking-tight" aria-label="Sunline — home">Sunline</span>
          <span className="hidden sm:block text-white/40 text-xs font-medium uppercase tracking-widest ml-1" aria-hidden="true">
            Solar Appointments
          </span>
        </div>
        <nav aria-label="Site navigation">
          <a
            href="#enquiry"
            className="btn btn-primary text-sm px-4 py-2 font-semibold"
          >
            Book a call
          </a>
        </nav>
      </div>
    </header>
  );
}

/* ─── HERO ─────────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="bg-sidebar text-white relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 60% 100%, rgba(224,123,57,0.12) 0%, transparent 70%)',
        }}
      />
      <div className="max-w-6xl mx-auto px-5 sm:px-8 pt-20 pb-24 relative">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-white/10 text-white/80 text-xs font-medium px-3 py-1.5 rounded-full mb-8 uppercase tracking-widest">
            UK residential solar only
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight mb-6">
            Stop buying leads.<br />
            <span className="text-amber">Start getting sales.</span>
          </h1>
          <p className="text-white/70 text-lg sm:text-xl leading-relaxed mb-10 max-w-2xl">
            You&apos;ve been sold &ldquo;qualified leads&rdquo; before. You know what you got:
            homeowners who don&apos;t answer, appointments that don&apos;t show up,
            and a lot of wasted Saturday mornings. Sunline is built differently.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <a
              href="#enquiry"
              className="btn btn-primary px-7 py-3.5 text-base font-bold text-center"
            >
              Book a call to see if you qualify →
            </a>
            <a
              href="#how-it-works"
              className="btn btn-ghost px-7 py-3.5 text-base font-semibold text-center text-white/80 hover:text-white border border-white/20 hover:border-white/40 rounded-lg transition-colors"
            >
              How it works
            </a>
          </div>
          <p className="text-white/40 text-sm mt-5">
            We only take on installers we&apos;re confident we can deliver for. Places are limited.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── PAIN ─────────────────────────────────────────────────────────────────── */

const PAINS = [
  {
    icon: '📵',
    title: '"Leads" that never answer',
    body: 'You paid for a phone number. The homeowner hasn\'t consented to a call, doesn\'t remember filling in the form, and hangs up immediately. You\'ve just paid for a refusal.',
  },
  {
    icon: '🚗',
    title: 'Appointments that don\'t show',
    body: 'You drove an hour. The lights are on but nobody answers. The "appointment" was booked by a call centre rep chasing a target, not a confirmer who rebuilt genuine interest.',
  },
  {
    icon: '🕳️',
    title: 'No visibility into what you\'re buying',
    body: 'No sit rate. No show-up data. No breakdown of what\'s working. Just a monthly invoice and a vague promise that "quality is improving".',
  },
];

function PainSection() {
  return (
    <section className="bg-bg py-20 border-b border-hairline">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="text-center mb-12">
          <p className="label text-amber mb-3">Sound familiar?</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-ink">
            The lead quality problem is real.
          </h2>
          <p className="text-muted mt-4 max-w-xl mx-auto">
            Most lead companies optimise for volume. You end up paying the price —
            in time, fuel, and morale.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PAINS.map((p) => (
            <div key={p.title} className="card p-6 card-lift">
              <div className="text-3xl mb-4">{p.icon}</div>
              <h3 className="font-bold text-ink mb-2">{p.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── PILLARS ──────────────────────────────────────────────────────────────── */

const PILLARS = [
  {
    number: '01',
    label: 'Qualified',
    color: 'text-amber',
    bgColor: 'bg-amber/10',
    headline: 'Only homeowners who actually qualify.',
    detail: [
      'Homeowner AND decision-maker present',
      'Monthly electricity bill above our threshold',
      'Roof assessed as suitable for solar',
      'Disqualified before they ever reach your diary',
    ],
    body:
      'Every enquiry goes through our qualifying questions before it becomes an appointment. If the roof is wrong, the bill is too low, or the decision-maker won\'t be there — it\'s filtered out. You only see people we\'re confident are worth your time.',
  },
  {
    number: '02',
    label: 'Confirmed',
    color: 'text-good',
    bgColor: 'bg-good/10',
    headline: 'A dedicated confirmer, not a chatbot.',
    detail: [
      'Personal call ~2 days before the appointment',
      'Rebuilds genuine interest, not just a reminder',
      'Reschedules no-shows before they happen',
      'Confirmation tracked and visible in your portal',
    ],
    body:
      'A real person calls every homeowner 48 hours before the appointment. They don\'t just confirm the time — they warm up the conversation, address doubts, and make sure the householder is looking forward to your visit. This is why our sit rates are higher.',
  },
  {
    number: '03',
    label: 'Transparent',
    color: 'text-amber',
    bgColor: 'bg-amber/10',
    headline: 'Your results, live. Nothing hidden.',
    detail: [
      'Sit rate vs. UK installer industry average',
      'Confirmation rate, no-show rate',
      'Cost per sale (not just cost per appointment)',
      'Every appointment outcome, in real time',
    ],
    body:
      'You get a private portal with your numbers. Not a monthly PDF — a live dashboard showing sit rate, confirmation rate, and cost per sale. We publish our own benchmarks so you can see exactly how your results compare. No other UK appointment company does this.',
  },
];

function PillarsSection() {
  return (
    <section className="bg-sidebar text-white py-20" id="what-we-do">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="text-center mb-14">
          <p className="label text-amber mb-3">The Sunline difference</p>
          <h2 className="text-3xl sm:text-4xl font-bold">
            Three things nobody else gets right.
          </h2>
          <p className="text-white/60 mt-4 max-w-xl mx-auto">
            Every appointment company claims quality. Here is exactly what we mean by it.
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {PILLARS.map((p) => (
            <div key={p.number} className="bg-white/5 border border-white/10 rounded-2xl p-7">
              <div className="flex items-center gap-3 mb-5">
                <span className={`${p.bgColor} ${p.color} text-xs font-bold px-2.5 py-1 rounded-full uppercase tracking-widest`}>
                  {p.label}
                </span>
                <span className="text-white/20 text-sm font-mono">{p.number}</span>
              </div>
              <h3 className="text-xl font-bold mb-3">{p.headline}</h3>
              <ul className="space-y-2 mb-5">
                {p.detail.map((d) => (
                  <li key={d} className="flex items-start gap-2 text-sm text-white/70">
                    <svg className="w-4 h-4 mt-0.5 shrink-0 text-good" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {d}
                  </li>
                ))}
              </ul>
              <p className="text-white/50 text-sm leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── HOW IT WORKS ─────────────────────────────────────────────────────────── */

const STEPS = [
  { n: 1, title: 'We run the ads', body: 'Meta and Google campaigns targeting UK homeowners actively researching solar in your region.' },
  { n: 2, title: 'Leads are qualified in real time', body: 'Our qualifying form filters out unsuitable homeowners — wrong roof, too-low bill, not the decision-maker — before they ever reach you.' },
  { n: 3, title: 'Qualified leads become booked appointments', body: 'Our setters call qualified leads immediately (within minutes). They book the appointment into your calendar with full notes.' },
  { n: 4, title: 'A confirmer calls 48 hours before', body: 'A dedicated confirmer rings every homeowner before the visit to rebuild interest, answer questions, and make sure they\'ll be there.' },
  { n: 5, title: 'You attend. They\'re expecting you.', body: 'You arrive at a home where someone is genuinely interested in solar and prepared for your visit.' },
  { n: 6, title: 'You see everything in your portal', body: 'Sit rate, confirmation rate, cost per sale — all live. We review performance with you monthly and adjust to keep results sharp.' },
];

function HowItWorksSection() {
  return (
    <section className="bg-bg py-20 border-b border-hairline" id="how-it-works">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="text-center mb-14">
          <p className="label text-amber mb-3">The process</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-ink">How it works</h2>
          <p className="text-muted mt-4 max-w-xl mx-auto">
            From ad impression to confirmed appointment — end to end, handled.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-6 relative card-lift">
              <div className="w-8 h-8 rounded-full bg-amber/15 text-amber font-bold text-sm flex items-center justify-center mb-4">
                {s.n}
              </div>
              <h3 className="font-bold text-ink mb-2">{s.title}</h3>
              <p className="text-muted text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── PORTAL PREVIEW ───────────────────────────────────────────────────────── */

function PortalPreviewSection() {
  return (
    <section className="bg-sidebar text-white py-20">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
          <div>
            <p className="label text-amber mb-3">Your live portal</p>
            <h2 className="text-3xl sm:text-4xl font-bold mb-5">
              Your results. Your numbers. No mystery.
            </h2>
            <p className="text-white/60 text-lg leading-relaxed mb-8">
              Every client gets a private performance portal. Log in on your phone between
              surveys and see exactly what&apos;s happening: how many appointments ran,
              how many sat, what it&apos;s costing per sale, and how your sit rate compares
              to UK installer averages. We don&apos;t hide bad weeks.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                'Live sit rate vs. industry benchmark',
                'Confirmation rate by week',
                'Cost per sale, not just cost per appointment',
                'Every appointment — date, outcome, quality rating',
              ].map((item) => (
                <li key={item} className="flex items-start gap-3 text-white/80 text-sm">
                  <svg className="w-4 h-4 mt-0.5 shrink-0 text-good" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
            <a href="#enquiry" className="btn btn-primary px-6 py-3 font-semibold inline-block">
              See if you qualify →
            </a>
          </div>
          {/* Portal mockup placeholder */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 min-h-72 flex flex-col gap-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-xs text-white/40 uppercase tracking-widest">Your portal</div>
                <div className="text-white font-semibold text-sm mt-0.5">Performance — this month</div>
              </div>
              <div className="w-2 h-2 rounded-full bg-good animate-pulse" aria-hidden="true" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { label: 'Appointments', value: '—', hint: 'This month' },
                { label: 'Sit rate', value: '—', hint: 'vs industry' },
                { label: 'Cost per sale', value: '—', hint: 'GBP' },
              ].map((m) => (
                <div key={m.label} className="bg-white/5 rounded-xl p-4">
                  <div className="text-white/40 text-xs mb-1">{m.label}</div>
                  <div className="text-white font-bold text-2xl num">{m.value}</div>
                  <div className="text-white/30 text-xs mt-1">{m.hint}</div>
                </div>
              ))}
            </div>
            <div className="bg-white/5 rounded-xl p-4 flex-1">
              <div className="text-white/40 text-xs mb-3">Recent appointments</div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className="w-2 h-2 rounded-full bg-white/20 shrink-0" />
                  <div className="flex-1 h-2.5 bg-white/10 rounded-full" />
                  <div className="w-12 h-2.5 bg-white/10 rounded-full" />
                </div>
              ))}
              <p className="text-center text-white/20 text-xs mt-3 italic">
                [ Screenshot of live portal — available on request ]
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── TESTIMONIALS ─────────────────────────────────────────────────────────── */

function TestimonialsSection() {
  return (
    <section className="bg-bg py-20 border-b border-hairline">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="text-center mb-12">
          <p className="label text-amber mb-3">Results</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-ink">What installers say</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-6 flex flex-col">
              <div className="flex gap-1 mb-4">
                {[1, 2, 3, 4, 5].map((s) => (
                  <svg key={s} className="w-4 h-4 text-amber" aria-hidden="true" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <blockquote className="text-muted text-sm leading-relaxed flex-1 italic">
                [ Real testimonial coming soon — this space is reserved for a verified client quote ]
              </blockquote>
              <div className="mt-5 pt-5 border-t border-hairline">
                <div className="font-semibold text-sm text-ink">[ Installer name ]</div>
                <div className="text-xs text-muted">[ Company ], [ Region ]</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-muted mt-8">
          Testimonials will be added as we collect verified reviews from active clients.
        </p>
      </div>
    </section>
  );
}

/* ─── ENQUIRY ──────────────────────────────────────────────────────────────── */

function EnquirySection() {
  return (
    <section className="bg-bg py-20" id="enquiry">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-start">
          <div>
            <p className="label text-amber mb-3">Apply to work with us</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-ink mb-5">
              We&apos;re selective. Here&apos;s why that helps you.
            </h2>
            <p className="text-muted text-lg leading-relaxed mb-6">
              We only take on installers where we&apos;re confident we can deliver.
              That means checking your region, your capacity, and your current close rate
              before we start — because our results depend on a good match.
            </p>
            <p className="text-muted leading-relaxed mb-8">
              If we can work together, you&apos;ll get qualified, confirmed appointments
              and a live portal to hold us accountable. If it&apos;s not the right fit
              yet, we&apos;ll tell you honestly and why.
            </p>
            <div className="space-y-4">
              {[
                'We review every enquiry personally within one working day',
                'A 20-minute call to understand your setup and targets',
                'No obligation — just a straight conversation',
              ].map((item) => (
                <div key={item} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-good/20 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-good" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-muted text-sm">{item}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card p-7">
            <h3 className="font-bold text-lg text-ink mb-1">Book a call to see if you qualify</h3>
            <p className="text-sm text-muted mb-6">Takes 2 minutes. No commitment required.</p>
            <EnquiryForm />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── FOOTER ───────────────────────────────────────────────────────────────── */

function Footer() {
  return (
    <footer className="bg-sidebar text-white/50 py-12 border-t border-white/10">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <div className="text-amber font-bold text-base mb-1">Sunline</div>
            <div className="text-xs">UK residential solar appointment-setting agency</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 text-xs">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy policy</Link>
            <Link href="/login" className="hover:text-white transition-colors">Client login</Link>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-white/10 text-xs leading-relaxed max-w-2xl">
          Sunline is a UK appointment-setting agency for residential solar installers.
          We do not guarantee sales outcomes — results depend on installer performance and market conditions.
          All claims on this page reflect our actual service model; no testimonials or statistics
          have been fabricated. Solar advertising is regulated by the ASA and CAP Code.
        </div>
        <div className="mt-4 text-xs">
          &copy; {new Date().getFullYear()} Sunline. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
