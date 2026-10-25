-- 004: islands. Every shop belongs to one island; every customer picks one.
-- Discover, Home's Today view and launch pushes are scoped to it. Cards,
-- rewards and history are never filtered. Everything existing becomes
-- Grand Bahama, so nothing changes for anyone until a Nassau shop is added.

-- ── Columns ──────────────────────────────────────────────────────────────
alter table public.merchants
  add column if not exists island text not null default 'grand-bahama';
alter table public.merchants
  drop constraint if exists merchants_island_check;
alter table public.merchants
  add constraint merchants_island_check check (island in ('grand-bahama', 'nassau'));
create index if not exists merchants_island_idx on public.merchants (island);

alter table public.users
  add column if not exists island text not null default 'grand-bahama';
alter table public.users
  drop constraint if exists users_island_check;
alter table public.users
  add constraint users_island_check check (island in ('grand-bahama', 'nassau'));

-- ── The caller's island: their setting, or Grand Bahama when signed out ──
create or replace function public.my_island()
returns text
language sql stable security definer
set search_path to 'public'
as $$
  select coalesce((select u.island from users u where u.id = auth.uid()), 'grand-bahama');
$$;
grant execute on function public.my_island() to anon, authenticated;

-- ── Today board: only this island's posts ────────────────────────────────
drop function if exists public.specials_today();
create or replace function public.specials_today(p_island text default null)
returns table(
  id uuid, merchant_id uuid, business_name text, logo_url text, card_color text,
  kind text, text text, image_url text, earns_stamp boolean,
  starts_on date, ends_on date, ends_at_time time without time zone,
  tag text, sent_at timestamp with time zone, is_mine boolean
)
language sql stable security definer
set search_path to 'public'
as $$
  select s.id, s.merchant_id, m.business_name, m.logo_url,
         coalesce(lc.card_color, '#00605A') as card_color,
         s.kind, s.text, s.image_url, s.earns_stamp,
         s.starts_on, s.ends_on, s.ends_at_time, s.tag, s.sent_at,
         exists (select 1 from memberships ms where ms.merchant_id = s.merchant_id and ms.user_id = auth.uid()) as is_mine
  from merchant_specials s
  join merchants m on m.id = s.merchant_id and m.is_active
                   and m.island = coalesce(p_island, public.my_island())
  left join loyalty_cards lc on lc.merchant_id = m.id and lc.is_active
  where public.special_is_running(s)
  order by is_mine desc, s.sent_at desc;
$$;
grant execute on function public.specials_today(text) to anon, authenticated;

-- ── Launch push: only customers on the shop's island ─────────────────────
create or replace function public.announce_merchant_launch(p_merchant_id uuid, p_dry_run boolean default false)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_name text;
  v_active boolean;
  v_island text;
  v_reward text;
  v_title text;
  v_body text;
  v_secret text;
  v_recipients int;
  v_recent int;
  v_user_ids jsonb;
begin
  select business_name, is_active, island into v_name, v_active, v_island
  from merchants where id = p_merchant_id;
  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'merchant_not_found');
  end if;
  if not v_active then
    return jsonb_build_object('ok', false, 'reason', 'merchant_not_active');
  end if;

  -- refuse to announce the same merchant twice within 30 days
  select count(*) into v_recent from notifications
  where merchant_id = p_merchant_id and type = 'merchant_promo'
    and sent_at > now() - interval '30 days';
  if v_recent > 0 then
    return jsonb_build_object('ok', false, 'reason', 'already_announced_recently');
  end if;

  select lc.reward_title into v_reward
  from loyalty_cards lc
  where lc.merchant_id = p_merchant_id and lc.is_active = true
  limit 1;

  v_title := format('%s just joined Stampd', v_name);
  if v_reward is not null then
    v_body := format('Stop by, show your PIN, and start earning toward %s.', v_reward);
  else
    v_body := 'Stop by and show your PIN to get your first stamp.';
  end if;

  select count(*), coalesce(jsonb_agg(u.id), '[]'::jsonb)
    into v_recipients, v_user_ids
  from users u where u.island = v_island;

  if p_dry_run then
    return jsonb_build_object(
      'ok', true, 'dry_run', true, 'merchant', v_name, 'island', v_island,
      'title', v_title, 'body', v_body, 'recipients', v_recipients);
  end if;

  insert into notifications (user_id, merchant_id, type, channel, title, body, sent_at)
  select u.id, p_merchant_id, 'merchant_promo', 'push', v_title, v_body, now()
  from users u where u.island = v_island;

  select value into v_secret from app_internal_config where key = 'notify_secret';
  if v_secret is not null and v_recipients > 0 then
    perform net.http_post(
      url := 'https://ydffxgnuljyvtbpexkkv.supabase.co/functions/v1/send-consumer-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', v_secret
      ),
      body := jsonb_build_object(
        'user_ids', v_user_ids,
        'title', v_title,
        'body', v_body,
        'data', jsonb_build_object('kind', 'merchant_promo', 'merchant_id', p_merchant_id)
      )
    );
  end if;

  return jsonb_build_object(
    'ok', true, 'dry_run', false, 'merchant', v_name, 'island', v_island,
    'title', v_title, 'body', v_body, 'recipients', v_recipients);
end;
$function$;

-- ── Admin: island in the list, the setup sheet, and a setter ─────────────
drop function if exists public.admin_list_merchants();
create or replace function public.admin_list_merchants()
returns table(
  id uuid, business_name text, merchant_type text, category text, is_active boolean,
  created_at timestamp with time zone, has_active_card boolean, owner_email text, island text
)
language plpgsql security definer
set search_path to 'public'
as $function$
begin
  if not exists (select 1 from app_admins where user_id = auth.uid()) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    m.id,
    m.business_name,
    m.merchant_type,
    m.category,
    m.is_active,
    m.created_at,
    exists (
      select 1 from loyalty_cards lc
      where lc.merchant_id = m.id and lc.is_active = true
    ) as has_active_card,
    u.email::text as owner_email,
    m.island
  from merchants m
  left join auth.users u on u.id = m.owner_id
  order by m.is_active asc, m.created_at desc;
end;
$function$;
grant execute on function public.admin_list_merchants() to authenticated;

create or replace function public.admin_get_merchant_setup(p_merchant_id uuid)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
declare
  v_merchant record;
  v_card record;
  v_tiers jsonb;
begin
  if not public.admin_is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;

  select id, business_name, merchant_type, category, description, address, phone, website,
         logo_url, cover_image_url, is_active, latitude, longitude, island
  into v_merchant from merchants where id = p_merchant_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;

  select id, stamp_count_required, reward_title, reward_description, card_color, stamp_icon, visit_label
  into v_card from loyalty_cards where merchant_id = p_merchant_id and is_active = true limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'stamp_threshold', stamp_threshold, 'reward_title', reward_title
         ) order by stamp_threshold), '[]'::jsonb)
  into v_tiers from reward_tiers where loyalty_card_id = v_card.id;

  return jsonb_build_object(
    'ok', true,
    'merchant', jsonb_build_object(
      'id', v_merchant.id, 'business_name', v_merchant.business_name,
      'merchant_type', v_merchant.merchant_type, 'category', v_merchant.category,
      'description', v_merchant.description, 'address', v_merchant.address,
      'phone', v_merchant.phone, 'website', v_merchant.website,
      'logo_url', v_merchant.logo_url, 'cover_image_url', v_merchant.cover_image_url,
      'is_active', v_merchant.is_active,
      'latitude', v_merchant.latitude, 'longitude', v_merchant.longitude,
      'island', v_merchant.island
    ),
    'card', case when v_card.id is null then null else jsonb_build_object(
      'stamp_count_required', v_card.stamp_count_required,
      'reward_title', v_card.reward_title,
      'card_color', v_card.card_color,
      'stamp_icon', v_card.stamp_icon,
      'visit_label', v_card.visit_label,
      'tiers', v_tiers
    ) end
  );
end;
$function$;

create or replace function public.admin_set_merchant_island(p_merchant_id uuid, p_island text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $function$
begin
  if not public.admin_is_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_admin');
  end if;
  if p_island not in ('grand-bahama', 'nassau') then
    return jsonb_build_object('ok', false, 'error', 'bad_island');
  end if;

  update public.merchants set island = p_island, updated_at = now()
  where id = p_merchant_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'island', p_island);
end;
$function$;
grant execute on function public.admin_set_merchant_island(uuid, text) to authenticated;
