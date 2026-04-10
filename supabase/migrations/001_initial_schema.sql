-- ============================================================================
-- Hero Dashboards — Initial Schema
-- ============================================================================

-- ---------- helper: updated_at trigger function ----------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
security definer
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. PROFILES  (extends auth.users)
-- ============================================================================
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  avatar_url  text,
  role        text not null default 'viewer'
              check (role in ('admin', 'builder', 'viewer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- 2. DATASOURCES
-- ============================================================================
create table public.datasources (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null
                  check (type in ('postgresql', 'rest_api', 'google_sheets', 'csv')),
  config          jsonb not null default '{}'::jsonb,
  status          text not null default 'active'
                  check (status in ('active', 'error', 'inactive')),
  last_synced_at  timestamptz,
  created_by      uuid not null references public.profiles(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_datasources_created_by on public.datasources(created_by);

create trigger datasources_updated_at
  before update on public.datasources
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 3. KLIPS
-- ============================================================================
create table public.klips (
  id                      uuid primary key default gen_random_uuid(),
  title                   text not null,
  description             text,
  type                    text not null
                          check (type in ('bar', 'line', 'pie', 'area', 'number', 'table', 'custom')),
  config                  jsonb not null default '{}'::jsonb,
  query                   text,
  datasource_id           uuid references public.datasources(id) on delete set null,
  cache_duration_seconds  int not null default 300,
  cached_data             jsonb,
  cached_at               timestamptz,
  created_by              uuid not null references public.profiles(id) on delete cascade,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_klips_datasource_id on public.klips(datasource_id);
create index idx_klips_created_by    on public.klips(created_by);

create trigger klips_updated_at
  before update on public.klips
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 4. DASHBOARDS
-- ============================================================================
create table public.dashboards (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  is_public   boolean not null default false,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_dashboards_created_by on public.dashboards(created_by);

create trigger dashboards_updated_at
  before update on public.dashboards
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 5. DASHBOARD_KLIPS  (join table with layout)
-- ============================================================================
create table public.dashboard_klips (
  id            uuid primary key default gen_random_uuid(),
  dashboard_id  uuid not null references public.dashboards(id) on delete cascade,
  klip_id       uuid not null references public.klips(id) on delete cascade,
  layout        jsonb not null default '{"x":0,"y":0,"w":6,"h":4}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (dashboard_id, klip_id)
);

create index idx_dashboard_klips_dashboard_id on public.dashboard_klips(dashboard_id);
create index idx_dashboard_klips_klip_id      on public.dashboard_klips(klip_id);

-- ============================================================================
-- 6. AI_CONVERSATIONS
-- ============================================================================
create table public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index idx_ai_conversations_user_id on public.ai_conversations(user_id);

create trigger ai_conversations_updated_at
  before update on public.ai_conversations
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- 7. AI_MESSAGES
-- ============================================================================
create table public.ai_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.ai_conversations(id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  tool_calls       jsonb,
  created_at       timestamptz not null default now()
);

create index idx_ai_messages_conversation_id on public.ai_messages(conversation_id);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Helper: get the role of the current user
create or replace function public.user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- ---- profiles ----
alter table public.profiles enable row level security;

create policy "profiles: anyone authenticated can read"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles: users can update own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- datasources ----
alter table public.datasources enable row level security;

create policy "datasources: authenticated can read"
  on public.datasources for select
  to authenticated
  using (true);

create policy "datasources: admin and builder can insert"
  on public.datasources for insert
  to authenticated
  with check (public.user_role() in ('admin', 'builder'));

create policy "datasources: admin and builder can update"
  on public.datasources for update
  to authenticated
  using (public.user_role() in ('admin', 'builder'))
  with check (public.user_role() in ('admin', 'builder'));

create policy "datasources: admin can delete"
  on public.datasources for delete
  to authenticated
  using (public.user_role() = 'admin');

-- ---- klips ----
alter table public.klips enable row level security;

create policy "klips: authenticated can read"
  on public.klips for select
  to authenticated
  using (true);

create policy "klips: authenticated can insert"
  on public.klips for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "klips: owner or admin can update"
  on public.klips for update
  to authenticated
  using (created_by = auth.uid() or public.user_role() = 'admin')
  with check (created_by = auth.uid() or public.user_role() = 'admin');

create policy "klips: owner or admin can delete"
  on public.klips for delete
  to authenticated
  using (created_by = auth.uid() or public.user_role() = 'admin');

-- ---- dashboards ----
alter table public.dashboards enable row level security;

create policy "dashboards: public or own or admin can read"
  on public.dashboards for select
  to authenticated
  using (
    is_public = true
    or created_by = auth.uid()
    or public.user_role() = 'admin'
  );

create policy "dashboards: authenticated can insert"
  on public.dashboards for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "dashboards: owner or admin can update"
  on public.dashboards for update
  to authenticated
  using (created_by = auth.uid() or public.user_role() = 'admin')
  with check (created_by = auth.uid() or public.user_role() = 'admin');

create policy "dashboards: owner or admin can delete"
  on public.dashboards for delete
  to authenticated
  using (created_by = auth.uid() or public.user_role() = 'admin');

-- ---- dashboard_klips ----
alter table public.dashboard_klips enable row level security;

create policy "dashboard_klips: follow dashboard read access"
  on public.dashboard_klips for select
  to authenticated
  using (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_id
        and (d.is_public = true or d.created_by = auth.uid() or public.user_role() = 'admin')
    )
  );

create policy "dashboard_klips: dashboard owner or admin can insert"
  on public.dashboard_klips for insert
  to authenticated
  with check (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_id
        and (d.created_by = auth.uid() or public.user_role() = 'admin')
    )
  );

create policy "dashboard_klips: dashboard owner or admin can update"
  on public.dashboard_klips for update
  to authenticated
  using (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_id
        and (d.created_by = auth.uid() or public.user_role() = 'admin')
    )
  )
  with check (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_id
        and (d.created_by = auth.uid() or public.user_role() = 'admin')
    )
  );

create policy "dashboard_klips: dashboard owner or admin can delete"
  on public.dashboard_klips for delete
  to authenticated
  using (
    exists (
      select 1 from public.dashboards d
      where d.id = dashboard_id
        and (d.created_by = auth.uid() or public.user_role() = 'admin')
    )
  );

-- ---- ai_conversations ----
alter table public.ai_conversations enable row level security;

create policy "ai_conversations: own only"
  on public.ai_conversations for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---- ai_messages ----
alter table public.ai_messages enable row level security;

create policy "ai_messages: own conversations only"
  on public.ai_messages for all
  to authenticated
  using (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.ai_conversations c
      where c.id = conversation_id
        and c.user_id = auth.uid()
    )
  );
