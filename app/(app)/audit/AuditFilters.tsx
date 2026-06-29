'use client';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

type Props = {
  actionTypes: string[];
  current: {
    action_type?: string;
    entity_type?: string;
    actor_role?: string;
    entity_id?: string;
    from?: string;
    to?: string;
    q?: string;
  };
};

const ENTITY_TYPES = ['lead', 'appointment', 'invoice', 'client', 'settings', 'data_request'];
const ACTOR_ROLES  = ['owner', 'setter', 'client', 'system', 'public'];

export function AuditFilters({ actionTypes, current }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) {
    const form = e.currentTarget.closest('form') as HTMLFormElement;
    const data = new FormData(form);
    const qs = new URLSearchParams();
    for (const [k, v] of data.entries()) {
      if (v && typeof v === 'string') qs.set(k, v);
    }
    startTransition(() => router.push(`/audit?${qs.toString()}`));
  }

  return (
    <form className="card p-4 flex flex-wrap gap-3 items-end" onSubmit={(e) => e.preventDefault()}>
      <div className="flex flex-col gap-1">
        <label className="label text-xs">Search</label>
        <input
          name="q"
          defaultValue={current.q ?? ''}
          placeholder="Search description…"
          className="input text-sm w-52"
          onChange={handleChange}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="label text-xs">Action type</label>
        <select
          name="action_type"
          defaultValue={current.action_type ?? ''}
          className="input text-sm"
          onChange={handleChange}
        >
          <option value="">All actions</option>
          {actionTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="label text-xs">Entity type</label>
        <select
          name="entity_type"
          defaultValue={current.entity_type ?? ''}
          className="input text-sm"
          onChange={handleChange}
        >
          <option value="">All entities</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="label text-xs">Actor role</label>
        <select
          name="actor_role"
          defaultValue={current.actor_role ?? ''}
          className="input text-sm"
          onChange={handleChange}
        >
          <option value="">All roles</option>
          {ACTOR_ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="label text-xs">From date</label>
        <input
          type="date"
          name="from"
          defaultValue={current.from ?? ''}
          className="input text-sm"
          onChange={handleChange}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="label text-xs">To date</label>
        <input
          type="date"
          name="to"
          defaultValue={current.to ?? ''}
          className="input text-sm"
          onChange={handleChange}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="label text-xs">Entity ID</label>
        <input
          name="entity_id"
          defaultValue={current.entity_id ?? ''}
          placeholder="Paste a UUID…"
          className="input text-sm font-mono w-44"
          onChange={handleChange}
        />
      </div>
    </form>
  );
}
