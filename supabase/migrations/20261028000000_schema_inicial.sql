-- Escravos Dourados — schema inicial (aplicado em 2026-10-28 no projeto Supabase awnexidwzciauhbmsywf)
create extension if not exists pgcrypto with schema extensions;

-- Chave de acesso de dono único: o app envia a chave no header x-arkad; aqui só fica o sha256.
create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;
create table privado.chave (
  id int primary key default 1 check (id = 1),
  hash text not null,
  criada_em timestamptz not null default now()
);

create or replace function public.chave_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from privado.chave c
    where c.hash = encode(extensions.digest(coalesce(current_setting('request.headers', true)::json ->> 'x-arkad', ''), 'sha256'), 'hex')
  );
$$;
revoke all on function public.chave_ok() from public;
grant execute on function public.chave_ok() to anon, authenticated;

create table public.censos (
  data date primary key,
  payload jsonb not null,
  patrimonio numeric(16,2),
  registrado_em timestamptz not null default now()
);

create table public.serie (
  id int primary key default 1 check (id = 1),
  atualizado_em date,
  pontos jsonb not null
);

create table public.ordens (
  id text primary key,
  data text,
  ref text,
  ativo text not null,
  tipo text not null check (tipo in ('C','V','A')),
  qtd numeric not null check (qtd > 0),
  preco numeric not null check (preco > 0),
  status text not null default 'executada' check (status in ('executada','pendente','cancelada')),
  fonte text,
  nota text,
  seq bigint,
  criado_em timestamptz not null default now()
);
create index ordens_ativo_idx on public.ordens (ativo);

alter table public.censos enable row level security;
alter table public.serie enable row level security;
alter table public.ordens enable row level security;

create policy censos_chave on public.censos for all to anon, authenticated using ((select public.chave_ok())) with check ((select public.chave_ok()));
create policy serie_chave on public.serie for all to anon, authenticated using ((select public.chave_ok())) with check ((select public.chave_ok()));
create policy ordens_chave on public.ordens for all to anon, authenticated using ((select public.chave_ok())) with check ((select public.chave_ok()));

-- Trocar a chave (gere uma nova e grave só o hash):
--   insert into privado.chave(id, hash) values (1, encode(extensions.digest('NOVA_CHAVE','sha256'),'hex'))
--   on conflict (id) do update set hash = excluded.hash, criada_em = now();
