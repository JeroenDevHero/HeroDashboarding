'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ContextType } from '@/lib/types';

export async function getConversations() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, user_id, title, context_type, context_id, created_klip_ids, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Find the most recently updated conversation for a given klip.
 * Used by the klip detail page to restore the chat history when the user
 * re-opens the page. Returns `null` when no previous conversation exists.
 */
export async function getLatestKlipConversation(klipId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, messages, updated_at')
    .eq('user_id', user.id)
    .eq('context_type', 'klip_builder')
    .eq('context_id', klipId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function getConversation(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  // Messages are stored as JSONB array in the ai_conversations row itself
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createConversation(
  contextType: ContextType = 'klip_builder',
  contextId?: string
) {
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
      context_type: contextType,
      context_id: contextId || null,
      messages: [],
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

export async function updateConversationTitle(id: string, title: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { error } = await supabase
    .from('ai_conversations')
    .update({ title })
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

  // Fetch the current conversation to get existing messages
  const { data: conversation, error: convError } = await supabase
    .from('ai_conversations')
    .select('messages')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .single();

  if (convError || !conversation)
    throw new Error('Gesprek niet gevonden');

  // Build the new message
  const newMessage = {
    id: crypto.randomUUID(),
    role,
    content,
    tool_calls: toolCalls || null,
    created_at: new Date().toISOString(),
  };

  // Append to the existing messages JSONB array
  const updatedMessages = [...(conversation.messages || []), newMessage];

  const { error } = await supabase
    .from('ai_conversations')
    .update({
      messages: updatedMessages,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);

  if (error) throw new Error(error.message);

  revalidatePath('/ai');
  return newMessage;
}
