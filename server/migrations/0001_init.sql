create extension if not exists pgcrypto;

create table users (
  id          uuid primary key default gen_random_uuid(),
  google_sub  text not null unique,           -- Google's stable user id: identity key
  email       text not null,                  -- locked: never updated after first login
  avatar_url  text,
  created_at  timestamptz not null default now()
);
create unique index users_email_lower_key on users (lower(email));

create table profiles (
  user_id           uuid primary key references users(id) on delete cascade,
  full_name         text not null,
  terms_accepted_at timestamptz not null,
  policy_version    text not null,
  consent_text      text not null,            -- the exact sentence the user agreed to
  signup_source     text,
  created_at        timestamptz not null default now(),
  -- three names, each at least 2 characters, max 120 chars
  constraint profiles_full_name_three_names
    check (btrim(full_name) ~ '^\S{2,}(\s+\S{2,}){2,}$' and char_length(full_name) <= 120)
);

-- name and consent are locked forever: any UPDATE is rejected at the database level
create function profiles_immutable() returns trigger language plpgsql as $$
begin raise exception 'profiles are immutable'; end $$;
create trigger profiles_no_update before update on profiles
  for each row execute function profiles_immutable();

create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  bytea not null unique,          -- sha256 of the cookie token, never the token itself
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);
