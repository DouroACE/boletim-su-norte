-- Acesso sem e-mail: cada pessoa entra uma vez com o código da equipa (sessão anónima do Supabase).
-- O código não fica no repositório: guarda-se só o hash. Definir/mudar o código no SQL Editor do Supabase:
--   select public.definir_codigo_equipa('o código que a equipa vai usar');

create extension if not exists pgcrypto with schema extensions;

create table public.codigo_equipa (
  id smallint primary key default 1 check (id = 1),
  hash text not null,
  mudado_em timestamptz not null default now()
);
alter table public.codigo_equipa enable row level security; -- sem regras: ninguém lê pela API

create table public.membros (
  uid uuid primary key,
  entrou_em timestamptz not null default now()
);
alter table public.membros enable row level security;
create policy "ver a propria linha" on public.membros for select to authenticated using (uid = auth.uid());
revoke all on public.codigo_equipa, public.membros from anon;
revoke insert, update, delete, truncate, references, trigger on public.membros from authenticated;
revoke all on public.codigo_equipa from authenticated;

-- Só no SQL Editor (servidor): define ou muda o código; quem já entrou mantém o acesso até se limpar public.membros.
create function public.definir_codigo_equipa(novo text) returns void
  language plpgsql security definer set search_path = ''
  as $$
  begin
    if length(coalesce(novo, '')) < 12 then raise exception 'O código tem de ter pelo menos 12 caracteres.'; end if;
    insert into public.codigo_equipa(id, hash) values (1, extensions.crypt(novo, extensions.gen_salt('bf', 10)))
      on conflict (id) do update set hash = excluded.hash, mudado_em = now();
  end $$;
revoke all on function public.definir_codigo_equipa(text) from public, anon, authenticated;

-- Pelo browser: confirma o código e junta a sessão atual à equipa. Falhas demoram 1 s (trava tentativas em série).
create function public.entrar_equipa(codigo text) returns boolean
  language plpgsql security definer set search_path = ''
  as $$
  declare ok boolean;
  begin
    if auth.uid() is null then return false; end if;
    select extensions.crypt(coalesce(codigo, ''), hash) = hash into ok from public.codigo_equipa where id = 1;
    if coalesce(ok, false) then
      insert into public.membros(uid) values (auth.uid()) on conflict (uid) do nothing;
      return true;
    end if;
    perform pg_sleep(1);
    return false;
  end $$;
revoke all on function public.entrar_equipa(text) from public, anon;
grant execute on function public.entrar_equipa(text) to authenticated;

-- Da equipa: entrou com o código (membros) ou tem o e-mail na lista (equipa).
create or replace function public.e_da_equipa() returns boolean
  language sql stable security definer set search_path = ''
  as $$ select exists (select 1 from public.membros where uid = auth.uid())
            or exists (select 1 from public.equipa where email = lower(auth.jwt() ->> 'email')) $$;

-- Carimbo: e-mail quando existe, senão «codigo:» e o início do id da sessão.
create or replace function public.carimbar() returns trigger language plpgsql set search_path = ''
  as $$ begin
    new.atualizado_em := now();
    new.atualizado_por := coalesce(nullif(lower(auth.jwt() ->> 'email'), ''), 'codigo:' || left(auth.uid()::text, 8));
    return new;
  end $$;
