-- SOP / Playbook Library
-- Owner-only table; setters, confirmers, and clients are completely blocked.

create table sop_documents (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,          -- 'setter' | 'confirmer' | 'manager' | 'technical'
  title        text not null,
  content      text not null,                 -- Markdown
  default_content text not null,             -- Immutable original — enables Reset to default
  updated_at   timestamptz not null default now()
);

alter table sop_documents enable row level security;

-- Only the owner may read or write.
create policy "owner_all_sop"
  on sop_documents
  for all
  using  (is_owner())
  with check (is_owner());

-- -----------------------------------------------------------------------
-- Seed: four role playbooks with thorough first-draft content
-- -----------------------------------------------------------------------

insert into sop_documents (key, title, content, default_content) values

-- ============================================================
-- 1. SETTER SOP
-- ============================================================
('setter', 'Setter SOP — Call Centre Playbook',
$$# Setter SOP — Call Centre Playbook

_Version 1.0 · Sunline Solar · Owner-editable_

---

## 1. Your Role

You are a **Setter** — the first human a homeowner speaks to about solar panels. Your job is to start a warm conversation, work out whether solar is genuinely right for them, and book a qualified survey appointment with an installer. You do not sell panels. You qualify leads and fill the calendar.

Quality matters more than quantity. A survey that shows up and converts to a sale is worth far more than ten no-shows. Every appointment you book reflects directly on the agency's reputation with its installer clients.

---

## 2. Before You Start a Shift

1. Log in at the URL your manager shared. Use your setter email and password.
2. You will land on the **Call Queue** (`/queue`). This is your cockpit for the whole shift.
3. Check the **Leaderboard** (`/leaderboard`) briefly — know where you stand and what today's benchmarks are.
4. Have a quiet space, a working headset, and your dialler or SIM ready.
5. Tell your manager your start time so the shift is logged.

---

## 3. The Call Queue — What You See

The queue shows leads assigned to your agency's clients (installers). Each row shows:

| Column | What it means |
|--------|--------------|
| **Name** | Homeowner's first name |
| **Address** | Where the panels would go |
| **Time in queue** | How long since the lead came in — speed matters |
| **Attempts** | How many times a setter has already tried this lead |
| **Status** | New / In progress / Qualified / Disqualified / Do Not Call |
| **Consent** | Whether the homeowner has opted in to be contacted |

**Never dial a lead where consent = No.** The system will warn you; ignore the warning and you have broken UK PECR law and your employment terms.

---

## 4. Claiming a Lead

1. Click a lead row to open it.
2. Press **Claim** to take ownership. The lead is now assigned to you and hidden from other setters.
3. You have a short window (configurable by the owner) to call before the system auto-releases it.
4. If you cannot call immediately, release it so someone else can pick it up.

Speed to lead is critical. Research consistently shows that calling within 5 minutes of a lead arriving converts 3–4× better than calling 30 minutes later. Treat the queue like a live conveyor belt.

---

## 5. Calling the Homeowner

### Opening the call

Keep it natural and friendly. A suggested opener:

> "Hi, is that [Name]? Great — I'm calling from [Installer name]'s solar team. You expressed an interest in a free solar survey for your home — is now a good time for a quick chat?"

Never say you're from Sunline (the agency). You represent the installer client.

### If they say no / not a good time

Ask: "No problem at all — when would be a better time to call you back?" Log the callback in the notes and set a follow-up disposition. Do not count this as a no-answer.

### If no answer

Follow the **No-Answer Cadence** (Section 7).

---

## 6. Qualifying the Lead

Your job on this call is to establish whether the homeowner is a **good fit** for a solar installation. You need all of the following to be true before booking.

### 6.1 Property

- **Owner-occupier** (they own the home). Renters can't install solar without landlord consent — do not book.
- **Suitable roof** — south, south-east, or south-west facing; not heavily shaded by trees or adjacent buildings; large enough for at least 4 panels.
- **House type** — detached or semi-detached strongly preferred. Some installers take terraced; check the client's routing config.
- **Not a flat or maisonette** (shared roof → not suitable).

### 6.2 Electricity Bill

- Ask: "Just to give you an accurate picture of what solar could save you — roughly what's your monthly electricity bill?"
- Typical qualifying thresholds: **£80+/month** is a clear fit; £50–79 is marginal (use judgement); below £50 is unlikely to see meaningful ROI — discuss with your manager.

### 6.3 Affordability / Finance Route

- Ask: "Are you looking to buy outright, or would you want to explore finance options?"
- The installer will handle the detailed finance conversation, but flag if the homeowner mentions serious financial difficulties (bailiffs, bankruptcy) — these leads do not convert and cause issues for the installer.

### 6.4 Decision-Maker

- "Is it just yourself making the decision, or would your partner/spouse need to be involved?"
- If a partner is needed and unavailable, book when both can attend the survey.

### 6.5 Timeline

- "Are you looking to have this installed within the next few months, or more of a long-term plan?"
- Long-term (12+ months) leads are low priority; log them for re-contact later and deprioritise in the queue.

### 6.6 Disqualifying Signals (Do Not Book)

| Signal | Action |
|--------|--------|
| Renter with no landlord permission | Disqualify — type: "Not owner-occupier" |
| Listed building or conservation area | Disqualify — planning restrictions |
| Roof faces north | Disqualify — insufficient solar generation |
| Heavy shading (big trees, adjacent building) | Disqualify — same |
| Already has solar installed | Disqualify — note for installer if they want battery add-ons |
| Actively hostile / abusive | Hang up politely; mark Do Not Call |
| TPS registered (no prior consent) | Do Not Call — check before cold-calling |

---

## 7. No-Answer Cadence

If the homeowner doesn't answer, follow this schedule before marking a lead as exhausted:

| Attempt | Timing | Note |
|---------|--------|------|
| 1st | Immediately when lead arrives | |
| 2nd | 1 hour after 1st attempt | Try a different time of day |
| 3rd | Same day, 3–4 hours later | |
| 4th | Next day, morning | |
| 5th | Next day, afternoon | |
| 6th | Day 3, morning | |
| 7th | Day 3, evening (before 8 pm) | |
| 8th | Day 5 | Final attempt |

After 8 failed attempts with no contact, log disposition as "Exhausted — No Contact" and release the lead.

Leave a brief, professional voicemail on attempts 2 and 5:

> "Hi [Name], this is [your name] calling from [Installer name]. We received your enquiry about a free solar survey. I'll try you again shortly — or feel free to call back on [number]. Thanks!"

---

## 8. Wrap-Up: Logging the Call

After every call — whether you reached them or not — log the outcome in the app:

1. Select the **Disposition** from the dropdown:
   - **Booked** — appointment confirmed, date/time selected
   - **Callback** — they asked to be called back; log date/time
   - **No Answer** — no contact; follow cadence
   - **Not Interested** — politely declined
   - **Disqualified** — does not meet criteria (select reason)
   - **Do Not Call** — requested no further contact; must be honoured immediately
   - **Voicemail Left**
   - **Wrong Number**

2. Add a brief **note** if anything was unusual or helpful for the confirmer to know.

3. If booking: select the **Appointment Date & Time** from the picker (the installer's available slots).

4. Hit **Save** — the lead status updates and moves off your active queue.

---

## 9. Booking the Appointment

When the homeowner agrees to a survey:

1. Offer 2–3 time slots from the installer's calendar.
2. Confirm the **full address** (ask them to repeat it).
3. Confirm the **homeowner's name** and a **callback number**.
4. Tell them: "You'll get a confirmation call a couple of days before to make sure it still works for you."
5. Log it in the system (Disposition: Booked, Date/Time filled in).
6. The Confirmer team will handle the reminder call.

---

## 10. Benchmarks

These are healthy performance indicators — not rigid quotas, but targets to aim for:

| Metric | Good | Strong |
|--------|------|--------|
| Dials per shift (6 hours) | 100–120 | 140–160 |
| Contact rate (dials → answered) | 20–30% | 35%+ |
| Qualified-pickup → Booking rate | 35–40% | 45%+ |
| No-shows from your bookings | < 20% | < 15% |
| Speed to first dial (from lead arrival) | < 10 min | < 5 min |

If your no-show rate is above 25% consistently, review your qualifying questions — you may be booking homeowners who don't fully meet the criteria.

---

## 11. Common Situations

**"How much will it save me?"**
Tell them the installer's surveyor will give them an accurate figure — your job is to assess if solar is suitable for the property, not to give a savings projection.

**"I've already had three solar companies call me."**
Acknowledge it, then differentiate: "That's popular! The difference with [Installer] is [local reputation, no-pressure approach, etc.]. The survey is completely free and there's no obligation — worth having all the facts, isn't it?"

**"Is this a cold call?"**
"You filled in an online enquiry about solar — I'm following up on that. Does that ring a bell?" If they deny it, don't push — log as Do Not Call.

**"Just send me a quote."**
"Unfortunately we can't give accurate quotes without seeing the roof and checking the meter — that's exactly why the survey is free. Once the surveyor visits, you'll have everything in writing. Shall we get a date in the diary?"

**"I need to speak to my husband/wife first."**
"Of course — when would be a good time when you're both available? I can call back then." Book a callback.

---

## 12. Rules to Live By

1. **Consent first, always.** Never dial without consent logged.
2. **Quality over quantity.** A bad booking hurts your stats and the installer's trust.
3. **Be honest.** Do not over-promise what solar will do.
4. **Be quick.** The faster you call, the better it converts.
5. **Log everything.** If it's not in the system, it didn't happen.
6. **Respect DNC.** Do Not Call requests must be actioned immediately and never overridden.
$$,
$$# Setter SOP — Call Centre Playbook

_Version 1.0 · Sunline Solar · Owner-editable_

---

## 1. Your Role

You are a **Setter** — the first human a homeowner speaks to about solar panels. Your job is to start a warm conversation, work out whether solar is genuinely right for them, and book a qualified survey appointment with an installer. You do not sell panels. You qualify leads and fill the calendar.

Quality matters more than quantity. A survey that shows up and converts to a sale is worth far more than ten no-shows. Every appointment you book reflects directly on the agency's reputation with its installer clients.

---

## 2. Before You Start a Shift

1. Log in at the URL your manager shared. Use your setter email and password.
2. You will land on the **Call Queue** (`/queue`). This is your cockpit for the whole shift.
3. Check the **Leaderboard** (`/leaderboard`) briefly — know where you stand and what today's benchmarks are.
4. Have a quiet space, a working headset, and your dialler or SIM ready.
5. Tell your manager your start time so the shift is logged.

---

## 3. The Call Queue — What You See

The queue shows leads assigned to your agency's clients (installers). Each row shows:

| Column | What it means |
|--------|--------------|
| **Name** | Homeowner's first name |
| **Address** | Where the panels would go |
| **Time in queue** | How long since the lead came in — speed matters |
| **Attempts** | How many times a setter has already tried this lead |
| **Status** | New / In progress / Qualified / Disqualified / Do Not Call |
| **Consent** | Whether the homeowner has opted in to be contacted |

**Never dial a lead where consent = No.** The system will warn you; ignore the warning and you have broken UK PECR law and your employment terms.

---

## 4. Claiming a Lead

1. Click a lead row to open it.
2. Press **Claim** to take ownership. The lead is now assigned to you and hidden from other setters.
3. You have a short window (configurable by the owner) to call before the system auto-releases it.
4. If you cannot call immediately, release it so someone else can pick it up.

Speed to lead is critical. Research consistently shows that calling within 5 minutes of a lead arriving converts 3–4× better than calling 30 minutes later. Treat the queue like a live conveyor belt.

---

## 5. Calling the Homeowner

### Opening the call

Keep it natural and friendly. A suggested opener:

> "Hi, is that [Name]? Great — I'm calling from [Installer name]'s solar team. You expressed an interest in a free solar survey for your home — is now a good time for a quick chat?"

Never say you're from Sunline (the agency). You represent the installer client.

### If they say no / not a good time

Ask: "No problem at all — when would be a better time to call you back?" Log the callback in the notes and set a follow-up disposition. Do not count this as a no-answer.

### If no answer

Follow the **No-Answer Cadence** (Section 7).

---

## 6. Qualifying the Lead

Your job on this call is to establish whether the homeowner is a **good fit** for a solar installation. You need all of the following to be true before booking.

### 6.1 Property

- **Owner-occupier** (they own the home). Renters can't install solar without landlord consent — do not book.
- **Suitable roof** — south, south-east, or south-west facing; not heavily shaded by trees or adjacent buildings; large enough for at least 4 panels.
- **House type** — detached or semi-detached strongly preferred. Some installers take terraced; check the client's routing config.
- **Not a flat or maisonette** (shared roof → not suitable).

### 6.2 Electricity Bill

- Ask: "Just to give you an accurate picture of what solar could save you — roughly what's your monthly electricity bill?"
- Typical qualifying thresholds: **£80+/month** is a clear fit; £50–79 is marginal (use judgement); below £50 is unlikely to see meaningful ROI — discuss with your manager.

### 6.3 Affordability / Finance Route

- Ask: "Are you looking to buy outright, or would you want to explore finance options?"
- The installer will handle the detailed finance conversation, but flag if the homeowner mentions serious financial difficulties (bailiffs, bankruptcy) — these leads do not convert and cause issues for the installer.

### 6.4 Decision-Maker

- "Is it just yourself making the decision, or would your partner/spouse need to be involved?"
- If a partner is needed and unavailable, book when both can attend the survey.

### 6.5 Timeline

- "Are you looking to have this installed within the next few months, or more of a long-term plan?"
- Long-term (12+ months) leads are low priority; log them for re-contact later and deprioritise in the queue.

### 6.6 Disqualifying Signals (Do Not Book)

| Signal | Action |
|--------|--------|
| Renter with no landlord permission | Disqualify — type: "Not owner-occupier" |
| Listed building or conservation area | Disqualify — planning restrictions |
| Roof faces north | Disqualify — insufficient solar generation |
| Heavy shading (big trees, adjacent building) | Disqualify — same |
| Already has solar installed | Disqualify — note for installer if they want battery add-ons |
| Actively hostile / abusive | Hang up politely; mark Do Not Call |
| TPS registered (no prior consent) | Do Not Call — check before cold-calling |

---

## 7. No-Answer Cadence

If the homeowner doesn't answer, follow this schedule before marking a lead as exhausted:

| Attempt | Timing | Note |
|---------|--------|------|
| 1st | Immediately when lead arrives | |
| 2nd | 1 hour after 1st attempt | Try a different time of day |
| 3rd | Same day, 3–4 hours later | |
| 4th | Next day, morning | |
| 5th | Next day, afternoon | |
| 6th | Day 3, morning | |
| 7th | Day 3, evening (before 8 pm) | |
| 8th | Day 5 | Final attempt |

After 8 failed attempts with no contact, log disposition as "Exhausted — No Contact" and release the lead.

Leave a brief, professional voicemail on attempts 2 and 5:

> "Hi [Name], this is [your name] calling from [Installer name]. We received your enquiry about a free solar survey. I'll try you again shortly — or feel free to call back on [number]. Thanks!"

---

## 8. Wrap-Up: Logging the Call

After every call — whether you reached them or not — log the outcome in the app:

1. Select the **Disposition** from the dropdown:
   - **Booked** — appointment confirmed, date/time selected
   - **Callback** — they asked to be called back; log date/time
   - **No Answer** — no contact; follow cadence
   - **Not Interested** — politely declined
   - **Disqualified** — does not meet criteria (select reason)
   - **Do Not Call** — requested no further contact; must be honoured immediately
   - **Voicemail Left**
   - **Wrong Number**

2. Add a brief **note** if anything was unusual or helpful for the confirmer to know.

3. If booking: select the **Appointment Date & Time** from the picker (the installer's available slots).

4. Hit **Save** — the lead status updates and moves off your active queue.

---

## 9. Booking the Appointment

When the homeowner agrees to a survey:

1. Offer 2–3 time slots from the installer's calendar.
2. Confirm the **full address** (ask them to repeat it).
3. Confirm the **homeowner's name** and a **callback number**.
4. Tell them: "You'll get a confirmation call a couple of days before to make sure it still works for you."
5. Log it in the system (Disposition: Booked, Date/Time filled in).
6. The Confirmer team will handle the reminder call.

---

## 10. Benchmarks

These are healthy performance indicators — not rigid quotas, but targets to aim for:

| Metric | Good | Strong |
|--------|------|--------|
| Dials per shift (6 hours) | 100–120 | 140–160 |
| Contact rate (dials → answered) | 20–30% | 35%+ |
| Qualified-pickup → Booking rate | 35–40% | 45%+ |
| No-shows from your bookings | < 20% | < 15% |
| Speed to first dial (from lead arrival) | < 10 min | < 5 min |

If your no-show rate is above 25% consistently, review your qualifying questions — you may be booking homeowners who don't fully meet the criteria.

---

## 11. Common Situations

**"How much will it save me?"**
Tell them the installer's surveyor will give them an accurate figure — your job is to assess if solar is suitable for the property, not to give a savings projection.

**"I've already had three solar companies call me."**
Acknowledge it, then differentiate: "That's popular! The difference with [Installer] is [local reputation, no-pressure approach, etc.]. The survey is completely free and there's no obligation — worth having all the facts, isn't it?"

**"Is this a cold call?"**
"You filled in an online enquiry about solar — I'm following up on that. Does that ring a bell?" If they deny it, don't push — log as Do Not Call.

**"Just send me a quote."**
"Unfortunately we can't give accurate quotes without seeing the roof and checking the meter — that's exactly why the survey is free. Once the surveyor visits, you'll have everything in writing. Shall we get a date in the diary?"

**"I need to speak to my husband/wife first."**
"Of course — when would be a good time when you're both available? I can call back then." Book a callback.

---

## 12. Rules to Live By

1. **Consent first, always.** Never dial without consent logged.
2. **Quality over quantity.** A bad booking hurts your stats and the installer's trust.
3. **Be honest.** Do not over-promise what solar will do.
4. **Be quick.** The faster you call, the better it converts.
5. **Log everything.** If it's not in the system, it didn't happen.
6. **Respect DNC.** Do Not Call requests must be actioned immediately and never overridden.
$$),

-- ============================================================
-- 2. CONFIRMER SOP
-- ============================================================
('confirmer', 'Confirmer SOP — Appointment Confirmation Playbook',
$$# Confirmer SOP — Appointment Confirmation Playbook

_Version 1.0 · Sunline Solar · Owner-editable_

---

## 1. Your Role

You are a **Confirmer**. Your job is to protect the installer's calendar by contacting homeowners 48–72 hours before their survey appointment to:

1. Confirm they are still coming.
2. Remind them of the time and address.
3. Rescue any appointments that are at risk (reschedule rather than lose).
4. Handle inbound calls from homeowners who want to move or cancel.

A booked appointment is not revenue — a **showed appointment** is. Your work directly determines how many appointments translate into real business for the installer.

---

## 2. The Cockpit

Your main view is the **Cockpit** (`/cockpit`). It shows:

- **Upcoming appointments** that need a confirmation call (sorted by date, soonest first)
- **Status** for each: Unconfirmed / Confirmed / Rescheduled / Cancelled
- **Confirmation history** — how many attempts have been made, by whom
- **Homeowner details**: name, address, phone number, appointment time

Work through the list from top (soonest appointment) downwards. Call every unconfirmed appointment that is 2–4 days out. Do not wait until the day before — that is too late to rescue a rescheduled appointment.

---

## 3. Making the Confirmation Call

### Timing

Call 48–72 hours before the appointment. If the appointment is on a Monday, call Friday afternoon.

### Opening

> "Hi, is that [Name]? Great — I'm calling from [Installer name]'s solar team. I'm just calling to confirm your free solar survey on [day] at [time]. Is that still working for you?"

### If they confirm

> "Perfect. Just to remind you, the surveyor will come to [address] at [time]. The survey takes about an hour. Do you have any questions before then?"

Log: **Confirmed**. Done.

### If they want to reschedule

> "No problem at all — let me find another slot that works for you."

- Offer 2–3 alternative dates.
- Log the new date/time and update the appointment.
- Log: **Rescheduled** (not cancelled — you saved it).

### If they want to cancel

Before accepting a cancellation, try a soft save:

> "Is there a particular reason? I ask because if it's a timing thing, we can usually find a date that works better."

If they insist:

> "Of course, no problem. I'll cancel that for you now. If you change your mind about exploring solar, just get in touch."

Log: **Cancelled**. Add a brief reason note.

### If no answer

Try twice, at least 3 hours apart. Leave a voicemail on the second attempt:

> "Hi [Name], this is [your name] from [Installer name]. I'm calling to confirm your solar survey on [day] at [time]. Could you give us a quick call back on [number] to let us know if that's still working for you? Thanks!"

If no response within 24 hours of the appointment, log as **No Response** and inform the manager — they may choose to send the surveyor anyway or mark as high-risk.

---

## 4. Handling Inbound Calls

Homeowners will sometimes call in to reschedule or ask questions. Be ready with:

- The appointment lookup (search by name or phone in the cockpit)
- Availability for rescheduling (check with the installer if needed)
- Clear, friendly communication — they should feel well looked after

Common inbound calls:

| Call type | Response |
|-----------|----------|
| "Can I move my appointment?" | Find a new slot, update, confirm back |
| "What time is my survey?" | Read it from the record; confirm address too |
| "I want to cancel" | Try a soft save; if they insist, cancel and log reason |
| "Will the surveyor call before arriving?" | "Yes, the surveyor will typically call 20–30 minutes ahead" (confirm with client if uncertain) |
| "Can you give me a quote over the phone?" | "The survey is exactly so the surveyor can give you an accurate quote for your specific roof. They'll go through all the numbers with you on the day." |

---

## 5. Metrics You're Responsible For

| Metric | What it measures | Target |
|--------|-----------------|--------|
| **Confirmation rate** | % of appointments successfully confirmed (confirmed or rescheduled) before the day | ≥ 85% |
| **Show rate** | % of confirmed appointments where the homeowner actually appeared | ≥ 80% |
| **Save rate** | % of at-risk appointments (homeowner wanted to cancel) that you rescheduled instead | ≥ 40% |
| **Cancellation rate** | % of total appointments that ended as cancelled | ≤ 15% |
| **Average call attempts** | Average attempts per appointment before confirmed/cancelled | ≤ 2.5 |

The **show rate** is the most important number. Installers pay per sat appointment, so a high show rate = happy clients = continued contracts.

---

## 6. What Makes a Good Confirmer

- **Calls early enough.** 72 hours out is better than 48. Leave time to rescue reschedules.
- **Doesn't give up on one no-answer.** Try twice; leave a voicemail second time.
- **Reschedules, doesn't just cancel.** Every saved appointment is revenue protected.
- **Updates the system immediately.** The appointment status must always reflect reality.
- **Stays calm on difficult calls.** Some homeowners are cold at this stage. Warmth and brevity are your tools.
- **Flags issues to the manager.** Unusual cancellation spikes, a client with low show rates, homeowners who seem unqualified — flag it.

---

## 7. Escalation

Escalate to the manager/owner when:

- A homeowner is hostile or abusive on the inbound line.
- You suspect a lead was not genuinely qualified (homeowner has no memory of enquiring).
- A particular client (installer) has an unusually high cancellation rate this week — something may be going wrong upstream.
- You cannot access an appointment that should be on your list.

---

## 8. Data and Consent

You handle personal data (names, addresses, phone numbers). This is covered by UK GDPR:

- Only use contact details for the purpose they were collected (confirming the solar appointment).
- Do not share homeowner details with anyone outside the agency.
- If a homeowner asks to be removed from the system, pass this to the owner immediately — it is a legal right and must be actioned within 30 days.
$$,
$$# Confirmer SOP — Appointment Confirmation Playbook

_Version 1.0 · Sunline Solar · Owner-editable_

---

## 1. Your Role

You are a **Confirmer**. Your job is to protect the installer's calendar by contacting homeowners 48–72 hours before their survey appointment to:

1. Confirm they are still coming.
2. Remind them of the time and address.
3. Rescue any appointments that are at risk (reschedule rather than lose).
4. Handle inbound calls from homeowners who want to move or cancel.

A booked appointment is not revenue — a **showed appointment** is. Your work directly determines how many appointments translate into real business for the installer.

---

## 2. The Cockpit

Your main view is the **Cockpit** (`/cockpit`). It shows:

- **Upcoming appointments** that need a confirmation call (sorted by date, soonest first)
- **Status** for each: Unconfirmed / Confirmed / Rescheduled / Cancelled
- **Confirmation history** — how many attempts have been made, by whom
- **Homeowner details**: name, address, phone number, appointment time

Work through the list from top (soonest appointment) downwards. Call every unconfirmed appointment that is 2–4 days out. Do not wait until the day before — that is too late to rescue a rescheduled appointment.

---

## 3. Making the Confirmation Call

### Timing

Call 48–72 hours before the appointment. If the appointment is on a Monday, call Friday afternoon.

### Opening

> "Hi, is that [Name]? Great — I'm calling from [Installer name]'s solar team. I'm just calling to confirm your free solar survey on [day] at [time]. Is that still working for you?"

### If they confirm

> "Perfect. Just to remind you, the surveyor will come to [address] at [time]. The survey takes about an hour. Do you have any questions before then?"

Log: **Confirmed**. Done.

### If they want to reschedule

> "No problem at all — let me find another slot that works for you."

- Offer 2–3 alternative dates.
- Log the new date/time and update the appointment.
- Log: **Rescheduled** (not cancelled — you saved it).

### If they want to cancel

Before accepting a cancellation, try a soft save:

> "Is there a particular reason? I ask because if it's a timing thing, we can usually find a date that works better."

If they insist:

> "Of course, no problem. I'll cancel that for you now. If you change your mind about exploring solar, just get in touch."

Log: **Cancelled**. Add a brief reason note.

### If no answer

Try twice, at least 3 hours apart. Leave a voicemail on the second attempt:

> "Hi [Name], this is [your name] from [Installer name]. I'm calling to confirm your solar survey on [day] at [time]. Could you give us a quick call back on [number] to let us know if that's still working for you? Thanks!"

If no response within 24 hours of the appointment, log as **No Response** and inform the manager — they may choose to send the surveyor anyway or mark as high-risk.

---

## 4. Handling Inbound Calls

Homeowners will sometimes call in to reschedule or ask questions. Be ready with:

- The appointment lookup (search by name or phone in the cockpit)
- Availability for rescheduling (check with the installer if needed)
- Clear, friendly communication — they should feel well looked after

Common inbound calls:

| Call type | Response |
|-----------|----------|
| "Can I move my appointment?" | Find a new slot, update, confirm back |
| "What time is my survey?" | Read it from the record; confirm address too |
| "I want to cancel" | Try a soft save; if they insist, cancel and log reason |
| "Will the surveyor call before arriving?" | "Yes, the surveyor will typically call 20–30 minutes ahead" (confirm with client if uncertain) |
| "Can you give me a quote over the phone?" | "The survey is exactly so the surveyor can give you an accurate quote for your specific roof. They'll go through all the numbers with you on the day." |

---

## 5. Metrics You're Responsible For

| Metric | What it measures | Target |
|--------|-----------------|--------|
| **Confirmation rate** | % of appointments successfully confirmed (confirmed or rescheduled) before the day | ≥ 85% |
| **Show rate** | % of confirmed appointments where the homeowner actually appeared | ≥ 80% |
| **Save rate** | % of at-risk appointments (homeowner wanted to cancel) that you rescheduled instead | ≥ 40% |
| **Cancellation rate** | % of total appointments that ended as cancelled | ≤ 15% |
| **Average call attempts** | Average attempts per appointment before confirmed/cancelled | ≤ 2.5 |

The **show rate** is the most important number. Installers pay per sat appointment, so a high show rate = happy clients = continued contracts.

---

## 6. What Makes a Good Confirmer

- **Calls early enough.** 72 hours out is better than 48. Leave time to rescue reschedules.
- **Doesn't give up on one no-answer.** Try twice; leave a voicemail second time.
- **Reschedules, doesn't just cancel.** Every saved appointment is revenue protected.
- **Updates the system immediately.** The appointment status must always reflect reality.
- **Stays calm on difficult calls.** Some homeowners are cold at this stage. Warmth and brevity are your tools.
- **Flags issues to the manager.** Unusual cancellation spikes, a client with low show rates, homeowners who seem unqualified — flag it.

---

## 7. Escalation

Escalate to the manager/owner when:

- A homeowner is hostile or abusive on the inbound line.
- You suspect a lead was not genuinely qualified (homeowner has no memory of enquiring).
- A particular client (installer) has an unusually high cancellation rate this week — something may be going wrong upstream.
- You cannot access an appointment that should be on your list.

---

## 8. Data and Consent

You handle personal data (names, addresses, phone numbers). This is covered by UK GDPR:

- Only use contact details for the purpose they were collected (confirming the solar appointment).
- Do not share homeowner details with anyone outside the agency.
- If a homeowner asks to be removed from the system, pass this to the owner immediately — it is a legal right and must be actioned within 30 days.
$$),

-- ============================================================
-- 3. MANAGER/OWNER SOP
-- ============================================================
('manager', 'Manager / Owner SOP — Running the Operation',
$$# Manager / Owner SOP — Running the Operation

_Version 1.0 · Sunline Solar · Owner-editable_

---

## 1. What Sunline Is

Sunline is a UK solar appointment-setting agency. You act as the broker between:

- **Leads** (homeowners who have expressed interest in solar, inbound from digital ads)
- **Setters** (call-centre agents who qualify leads and book surveys)
- **Confirmers** (agents who protect the calendar, calling 48–72 hours before each appointment)
- **Installer clients** (solar companies paying a retainer + per-sit fee, who receive qualified, confirmed appointments)

Revenue model: **monthly retainer** (buys a set number of appointments) + **per-sit fee** (charged for each appointment that actually showed up). You do not charge for no-shows. The economic flywheel is: good leads → quality bookings → high show rates → happy installers → growing retainers.

---

## 2. Daily Rhythm

### Morning (first 30 minutes)

1. Open the **Today** dashboard (`/today`). Review: appointments due today, which are confirmed, which are unconfirmed.
2. Check **Alerts** (`/alerts`) — any churn risks, quality flags, billing issues that need attention.
3. Scan the **Churn risk** board (`/churn`) — clients at risk of cancellation.
4. Brief setters on the day's focus (which client queues are thin, any new routing rules).
5. Check that confirmers are working through the 48–72 hour window for appointments 2–3 days out.

### Midday

- Review setter activity on the **Leaderboard** section of `/setters`. Is call volume in line with target?
- Spot-check 2–3 call wrap-ups for quality. Flag any that look under-qualified.
- Check lead volume by client — are queues being worked or accumulating?

### End of day

- Open **Overview** (`/overview`). Review: sits today, bookings made today, show rate for the week.
- Update any billing manually (mark invoiced appointments, create new invoices if due).
- Check if any confirmations are still outstanding for tomorrow's appointments — call the confirmer if needed.
- Log any significant events in the notes/settings area for your own records.

---

## 3. Adding a New Client

1. Go to **Clients** (`/clients`) → **Add client** button.
2. Fill in: company name, contact name/email, region(s), retainer amount (£), per-sit fee (£), estimated monthly appointments target.
3. Review the **over-promise check** — the system will flag if your commit to the client exceeds your realistic setter capacity. Do not over-promise.
4. Set up routing: go to **Routing** (`/routing`) and add the client's postcode areas / lead routing rules.
5. Create a campaign entry in **Allocation** (`/allocation`) to link their ad spend to lead volume.
6. Brief the setter team on the new client — routing, any special qualifying criteria.

### Pricing guardrails

- **Never discount the per-sit fee** below your cost-per-sit to the agency. The client sees their retainer and per-sit fee; they do not see your cost structure.
- **Retainer covers fixed overhead** (setter time, tooling). Per-sit is margin. Protect both.
- **No replacement guarantee.** If an installer asks you to replace no-shows for free, decline — you can offer a credit discussion but not a blanket policy.

---

## 4. Reading the Dashboards

### Today (`/today`)

Your operational view. Shows every appointment due today with:
- Confirmed / unconfirmed status
- Homeowner name and address
- Which setter booked it
- Outcome (once the surveyor reports back)

Use this to anticipate problems before surveyors go out and to log outcomes as they come in (mark sat/no-show/sold).

### Overview (`/overview`)

Your weekly/monthly performance summary:
- Total sits, no-shows, bookings, show rate, booking rate
- Per-client breakdown
- Trend lines

Check this daily for trend awareness. A show rate dropping below 75% is an early warning signal — investigate the setter who booked the affected appointments.

### Attribution (`/attribution`)

Tracks which ad campaigns are generating leads that convert to sat appointments. Use this to:
- Identify high-quality lead sources (raise budget there)
- Identify low-quality lead sources (pause or reduce spend)
- Present ROI data to clients if they ask about ad effectiveness

Note: you see ad spend and cost-per-sit here. This view is **never shared with clients** — it contains your margin data.

---

## 5. Managing Setters

### Adding a setter

1. Go to **Setters** (`/setters`).
2. Invite the new setter by email. They receive login credentials.
3. Their role is set to `setter` — they see only the queue and leaderboard.

### Monitoring performance

The Setters page and Leaderboard show:
- Dials per day
- Booking rate (dials → appointments booked)
- Show rate (appointments → sats)
- No-show rate (your quality signal)
- Speed to lead (average minutes from lead arriving to first dial)

A setter with a **high booking rate but high no-show rate** is booking unqualified leads. Review their wrap-up notes and have a coaching conversation.

A setter with a **low dial count** may be cherry-picking easy leads or struggling with the system. Check their queue activity.

### Quality flags

If an appointment shows up as a no-show, the system allows you to add a quality rating and note. Use this to track which setters' bookings are reliable. This feeds into the leaderboard and helps you make staffing decisions.

### Speed to lead

This is the most impactful single variable in setter performance. Monitor average speed-to-lead per setter. If it exceeds 15 minutes, the economics of the agency deteriorate noticeably. Consider shift structure changes or queue alerts if this is drifting.

---

## 6. Managing Confirmers

Confirmers work a 48–72 hour window. Your role is to:

1. Check that every appointment within 3 days has at least one confirmation attempt logged.
2. Review the **Confirmations** dashboard (`/confirmations`) — it surfaces unconfirmed appointments due soon.
3. Monitor the **save rate** — a good confirmer should turn ~40%+ of cancellation attempts into reschedules.
4. If a confirmer's show rate is low, check whether they are confirming early enough and whether they are attempting saves before accepting cancellations.

---

## 7. Billing and Invoicing

Billing is tracked in **Billing** (`/billing`):

- Each client has a retainer (monthly fixed fee) and a per-sit rate.
- Appointments marked as **sat** generate a per-sit charge.
- Invoices are created in the Billing view once a month (or as agreed with the client).
- The **Allocation** view (`/allocation`) shows each client's ad-spend vs. lead volume, helping you manage their budget health.

### Monthly billing process

1. At month-end, go to **Billing** → filter by client → mark all sat appointments as invoiced.
2. Create invoice for: retainer + (sat count × per-sit fee).
3. Send invoice to the client's contact email.
4. Log payment when received.

Clients never see your ad spend, cost-per-sit to agency, or your margin. Keep those columns strictly internal.

---

## 8. Alerts and Churn Risk

### Alerts (`/alerts`)

Automated flags for:
- Clients approaching their sit allocation limit
- Clients with show rates dropping below threshold
- Billing anomalies
- Queue health (too many leads, not enough dials)

Review alerts every morning. Each alert has a recommended action — take it or dismiss it with a reason.

### Churn Risk (`/churn`)

Clients are scored for churn risk based on: declining show rates, recent no-shows, unresponsive contacts, billing disputes. A high churn-risk client needs a proactive call from you within 48 hours — ask what's going well, what isn't, and what you can adjust.

Do not wait for a client to cancel. The churn model gives you 2–4 weeks of advance warning if you act on it.

---

## 9. Settings and Configuration

The **Settings** page (`/settings`) lets you:
- Update agency-wide SMS templates for setter confirmation messages
- Configure lead routing default rules
- Update billing rates

Never change routing or billing settings without testing the impact. Routing changes affect which clients receive leads in real time.

---

## 10. Data, GDPR, and Compliance

Sunline stores UK homeowner personal data. Your legal responsibilities:

- **Consent gate**: no outbound contact to any lead without `consent = true` in the system.
- **TPS check**: before cold-calling any list, verify against the Telephone Preference Service.
- **Data requests**: homeowners have the right to access or delete their data. Requests come in via `/data-requests`. You have 30 days to respond. The system captures the request; action it manually or with your solicitor.
- **Retention**: data should not be kept longer than necessary. Review leads older than 12 months for deletion.
- **Audit log**: every significant data change is logged in `/audit`. This is append-only and cannot be edited.

---

## 11. Key Decisions and Rules

| Situation | Rule |
|-----------|------|
| Client asks for a no-show replacement | Offer goodwill credit discussion; no blanket replacement guarantee |
| Setter books leads outside routing area | Investigate: wrong routing config or setter error; fix routing |
| Client queries their ad spend | Do not share agency ad spend; share only their retainer and sit count |
| A lead has consent = false | Block all outbound contact; do not override |
| Client wants automated ad budget increases | Surface as a suggestion only; never automate spend changes |
| A setter asks for their show-rate data | Share it — it helps quality. Never share another setter's data |
| A client asks to see the lead source | Share lead volume by region; never share cost-per-lead or margin |
$$,
$$# Manager / Owner SOP — Running the Operation

_Version 1.0 · Sunline Solar · Owner-editable_

---

## 1. What Sunline Is

Sunline is a UK solar appointment-setting agency. You act as the broker between:

- **Leads** (homeowners who have expressed interest in solar, inbound from digital ads)
- **Setters** (call-centre agents who qualify leads and book surveys)
- **Confirmers** (agents who protect the calendar, calling 48–72 hours before each appointment)
- **Installer clients** (solar companies paying a retainer + per-sit fee, who receive qualified, confirmed appointments)

Revenue model: **monthly retainer** (buys a set number of appointments) + **per-sit fee** (charged for each appointment that actually showed up). You do not charge for no-shows. The economic flywheel is: good leads → quality bookings → high show rates → happy installers → growing retainers.

---

## 2. Daily Rhythm

### Morning (first 30 minutes)

1. Open the **Today** dashboard (`/today`). Review: appointments due today, which are confirmed, which are unconfirmed.
2. Check **Alerts** (`/alerts`) — any churn risks, quality flags, billing issues that need attention.
3. Scan the **Churn risk** board (`/churn`) — clients at risk of cancellation.
4. Brief setters on the day's focus (which client queues are thin, any new routing rules).
5. Check that confirmers are working through the 48–72 hour window for appointments 2–3 days out.

### Midday

- Review setter activity on the **Leaderboard** section of `/setters`. Is call volume in line with target?
- Spot-check 2–3 call wrap-ups for quality. Flag any that look under-qualified.
- Check lead volume by client — are queues being worked or accumulating?

### End of day

- Open **Overview** (`/overview`). Review: sits today, bookings made today, show rate for the week.
- Update any billing manually (mark invoiced appointments, create new invoices if due).
- Check if any confirmations are still outstanding for tomorrow's appointments — call the confirmer if needed.
- Log any significant events in the notes/settings area for your own records.

---

## 3. Adding a New Client

1. Go to **Clients** (`/clients`) → **Add client** button.
2. Fill in: company name, contact name/email, region(s), retainer amount (£), per-sit fee (£), estimated monthly appointments target.
3. Review the **over-promise check** — the system will flag if your commit to the client exceeds your realistic setter capacity. Do not over-promise.
4. Set up routing: go to **Routing** (`/routing`) and add the client's postcode areas / lead routing rules.
5. Create a campaign entry in **Allocation** (`/allocation`) to link their ad spend to lead volume.
6. Brief the setter team on the new client — routing, any special qualifying criteria.

### Pricing guardrails

- **Never discount the per-sit fee** below your cost-per-sit to the agency. The client sees their retainer and per-sit fee; they do not see your cost structure.
- **Retainer covers fixed overhead** (setter time, tooling). Per-sit is margin. Protect both.
- **No replacement guarantee.** If an installer asks you to replace no-shows for free, decline — you can offer a credit discussion but not a blanket policy.

---

## 4. Reading the Dashboards

### Today (`/today`)

Your operational view. Shows every appointment due today with:
- Confirmed / unconfirmed status
- Homeowner name and address
- Which setter booked it
- Outcome (once the surveyor reports back)

Use this to anticipate problems before surveyors go out and to log outcomes as they come in (mark sat/no-show/sold).

### Overview (`/overview`)

Your weekly/monthly performance summary:
- Total sits, no-shows, bookings, show rate, booking rate
- Per-client breakdown
- Trend lines

Check this daily for trend awareness. A show rate dropping below 75% is an early warning signal — investigate the setter who booked the affected appointments.

### Attribution (`/attribution`)

Tracks which ad campaigns are generating leads that convert to sat appointments. Use this to:
- Identify high-quality lead sources (raise budget there)
- Identify low-quality lead sources (pause or reduce spend)
- Present ROI data to clients if they ask about ad effectiveness

Note: you see ad spend and cost-per-sit here. This view is **never shared with clients** — it contains your margin data.

---

## 5. Managing Setters

### Adding a setter

1. Go to **Setters** (`/setters`).
2. Invite the new setter by email. They receive login credentials.
3. Their role is set to `setter` — they see only the queue and leaderboard.

### Monitoring performance

The Setters page and Leaderboard show:
- Dials per day
- Booking rate (dials → appointments booked)
- Show rate (appointments → sats)
- No-show rate (your quality signal)
- Speed to lead (average minutes from lead arriving to first dial)

A setter with a **high booking rate but high no-show rate** is booking unqualified leads. Review their wrap-up notes and have a coaching conversation.

A setter with a **low dial count** may be cherry-picking easy leads or struggling with the system. Check their queue activity.

### Quality flags

If an appointment shows up as a no-show, the system allows you to add a quality rating and note. Use this to track which setters' bookings are reliable. This feeds into the leaderboard and helps you make staffing decisions.

### Speed to lead

This is the most impactful single variable in setter performance. Monitor average speed-to-lead per setter. If it exceeds 15 minutes, the economics of the agency deteriorate noticeably. Consider shift structure changes or queue alerts if this is drifting.

---

## 6. Managing Confirmers

Confirmers work a 48–72 hour window. Your role is to:

1. Check that every appointment within 3 days has at least one confirmation attempt logged.
2. Review the **Confirmations** dashboard (`/confirmations`) — it surfaces unconfirmed appointments due soon.
3. Monitor the **save rate** — a good confirmer should turn ~40%+ of cancellation attempts into reschedules.
4. If a confirmer's show rate is low, check whether they are confirming early enough and whether they are attempting saves before accepting cancellations.

---

## 7. Billing and Invoicing

Billing is tracked in **Billing** (`/billing`):

- Each client has a retainer (monthly fixed fee) and a per-sit rate.
- Appointments marked as **sat** generate a per-sit charge.
- Invoices are created in the Billing view once a month (or as agreed with the client).
- The **Allocation** view (`/allocation`) shows each client's ad-spend vs. lead volume, helping you manage their budget health.

### Monthly billing process

1. At month-end, go to **Billing** → filter by client → mark all sat appointments as invoiced.
2. Create invoice for: retainer + (sat count × per-sit fee).
3. Send invoice to the client's contact email.
4. Log payment when received.

Clients never see your ad spend, cost-per-sit to agency, or your margin. Keep those columns strictly internal.

---

## 8. Alerts and Churn Risk

### Alerts (`/alerts`)

Automated flags for:
- Clients approaching their sit allocation limit
- Clients with show rates dropping below threshold
- Billing anomalies
- Queue health (too many leads, not enough dials)

Review alerts every morning. Each alert has a recommended action — take it or dismiss it with a reason.

### Churn Risk (`/churn`)

Clients are scored for churn risk based on: declining show rates, recent no-shows, unresponsive contacts, billing disputes. A high churn-risk client needs a proactive call from you within 48 hours — ask what's going well, what isn't, and what you can adjust.

Do not wait for a client to cancel. The churn model gives you 2–4 weeks of advance warning if you act on it.

---

## 9. Settings and Configuration

The **Settings** page (`/settings`) lets you:
- Update agency-wide SMS templates for setter confirmation messages
- Configure lead routing default rules
- Update billing rates

Never change routing or billing settings without testing the impact. Routing changes affect which clients receive leads in real time.

---

## 10. Data, GDPR, and Compliance

Sunline stores UK homeowner personal data. Your legal responsibilities:

- **Consent gate**: no outbound contact to any lead without `consent = true` in the system.
- **TPS check**: before cold-calling any list, verify against the Telephone Preference Service.
- **Data requests**: homeowners have the right to access or delete their data. Requests come in via `/data-requests`. You have 30 days to respond. The system captures the request; action it manually or with your solicitor.
- **Retention**: data should not be kept longer than necessary. Review leads older than 12 months for deletion.
- **Audit log**: every significant data change is logged in `/audit`. This is append-only and cannot be edited.

---

## 11. Key Decisions and Rules

| Situation | Rule |
|-----------|------|
| Client asks for a no-show replacement | Offer goodwill credit discussion; no blanket replacement guarantee |
| Setter books leads outside routing area | Investigate: wrong routing config or setter error; fix routing |
| Client queries their ad spend | Do not share agency ad spend; share only their retainer and sit count |
| A lead has consent = false | Block all outbound contact; do not override |
| Client wants automated ad budget increases | Surface as a suggestion only; never automate spend changes |
| A setter asks for their show-rate data | Share it — it helps quality. Never share another setter's data |
| A client asks to see the lead source | Share lead volume by region; never share cost-per-lead or margin |
$$),

-- ============================================================
-- 4. TECHNICAL SOP
-- ============================================================
('technical', 'Technical SOP — Developer Handbook',
$$# Technical SOP — Developer Handbook

_Version 1.0 · Sunline Solar · Owner-editable_

---

## 1. Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Charts | Recharts 2 |
| Auth | Supabase Auth (email/password, JWT via session cookies) |
| Database | PostgreSQL on Supabase (managed) |
| ORM / query | Supabase JS client (`@supabase/supabase-js`) |
| Hosting | Vercel (frontend + API routes) |
| DB hosting | Supabase managed Postgres |
| PWA | `@ducanh2912/next-pwa` |
| Testing | Vitest |
| PDF export | jsPDF (client-side) |
| CI | GitHub Actions (on push to main) |

---

## 2. Architecture

```
app/
  (app)/           # Owner dashboard — 19 pages, requireOwner() guard
  (portal)/        # Client portal — requireClient() guard
  (setter)/        # Setter queue — requireSetter() guard
  (confirmer)/     # Confirmer cockpit — requireConfirmer() guard
  api/             # API routes (CSV export, PDF endpoint)
  login/           # Auth pages
  apply/           # Public lead capture form
components/        # Shared React components
lib/               # Server-side data loaders, Supabase clients, types
scripts/           # Seed scripts, verify:rls
supabase/
  migrations/      # Append-only SQL migration files
```

### Request path (owner page)

1. Next.js middleware (`middleware.ts`) refreshes the session cookie on every request.
2. The layout for `(app)/` calls `requireOwner()` from `lib/data.ts`.
3. `requireOwner()` uses the server-side Supabase client (cookie-based) to verify the JWT and read `users.role`.
4. If role ≠ `owner`, the layout redirects. The page never renders.
5. Page server components call data loaders in `lib/data.ts` using the authenticated client — RLS is enforced automatically.

---

## 3. Data Model (Core Tables)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `clients` | Installer clients | `id, company, retainer, per_sit_fee, ad_spend_monthly` (hidden from non-owners) |
| `leads` | Homeowner enquiries | `id, client_id, name, address, consent, response_mins` |
| `appointments` | Booked surveys | `id, client_id, lead_id, appt_date, outcome, quality_rating` |
| `invoices` | Monthly billing | `id, client_id, amount, paid_at` |
| `users` | Auth roles + tenant mapping | `id (= auth.uid()), role, client_id` |
| `call_queue` | Setter lead assignments | `id, lead_id, setter_id, claimed_at, disposition` |
| `confirmation_queue` | Confirmer work list | `id, appointment_id, status, confirmed_at` |
| `campaigns` / `campaign_spend` | Ad budget tracking | Agency-only (owner view) |
| `routing_rules` | Postcode → client routing | `postcode_prefix, client_id, priority` |
| `sop_documents` | Playbook library | `id, key, title, content, default_content, updated_at` |
| `audit_log` | Immutable event log | `id, user_id, action, table_name, record_id, changed_at` |
| `data_requests` | GDPR requests | `id, requester_email, type, status, created_at` |

---

## 4. Security Model

### RLS (Row-Level Security)

RLS is **on by default** for every business table. Policies fail-closed: if no policy matches, access is denied.

Three policy helper functions (defined in migration 0002):
- `is_owner()` — returns true if `auth.uid()` matches the owner user's ID via the `users` table
- `auth_role()` — returns the authenticated user's role string
- `auth_client_id()` — returns the `client_id` from the `users` table for the current user

Standard policy pattern for business tables:
```sql
-- Owner sees everything
create policy "owner_all" on <table>
  for all using (is_owner());

-- Client sees only their own rows
create policy "client_read_own" on <table>
  for select using (client_id = auth_client_id());
```

### Column-level lockdown

Migration 0004 uses `REVOKE SELECT` on specific columns from the `authenticated` role:
- `clients.ad_spend_monthly`
- `clients.weekly_promise`
- `clients.priority`
- Lead metadata columns

This means even a correctly authenticated owner (or client) cannot SELECT these columns via the anon/authenticated key. The service-role key (used only server-side) bypasses this — this is intentional for owner data loading.

### Service-role key

The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses all RLS. It is used **only in**:
- `lib/supabase/admin.ts` (server-only)
- `scripts/` (seed scripts, verify:rls)

Never expose the service-role key to the browser. It must never appear in `NEXT_PUBLIC_` variables or client-side code.

### Roles

| Role | Access |
|------|--------|
| `owner` | All tables, all rows, all columns (via service role for hidden cols) |
| `client` | Own `clients`, `leads`, `appointments`, `invoices` rows only; no agency money columns |
| `setter` | Own `users` row only; call queue RPCs; no business tables |
| `confirmer` | `appointments` + `leads` (safe cols); no money/clients/audit |

---

## 5. Key Logic Locations

| Feature | File(s) |
|---------|---------|
| Role guards | `lib/data.ts` — `requireOwner()`, `requireSession()` |
| Supabase server client | `lib/supabase/server.ts` |
| Supabase admin client | `lib/supabase/admin.ts` |
| Middleware (session refresh) | `middleware.ts` |
| Seed data | `scripts/seed.ts` |
| RLS verification | `scripts/verify-rls.ts` |
| SOP library | `app/(app)/sops/` |
| PDF generation | `app/(app)/sops/[key]/pdf-client.tsx` |
| Owner sidebar nav | `components/Sidebar.tsx` |

---

## 6. Build, Deploy, and Workflow

### Local development

There is no local Supabase — all dev points to the Supabase cloud project.

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Seed the database (run once after migrations)
npm run seed

# Verify RLS
npm run verify:rls

# Run tests
npm test
```

### Environment variables

Required in `.env.local` (never committed):

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SEED_OWNER_EMAIL=
SEED_OWNER_PASSWORD=
SEED_CLIENT_EMAIL=
SEED_CLIENT_PASSWORD=
SEED_SETTER_EMAIL=
SEED_SETTER_PASSWORD=
SEED_CONFIRMER_EMAIL=
SEED_CONFIRMER_PASSWORD=
NEXT_PUBLIC_SUPABASE_URL=     # Same value as SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Same value as SUPABASE_ANON_KEY
```

On Vercel, set all of these in Project Settings → Environment Variables.

### Migrations

Migrations are **append-only**. To make a schema change:

1. Create `supabase/migrations/NNNN_description.sql` (next sequence number).
2. Paste the SQL into the Supabase SQL editor and run it.
3. Commit the file.
4. Re-run `npm run verify:rls` to confirm nothing broke.

Never edit a migration that has already been applied.

### Deploy

Vercel auto-deploys on push to `main`. The build runs `next build`. There is no migration step in CI — migrations are applied manually in the Supabase dashboard first, then the code is pushed.

---

## 7. Test Suite

Tests live in `__tests__/`. Run with `npm test` (Vitest).

Current coverage:
- Unit tests for data formatting utilities
- RLS integration test script (`verify:rls`) — the primary correctness gate

`npm run verify:rls` requires live Supabase credentials and a seeded database. It signs in as each role and verifies 70+ access-control checks. This must pass before any schema change is considered done.

---

## 8. Gotchas and Known Issues

1. **Two `0021_*.sql` files.** Migration `0021` was applied twice (adaptive routing and confirmer cockpit). Both files exist; only one is in sequence. The DB has both changes applied. Do not renumber.

2. **Column-level revoke + service role.** When loading owner data that includes hidden columns (e.g. `ad_spend_monthly`), you must use the admin/service-role client, not the authenticated client. See `lib/data.ts` — the merge pattern loads safe cols via authenticated client then merges hidden cols via admin.

3. **`select *` is forbidden in portal code.** Always enumerate columns explicitly in client-facing queries. RLS hides rows, not columns.

4. **PWA caching.** The service worker (`@ducanh2912/next-pwa`) caches aggressively. After a deploy, users may need to hard-refresh or wait for the SW to update. The offline page at `/offline` is the fallback.

5. **jsPDF in App Router.** The PDF download for SOPs runs entirely client-side (dynamic import with `ssr: false`). Do not import jsPDF in a server component — it uses browser APIs.

---

## 9. Deferred Roadmap

Items scoped but not yet built:

- **Speed-to-lead webhook**: inbound lead → trigger setter dial alert via SMS/n8n (Phase 4)
- **Outbound SMS consent flow**: auto-SMS on lead arrival gated on `consent = true`
- **Claude Agent SDK qualifier**: replace manual setter wrap-up with AI-assisted call scoring
- **Stripe integration**: replace manual invoice tracking with automated payment links
- **Multi-region routing**: postcode → regional setter assignment (routing rules table is seeded, logic not fully wired)
- **Audit log UI filtering**: audit log table exists, basic UI present; full filter/search UI deferred
$$,
$$# Technical SOP — Developer Handbook

_Version 1.0 · Sunline Solar · Owner-editable_

---

## 1. Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 |
| Charts | Recharts 2 |
| Auth | Supabase Auth (email/password, JWT via session cookies) |
| Database | PostgreSQL on Supabase (managed) |
| ORM / query | Supabase JS client (`@supabase/supabase-js`) |
| Hosting | Vercel (frontend + API routes) |
| DB hosting | Supabase managed Postgres |
| PWA | `@ducanh2912/next-pwa` |
| Testing | Vitest |
| PDF export | jsPDF (client-side) |
| CI | GitHub Actions (on push to main) |

---

## 2. Architecture

```
app/
  (app)/           # Owner dashboard — 19 pages, requireOwner() guard
  (portal)/        # Client portal — requireClient() guard
  (setter)/        # Setter queue — requireSetter() guard
  (confirmer)/     # Confirmer cockpit — requireConfirmer() guard
  api/             # API routes (CSV export, PDF endpoint)
  login/           # Auth pages
  apply/           # Public lead capture form
components/        # Shared React components
lib/               # Server-side data loaders, Supabase clients, types
scripts/           # Seed scripts, verify:rls
supabase/
  migrations/      # Append-only SQL migration files
```

### Request path (owner page)

1. Next.js middleware (`middleware.ts`) refreshes the session cookie on every request.
2. The layout for `(app)/` calls `requireOwner()` from `lib/data.ts`.
3. `requireOwner()` uses the server-side Supabase client (cookie-based) to verify the JWT and read `users.role`.
4. If role ≠ `owner`, the layout redirects. The page never renders.
5. Page server components call data loaders in `lib/data.ts` using the authenticated client — RLS is enforced automatically.

---

## 3. Data Model (Core Tables)

| Table | Purpose | Key columns |
|-------|---------|-------------|
| `clients` | Installer clients | `id, company, retainer, per_sit_fee, ad_spend_monthly` (hidden from non-owners) |
| `leads` | Homeowner enquiries | `id, client_id, name, address, consent, response_mins` |
| `appointments` | Booked surveys | `id, client_id, lead_id, appt_date, outcome, quality_rating` |
| `invoices` | Monthly billing | `id, client_id, amount, paid_at` |
| `users` | Auth roles + tenant mapping | `id (= auth.uid()), role, client_id` |
| `call_queue` | Setter lead assignments | `id, lead_id, setter_id, claimed_at, disposition` |
| `confirmation_queue` | Confirmer work list | `id, appointment_id, status, confirmed_at` |
| `campaigns` / `campaign_spend` | Ad budget tracking | Agency-only (owner view) |
| `routing_rules` | Postcode → client routing | `postcode_prefix, client_id, priority` |
| `sop_documents` | Playbook library | `id, key, title, content, default_content, updated_at` |
| `audit_log` | Immutable event log | `id, user_id, action, table_name, record_id, changed_at` |
| `data_requests` | GDPR requests | `id, requester_email, type, status, created_at` |

---

## 4. Security Model

### RLS (Row-Level Security)

RLS is **on by default** for every business table. Policies fail-closed: if no policy matches, access is denied.

Three policy helper functions (defined in migration 0002):
- `is_owner()` — returns true if `auth.uid()` matches the owner user's ID via the `users` table
- `auth_role()` — returns the authenticated user's role string
- `auth_client_id()` — returns the `client_id` from the `users` table for the current user

Standard policy pattern for business tables:
```sql
-- Owner sees everything
create policy "owner_all" on <table>
  for all using (is_owner());

-- Client sees only their own rows
create policy "client_read_own" on <table>
  for select using (client_id = auth_client_id());
```

### Column-level lockdown

Migration 0004 uses `REVOKE SELECT` on specific columns from the `authenticated` role:
- `clients.ad_spend_monthly`
- `clients.weekly_promise`
- `clients.priority`
- Lead metadata columns

This means even a correctly authenticated owner (or client) cannot SELECT these columns via the anon/authenticated key. The service-role key (used only server-side) bypasses this — this is intentional for owner data loading.

### Service-role key

The service-role key (`SUPABASE_SERVICE_ROLE_KEY`) bypasses all RLS. It is used **only in**:
- `lib/supabase/admin.ts` (server-only)
- `scripts/` (seed scripts, verify:rls)

Never expose the service-role key to the browser. It must never appear in `NEXT_PUBLIC_` variables or client-side code.

### Roles

| Role | Access |
|------|--------|
| `owner` | All tables, all rows, all columns (via service role for hidden cols) |
| `client` | Own `clients`, `leads`, `appointments`, `invoices` rows only; no agency money columns |
| `setter` | Own `users` row only; call queue RPCs; no business tables |
| `confirmer` | `appointments` + `leads` (safe cols); no money/clients/audit |

---

## 5. Key Logic Locations

| Feature | File(s) |
|---------|---------|
| Role guards | `lib/data.ts` — `requireOwner()`, `requireSession()` |
| Supabase server client | `lib/supabase/server.ts` |
| Supabase admin client | `lib/supabase/admin.ts` |
| Middleware (session refresh) | `middleware.ts` |
| Seed data | `scripts/seed.ts` |
| RLS verification | `scripts/verify-rls.ts` |
| SOP library | `app/(app)/sops/` |
| PDF generation | `app/(app)/sops/[key]/pdf-client.tsx` |
| Owner sidebar nav | `components/Sidebar.tsx` |

---

## 6. Build, Deploy, and Workflow

### Local development

There is no local Supabase — all dev points to the Supabase cloud project.

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Seed the database (run once after migrations)
npm run seed

# Verify RLS
npm run verify:rls

# Run tests
npm test
```

### Environment variables

Required in `.env.local` (never committed):

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SEED_OWNER_EMAIL=
SEED_OWNER_PASSWORD=
SEED_CLIENT_EMAIL=
SEED_CLIENT_PASSWORD=
SEED_SETTER_EMAIL=
SEED_SETTER_PASSWORD=
SEED_CONFIRMER_EMAIL=
SEED_CONFIRMER_PASSWORD=
NEXT_PUBLIC_SUPABASE_URL=     # Same value as SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY= # Same value as SUPABASE_ANON_KEY
```

On Vercel, set all of these in Project Settings → Environment Variables.

### Migrations

Migrations are **append-only**. To make a schema change:

1. Create `supabase/migrations/NNNN_description.sql` (next sequence number).
2. Paste the SQL into the Supabase SQL editor and run it.
3. Commit the file.
4. Re-run `npm run verify:rls` to confirm nothing broke.

Never edit a migration that has already been applied.

### Deploy

Vercel auto-deploys on push to `main`. The build runs `next build`. There is no migration step in CI — migrations are applied manually in the Supabase dashboard first, then the code is pushed.

---

## 7. Test Suite

Tests live in `__tests__/`. Run with `npm test` (Vitest).

Current coverage:
- Unit tests for data formatting utilities
- RLS integration test script (`verify:rls`) — the primary correctness gate

`npm run verify:rls` requires live Supabase credentials and a seeded database. It signs in as each role and verifies 70+ access-control checks. This must pass before any schema change is considered done.

---

## 8. Gotchas and Known Issues

1. **Two `0021_*.sql` files.** Migration `0021` was applied twice (adaptive routing and confirmer cockpit). Both files exist; only one is in sequence. The DB has both changes applied. Do not renumber.

2. **Column-level revoke + service role.** When loading owner data that includes hidden columns (e.g. `ad_spend_monthly`), you must use the admin/service-role client, not the authenticated client. See `lib/data.ts` — the merge pattern loads safe cols via authenticated client then merges hidden cols via admin.

3. **`select *` is forbidden in portal code.** Always enumerate columns explicitly in client-facing queries. RLS hides rows, not columns.

4. **PWA caching.** The service worker (`@ducanh2912/next-pwa`) caches aggressively. After a deploy, users may need to hard-refresh or wait for the SW to update. The offline page at `/offline` is the fallback.

5. **jsPDF in App Router.** The PDF download for SOPs runs entirely client-side (dynamic import with `ssr: false`). Do not import jsPDF in a server component — it uses browser APIs.

---

## 9. Deferred Roadmap

Items scoped but not yet built:

- **Speed-to-lead webhook**: inbound lead → trigger setter dial alert via SMS/n8n (Phase 4)
- **Outbound SMS consent flow**: auto-SMS on lead arrival gated on `consent = true`
- **Claude Agent SDK qualifier**: replace manual setter wrap-up with AI-assisted call scoring
- **Stripe integration**: replace manual invoice tracking with automated payment links
- **Multi-region routing**: postcode → regional setter assignment (routing rules table is seeded, logic not fully wired)
- **Audit log UI filtering**: audit log table exists, basic UI present; full filter/search UI deferred
$$);
