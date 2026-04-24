import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getClientIp, isIpWhitelisted } from '@/lib/actions/display';
import DisplayView from './DisplayView';

export const dynamic = 'force-dynamic';

export default async function DisplayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Look up the dashboard by its share token using the service-role client,
  // because visitors hitting this URL may not (yet) be authenticated.
  const admin = createAdminClient();
  const { data: dashboard, error } = await admin
    .from('dashboards')
    .select(
      `
      id,
      name,
      description,
      is_default,
      theme,
      auto_refresh_seconds,
      dashboard_klips (
        id,
        klip_id,
        dashboard_id,
        position_x,
        position_y,
        width,
        height,
        klip:klips (
          id,
          name,
          type,
          description,
          config,
          query_id,
          ai_generated,
          is_template
        )
      )
    `
    )
    .eq('share_token', token)
    .maybeSingle();

  if (error || !dashboard) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-hero-blue p-6 text-center text-white">
        <div>
          <h1 className="text-xl font-semibold">Dashboard niet gevonden</h1>
          <p className="mt-2 text-sm text-white/70">
            De link is ongeldig of verlopen.
          </p>
        </div>
      </div>
    );
  }

  // 1. Whitelisted IP → always show without auth.
  const clientIp = await getClientIp();
  const ipAllowed = clientIp ? await isIpWhitelisted(clientIp) : false;

  if (!ipAllowed) {
    // 2. Logged-in users are fine too.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // 3. Neither: force the Microsoft login flow, then come back here.
      const nextUrl = `/display/${encodeURIComponent(token)}`;
      redirect(`/login?next=${encodeURIComponent(nextUrl)}`);
    }
  }

  // Supabase's TS inference flags each `klip:klips(...)` join as an array
  // of klips, but the FK is singular — so cast to the expected shape.
  return (
    <DisplayView
      dashboard={dashboard as unknown as Parameters<typeof DisplayView>[0]['dashboard']}
    />
  );
}
