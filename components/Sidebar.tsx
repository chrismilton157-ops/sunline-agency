'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/login/actions';

const OWNER_ITEMS = [
  { href: '/today',         label: 'Today' },
  { href: '/alerts',        label: 'Alerts' },
  { href: '/overview',      label: 'Overview' },
  { href: '/clients',       label: 'Clients' },
  { href: '/routing',       label: 'Routing' },
  { href: '/leads',         label: 'Leads' },
  { href: '/queue',         label: 'Call queue' },
  { href: '/setters',       label: 'Setters' },
  { href: '/confirmations', label: 'Confirmations' },
  { href: '/billing',       label: 'Billing' },
  { href: '/allocation',    label: 'Allocation' },
  { href: '/attribution',   label: 'Attribution' },
  { href: '/log',           label: 'Log activity' },
  { href: '/settings',      label: 'Settings' },
];

const SETTER_ITEMS = [
  { href: '/queue',       label: 'Call queue' },
  { href: '/leaderboard', label: 'Leaderboard' },
];

export function Sidebar({ email, role }: { email: string; role?: string }) {
  const path = usePathname() ?? '';
  const isSetter = role === 'setter';
  const items = isSetter ? SETTER_ITEMS : OWNER_ITEMS;

  return (
    <aside className="bg-sidebar text-white md:w-60 md:min-h-screen md:sticky md:top-0
                      flex md:flex-col items-center md:items-stretch
                      px-4 py-3 md:py-6 gap-1 md:gap-1">
      <div className="hidden md:block mb-6 px-2">
        <div className="text-amber font-semibold text-base tracking-tight">
          Sunline
        </div>
        <div className="text-white/50 text-xs mt-0.5">
          {isSetter ? 'Setter' : 'Owner'}
        </div>
      </div>

      <nav className="flex md:flex-col gap-1 flex-1 overflow-x-auto">
        {items.map((it) => {
          const active =
            path === it.href || path.startsWith(it.href + '/');
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap
                ${
                  active
                    ? 'bg-amber text-white'
                    : 'text-white/80 hover:bg-white/5'
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
