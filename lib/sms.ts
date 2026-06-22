import 'server-only';

// Sunline Phase 5: SMS provider abstraction.
//
// Safe no-op when no provider is configured: if any of the Twilio env
// vars are missing, sendSms() logs "[sms] would send to X: ..." and
// returns { sent: false }. That lets the rest of Phase 5 work without
// a Twilio account.
//
// IMPORTANT: this module does NOT enforce consent — that's the caller's
// job. Use lib/leads.ts → notifyLeadAfterCapture() which re-reads the
// lead from the DB and refuses to send unless consent + consent_at are
// both set. Defence in depth.

export type SmsResult =
  | { sent: true; provider: 'twilio'; messageSid: string }
  | { sent: false; reason: string };

export function smsConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  if (!smsConfigured()) {
    // Safe no-op: form will still work, lead is still captured + routed.
    console.log(`[sms] would send to ${to}: ${body}`);
    return { sent: false, reason: 'sms provider not configured' };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const token = process.env.TWILIO_AUTH_TOKEN!;
  const from = process.env.TWILIO_FROM_NUMBER!;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ To: to, From: from, Body: body });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${auth}`,
      },
      body: params,
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`[sms] Twilio ${res.status}: ${txt}`);
      return { sent: false, reason: `twilio_${res.status}` };
    }
    const json = (await res.json()) as { sid: string };
    return { sent: true, provider: 'twilio', messageSid: json.sid };
  } catch (e) {
    console.error('[sms] Twilio fetch failed', e);
    return { sent: false, reason: 'twilio_fetch_failed' };
  }
}
