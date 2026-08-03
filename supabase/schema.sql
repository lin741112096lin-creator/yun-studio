-- YunWangAI server-side data model.
-- Media binaries stay on the customer's device; these tables store account,
-- billing, task metadata, and audit information only.

create table if not exists public.app_users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.auth_sessions (
  token_hash text primary key,
  user_id text not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id text primary key references public.app_users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.star_ledger (
  id text primary key,
  user_id text not null references public.app_users(id) on delete cascade,
  amount integer not null,
  balance_after integer not null check (balance_after >= 0),
  reason text not null,
  actor_id text not null references public.app_users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.usage_summary (
  user_id text primary key references public.app_users(id) on delete cascade,
  image_count integer not null default 0,
  video_count integer not null default 0,
  chat_count integer not null default 0,
  total_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.usage_logs (
  id text primary key,
  user_id text not null references public.app_users(id) on delete cascade,
  username text not null,
  kind text not null check (kind in ('image', 'video', 'chat')),
  provider text,
  model text,
  aspect_ratio text,
  resolution text,
  duration integer,
  stars integer not null default 0,
  status text not null default 'requested',
  created_at timestamptz not null default now()
);

create table if not exists public.generation_tasks (
  id text primary key,
  user_id text not null references public.app_users(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'chat')),
  status text not null,
  operation_name text,
  task_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists star_ledger_user_created_idx
  on public.star_ledger (user_id, created_at desc);

create index if not exists usage_logs_user_created_idx
  on public.usage_logs (user_id, created_at desc);

create index if not exists generation_tasks_user_updated_idx
  on public.generation_tasks (user_id, updated_at desc);

-- The frontend never receives the service key. RLS remains enabled as a
-- second layer of protection if a publishable key is ever used accidentally.
alter table public.app_users enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.wallets enable row level security;
alter table public.star_ledger enable row level security;
alter table public.usage_summary enable row level security;
alter table public.usage_logs enable row level security;
alter table public.generation_tasks enable row level security;

create or replace function public.adjust_wallet(
  p_user_id text,
  p_amount integer,
  p_reason text,
  p_actor_id text
)
returns table(balance integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  next_balance integer;
begin
  insert into public.wallets (user_id, balance)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  update public.wallets
  set balance = wallets.balance + p_amount,
      updated_at = now()
  where wallets.user_id = p_user_id
    and wallets.balance + p_amount >= 0
  returning wallets.balance, wallets.updated_at into next_balance, updated_at;

  if not found then
    return;
  end if;

  insert into public.star_ledger (id, user_id, amount, balance_after, reason, actor_id)
  values (
    'star_' || extract(epoch from clock_timestamp())::bigint || '_' || replace(gen_random_uuid()::text, '-', ''),
    p_user_id,
    p_amount,
    next_balance,
    p_reason,
    p_actor_id
  );

  balance := next_balance;
  return next;
end;
$$;

revoke all on function public.adjust_wallet(text, integer, text, text) from public;
grant execute on function public.adjust_wallet(text, integer, text, text) to service_role;
