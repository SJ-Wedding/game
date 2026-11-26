-- 균열 아레나 아이디 계정 (이메일 없이 아이디·비밀번호)
-- 게스트(익명 로그인) 데이터는 profiles, 아이디 계정 데이터는 accounts 에 둔다.
-- 브라우저마다 익명 로그인 사용자가 있고, 아이디로 로그인하면 account_links 로 그 계정에 연결된다.
-- 테이블은 직접 접근할 수 없고(RLS, 정책 없음) 아래 함수로만 읽고 쓴다.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.accounts (
  username text primary key check (username ~ '^[a-z0-9_]{3,16}$'),
  pass_hash text not null,
  meta jsonb not null default '{}'::jsonb,
  records jsonb not null default '{}'::jsonb,
  rev integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.account_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null references public.accounts(username) on delete cascade
);

alter table public.accounts enable row level security;
alter table public.account_links enable row level security;

-- 지금 브라우저의 저장 데이터 (아이디로 로그인했으면 그 계정, 아니면 게스트)
create or replace function public.pull_save()
returns table(account text, meta jsonb, records jsonb, rev integer)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare v_user text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select l.username into v_user from public.account_links l where l.user_id = auth.uid();
  if v_user is not null then
    return query select a.username, a.meta, a.records, a.rev from public.accounts a where a.username = v_user;
  else
    return query select null::text, p.meta, p.records, p.rev from public.profiles p where p.user_id = auth.uid();
  end if;
end $$;

create or replace function public.push_save(p_meta jsonb, p_records jsonb, p_rev integer)
returns void
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
declare v_user text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select l.username into v_user from public.account_links l where l.user_id = auth.uid();
  if v_user is not null then
    update public.accounts a set meta = p_meta, records = p_records, rev = p_rev, updated_at = now() where a.username = v_user;
  else
    insert into public.profiles as p (user_id, meta, records, rev, updated_at) values (auth.uid(), p_meta, p_records, p_rev, now())
    on conflict (user_id) do update set meta = excluded.meta, records = excluded.records, rev = excluded.rev, updated_at = now();
  end if;
end $$;

-- 회원가입: 지금 진행 상황으로 아이디 계정을 만들고 이 브라우저를 연결한다
create or replace function public.register_account(p_username text, p_password text, p_meta jsonb, p_records jsonb, p_rev integer)
returns void
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_username !~ '^[a-z0-9_]{3,16}$' then raise exception 'invalid_username'; end if;
  if length(p_password) < 6 then raise exception 'weak_password'; end if;
  if exists (select 1 from public.accounts a where a.username = p_username) then raise exception 'username_taken'; end if;
  insert into public.accounts (username, pass_hash, meta, records, rev)
    values (p_username, crypt(p_password, gen_salt('bf')), p_meta, p_records, p_rev);
  insert into public.account_links (user_id, username) values (auth.uid(), p_username)
    on conflict (user_id) do update set username = excluded.username;
  delete from public.profiles p where p.user_id = auth.uid();
end $$;

-- 로그인: 비밀번호를 확인하고 이 브라우저를 계정에 연결한 뒤 계정 데이터를 돌려준다
create or replace function public.login_account(p_username text, p_password text)
returns table(account text, meta jsonb, records jsonb, rev integer)
language plpgsql security definer set search_path = public, extensions as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from public.accounts a where a.username = lower(p_username) and a.pass_hash = crypt(p_password, a.pass_hash)) then
    raise exception 'invalid_credentials';
  end if;
  insert into public.account_links (user_id, username) values (auth.uid(), lower(p_username))
    on conflict (user_id) do update set username = excluded.username;
  return query select a.username, a.meta, a.records, a.rev from public.accounts a where a.username = lower(p_username);
end $$;

-- 로그아웃: 이 브라우저와 계정의 연결만 끊는다 (계정 데이터는 그대로)
create or replace function public.logout_account()
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  delete from public.account_links l where l.user_id = auth.uid();
end $$;

revoke all on function public.pull_save() from public, anon;
revoke all on function public.push_save(jsonb, jsonb, integer) from public, anon;
revoke all on function public.register_account(text, text, jsonb, jsonb, integer) from public, anon;
revoke all on function public.login_account(text, text) from public, anon;
revoke all on function public.logout_account() from public, anon;
grant execute on function public.pull_save() to authenticated;
grant execute on function public.push_save(jsonb, jsonb, integer) to authenticated;
grant execute on function public.register_account(text, text, jsonb, jsonb, integer) to authenticated;
grant execute on function public.login_account(text, text) to authenticated;
grant execute on function public.logout_account() to authenticated;
