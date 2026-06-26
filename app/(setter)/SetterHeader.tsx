'use client';
import { logout } from '@/app/login/actions';

export function SetterHeader({ email }: { email: string }) {
  return (
    <header className="border-b border-hairline bg-white/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-2xl mx-auto px-4 h-12 flex items-center justify-between">
        <span className="font-semibold text-amber tracking-tight text-sm">Sunline</span>
        <div className="flex items-center gap-4">
          <span className="text-xs text-muted hidden sm:block">{email}</span>
          <form action={logout}>
            <button
              type="submit"
              className="text-xs text-muted hover:text-ink underline underline-offset-2"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
