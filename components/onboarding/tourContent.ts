export type TourRole = 'setter' | 'confirmer' | 'client' | 'owner';

export interface TourStep {
  title: string;
  body: string;
  emoji: string;
}

export const TOUR_STEPS: Record<TourRole, TourStep[]> = {
  setter: [
    {
      emoji: '👋',
      title: 'Welcome to your call queue',
      body: 'This is where you spend your day. Every lead that comes in lands here — newest first at the top, so you always call the freshest ones.',
    },
    {
      emoji: '🎯',
      title: 'Claim a lead to start',
      body: 'Tap "Claim" on any lead in the left panel to lock it to you. You\'ll see their name, number, and a tap-to-dial button. Only one lead at a time.',
    },
    {
      emoji: '📞',
      title: 'Tap the number to dial',
      body: "Once you've claimed a lead, tap the green phone number. It opens your phone's dialler with the number ready. Call, have the conversation, then come back here.",
    },
    {
      emoji: '✍️',
      title: 'Log what happened',
      body: 'After the call, pick an outcome: No answer, Callback, Not interested, Wrong number, Disqualified, or Booked. If you booked an appointment, tap "Booked" to fill in the details — that\'s the win!',
    },
    {
      emoji: '⚡',
      title: 'Speed is everything',
      body: 'Fresh leads at the top go cold fast. Claim, dial, log — then move straight to the next one. New leads jump to the top when they arrive, so keep an eye on the queue.',
    },
  ],
  confirmer: [
    {
      emoji: '👋',
      title: 'Welcome to your cockpit',
      body: 'This is your command centre. Every appointment that gets booked appears here, and your job is to confirm each one before the install date.',
    },
    {
      emoji: '🔴',
      title: 'Urgent first — always',
      body: 'Appointments are sorted by urgency. "Callback due" and "same-day" appointments are at the top — handle those first. The badge colour tells you how urgent each one is.',
    },
    {
      emoji: '✅',
      title: 'Confirm, reschedule, or cancel',
      body: 'Open an appointment card to see the full actions: Confirm (they\'re coming), Reschedule (new date), Cancel, or Log inbound (they called you). Always log what happened.',
    },
    {
      emoji: '🔍',
      title: 'Use the search',
      body: 'Need to find a specific lead fast? Use the search box at the top — search by name, phone, or postcode. Great when someone calls in and you need to pull them up quickly.',
    },
    {
      emoji: '📊',
      title: 'Your stats',
      body: 'Your confirmation rate and today\'s activity are shown at the top. A high confirmation rate means appointments actually happen — that\'s the metric the owner watches.',
    },
  ],
  client: [
    {
      emoji: '👋',
      title: 'Welcome to your performance portal',
      body: 'This is your live view of everything Sunline is doing for you. All numbers update in real time — no waiting for a monthly report.',
    },
    {
      emoji: '📈',
      title: 'My Results',
      body: 'The Results page shows your appointments, how many sat (the homeowner was home), how many led to a sale, and what they were worth. All in GBP, all live.',
    },
    {
      emoji: '📅',
      title: 'Appointments',
      body: 'Every appointment booked on your behalf appears here. "Qualified + confirmed" means the homeowner confirmed they\'ll be home — these are your best quality sits.',
    },
    {
      emoji: '💷',
      title: 'Billing',
      body: 'Your retainer and per-sit fees are on the Billing page. You\'ll see what you\'ve been charged and what\'s upcoming. Everything is transparent.',
    },
  ],
  owner: [
    {
      emoji: '👋',
      title: 'Your control room',
      body: 'Welcome. The sidebar has everything. Start with Today for your daily snapshot — active leads, bookings, and anything needing attention right now.',
    },
    {
      emoji: '🧭',
      title: 'Key areas to know',
      body: 'Clients — manage all your client accounts. Routing — control how leads flow to setters. Setters — performance view. Confirmations — what your confirmers are handling. Alerts — anything flagged.',
    },
    {
      emoji: '📊',
      title: 'Billing & churn risk',
      body: 'Billing tracks what each client owes. Churn Risk scores clients by health signals — check it weekly to catch problems early. Overview is your high-level chart view.',
    },
  ],
};

export const HELP_CONTENT: Record<TourRole, { heading: string; sections: { title: string; body: string }[] }> = {
  setter: {
    heading: 'How the call queue works',
    sections: [
      { title: 'The queue', body: 'Leads appear newest-first. Claim one to lock it to you — nobody else can call that lead while you hold it. Release it if you need to step away.' },
      { title: 'Outcomes explained', body: '"No answer" — they didn\'t pick up; the lead stays in the queue.\n"Callback" — they asked to be called back at a specific time.\n"Not interested" — move on, log it.\n"Disqualified" — doesn\'t meet criteria (renting, unsuitable roof, etc.).\n"Booked" — the win! Fill in the appointment details.' },
      { title: 'Speed-to-claim', body: 'The time from a lead arriving to your first dial. Faster is better — leads called within 5 minutes book at much higher rates.' },
      { title: 'Leaderboard', body: 'Your stats (calls, books, conversion rate) appear on the Leaderboard. The owner reviews this to see who\'s performing.' },
    ],
  },
  confirmer: {
    heading: 'How the cockpit works',
    sections: [
      { title: 'Urgency levels', body: '"Callback due" — you set a callback; it\'s now due. Call first.\n"Same-day" — appointment is today.\n"Urgent" — within 48 hours.\n"Upcoming" — confirmed and scheduled.\n"Snoozed" — you\'ve parked it until later.' },
      { title: 'Confirmation rate', body: 'The % of appointments you\'ve successfully confirmed (homeowner verbally agreed they\'ll be home). The target is 80%+. Low confirmation = more no-shows = unhappy clients.' },
      { title: 'Logging inbound calls', body: 'If a homeowner calls you unprompted, use "Log inbound call" so there\'s a record of every touch. It counts toward your activity stats.' },
      { title: 'Flagging to owner', body: 'If something\'s wrong with an appointment that needs owner attention (angry homeowner, incorrect address, etc.), use "Flag to owner". The owner sees it immediately in Alerts.' },
    ],
  },
  client: {
    heading: 'Understanding your portal',
    sections: [
      { title: 'Qualified + confirmed', body: '"Qualified" means the homeowner passed our pre-screening (homeowner, right roof, motivated). "Confirmed" means our confirmation team called to verify they\'ll be home. These appointments show up.' },
      { title: 'Sat rate', body: 'The % of booked appointments where the homeowner was actually home. A good sat rate is 75%+. If it\'s lower, it usually means no-shows — our confirmation process helps fix that.' },
      { title: 'Live numbers', body: 'All numbers update as soon as appointments are logged. There\'s no delay. What you see is what happened.' },
      { title: 'Questions?', body: 'Email your account manager or reply to your last Sunline email. We\'re responsive.' },
    ],
  },
  owner: {
    heading: 'Owner control room guide',
    sections: [
      { title: 'Daily workflow', body: 'Today → check the snapshot. Alerts → clear anything flagged. Churn risk → scan for amber/red clients weekly.' },
      { title: 'Lead routing', body: 'Routing page controls how leads are distributed across setters. Adaptive mode auto-balances; manual mode lets you pin leads to specific setters.' },
      { title: 'Billing', body: 'Billing shows retainers and per-sit fees per client. All invoicing is manual — the system tracks what\'s owed; you invoice separately.' },
      { title: 'RLS & security', body: 'Client portal users can only see their own data. Setter/confirmer data is isolated by role. Ad spend and agency margin are never exposed to clients.' },
    ],
  },
};
