'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { logout } from '@/app/login/actions';

const items = [
  { href: '/portal/results', label: 'My results' },
  { href: '/portal/appointments', label: 'Appointments' },
  { href: '/portal/billing', label: 'Billing' },
];

export function PortalSidebar({ company }: { company: string }) {
  const path = usePathname() ?? '';
  return (
    <aside
      className="bg-sidebar text-white md:w-60 md:min-h-screen md:sticky md:top-0
                 flex md:flex-col items-center md:items-stretch
                 px-4 pb-3 md:py-6 gap-1 md:gap-1
                 pt-safe-top md:pt-6
                 pb-[max(12px,env(safe-area-inset-bottom))] md:pb-6"
    >
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
        <div className="text-white font-medium text-sm mt-1.5 ml-7 truncate">
          {company}
        </div>
        <div className="text-white/50 text-xs mt-0.5 ml-7">Performance portal</div>
      </div>

      <nav className="flex md:flex-col gap-1 flex-1 overflow-x-auto">
        {items.map((it) => {
          const active = path === it.href || path.startsWith(it.href + '/');
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
