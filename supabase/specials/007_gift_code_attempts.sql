-- 007: cap wrong guesses. A person types a code wrong twice; a script fires
-- thousands. After 20 wrong claim codes in an hour, an account is told to
-- wait. After 30 wrong counter codes in an hour, a shop's account is too.

create table if not exists public.gift_code_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null,
  kind         text not null check (kind in ('claim', 'redeem')),
  attempted_at timestamptz not null default now()
);
create index if not exists gift_code_attempts_idx on public.gift_code_attempts (user_id, kind, attempted_at desc);
alter table public.gift_code_attempts enable row level security;

-- Returns true when the caller is over the cap. Records nothing itself.
create or replace function public.gift_too_many_tries(p_kind text, p_cap int)
returns boolean
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_n int;
begin
  -- Keep the table small: drop this user's day-old rows while we're here
  delete from public.gift_code_attempts
  where user_id = auth.uid() and kind = p_kind and attempted_at < now() - interval '1 day';

  select count(*) into v_n from public.gift_code_attempts
  where user_id = auth.uid() and kind = p_kind and attempted_at > now() - interval '1 hour';
  return v_n >= p_cap;
end;
$$;

create or replace function public.gift_note_bad_try(p_kind text)
returns void
language sql security definer
set search_path to 'public'
as $$
  insert into public.gift_code_attempts (user_id, kind) values (auth.uid(), p_kind);
$$;

-- ── Claim side: peek and claim share the cap ──────────────────────────────
create or replace function public.peek_gift_card(p_code text)
returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_card public.gift_cards;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;
  if public.gift_too_many_tries('claim', 20) then
    return jsonb_build_object('ok', false, 'error', 'too_many_tries');
  end if;
  select * into v_card from public.gift_cards where claim_code = public.gift_normalize_code(p_code);
  if not found then
    perform public.gift_note_bad_try('claim');
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
  if public.gift_too_many_tries('claim', 20) then
    return jsonb_build_object('ok', false, 'error', 'too_many_tries');
  end if;

  select * into v_card from public.gift_cards
  where claim_code = public.gift_normalize_code(p_code)
  for update;

  if not found then
    perform public.gift_note_bad_try('claim');
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

  select id into v_loyalty from public.loyalty_cards
  where merchant_id = v_card.merchant_id and is_active limit 1;
  if v_loyalty is not null then
    insert into public.memberships (user_id, merchant_id, loyalty_card_id, current_stamps)
    values (auth.uid(), v_card.merchant_id, v_loyalty, 0)
    on conflict (user_id, merchant_id) do nothing;
  end if;

  insert into public.gift_card_events (gift_card_id, merchant_id, type, amount_cents, balance_after_cents, user_id, actor_id)
  values (v_card.id, v_card.merchant_id, 'claim', null, v_card.balance_cents, auth.uid(), auth.uid());

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

-- ── Counter side: lookup and redeem share the cap ─────────────────────────
create or replace function public.lookup_gift_card_code(p_merchant_id uuid, p_code text)
returns jsonb
language plpgsql security definer
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
  if public.gift_too_many_tries('redeem', 30) then
    return jsonb_build_object('ok', false, 'error', 'too_many_tries');
  end if;
  v_minute := floor(extract(epoch from now()) / 60);
  select g.* into v_card
  from public.gift_cards g
  where g.merchant_id = p_merchant_id and g.status = 'active'
    and (public.gift_code_at(g.secret, v_minute) = v_code or public.gift_code_at(g.secret, v_minute - 1) = v_code)
  limit 1;
  if not found then
    perform public.gift_note_bad_try('redeem');
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
  if public.gift_too_many_tries('redeem', 30) then
    return jsonb_build_object('ok', false, 'error', 'too_many_tries');
  end if;

  v_minute := floor(extract(epoch from now()) / 60);
  select g.* into v_card
  from public.gift_cards g
  where g.merchant_id = p_merchant_id and g.status = 'active'
    and (public.gift_code_at(g.secret, v_minute) = v_code or public.gift_code_at(g.secret, v_minute - 1) = v_code)
  limit 1
  for update;

  if not found then
    perform public.gift_note_bad_try('redeem');
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

revoke execute on function public.gift_too_many_tries(text, int) from public, anon, authenticated;
revoke execute on function public.gift_note_bad_try(text) from public, anon, authenticated;
