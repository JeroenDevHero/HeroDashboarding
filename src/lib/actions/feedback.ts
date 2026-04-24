'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type FeedbackRating = 1 | -1;

export interface SubmitFeedbackInput {
  rating: FeedbackRating;
  conversation_id?: string;
  klip_id?: string;
  query_pattern_id?: string;
  comment?: string;
}

export async function submitFeedback(input: SubmitFeedbackInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('query_feedback')
    .insert({
      user_id: user.id,
      rating: input.rating,
      conversation_id: input.conversation_id || null,
      klip_id: input.klip_id || null,
      query_pattern_id: input.query_pattern_id || null,
      comment: input.comment || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getFeedbackForConversation(conversationId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('query_feedback')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);
  return data || [];
}

/**
 * Admin-style aggregated feedback view. Returns the lowest-scoring query
 * patterns so humans can quickly review bad answers.
 */
export async function listLowQualityPatterns(limit: number = 20) {
  await requireAdminUser();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('query_patterns')
    .select('*')
    .lt('quality_score', 0)
    .order('quality_score', { ascending: true })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

async function requireAdminUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.is_admin) throw new Error('Alleen beheerders');
  return user;
}
