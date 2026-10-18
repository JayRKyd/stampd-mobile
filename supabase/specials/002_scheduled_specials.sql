-- ============================================================
-- Merchant Specials: scheduling ("send later", a week planned ahead)
-- Builds on 001. Additive: two columns, one cron job, function updates.
-- ============================================================

alter table public.merchant_specials
  add column if not exists status text not null default 'sent'
    check (status in ('scheduled','sent','cancelled'));
-- For a scheduled post, sent_at holds the planned send time until it goes out,
-- then becomes the real send time. starts_on is the planned day.

create index if not exists merchant_specials_due_idx
  on public.merchant_specials (sent_at) where status = 'scheduled';

-- Running = sent, not ended, inside its window
create or replace function public.special_is_running(s public.merchant_specials)
returns boolean language sql stable as $$
  select s.status = 'sent'
     and s.ended_at is null
     and (public.nassau_now())::date between s.starts_on and s.ends_on
     and (s.ends_at_time is null
          or (public.nassau_now())::date < s.ends_on
          or (public.nassau_now())::time < s.ends_at_time);
$$;

-- ---------- validation: now takes the target send time ----------
drop function if exists public.specials_check(uuid, text, int, time);
create or replace function public.specials_check(
  p_merchant_id uuid, p_text text, p_days int, p_ends_at_time time, p_send_at timestamptz default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_m record;
  v_now_local timestamp := public.nassau_now();
  v_target timestamp := coalesce(p_send_at at time zone 'America/Nassau', public.nassau_now());
  v_target_day date;
  v_sent_day int;
  v_sent_month int;
  v_recipients int;
  v_text text := btrim(coalesce(p_text, ''));
  v_caps int;
  v_scheduled boolean := p_send_at is not null and p_send_at > now() + interval '1 minute';
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
  select count(*) into v_caps from regexp_matches(v_text, '\m[A-Z]{3,}\M(\s+[A-Z]{3,}\M){2,}', 'g');
  if v_caps > 0 then return jsonb_build_object('ok', false, 'reason', 'no_all_caps'); end if;
  if v_text ~ '!!' then return jsonb_build_object('ok', false, 'reason', 'too_many_exclamations'); end if;

  if coalesce(p_days, 1) < 1 or coalesce(p_days, 1) > 7 then
    return jsonb_build_object('ok', false, 'reason', 'bad_run_length');
  end if;

  -- when: now, or a future time up to 14 days out
  if p_send_at is not null and not v_scheduled then
    v_target := v_now_local;   -- "later" but effectively now
  end if;
  if v_scheduled and p_send_at > now() + interval '14 days' then
    return jsonb_build_object('ok', false, 'reason', 'too_far_ahead');
  end if;
  v_target_day := v_target::date;

  if p_ends_at_time is not null and coalesce(p_days, 1) = 1 and p_ends_at_time <= v_target::time then
    return jsonb_build_object('ok', false, 'reason', 'end_time_passed');
  end if;

  if v_target::time < time '09:00' or v_target::time >= time '20:00' then
    return jsonb_build_object('ok', false, 'reason', 'quiet_hours',
      'next_allowed_at', (case when v_target::time >= time '20:00' then v_target_day + 1 else v_target_day end) + time '09:00');
  end if;

  -- one send per shop per day, counting what's already planned for that day
  select count(*) into v_sent_day from merchant_specials
   where merchant_id = p_merchant_id and status in ('scheduled','sent')
     and (sent_at at time zone 'America/Nassau')::date = v_target_day;
  if v_sent_day >= 1 then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap',
      'next_allowed_at', (v_target_day + 1) + time '09:00');
  end if;

  select count(*) into v_sent_month from merchant_specials
   where merchant_id = p_merchant_id and status in ('scheduled','sent')
     and date_trunc('month', sent_at at time zone 'America/Nassau') = date_trunc('month', v_target);
  if v_sent_month >= coalesce(v_m.specials_monthly_cap, 8) then
    return jsonb_build_object('ok', false, 'reason', 'monthly_cap',
      'month_used', v_sent_month, 'month_cap', v_m.specials_monthly_cap);
  end if;

  select count(*) into v_recipients from memberships ms
   where ms.merchant_id = p_merchant_id and not ms.specials_muted;

  return jsonb_build_object(
    'ok', true,
    'scheduled', v_scheduled,
    'send_at_local', v_target,
    'merchant', v_m.business_name,
    'title', v_m.business_name,
    'body', v_text || case when right(v_text, 1) in ('.', '!', '?') then '' else '.' end || ' Stop by.',
    'recipients', v_recipients,
    'month_used', v_sent_month,
    'month_cap', v_m.specials_monthly_cap
  );
end;
$$;

drop function if exists public.preview_special(uuid, text, int, time);
create or replace function public.preview_special(
  p_merchant_id uuid, p_text text, p_days int default 1, p_ends_at_time time default null, p_send_at timestamptz default null
) returns jsonb language sql stable security definer set search_path = public as $$
  select public.specials_check(p_merchant_id, p_text, p_days, p_ends_at_time, p_send_at);
$$;

-- ---------- dispatch: the actual send, shared by "now" and the cron ----------
create or replace function public.dispatch_special(p_id uuid)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  r record;
  v_title text;
  v_body text;
  v_secret text;
  v_user_ids uuid[];
  v_n int;
begin
  select s.*, m.business_name into r
    from merchant_specials s join merchants m on m.id = s.merchant_id
   where s.id = p_id;
  if r is null then return 0; end if;

  v_title := r.business_name;
  v_body  := r.text || case when right(r.text, 1) in ('.', '!', '?') then '' else '.' end || ' Stop by.';

  select array_agg(ms.user_id) into v_user_ids
    from memberships ms where ms.merchant_id = r.merchant_id and not ms.specials_muted;
  v_n := coalesce(array_length(v_user_ids, 1), 0);

  insert into notifications (user_id, merchant_id, type, channel, title, body, sent_at)
  select u, r.merchant_id, 'merchant_promo', 'push', v_title, v_body, now()
    from unnest(coalesce(v_user_ids, '{}'::uuid[])) as u;

  update merchant_specials set recipients = v_n, status = 'sent', sent_at = now() where id = p_id;

  select value into v_secret from app_internal_config where key = 'notify_secret';
  if v_secret is not null and v_n > 0 then
    perform net.http_post(
      url := 'https://ydffxgnuljyvtbpexkkv.supabase.co/functions/v1/send-consumer-push',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
      body := jsonb_build_object(
        'user_ids', to_jsonb(v_user_ids),
        'title', v_title,
        'body', v_body,
        'data', jsonb_build_object('kind', 'special', 'special_id', p_id, 'merchant_id', r.merchant_id)
      )
    );
  end if;
  return v_n;
end;
$$;

-- ---------- send: now, or later ----------
drop function if exists public.send_special(uuid, text, text, text, boolean, int, time, text);
create or replace function public.send_special(
  p_merchant_id uuid,
  p_text text,
  p_kind text default 'special',
  p_image_url text default null,
  p_earns_stamp boolean default false,
  p_days int default 1,
  p_ends_at_time time default null,
  p_tag text default null,
  p_send_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_check jsonb;
  v_id uuid;
  v_scheduled boolean;
  v_start date;
  v_tag text;
  v_is_admin boolean;
  v_is_owner boolean;
  v_n int;
begin
  v_check := public.specials_check(p_merchant_id, p_text, p_days, p_ends_at_time, p_send_at);
  if not (v_check->>'ok')::boolean then return v_check; end if;
  v_scheduled := (v_check->>'scheduled')::boolean;
  v_start := (v_check->>'send_at_local')::timestamp::date;

  v_tag := coalesce(p_tag, case when p_kind = 'update' then 'TODAY' else 'SPECIAL' end);
  if v_tag = 'UNTIL' and p_ends_at_time is null then v_tag := case when p_kind = 'update' then 'TODAY' else 'SPECIAL' end; end if;
  if v_tag in ('ENDS','COUNTDOWN') and coalesce(p_days,1) < 2 then v_tag := case when p_kind = 'update' then 'TODAY' else 'SPECIAL' end; end if;

  v_is_owner := exists (select 1 from merchants m where m.id = p_merchant_id and m.owner_id = auth.uid());
  v_is_admin := exists (select 1 from app_admins a where a.user_id = auth.uid());

  insert into merchant_specials (merchant_id, kind, text, image_url, earns_stamp, starts_on, ends_on,
                                 ends_at_time, tag, posted_by, posted_by_admin, status, sent_at)
  values (p_merchant_id, coalesce(p_kind, 'special'), btrim(p_text), nullif(p_image_url, ''),
          coalesce(p_earns_stamp, false), v_start, v_start + (coalesce(p_days,1) - 1),
          p_ends_at_time, v_tag, auth.uid(), (v_is_admin and not v_is_owner),
          case when v_scheduled then 'scheduled' else 'sent' end,
          case when v_scheduled then p_send_at else now() end)
  returning id into v_id;

  if v_scheduled then
    return jsonb_build_object('ok', true, 'id', v_id, 'scheduled', true, 'send_at', p_send_at,
                              'title', v_check->>'title', 'body', v_check->>'body', 'tag', v_tag,
                              'recipients', (v_check->>'recipients')::int);
  end if;

  v_n := public.dispatch_special(v_id);
  return jsonb_build_object('ok', true, 'id', v_id, 'scheduled', false, 'recipients', v_n,
                            'title', v_check->>'title', 'body', v_check->>'body', 'tag', v_tag);
end;
$$;

-- Cancel a scheduled post (owner or admin). Sent posts use end_special.
create or replace function public.cancel_special(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_merchant uuid; v_status text;
begin
  select merchant_id, status into v_merchant, v_status from merchant_specials where id = p_id;
  if v_merchant is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if not public.specials_can_manage(v_merchant) then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if v_status <> 'scheduled' then return jsonb_build_object('ok', false, 'reason', 'not_scheduled'); end if;
  update merchant_specials set status = 'cancelled' where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Every five minutes: send what's due. A merchant deactivated since
-- scheduling gets the post cancelled, not sent.
create or replace function public.send_scheduled_specials()
returns int language plpgsql security definer set search_path = public as $$
declare r record; v_count int := 0;
begin
  for r in
    select s.id, m.is_active
      from merchant_specials s join merchants m on m.id = s.merchant_id
     where s.status = 'scheduled' and s.sent_at <= now()
     order by s.sent_at
  loop
    if not coalesce(r.is_active, false) then
      update merchant_specials set status = 'cancelled' where id = r.id;
    else
      -- the planned day may differ from the actual day on a late run; keep the window honest
      update merchant_specials
         set ends_on = (public.nassau_now())::date + (ends_on - starts_on),
             starts_on = (public.nassau_now())::date
       where id = r.id;
      perform public.dispatch_special(r.id);
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

select cron.unschedule('specials-dispatch-5min') where exists (select 1 from cron.job where jobname = 'specials-dispatch-5min');
select cron.schedule('specials-dispatch-5min', '*/5 * * * *', $$select public.send_scheduled_specials();$$);

-- ---------- history now carries status ----------
drop function if exists public.list_merchant_specials(uuid);
create or replace function public.list_merchant_specials(p_merchant_id uuid)
returns table (
  id uuid, kind text, text text, image_url text, earns_stamp boolean,
  starts_on date, ends_on date, ends_at_time time, tag text,
  status text, sent_at timestamptz, ended_at timestamptz, running boolean,
  recipients int, stamped_window int, usual_day numeric, new_customers int,
  posted_by_admin boolean
) language sql stable security definer set search_path = public as $$
  select s.id, s.kind, s.text, s.image_url, s.earns_stamp,
         s.starts_on, s.ends_on, s.ends_at_time, s.tag,
         s.status, s.sent_at, s.ended_at, public.special_is_running(s) as running,
         s.recipients, s.stamped_window, s.usual_day, s.new_customers, s.posted_by_admin
  from merchant_specials s
  where s.merchant_id = p_merchant_id and public.specials_can_manage(p_merchant_id)
    and s.status <> 'cancelled'
  order by s.sent_at desc
  limit 90;
$$;

-- nightly results: only sent posts
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
    where s.status = 'sent' and s.results_filled_at is null
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
      select se.user_id from stamp_events se
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

-- ---------- grants ----------
revoke all on function public.specials_check(uuid, text, int, time, timestamptz) from public, anon;
grant execute on function public.preview_special(uuid, text, int, time, timestamptz) to authenticated;
grant execute on function public.send_special(uuid, text, text, text, boolean, int, time, text, timestamptz) to authenticated;
grant execute on function public.cancel_special(uuid) to authenticated;
grant execute on function public.list_merchant_specials(uuid) to authenticated;
revoke all on function public.dispatch_special(uuid) from public, anon, authenticated;
revoke all on function public.send_scheduled_specials() from public, anon, authenticated;
