import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { login } from './actions';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect('/overview');

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6">
          <div className="text-amber font-semibold text-lg">Sunline</div>
          <div className="text-muted text-sm">Sign in</div>
        </div>
        <form action={login} className="space-y-3">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="input mt-1"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="input mt-1"
            />
          </div>
          {searchParams.error && (
            <p className="text-bad text-sm">{searchParams.error}</p>
          )}
          <button type="submit" className="btn btn-primary w-full">
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}
