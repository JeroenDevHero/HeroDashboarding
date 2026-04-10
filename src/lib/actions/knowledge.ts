'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function getKnowledgeEntries(category?: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  let query = supabase
    .from('knowledge_base')
    .select('*')
    .order('updated_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return data;
}

export async function getKnowledgeEntry(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('knowledge_base')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function createKnowledgeEntry(data: {
  title: string;
  content: string;
  category: string;
  tags?: string[];
  source?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data: entry, error } = await supabase
    .from('knowledge_base')
    .insert({
      title: data.title,
      content: data.content,
      category: data.category,
      tags: data.tags || [],
      source: data.source || null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  revalidatePath('/knowledge');
  return entry;
}

export async function updateKnowledgeEntry(
  id: string,
  data: {
    title?: string;
    content?: string;
    category?: string;
    tags?: string[];
  }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { error } = await supabase
    .from('knowledge_base')
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/knowledge');
}

export async function deleteKnowledgeEntry(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { error } = await supabase
    .from('knowledge_base')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);

  revalidatePath('/knowledge');
}

export async function getKnowledgeContext(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Niet ingelogd');

  const { data, error } = await supabase
    .from('knowledge_base')
    .select('title, content, category')
    .order('updated_at', { ascending: false });

  if (error) throw new Error(error.message);

  if (!data || data.length === 0) {
    return 'Geen kennisbank-items gevonden.';
  }

  return data
    .map(
      (entry) =>
        `## ${entry.title} (categorie: ${entry.category})\n${entry.content}\n---`
    )
    .join('\n\n');
}
