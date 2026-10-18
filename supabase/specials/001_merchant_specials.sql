-- ============================================================
-- Merchant Specials V1 (see merchant-specials.md)
-- A merchant posts a special or update. Push goes once to their
-- stamped customers (minus muted); the post is listed under
-- "Today" in the app for everyone while it runs.
--
-- Apply via Supabase SQL editor or the MCP apply_migration tool.
-- Additive only: one new table, two new columns, policies,
-- functions, one cron job. Nothing existing is altered.
-- ============================================================

create table if not exists public.merchant_specials (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references public.merchants(id) on delete cascade,
  kind             text not null default 'special' check (kind in ('special','update')),
  text             text not null check (char_length(text) between 1 and 80),
  image_url        text,
  earns_stamp      boolean not null default false,
  starts_on        date not null,
  ends_on          date not null,
  ends_at_time     time,                       -- optional; applies on ends_on
  tag              text not null default 'SPECIAL'
                   check (tag in ('SPECIAL','TODAY','UNTIL','ENDS','COUNTDOWN')),
  sent_at          timestamptz not null default now(),
  ended_at         timestamptz,                -- ended early ("sold out")
  recipients       int not null default 0,
  stamped_window   int,                        -- filled nightly
  usual_day        numeric(6,1),               -- filled nightly
  new_customers    int,                        -- filled nightly
  results_filled_at timestamptz,
  posted_by        uuid references auth.users(id),
  posted_by_admin  boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint merchant_specials_window check (ends_on >= starts_on and ends_on <= starts_on + 6)
);
comment on table public.merchant_specials is
  'One row per special/update a merchant posts. Push goes once on day one; the post is listed under Today in the app while it runs.';

create index if not exists merchant_specials_merchant_sent_idx on public.merchant_specials (merchant_id, sent_at desc);
create index if not exists merchant_specials_window_idx on public.merchant_specials (starts_on, ends_on) where ended_at is null;

alter table public.memberships add column if not exists specials_muted boolean not null default false;
alter table public.merchants   add column if not exists specials_monthly_cap int not null default 8;

-- ---------- helpers ----------
create or replace function public.nassau_now()
returns timestamp language sql stable as $$
  select (now() at time zone 'America/Nassau');
$$;

create or replace function public.special_is_running(s public.merchant_specials)
returns boolean language sql stable as $$
  select s.ended_at is null
     and (public.nassau_now())::date between s.starts_on and s.ends_on
     and (s.ends_at_time is null
          or (public.nassau_now())::date < s.ends_on
          or (public.nassau_now())::time < s.ends_at_time);
$$;

-- owner of the merchant, or an app admin
create or replace function public.specials_can_manage(p_merchant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from merchants m where m.id = p_merchant_id and m.owner_id = auth.uid())
      or exists (select 1 from app_admins a where a.user_id = auth.uid());
$$;

-- ---------- RLS ----------
alter table public.merchant_specials enable row level security;

drop policy if exists "specials public read running" on public.merchant_specials;
create policy "specials public read running" on public.merchant_specials
  for select using (
    public.special_is_running(merchant_specials)
    and exists (select 1 from merchants m where m.id = merchant_id and m.is_active)
  );

drop policy if exists "specials owner or admin read all" on public.merchant_specials;
create policy "specials owner or admin read all" on public.merchant_specials
  for select to authenticated using (public.specials_can_manage(merchant_id));
-- no insert/update/delete policies: RPCs only

-- storage: admins may upload/replace under any merchant folder (owners already can for their own)
drop policy if exists "Admins upload any merchant asset" on storage.objects;
create policy "Admins upload any merchant asset" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'merchant-assets'
    and (storage.foldername(name))[1] = 'merchants'
    and exists (select 1 from public.app_admins a where a.user_id = auth.uid()));
drop policy if exists "Admins update any merchant asset" on storage.objects;
create policy "Admins update any merchant asset" on storage.objects
  for update to authenticated
  using (bucket_id = 'merchant-assets'
    and (storage.foldername(name))[1] = 'merchants'
    and exists (select 1 from public.app_admins a where a.user_id = auth.uid()))
  with check (bucket_id = 'merchant-assets'
    and (storage.foldername(name))[1] = 'merchants'
    and exists (select 1 from public.app_admins a where a.user_id = auth.uid()));

-- ---------- validation shared by preview and send ----------
create or replace function public.specials_check(
  p_merchant_id uuid, p_text text, p_days int, p_ends_at_time time
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_m record;
  v_local timestamp := public.nassau_now();
  v_today date := (public.nassau_now())::date;
  v_sent_today int;
  v_sent_month int;
  v_recipients int;
  v_text text := btrim(coalesce(p_text, ''));
  v_caps int;
begin
  if not public.specials_can_manage(p_merchant_id) then
    return jsonb_build_object('ok', false, 'reason', 'unauthorized');
  end if;
  select business_name, is_active, subscription_status, specials_monthly_cap
    into v_m from merchants where id = p_merchant_id;
  if v_m is null then return jsonb_build_object('ok', false, 'reason', 'merchant_not_found'); end if;
  if not coalesce(v_m.is_active, false) or coalesce(v_m.subscription_status::text, 'active') <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'merchant_not_active');
  end if;

  if char_length(v_text) = 0 then return jsonb_build_object('ok', false, 'reason', 'empty'); end if;
  if char_length(v_text) > 80 then return jsonb_build_object('ok', false, 'reason', 'too_long'); end if;
  if v_text ~* '(https?://|www\.|\.com\b|\.bs\b|\.net\b)' then
    return jsonb_build_object('ok', false, 'reason', 'no_links');
  end if;
  if v_text ~ '\d{3}[-. ]?\d{4}' then
    return jsonb_build_object('ok', false, 'reason', 'no_phone_numbers');
  end if;
  -- three or more consecutive ALL-CAPS words of 3+ letters
  select count(*) into v_caps from regexp_matches(v_text, '\m[A-Z]{3,}\M(\s+[A-Z]{3,}\M){2,}', 'g');
  if v_caps > 0 then return jsonb_build_object('ok', false, 'reason', 'no_all_caps'); end if;
  if v_text ~ '!!' then return jsonb_build_object('ok', false, 'reason', 'too_many_exclamations'); end if;

  if coalesce(p_days, 1) < 1 or coalesce(p_days, 1) > 7 then
    return jsonb_build_object('ok', false, 'reason', 'bad_run_length');
  end if;
  if p_ends_at_time is not null and coalesce(p_days, 1) = 1 and p_ends_at_time <= v_local::time then
    return jsonb_build_object('ok', false, 'reason', 'end_time_passed');
  end if;

  if v_local::time < time '09:00' or v_local::time >= time '20:00' then
    return jsonb_build_object('ok', false, 'reason', 'quiet_hours',
      'next_allowed_at', (case when v_local::time >= time '20:00' then v_today + 1 else v_today end) + time '09:00');
  end if;

  select count(*) into v_sent_today from merchant_specials
   where merchant_id = p_merchant_id and (sent_at at time zone 'America/Nassau')::date = v_today;
  if v_sent_today >= 1 then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap',
      'next_allowed_at', (v_today + 1) + time '09:00');
  end if;

  select count(*) into v_sent_month from merchant_specials
   where merchant_id = p_merchant_id
     and date_trunc('month', sent_at at time zone 'America/Nassau') = date_trunc('month', v_local);
  if v_sent_month >= coalesce(v_m.specials_monthly_cap, 8) then
    return jsonb_build_object('ok', false, 'reason', 'monthly_cap',
      'month_used', v_sent_month, 'month_cap', v_m.specials_monthly_cap);
  end if;

  select count(*) into v_recipients from memberships ms
   where ms.merchant_id = p_merchant_id and not ms.specials_muted;

  return jsonb_build_object(
    'ok', true,
    'merchant', v_m.business_name,
    'title', v_m.business_name,
    'body', v_text || case when right(v_text, 1) in ('.', '!', '?') then '' else '.' end || ' Stop by.',
    'recipients', v_recipients,
    'month_used', v_sent_month,
    'month_cap', v_m.specials_monthly_cap
  );
end;
$$;

create or replace function public.preview_special(
  p_merchant_id uuid, p_text text, p_days int default 1, p_ends_at_time time default null
) returns jsonb language sql stable security definer set search_path = public as $$
  select public.specials_check(p_merchant_id, p_text, p_days, p_ends_at_time);
$$;

-- ---------- send ----------
create or replace function public.send_special(
  p_merchant_id uuid,
  p_text text,
  p_kind text default 'special',
  p_image_url text default null,
  p_earns_stamp boolean default false,
  p_days int default 1,
  p_ends_at_time time default null,
  p_tag text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_check jsonb;
  v_id uuid;
  v_today date := (public.nassau_now())::date;
  v_tag text;
  v_title text;
  v_body text;
  v_secret text;
  v_user_ids uuid[];
  v_is_admin boolean;
  v_is_owner boolean;
begin
  v_check := public.specials_check(p_merchant_id, p_text, p_days, p_ends_at_time);
  if not (v_check->>'ok')::boolean then return v_check; end if;

  v_tag := coalesce(p_tag, case when p_kind = 'update' then 'TODAY' else 'SPECIAL' end);
  if v_tag = 'UNTIL' and p_ends_at_time is null then v_tag := case when p_kind = 'update' then 'TODAY' else 'SPECIAL' end; end if;
  if v_tag in ('ENDS','COUNTDOWN') and coalesce(p_days,1) < 2 then v_tag := case when p_kind = 'update' then 'TODAY' else 'SPECIAL' end; end if;

  v_title := v_check->>'title';
  v_body  := v_check->>'body';
  v_is_owner := exists (select 1 from merchants m where m.id = p_merchant_id and m.owner_id = auth.uid());
  v_is_admin := exists (select 1 from app_admins a where a.user_id = auth.uid());

  insert into merchant_specials (merchant_id, kind, text, image_url, earns_stamp, starts_on, ends_on,
                                 ends_at_time, tag, posted_by, posted_by_admin)
  values (p_merchant_id, coalesce(p_kind, 'special'), btrim(p_text), nullif(p_image_url, ''),
          coalesce(p_earns_stamp, false), v_today, v_today + (coalesce(p_days,1) - 1),
          p_ends_at_time, v_tag, auth.uid(), (v_is_admin and not v_is_owner))
  returning id into v_id;

  -- recipients: everyone stamped at this shop who hasn't muted it
  select array_agg(ms.user_id) into v_user_ids
    from memberships ms where ms.merchant_id = p_merchant_id and not ms.specials_muted;

  insert into notifications (user_id, merchant_id, type, channel, title, body, sent_at)
  select u, p_merchant_id, 'merchant_promo', 'push', v_title, v_body, now()
    from unnest(coalesce(v_user_ids, '{}'::uuid[])) as u;

  update merchant_specials set recipients = coalesce(array_length(v_user_ids, 1), 0) where id = v_id;

  select value into v_secret from app_internal_config where key = 'notify_secret';
  if v_secret is not null and coalesce(array_length(v_user_ids, 1), 0) > 0 then
    perform net.http_post(
      url := 'https://ydffxgnuljyvtbpexkkv.supabase.co/functions/v1/send-consumer-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
      body := jsonb_build_object(
        'user_ids', to_jsonb(v_user_ids),
        'title', v_title,
        'body', v_body,
        'data', jsonb_build_object('kind', 'special', 'special_id', v_id, 'merchant_id', p_merchant_id)
      )
    );
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'recipients', coalesce(array_length(v_user_ids, 1), 0),
                            'title', v_title, 'body', v_body, 'tag', v_tag);
end;
$$;

create or replace function public.end_special(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_merchant uuid;
begin
  select merchant_id into v_merchant from merchant_specials where id = p_id;
  if v_merchant is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not public.specials_can_manage(v_merchant) then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  update merchant_specials set ended_at = now() where id = p_id and ended_at is null;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------- reads ----------
-- Merchant/admin history with results
create or replace function public.list_merchant_specials(p_merchant_id uuid)
returns table (
  id uuid, kind text, text text, image_url text, earns_stamp boolean,
  starts_on date, ends_on date, ends_at_time time, tag text,
  sent_at timestamptz, ended_at timestamptz, running boolean,
  recipients int, stamped_window int, usual_day numeric, new_customers int,
  posted_by_admin boolean
) language sql stable security definer set search_path = public as $$
  select s.id, s.kind, s.text, s.image_url, s.earns_stamp,
         s.starts_on, s.ends_on, s.ends_at_time, s.tag,
         s.sent_at, s.ended_at, public.special_is_running(s) as running,
         s.recipients, s.stamped_window, s.usual_day, s.new_customers, s.posted_by_admin
  from merchant_specials s
  where s.merchant_id = p_merchant_id and public.specials_can_manage(p_merchant_id)
  order by s.sent_at desc
  limit 60;
$$;

-- Everything running today, for the app. Caller's own shops first when signed in.
create or replace function public.specials_today()
returns table (
  id uuid, merchant_id uuid, business_name text, logo_url text, card_color text,
  kind text, text text, image_url text, earns_stamp boolean,
  starts_on date, ends_on date, ends_at_time time, tag text, sent_at timestamptz,
  is_mine boolean
) language sql stable security definer set search_path = public as $$
  select s.id, s.merchant_id, m.business_name, m.logo_url,
         coalesce(lc.card_color, '#00605A') as card_color,
         s.kind, s.text, s.image_url, s.earns_stamp,
         s.starts_on, s.ends_on, s.ends_at_time, s.tag, s.sent_at,
         exists (select 1 from memberships ms where ms.merchant_id = s.merchant_id and ms.user_id = auth.uid()) as is_mine
  from merchant_specials s
  join merchants m on m.id = s.merchant_id and m.is_active
  left join loyalty_cards lc on lc.merchant_id = m.id and lc.is_active
  where public.special_is_running(s)
  order by is_mine desc, s.sent_at desc;
$$;

create or replace function public.set_specials_muted(p_merchant_id uuid, p_muted boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  update memberships set specials_muted = coalesce(p_muted, false)
   where merchant_id = p_merchant_id and user_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_membership'); end if;
  return jsonb_build_object('ok', true, 'muted', coalesce(p_muted, false));
end;
$$;

-- ---------- nightly results ----------
-- Honest numbers: distinct customers stamped in the first day's window,
-- how many were first-timers, and a usual-day baseline (same weekday, prior 4 weeks).
create or replace function public.fill_special_results()
returns int language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_win_start timestamptz;
  v_win_end timestamptz;
  v_stamped int;
  v_new int;
  v_usual numeric;
  v_count int := 0;
begin
  for r in
    select * from merchant_specials s
    where s.results_filled_at is null
      and s.starts_on < (public.nassau_now())::date
  loop
    v_win_start := r.sent_at;
    v_win_end := least(
      ((r.starts_on + 1)::timestamp at time zone 'America/Nassau'),
      coalesce(r.ended_at, 'infinity'::timestamptz),
      case when r.ends_at_time is not null and r.ends_on = r.starts_on
           then ((r.starts_on + r.ends_at_time) at time zone 'America/Nassau') else 'infinity'::timestamptz end
    );

    select count(distinct se.user_id) into v_stamped
      from stamp_events se
     where se.merchant_id = r.merchant_id and se.created_at >= v_win_start and se.created_at < v_win_end;

    select count(*) into v_new from (
      select se.user_id
        from stamp_events se
       where se.merchant_id = r.merchant_id and se.created_at >= v_win_start and se.created_at < v_win_end
       group by se.user_id
      having not exists (select 1 from stamp_events p where p.merchant_id = r.merchant_id
                           and p.user_id = se.user_id and p.created_at < v_win_start)
    ) x;

    select avg(c) into v_usual from (
      select count(distinct se.user_id) as c
        from generate_series(1, 4) g
        left join stamp_events se
          on se.merchant_id = r.merchant_id
         and (se.created_at at time zone 'America/Nassau')::date = r.starts_on - (7 * g)
       group by g
    ) d;

    update merchant_specials
       set stamped_window = v_stamped, new_customers = v_new,
           usual_day = round(coalesce(v_usual, 0), 1), results_filled_at = now()
     where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 03:15 UTC = 23:15 Nassau (EDT) / 22:15 (EST): after the day closes locally
select cron.unschedule('specials-results-nightly') where exists (select 1 from cron.job where jobname = 'specials-results-nightly');
select cron.schedule('specials-results-nightly', '15 3 * * *', $$select public.fill_special_results();$$);

-- ---------- grants ----------
revoke all on function public.specials_check(uuid, text, int, time) from public, anon;
grant execute on function public.preview_special(uuid, text, int, time) to authenticated;
grant execute on function public.send_special(uuid, text, text, text, boolean, int, time, text) to authenticated;
grant execute on function public.end_special(uuid) to authenticated;
grant execute on function public.list_merchant_specials(uuid) to authenticated;
grant execute on function public.specials_today() to anon, authenticated;
grant execute on function public.set_specials_muted(uuid, boolean) to authenticated;
grant execute on function public.special_is_running(public.merchant_specials) to anon, authenticated;
grant execute on function public.nassau_now() to anon, authenticated;
revoke all on function public.fill_special_results() from public, anon, authenticated;
