-- 006: gift card email. The shop types an address, presses send, and Stampd
-- emails the gift from gifts@stampdbahamas.com as "<Shop> via Stampd".
-- Optional send date for birthdays; a 5-minute job sends what is due.

alter table public.gift_cards
  add column if not exists email_to text,
  add column if not exists email_send_at timestamptz,
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_last_error text;

create index if not exists gift_cards_email_due_idx
  on public.gift_cards (email_send_at)
  where email_to is not null and email_sent_at is null;

-- ── What the landing page shows before sign-up (anon) ─────────────────────
create or replace function public.gift_card_preview(p_code text)
returns jsonb
language sql stable security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'ok', true,
    'business_name', m.business_name,
    'logo_url', m.logo_url,
    'card_color', coalesce(lc.card_color, '#00605A'),
    'for_name', g.for_name,
    'from_name', g.from_name,
    'note', g.note,
    'amount_cents', g.amount_cents,
    'status', g.status,
    'expires_at', g.expires_at
  )
  from public.gift_cards g
  join public.merchants m on m.id = g.merchant_id
  left join public.loyalty_cards lc on lc.merchant_id = m.id and lc.is_active
  where g.claim_code = public.gift_normalize_code(p_code);
$$;
grant execute on function public.gift_card_preview(text) to anon, authenticated;

-- ── Hand one card to the email function ───────────────────────────────────
create or replace function public.dispatch_gift_email(p_card_id uuid)
returns void
language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_card public.gift_cards;
  v_secret text;
  v_merchant record;
begin
  select * into v_card from public.gift_cards where id = p_card_id;
  if not found or v_card.email_to is null or v_card.status <> 'unclaimed' then return; end if;

  select business_name, logo_url, address, phone into v_merchant
  from public.merchants where id = v_card.merchant_id;

  select value into v_secret from public.app_internal_config where key = 'notify_secret';
  if v_secret is null then return; end if;

  update public.gift_cards set email_sent_at = now(), email_last_error = null where id = p_card_id;

  perform net.http_post(
    url := 'https://ydffxgnuljyvtbpexkkv.supabase.co/functions/v1/send-gift-email',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-internal-secret', v_secret),
    body := jsonb_build_object(
      'card_id', v_card.id,
      'to', v_card.email_to,
      'claim_code', public.gift_format_code(v_card.claim_code),
      'business_name', v_merchant.business_name,
      'logo_url', v_merchant.logo_url,
      'address', v_merchant.address,
      'card_color', (select coalesce(lc.card_color, '#00605A') from public.loyalty_cards lc where lc.merchant_id = v_card.merchant_id and lc.is_active limit 1),
      'for_name', v_card.for_name,
      'from_name', v_card.from_name,
      'note', v_card.note,
      'amount_cents', v_card.amount_cents,
      'expires_at', v_card.expires_at
    )
  );
end;
$$;

-- ── Issue: now takes an email and an optional send time ───────────────────
drop function if exists public.issue_gift_card(uuid, int, text, text, text, text, uuid, int);
create or replace function public.issue_gift_card(
  p_merchant_id uuid,
  p_amount_cents int,
  p_for_name text default null,
  p_from_name text default null,
  p_note text default null,
  p_buyer_pin text default null,
  p_staff_id uuid default null,
  p_expires_months int default 12,
  p_email text default null,
  p_send_at timestamptz default null
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
  v_email text := lower(nullif(trim(p_email), ''));
  v_send_at timestamptz;
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

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;
  if v_email is not null then
    v_send_at := case when p_send_at is null or p_send_at <= now() then now() else p_send_at end;
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
    claim_code, buyer_user_id, issued_by, issued_staff_id, expires_at, email_to, email_send_at
  ) values (
    p_merchant_id, nullif(trim(p_for_name), ''), nullif(trim(p_from_name), ''), nullif(trim(p_note), ''),
    p_amount_cents, p_amount_cents, 'unclaimed',
    v_code, v_buyer_id, auth.uid(), p_staff_id,
    case when p_expires_months is null or p_expires_months <= 0 then null
         else now() + make_interval(months => p_expires_months) end,
    v_email, v_send_at
  )
  returning * into v_card;

  insert into public.gift_card_events (gift_card_id, merchant_id, type, amount_cents, balance_after_cents, user_id, actor_id, staff_id)
  values (v_card.id, p_merchant_id, 'issue', p_amount_cents, p_amount_cents, v_buyer_id, auth.uid(), p_staff_id);

  -- Send now; a future date waits for the 5-minute job
  if v_email is not null and v_send_at <= now() then
    perform public.dispatch_gift_email(v_card.id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'card', public.gift_card_public(v_card),
    'claim_code', public.gift_format_code(v_code),
    'buyer_first_name', v_buyer_first,
    'email_to', v_email,
    'email_send_at', v_send_at
  );
end;
$$;
grant execute on function public.issue_gift_card(uuid, int, text, text, text, text, uuid, int, text, timestamptz) to authenticated;

-- ── Send again, or to a corrected address ─────────────────────────────────
create or replace function public.resend_gift_card_email(p_card_id uuid, p_email text default null)
returns jsonb
language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_card public.gift_cards;
  v_email text := lower(nullif(trim(p_email), ''));
begin
  select * into v_card from public.gift_cards where id = p_card_id for update;
  if not found or not public.specials_can_manage(v_card.merchant_id) then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if v_card.status <> 'unclaimed' then
    return jsonb_build_object('ok', false, 'error', 'already_claimed');
  end if;
  v_email := coalesce(v_email, v_card.email_to);
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'bad_email');
  end if;

  update public.gift_cards set email_to = v_email, email_send_at = now(), email_sent_at = null where id = p_card_id;
  perform public.dispatch_gift_email(p_card_id);
  return jsonb_build_object('ok', true, 'email_to', v_email);
end;
$$;
grant execute on function public.resend_gift_card_email(uuid, text) to authenticated;

-- ── Scheduled sends ───────────────────────────────────────────────────────
create or replace function public.send_due_gift_emails()
returns int
language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id from public.gift_cards
    where email_to is not null and email_sent_at is null and status = 'unclaimed'
      and email_send_at is not null and email_send_at <= now()
    order by email_send_at
    limit 50
  loop
    perform public.dispatch_gift_email(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'gift-emails-5min') then
    perform cron.schedule('gift-emails-5min', '*/5 * * * *', 'select public.send_due_gift_emails()');
  end if;
end $$;

-- ── Ledger page: show where it went ───────────────────────────────────────
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
        'email_to', g.email_to, 'email_send_at', g.email_send_at, 'email_sent_at', g.email_sent_at, 'email_last_error', g.email_last_error,
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
