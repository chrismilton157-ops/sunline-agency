'use server';
import { redirect } from 'next/navigation';
import { getServerAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export async function submitDataRequest(formData: FormData) {
  const name  = String(formData.get('name')  ?? '').trim();
  const email = String(formData.get('email') ?? '').trim() || null;
  const phone = String(formData.get('phone') ?? '').trim() || null;
  const type  = String(formData.get('request_type') ?? '').trim();
  const msg   = String(formData.get('message') ?? '').trim() || null;

  const valid = ['access', 'erasure', 'other', 'complaint'];
  if (!name || !valid.includes(type) || (!email && !phone)) {
    redirect('/data-request?error=Please+fill+in+all+required+fields');
  }

  const admin = getServerAdmin();
  const { data: inserted, error } = await admin.from('data_requests').insert({
    requester_name:  name,
    requester_email: email,
    requester_phone: phone,
    request_type:    type,
    message:         msg,
  }).select('id').single();

  if (error) {
    console.error('data_requests insert error', error);
    redirect('/data-request?error=Something+went+wrong.+Please+try+again.');
  }

  await writeAudit({
    actor_id: null,
    actor_role: 'public',
    action_type: 'data_request.received',
    entity_type: 'data_request',
    entity_id: inserted?.id ?? null,
    description: `GDPR data request received: ${type} from ${name}`,
    metadata: { request_type: type, has_email: !!email, has_phone: !!phone },
  });

  redirect('/data-request/thanks');
}
