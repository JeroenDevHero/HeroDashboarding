'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function startDashboardRebuild(data: {
  klipfolioTabName: string;
  newDashboardName: string;
  klipNames: string[];
  userContext?: string;
}): Promise<{ dashboardId: string; conversationId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // 1. Create a new Hero dashboard
  const { data: dashboard, error: dashError } = await supabase
    .from('dashboards')
    .insert({
      name: data.newDashboardName,
      description: `Herbouwd vanuit Klipfolio dashboard: ${data.klipfolioTabName}`,
      created_by: user.id,
    })
    .select()
    .single();

  if (dashError || !dashboard) {
    throw new Error(dashError?.message || 'Kon dashboard niet aanmaken');
  }

  // 2. Build the rebuild prompt with rich context
  const klipList = data.klipNames.map((name) => `- ${name}`).join('\n');

  // Include user context which now contains component types and datasource info
  const detailSection = data.userContext?.trim()
    ? `\nGedetailleerde klip-informatie (types en databronnen):\n${data.userContext.trim()}`
    : '';

  const rebuildPrompt = `Herbouw het Klipfolio dashboard "${data.klipfolioTabName}".

Dit dashboard bevat de volgende visualisaties:
${klipList}
${detailSection}

Instructies:
1. Gebruik de beschikbare databronnen in Hero (haal eerst de data catalog op)
2. Houd rekening met het oorspronkelijke visualisatietype bij het kiezen van het Hero klip-type
3. Maak voor elke visualisatie een klip aan met de juiste data
4. Gebruik nette Nederlandse namen en het Hero kleurenschema (#073889 blauw, #F46015 oranje)
5. Voeg elke klip toe aan dashboard "${data.newDashboardName}" (ID: ${dashboard.id})
6. Controleer met preview_data of de data klopt voordat je klips aanmaakt
7. Gebruik de component type mapping als leidraad: bar-chart → bar_chart, line-chart → line_chart, number-block → kpi_tile, etc.`;

  // 3. Create an AI conversation with the rebuild prompt pre-filled
  const { data: conversation, error: convError } = await supabase
    .from('ai_conversations')
    .insert({
      user_id: user.id,
      title: `Herbouw: ${data.klipfolioTabName}`,
      context_type: 'dashboard_assistant',
      context_id: dashboard.id,
      messages: [
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: rebuildPrompt,
          tool_calls: null,
          created_at: new Date().toISOString(),
        },
      ],
    })
    .select()
    .single();

  if (convError || !conversation) {
    throw new Error(convError?.message || 'Kon AI gesprek niet aanmaken');
  }

  revalidatePath('/dashboards');
  revalidatePath('/ai');

  return {
    dashboardId: dashboard.id,
    conversationId: conversation.id,
  };
}
