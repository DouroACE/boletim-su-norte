-- Dados partilhados pela Equipa Local de Saúde Sazonal (ULS Santo António).
-- Só totais agregados (os ficheiros são lidos no browser). Acesso: utilizadores autenticados cujo e-mail está em public.equipa.

create table public.equipa (
  email text primary key check (email = lower(email) and position('@' in email) > 1),
  nome text,
  criado_em timestamptz not null default now()
);
alter table public.equipa enable row level security;
-- Cada pessoa só vê a sua própria linha (para a app saber se tem acesso). A lista gere-se no painel do Supabase.
create policy "ver a propria linha" on public.equipa for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

create function public.e_da_equipa() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.equipa where email = lower(auth.jwt() ->> 'email')) $$;
revoke all on function public.e_da_equipa() from public, anon;
grant execute on function public.e_da_equipa() to authenticated;

-- Um registo por tipo de dado, com o mesmo conteúdo que a app guarda no browser.
create table public.partilhado (
  chave text primary key check (chave in ('su-semanal-v1', 'boletim-semana-v1', 'relatorios-semanais-v1', 'historico-padronizado-v1', 'workspace-estudos-v1')),
  valor jsonb not null check (octet_length(valor::text) < 5000000),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
alter table public.partilhado enable row level security;
create policy "equipa le" on public.partilhado for select to authenticated using (public.e_da_equipa());
create policy "equipa insere" on public.partilhado for insert to authenticated with check (public.e_da_equipa());
create policy "equipa atualiza" on public.partilhado for update to authenticated using (public.e_da_equipa()) with check (public.e_da_equipa());
create policy "equipa apaga" on public.partilhado for delete to authenticated using (public.e_da_equipa());

-- Quem e quando, sempre preenchido pelo servidor (não pelo browser).
create function public.carimbar() returns trigger language plpgsql set search_path = ''
  as $$ begin new.atualizado_em := now(); new.atualizado_por := lower(auth.jwt() ->> 'email'); return new; end $$;
create trigger carimbar before insert or update on public.partilhado for each row execute function public.carimbar();

revoke all on public.partilhado, public.equipa from anon;

-- TRUNCATE passa por cima das regras de acesso: só o servidor o pode fazer.
revoke truncate, references, trigger on public.partilhado, public.equipa from authenticated;
revoke insert, update, delete on public.equipa from authenticated;
