import { redirect, notFound } from 'next/navigation';
import { requireOwner } from '@/lib/data';
import { getServerAdmin } from '@/lib/supabase/admin';
import { SOPEditor } from './sop-editor';

export default async function SOPPage({ params }: { params: { key: string } }) {
  const { role } = await requireOwner();
  if (role !== 'owner') redirect('/login?error=Owner+access+only');

  const admin = getServerAdmin();
  const { data: doc, error } = await admin
    .from('sop_documents')
    .select('id, key, title, content, default_content, updated_at')
    .eq('key', params.key)
    .single();

  if (error || !doc) notFound();

  return (
    <SOPEditor
      id={doc.id}
      sopKey={doc.key}
      title={doc.title}
      content={doc.content}
      defaultContent={doc.default_content}
      updatedAt={doc.updated_at}
    />
  );
}
