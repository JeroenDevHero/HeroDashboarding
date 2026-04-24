'use server';

import { createClient } from '@/lib/supabase/server';

export interface SuggestedQuestion {
  question: string;
  use_count: number;
  tables_used: string[] | null;
}

/**
 * Return the top-N most-used successful questions across every data source
 * the current user has access to. Used to populate the "probeer deze vragen"
 * starter state in the AI chat.
 */
export async function getSuggestedQuestions(
  limit: number = 6
): Promise<SuggestedQuestion[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('query_patterns')
    .select('natural_language, use_count, tables_used, quality_score')
    .gte('quality_score', 0)
    .order('use_count', { ascending: false })
    .order('quality_score', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[suggestions] query failed:', error.message);
    return [];
  }
  if (!data) return [];

  // Deduplicate on natural_language (patterns can have many small variants)
  const seen = new Set<string>();
  const result: SuggestedQuestion[] = [];
  for (const row of data) {
    const key = row.natural_language.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      question: row.natural_language,
      use_count: row.use_count,
      tables_used: row.tables_used as string[] | null,
    });
    if (result.length >= limit) break;
  }
  return result;
}
