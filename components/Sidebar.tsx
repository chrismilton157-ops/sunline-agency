'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/login/actions';

const OWNER_ITEMS = [
  { href: '/today',         label: 'Today' },
  { href: '/churn',         label: 'Churn risk' },
  { href: '/alerts',        label: 'Alerts' },
  { href: '/overview',      label: 'Overview' },
  { href: '/clients',       label: 'Clients' },
  { href: '/routing',       label: 'Routing' },
  { href: '/leads',         label: 'Leads' },
  { href: '/queue',         label: 'Call queue' },
  { href: '/pipelines',     label: 'Pipelines' },
  { href: '/setters',       label: 'Setters' },
  { href: '/confirmations', label: 'Confirmations' },
  { href: '/billing',       label: 'Billing' },
  { href: '/allocation',    label: 'Allocation' },
  { href: '/attribution',   label: 'Attribution' },
  { href: '/log',           label: 'Log activity' },
  { href: '/settings',      label: 'Settings' },
  { href: '/enquiries',     label: 'Enquiries' },
  { href: '/data-requests', label: 'Data requests' },
  { href: '/audit',         label: 'Audit log' },
  { href: '/sops',          label: 'SOPs & Playbooks' },
];

const SETTER_ITEMS = [
  { href: '/queue',       label: 'Call queue' },
  { href: '/leaderboard', label: 'Leaderboard' },
];

const CONFIRMER_ITEMS = [
  { href: '/cockpit', label: 'Cockpit' },
];

export function Sidebar({ email, role }: { email: string; role?: string }) {
  const path = usePathname() ?? '';
  const isSetter    = role === 'setter';
  const isConfirmer = role === 'confirmer';
  const items = isSetter ? SETTER_ITEMS : isConfirmer ? CONFIRMER_ITEMS : OWNER_ITEMS;

  return (
    <aside className="bg-sidebar text-white md:w-60 md:min-h-screen md:sticky md:top-0
                      flex md:flex-col items-center md:items-stretch
                      px-4 py-2 md:py-6 gap-1 md:gap-1
                      pb-[max(8px,env(safe-area-inset-bottom))] md:pb-6">
      <div className="hidden md:block mb-6 px-2">
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <line x1="16" y1="2" x2="16" y2="7" stroke="#E07B39" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="16" y1="25" x2="16" y2="30" stroke="#E07B39" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="2" y1="16" x2="7" y2="16" stroke="#E07B39" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="25" y1="16" x2="30" y2="16" stroke="#E07B39" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="5.5" y1="5.5" x2="9" y2="9" stroke="#E07B39" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="23" y1="23" x2="26.5" y2="26.5" stroke="#E07B39" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="26.5" y1="5.5" x2="23" y2="9" stroke="#E07B39" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="9" y1="23" x2="5.5" y2="26.5" stroke="#E07B39" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="16" cy="16" r="5.5" fill="#E07B39"/>
          </svg>
          <div className="text-amber font-semibold text-base tracking-tight">
            Sunline
          </div>
        </div>
        <div className="text-white/50 text-xs mt-0.5 ml-7">
          {isSetter ? 'Setter' : isConfirmer ? 'Confirmer' : 'Owner'}
        </div>
      </div>

      <nav aria-label="Main navigation" className="flex md:flex-col gap-0.5 flex-1 overflow-x-auto md:overflow-x-visible">
        {items.map((it) => {
          const active =
            path === it.href || path.startsWith(it.href + '/');
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? 'page' : undefined}
              className={`px-3 py-2.5 md:py-2 rounded-lg text-sm font-medium whitespace-nowrap
                min-h-[44px] flex items-center touch-manipulation
                transition-all duration-150 ease-out
                ${
                  active
                    ? 'bg-amber text-white shadow-[0_2px_8px_0_rgba(224,123,57,0.30)]'
                    : 'text-white/70 hover:bg-white/8 hover:text-white active:bg-white/12'
                }`}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden md:flex flex-col gap-2 mt-6 px-2 text-xs text-white/50">
        <div className="truncate">{email}</div>
        <form action={logout}>
          <button
            type="submit"
            className="text-white/70 hover:text-white text-xs underline underline-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
