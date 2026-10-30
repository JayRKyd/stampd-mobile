-- 005: gift cards. Stampd is the ledger, never the wallet. The shop takes the
-- money at the counter and issues a card; the buyer carries a one-time claim
-- code; the recipient claims it into their app; the counter spends from it
-- with a 6-digit code that changes every minute. Every move is an event row.

-- ── Per-merchant switch ───────────────────────────────────────────────────
alter table public.merchants
  add column if not exists gift_cards_enabled boolean not null default false;

-- ── Tables ────────────────────────────────────────────────────────────────
create table if not exists public.gift_cards (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references public.merchants(id),
  for_name         text,
  from_name        text,
  note             text,
  amount_cents     int  not null check (amount_cents > 0),
  balance_cents    int  not null check (balance_cents >= 0),
  status           text not null default 'unclaimed' check (status in ('unclaimed', 'active', 'used', 'void')),
  claim_code       text unique,
  secret           bytea not null default extensions.gen_random_bytes(16),
  buyer_user_id    uuid references public.users(id),
  claimed_by       uuid references public.users(id),
  claimed_at       timestamptz,
  issued_by        uuid,
  issued_staff_id  uuid references public.staff(id),
  expires_at       timestamptz,
  voided_at        timestamptz,
  void_reason      text,
  created_at       timestamptz not null default now()
);
create index if not exists gift_cards_merchant_idx on public.gift_cards (merchant_id, status);
create index if not exists gift_cards_claimed_by_idx on public.gift_cards (claimed_by);
create index if not exists gift_cards_buyer_idx on public.gift_cards (buyer_user_id);

create table if not exists public.gift_card_events (
  id                  uuid primary key default gen_random_uuid(),
  gift_card_id        uuid not null references public.gift_cards(id),
  merchant_id         uuid not null references public.merchants(id),
  type                text not null check (type in ('issue', 'claim', 'redeem', 'void')),
  amount_cents        int,
  balance_after_cents int,
  user_id             uuid references public.users(id),
  actor_id            uuid,
  staff_id            uuid references public.staff(id),
  created_at          timestamptz not null default now()
);
create index if not exists gift_card_events_card_idx on public.gift_card_events (gift_card_id, created_at);
create index if not exists gift_card_events_merchant_idx on public.gift_card_events (merchant_id, created_at desc);

-- ── RLS: reads only; every write goes through an RPC ──────────────────────
alter table public.gift_cards enable row level security;
alter table public.gift_card_events enable row level security;

drop policy if exists "gift cards: holder or buyer reads" on public.gift_cards;
create policy "gift cards: holder or buyer reads" on public.gift_cards
  for select to authenticated
  using (claimed_by = auth.uid() or buyer_user_id = auth.uid());

drop policy if exists "gift cards: merchant reads" on public.gift_cards;
create policy "gift cards: merchant reads" on public.gift_cards
  for select to authenticated
  using (public.specials_can_manage(merchant_id));

drop policy if exists "gift card events: holder reads" on public.gift_card_events;
create policy "gift card events: holder reads" on public.gift_card_events
  for select to authenticated
  using (exists (select 1 from public.gift_cards g where g.id = gift_card_id and g.claimed_by = auth.uid()));

drop policy if exists "gift card events: merchant reads" on public.gift_card_events;
create policy "gift card events: merchant reads" on public.gift_card_events
  for select to authenticated
  using (public.specials_can_manage(merchant_id));

-- ── Helpers ───────────────────────────────────────────────────────────────

-- Claim code: 8 characters, no 0/O/1/I, shown as XXXX-XXXX.
create or replace function public.gift_new_claim_code()
returns text
language plpgsql
set search_path to 'public', 'extensions'
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
  i int;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.gift_cards where claim_code = v_code);
  end loop;
  return v_code;
end;
$$;

-- The 6-digit counter code for a card at a given minute. Deterministic, so
-- the holder's screen and the counter's check agree. Skips any value that is
-- currently someone's PIN, so a gift code is never also a live PIN.
create or replace function public.gift_code_at(p_secret bytea, p_minute bigint)
returns text
language plpgsql stable
set search_path to 'public', 'extensions'
as $$
declare
  v_hex text;
  v_n bigint;
  v_code text;
  v_tries int := 0;
begin
  v_hex := encode(extensions.hmac(convert_to(p_minute::text, 'UTF8'), p_secret, 'sha256'), 'hex');
  v_n := ('x' || substr(v_hex, 1, 8))::bit(32)::bigint % 1000000;
  loop
    v_code := lpad(v_n::text, 6, '0');
    exit when not exists (select 1 from public.users u where u.personal_pin = v_code) or v_tries > 50;
    v_n := (v_n + 7919) % 1000000;
    v_tries := v_tries + 1;
  end loop;
  return v_code;
end;
$$;

create or replace function public.gift_normalize_code(p text)
returns text
language sql immutable
as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.gift_format_code(p text)
returns text
language sql immutable
as $$
  select substr(p, 1, 4) || '-' || substr(p, 5, 4);
$$;

create or replace function public.gift_card_public(g public.gift_cards)
returns jsonb
language sql stable
set search_path to 'public'
as $$
  select jsonb_build_object(
    'id', g.id,
    'merchant_id', g.merchant_id,
    'business_name', m.business_name,
    'logo_url', m.logo_url,
    'card_color', coalesce(lc.card_color, '#00605A'),
    'for_name', g.for_name,
    'from_name', g.from_name,
    'note', g.note,
    'amount_cents', g.amount_cents,
    'balance_cents', g.balance_cents,
    'status', g.status,
    'claim_code', case when g.status = 'unclaimed' then public.gift_format_code(g.claim_code) else null end,
    'claimed_at', g.claimed_at,
    'expires_at', g.expires_at,
    'created_at', g.created_at,
    'is_mine', coalesce(g.claimed_by = auth.uid(), false),
    'is_sent', coalesce(g.buyer_user_id = auth.uid(), false)
  )
  from public.merchants m
  left join public.loyalty_cards lc on lc.merchant_id = m.id and lc.is_active
  where m.id = g.merchant_id;
$$;

-- ── Merchant: issue ───────────────────────────────────────────────────────
create or replace function public.issue_gift_card(
  p_merchant_id uuid,
  p_amount_cents int,
  p_for_name text default null,
  p_from_name text default null,
  p_note text default null,
  p_buyer_pin text default null,
  p_staff_id uuid default null,
  p_expires_months int default 12
)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_merchant record;
  v_buyer_id uuid;
  v_buyer_first text;
  v_card public.gift_cards;
  v_code text;
begin
  if not public.specials_can_manage(p_merchant_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select is_active, gift_cards_enabled, business_name into v_merchant
  from public.merchants where id = p_merchant_id;
  if not found or not coalesce(v_merchant.is_active, false) then
    return jsonb_build_object('ok', false, 'error', 'merchant_not_active');
  end if;
  if not v_merchant.gift_cards_enabled then
    return jsonb_build_object('ok', false, 'error', 'gift_cards_off');
  end if;

  if p_amount_cents is null or p_amount_cents < 500 or p_amount_cents > 50000 then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;

  if p_staff_id is not null and not exists (
    select 1 from public.staff where id = p_staff_id and merchant_id = p_merchant_id and is_active
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_staff');
  end if;

  if nullif(trim(p_buyer_pin), '') is not null then
    select id, first_name into v_buyer_id, v_buyer_first from public.users where personal_pin = trim(p_buyer_pin) limit 1;
    if not found then
      return jsonb_build_object('ok', false, 'error', 'buyer_pin_not_found');
    end if;
  end if;

  v_code := public.gift_new_claim_code();

  insert into public.gift_cards (
    merchant_id, for_name, from_name, note, amount_cents, balance_cents, status,
    claim_code, buyer_user_id, issued_by, issued_staff_id, expires_at
  ) values (
    p_merchant_id, nullif(trim(p_for_name), ''), nullif(trim(p_from_name), ''), nullif(trim(p_note), ''),
    p_amount_cents, p_amount_cents, 'unclaimed',
    v_code, v_buyer_id, auth.uid(), p_staff_id,
    case when p_expires_months is null or p_expires_months <= 0 then null
         else now() + make_interval(months => p_expires_months) end
  )
  returning * into v_card;

  insert into public.gift_card_events (gift_card_id, merchant_id, type, amount_cents, balance_after_cents, user_id, actor_id, staff_id)
  values (v_card.id, p_merchant_id, 'issue', p_amount_cents, p_amount_cents, v_buyer_id, auth.uid(), p_staff_id);

  return jsonb_build_object(
    'ok', true,
    'card', public.gift_card_public(v_card),
    'claim_code', public.gift_format_code(v_code),
    'buyer_first_name', v_buyer_first
  );
end;
$$;

-- ── Customer: look before claiming ────────────────────────────────────────
create or replace function public.peek_gift_card(p_code text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_card public.gift_cards;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  select * into v_card from public.gift_cards where claim_code = public.gift_normalize_code(p_code);
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_card.status = 'void' then
    return jsonb_build_object('ok', false, 'error', 'void');
  end if;
  if v_card.status <> 'unclaimed' then
    return jsonb_build_object('ok', false, 'error',
      case when v_card.claimed_by = auth.uid() then 'already_yours' else 'already_claimed' end,
      'card_id', v_card.id);
  end if;
  if v_card.expires_at is not null and v_card.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  return jsonb_build_object('ok', true, 'card', public.gift_card_public(v_card));
end;
$$;

-- ── Customer: claim ───────────────────────────────────────────────────────
create or replace function public.claim_gift_card(p_code text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_card public.gift_cards;
  v_me record;
  v_loyalty uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select * into v_card from public.gift_cards
  where claim_code = public.gift_normalize_code(p_code)
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_card.status = 'void' then
    return jsonb_build_object('ok', false, 'error', 'void');
  end if;
  if v_card.status <> 'unclaimed' then
    if v_card.claimed_by = auth.uid() then
      return jsonb_build_object('ok', true, 'card', public.gift_card_public(v_card), 'already', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  if v_card.expires_at is not null and v_card.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  update public.gift_cards
    set claimed_by = auth.uid(), claimed_at = now(), status = 'active'
  where id = v_card.id
  returning * into v_card;

  -- The recipient becomes a cardholder at the shop, same as a first stamp
  select id into v_loyalty from public.loyalty_cards
  where merchant_id = v_card.merchant_id and is_active limit 1;
  if v_loyalty is not null then
    insert into public.memberships (user_id, merchant_id, loyalty_card_id, current_stamps)
    values (auth.uid(), v_card.merchant_id, v_loyalty, 0)
    on conflict (user_id, merchant_id) do nothing;
  end if;

  insert into public.gift_card_events (gift_card_id, merchant_id, type, amount_cents, balance_after_cents, user_id, actor_id)
  values (v_card.id, v_card.merchant_id, 'claim', null, v_card.balance_cents, auth.uid(), auth.uid());

  -- Tell the buyer, if they're on Stampd
  if v_card.buyer_user_id is not null and v_card.buyer_user_id <> auth.uid() then
    select first_name into v_me from public.users where id = auth.uid();
    perform public.queue_consumer_push(
      v_card.buyer_user_id,
      'Your gift card was claimed',
      format('%s now has the $%s gift card for %s.',
        coalesce(v_card.for_name, v_me.first_name, 'They'),
        to_char(v_card.amount_cents / 100.0, 'FM999990.00'),
        (select business_name from public.merchants where id = v_card.merchant_id))
    );
  end if;

  return jsonb_build_object('ok', true, 'card', public.gift_card_public(v_card));
end;
$$;

-- ── Customer: the counter code (changes every minute) ─────────────────────
create or replace function public.gift_card_code(p_card_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_card public.gift_cards;
  v_minute bigint;
begin
  select * into v_card from public.gift_cards where id = p_card_id and claimed_by = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_card.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', v_card.status);
  end if;
  v_minute := floor(extract(epoch from now()) / 60);
  return jsonb_build_object(
    'ok', true,
    'code', public.gift_code_at(v_card.secret, v_minute),
    'seconds_left', 60 - (floor(extract(epoch from now()))::bigint % 60),
    'balance_cents', v_card.balance_cents
  );
end;
$$;

-- ── Customer: everything of mine ──────────────────────────────────────────
create or replace function public.my_gift_cards()
returns jsonb
language sql stable security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'held', coalesce((
      select jsonb_agg(public.gift_card_public(g) order by (g.status = 'active') desc, g.claimed_at desc)
      from public.gift_cards g where g.claimed_by = auth.uid() and g.status in ('active', 'used')
    ), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(public.gift_card_public(g) order by g.created_at desc)
      from public.gift_cards g
      where g.buyer_user_id = auth.uid() and (g.claimed_by is null or g.claimed_by <> auth.uid())
        and g.status <> 'void'
    ), '[]'::jsonb)
  );
$$;

create or replace function public.gift_card_detail(p_card_id uuid)
returns jsonb
language sql stable security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'card', public.gift_card_public(g),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'type', e.type, 'amount_cents', e.amount_cents,
        'balance_after_cents', e.balance_after_cents, 'created_at', e.created_at,
        'staff_name', s.name
      ) order by e.created_at desc)
      from public.gift_card_events e
      left join public.staff s on s.id = e.staff_id
      where e.gift_card_id = g.id
    ), '[]'::jsonb)
  )
  from public.gift_cards g
  where g.id = p_card_id and (g.claimed_by = auth.uid() or g.buyer_user_id = auth.uid());
$$;

-- ── Merchant: redeem at the counter ───────────────────────────────────────
create or replace function public.redeem_gift_card(
  p_merchant_id uuid,
  p_code text,
  p_amount_cents int,
  p_staff_id uuid default null,
  p_earn_stamp boolean default true
)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_merchant record;
  v_minute bigint;
  v_code text;
  v_card public.gift_cards;
  v_holder record;
  v_stamped boolean := false;
  v_stamp_res jsonb;
begin
  if not public.specials_can_manage(p_merchant_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  select is_active, gift_cards_enabled, business_name into v_merchant
  from public.merchants where id = p_merchant_id;
  if not found or not coalesce(v_merchant.is_active, false) then
    return jsonb_build_object('ok', false, 'error', 'merchant_not_active');
  end if;

  if p_staff_id is not null and not exists (
    select 1 from public.staff where id = p_staff_id and merchant_id = p_merchant_id and is_active
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_staff');
  end if;

  v_code := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  if length(v_code) <> 6 then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;

  -- This minute or the one before (the customer may have shown it just as it rolled)
  v_minute := floor(extract(epoch from now()) / 60);
  select g.* into v_card
  from public.gift_cards g
  where g.merchant_id = p_merchant_id and g.status = 'active'
    and (public.gift_code_at(g.secret, v_minute) = v_code or public.gift_code_at(g.secret, v_minute - 1) = v_code)
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'code_not_found');
  end if;
  if v_card.expires_at is not null and v_card.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  select first_name, last_name, personal_pin into v_holder from public.users where id = v_card.claimed_by;

  if p_amount_cents is null or p_amount_cents <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  if p_amount_cents > v_card.balance_cents then
    return jsonb_build_object('ok', false, 'error', 'insufficient',
      'balance_cents', v_card.balance_cents,
      'holder_name', trim(coalesce(v_holder.first_name, '') || ' ' || coalesce(left(v_holder.last_name, 1) || '.', '')));
  end if;

  update public.gift_cards
    set balance_cents = balance_cents - p_amount_cents,
        status = case when balance_cents - p_amount_cents = 0 then 'used' else 'active' end
  where id = v_card.id
  returning * into v_card;

  insert into public.gift_card_events (gift_card_id, merchant_id, type, amount_cents, balance_after_cents, user_id, actor_id, staff_id)
  values (v_card.id, p_merchant_id, 'redeem', -p_amount_cents, v_card.balance_cents, v_card.claimed_by, auth.uid(), p_staff_id);

  -- A gift card visit is still a visit: try to stamp, but never let a stamp
  -- problem undo the redemption
  if p_earn_stamp and v_holder.personal_pin is not null then
    begin
      v_stamp_res := public.issue_stamp_by_personal_pin(v_holder.personal_pin, p_merchant_id, p_staff_id, 1, true);
      v_stamped := coalesce((v_stamp_res->>'success')::boolean, false);
    exception when others then
      v_stamped := false;
    end;
  end if;

  perform public.queue_consumer_push(
    v_card.claimed_by,
    format('$%s used at %s', to_char(p_amount_cents / 100.0, 'FM999990.00'), v_merchant.business_name),
    case when v_card.balance_cents = 0 then 'That used up your gift card. Thanks for coming in!'
         else format('$%s left on your gift card.', to_char(v_card.balance_cents / 100.0, 'FM999990.00')) end
  );

  return jsonb_build_object(
    'ok', true,
    'card_id', v_card.id,
    'holder_name', trim(coalesce(v_holder.first_name, '') || ' ' || coalesce(left(v_holder.last_name, 1) || '.', '')),
    'taken_cents', p_amount_cents,
    'balance_cents', v_card.balance_cents,
    'used_up', v_card.balance_cents = 0,
    'stamped', v_stamped
  );
end;
$$;

-- ── Merchant: what a counter code points at, before taking anything ──────
create or replace function public.lookup_gift_card_code(p_merchant_id uuid, p_code text)
returns jsonb
language plpgsql stable security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_minute bigint;
  v_code text;
  v_card public.gift_cards;
  v_holder record;
begin
  if not public.specials_can_manage(p_merchant_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  v_code := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  if length(v_code) <> 6 then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  v_minute := floor(extract(epoch from now()) / 60);
  select g.* into v_card
  from public.gift_cards g
  where g.merchant_id = p_merchant_id and g.status = 'active'
    and (public.gift_code_at(g.secret, v_minute) = v_code or public.gift_code_at(g.secret, v_minute - 1) = v_code)
  limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'code_not_found');
  end if;
  select first_name, last_name into v_holder from public.users where id = v_card.claimed_by;
  return jsonb_build_object(
    'ok', true,
    'card_id', v_card.id,
    'holder_name', trim(coalesce(v_holder.first_name, '') || ' ' || coalesce(left(v_holder.last_name, 1) || '.', '')),
    'from_name', v_card.from_name,
    'balance_cents', v_card.balance_cents,
    'amount_cents', v_card.amount_cents,
    'created_at', v_card.created_at,
    'expires_at', v_card.expires_at
  );
end;
$$;

-- ── Merchant: void a mistake ──────────────────────────────────────────────
create or replace function public.void_gift_card(p_card_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_card public.gift_cards;
begin
  select * into v_card from public.gift_cards where id = p_card_id for update;
  if not found or not public.specials_can_manage(v_card.merchant_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if v_card.status not in ('unclaimed', 'active') then
    return jsonb_build_object('ok', false, 'error', 'not_voidable');
  end if;

  update public.gift_cards
    set status = 'void', balance_cents = 0, voided_at = now(), void_reason = nullif(trim(p_reason), '')
  where id = p_card_id
  returning * into v_card;

  insert into public.gift_card_events (gift_card_id, merchant_id, type, amount_cents, balance_after_cents, user_id, actor_id)
  values (v_card.id, v_card.merchant_id, 'void', null, 0, v_card.claimed_by, auth.uid());

  if v_card.claimed_by is not null then
    perform public.queue_consumer_push(
      v_card.claimed_by,
      'Gift card cancelled',
      format('%s cancelled a gift card. Ask them at the counter if that looks wrong.',
        (select business_name from public.merchants where id = v_card.merchant_id))
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- ── Merchant: the ledger page ─────────────────────────────────────────────
create or replace function public.list_gift_cards(p_merchant_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $$
declare
  v_month_start timestamptz := date_trunc('month', timezone('America/Nassau', now())) at time zone 'America/Nassau';
begin
  if not public.specials_can_manage(p_merchant_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  return jsonb_build_object(
    'ok', true,
    'enabled', (select gift_cards_enabled from public.merchants where id = p_merchant_id),
    'summary', jsonb_build_object(
      'outstanding_cents', coalesce((select sum(balance_cents) from public.gift_cards where merchant_id = p_merchant_id and status in ('unclaimed', 'active')), 0),
      'outstanding_count', (select count(*) from public.gift_cards where merchant_id = p_merchant_id and status in ('unclaimed', 'active') and balance_cents > 0),
      'issued_month_cents', coalesce((select sum(amount_cents) from public.gift_card_events where merchant_id = p_merchant_id and type = 'issue' and created_at >= v_month_start), 0),
      'issued_month_count', (select count(*) from public.gift_card_events where merchant_id = p_merchant_id and type = 'issue' and created_at >= v_month_start),
      'used_month_cents', coalesce((select -sum(amount_cents) from public.gift_card_events where merchant_id = p_merchant_id and type = 'redeem' and created_at >= v_month_start), 0),
      'used_month_count', (select count(*) from public.gift_card_events where merchant_id = p_merchant_id and type = 'redeem' and created_at >= v_month_start)
    ),
    'cards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'for_name', g.for_name, 'from_name', g.from_name,
        'amount_cents', g.amount_cents, 'balance_cents', g.balance_cents, 'status', g.status,
        'claim_code', case when g.status = 'unclaimed' then public.gift_format_code(g.claim_code) else null end,
        'holder_name', case when u.id is null then null else trim(coalesce(u.first_name, '') || ' ' || coalesce(left(u.last_name, 1) || '.', '')) end,
        'created_at', g.created_at, 'expires_at', g.expires_at
      ) order by g.created_at desc)
      from public.gift_cards g
      left join public.users u on u.id = g.claimed_by
      where g.merchant_id = p_merchant_id and g.status in ('unclaimed', 'active')
    ), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'type', e.type, 'amount_cents', e.amount_cents, 'balance_after_cents', e.balance_after_cents,
        'created_at', e.created_at, 'staff_name', s.name, 'card_id', e.gift_card_id,
        'for_name', g.for_name, 'from_name', g.from_name,
        'holder_name', case when u.id is null then null else trim(coalesce(u.first_name, '') || ' ' || coalesce(left(u.last_name, 1) || '.', '')) end
      ) order by e.created_at desc)
      from (select * from public.gift_card_events where merchant_id = p_merchant_id order by created_at desc limit 200) e
      join public.gift_cards g on g.id = e.gift_card_id
      left join public.staff s on s.id = e.staff_id
      left join public.users u on u.id = g.claimed_by
    ), '[]'::jsonb)
  );
end;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────
grant execute on function public.issue_gift_card(uuid, int, text, text, text, text, uuid, int) to authenticated;
grant execute on function public.peek_gift_card(text) to authenticated;
grant execute on function public.claim_gift_card(text) to authenticated;
grant execute on function public.gift_card_code(uuid) to authenticated;
grant execute on function public.my_gift_cards() to authenticated;
grant execute on function public.gift_card_detail(uuid) to authenticated;
grant execute on function public.redeem_gift_card(uuid, text, int, uuid, boolean) to authenticated;
grant execute on function public.lookup_gift_card_code(uuid, text) to authenticated;
grant execute on function public.void_gift_card(uuid, text) to authenticated;
grant execute on function public.list_gift_cards(uuid) to authenticated;
revoke execute on function public.gift_new_claim_code() from public, anon, authenticated;
revoke execute on function public.gift_code_at(bytea, bigint) from public, anon, authenticated;

-- Island Cutz is the test shop
update public.merchants set gift_cards_enabled = true where id = '3cebcf15-5acb-4ca3-bcc3-b1a778287d05';
