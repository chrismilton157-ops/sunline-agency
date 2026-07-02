import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

type CookieIn = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieIn[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — required to keep cookies fresh on each request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLogin = path.startsWith('/login');
  // Phase 5: /apply (public lead form) and /privacy are public-by-design.
  // Phase 15: "/" (installer marketing landing) and /enquiry (form submission) are public.
  // Phase 28: /for-installers (public self-audit funnel for cold outreach) is public.
  const isPublic =
    path === '/' ||
    path.startsWith('/enquiry') ||
    path.startsWith('/apply') ||
    path.startsWith('/for-installers') ||
    path.startsWith('/privacy');
  const isPublicAsset =
    path.startsWith('/_next') ||
    path.startsWith('/favicon') ||
    path.startsWith('/api/health');

  if (!user && !isLogin && !isPublic && !isPublicAsset) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isLogin) {
    // Already signed in — route to the right front door by role.
    const { data: row } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();
    const url = request.nextUrl.clone();
    url.pathname =
      row?.role === 'client'    ? '/portal' :
      row?.role === 'setter'    ? '/queue' :
      row?.role === 'confirmer' ? '/cockpit' :
      '/today';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
