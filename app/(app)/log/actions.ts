'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerSupabase } from '@/lib/supabase/server';

export async function logAppointment(formData: FormData) {
  const clientId = String(formData.get('client_id') ?? '').trim();
  const homeowner = String(formData.get('homeowner') ?? '').trim();
  const address = String(formData.get('address') ?? '').trim();
  const apptDate = String(formData.get('appt_date') ?? '').trim();
  const responseMinsRaw = String(formData.get('response_mins') ?? '').trim();

  if (!clientId || !homeowner || !apptDate) {
    redirect('/log?error=Client%2C+homeowner+and+date+are+required.');
  }

  const responseMins =
    responseMinsRaw === '' ? null : Number(responseMinsRaw);
  if (responseMins != null && (!Number.isFinite(responseMins) || responseMins < 0)) {
    redirect('/log?error=Response+time+must+be+a+positive+number.');
  }

  const supabase = getServerSupabase();

  // Create a lead row so the appointment links to a homeowner record.
  // Consent stays false until they confirm on the form-of-record — Phase 2
  // is internal-only and not the consent-capture path.
  const { data: lead, error: lErr } = await supabase
    .from('leads')
    .insert({
      client_id: clientId,
      name: homeowner,
      address: address || null,
      response_mins: responseMins,
      status: 'booked',
      consent: false,
    })
    .select('id')
    .single();
  if (lErr || !lead) {
    redirect(
      `/log?error=${encodeURIComponent(
        `Could not create lead: ${lErr?.message ?? 'unknown error'}`,
      )}`,
    );
  }

  const { error: aErr } = await supabase.from('appointments').insert({
    client_id: clientId,
    lead_id: lead.id,
    appt_date: new Date(apptDate).toISOString(),
    outcome: 'booked',
  });
  if (aErr) {
    redirect(
      `/log?error=${encodeURIComponent(
        `Could not create appointment: ${aErr.message}`,
      )}`,
    );
  }

  revalidatePath('/overview');
  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?logged=1`);
}
