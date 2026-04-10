'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function getConversations() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function getConversation(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('ai_conversations')
    .select(
      `
      *,
      ai_messages (*)
    `
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createConversation() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('ai_conversations')
    .insert({
      user_id: user.id,
      title: 'Nieuw gesprek',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/ai');
  return data;
}

export async function deleteConversation(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { error } = await supabase
    .from('ai_conversations')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) throw new Error(error.message);

  revalidatePath('/ai');
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  toolCalls?: unknown[]
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Verify conversation ownership
  const { data: conversation, error: convError } = await supabase
    .from('ai_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (convError || !conversation)
    throw new Error('Gesprek niet gevonden');

  const { data, error } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id: conversationId,
      role,
      content,
      tool_calls: toolCalls || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Update conversation's updated_at timestamp
  await supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  revalidatePath('/ai');
  return data;
}
