import { logout } from '@/app/login/actions';

export function PortalHeader({ company }: { company: string }) {
  return (
    <header className="bg-sidebar text-white">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 py-4 flex items-center justify-between">
        <div>
          <div className="text-amber font-semibold text-base tracking-tight">
            Sunline
          </div>
          <div className="text-white/60 text-xs mt-0.5">
            <span className="font-medium text-white">{company}</span> · Performance portal
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="text-xs text-white/70 hover:text-white underline underline-offset-2"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
