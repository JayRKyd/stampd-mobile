# Digital Gift Cards — V1 Spec

**Status:** Spec — not built yet. Parked for the next phase; validate demand with Livity and Streatery first.
**Driver:** Merchants pay readily for gift cards (cash up front, 10–20% of balances typically go unredeemed), Q4 is gift-card season, and every card is a forced install of a new Stampd user who arrives with a balance and a reason to visit one specific shop.
**Core principle:** **Stampd is the ledger, not the wallet.** The merchant takes the money however they already do. Stampd only remembers a number, exactly as it remembers stamps. No funds are held, moved, or settled by Stampd.

## What the merchant gets

> "Sell gift cards at your counter with no cardboard, no lost cards, and a log of every dollar loaded and spent.
> The person receiving the card downloads Stampd to use it — and becomes your loyalty customer on day one."

- Issue a gift card in the business app in one tap, the same gesture as stamping.
- Redeem by customer PIN (or by code at the counter for recipients without the app).
- Append-only ledger of every load and redemption, visible to merchant and customer. Disputes ("it says $20, I paid $50") are answered in seconds.
- Zero payment processing, zero fees from Stampd, zero regulatory change for the merchant: they already sell gift cards this way on paper.

## Why this shape

- **Holding money is a different company.** Stored value / cross-merchant settlement is Central Bank territory in the Bahamas, plus chargebacks, fraud liability, and merchant-side accounting we'd have to explain. Ledger-only avoids all of it.
- **Single-merchant only in V1.** A network-wide "Stampd Bahamas" card redeemable anywhere is the exciting version, but cross-shop redemption means moving money between merchants, which is the regulatory cliff. Revisit when merchant count justifies a payments partner and legal advice.
- **The buyer does not need the app.** Walk-in gift buyers are often not users (the aunt buying for her niece). Forcing an install at the counter kills the sale. Only the *recipient* needs Stampd, and that install is the growth engine, not a cost.
- **Fits the existing plumbing.** Merchant already looks customers up by PIN; loading/redeeming is the same lookup with a dollar amount. Ledger has the same shape as `stamp_events`. Staff PIN machinery already exists for authorising sensitive actions.

## The flows

### At the counter (buyer, no app needed)

1. Buyer pays the merchant $50 by cash/card/their machine.
2. Merchant opens Stampd Business → **Gift card** → enters $50.
   - Buyer has Stampd and wants it on their own account → merchant enters buyer's PIN; balance attaches immediately.
   - Otherwise → app generates a **claim code** (e.g. `LIV-7K3P-9Q`), merchant writes it on a counter-kit card or texts it.
3. Done. Buyer never touched Stampd.

### Receiving it (recipient, app required)

1. Recipient gets the code from the buyer.
2. Opens Stampd (installs if needed) → **Redeem a gift card** → enters code.
3. Balance attaches to their PIN. Their card screen for that shop shows "$50 balance" above the stamp row. If they had no membership at that shop, one is created (so the shop gains a loyalty customer).
4. In store: merchant looks them up by PIN as usual and sees balance alongside stamps. Redeem → enter amount → balance drops.

### Fallback: recipient without a smartphone

Merchant can redeem **directly against the unclaimed code** at the counter. The balance lives on the code until claimed or spent. No account ever required.

### Does a redemption also earn a stamp?

Merchant decision, default **yes**: paying with a gift card is still a visit. Keep stamping and redeeming as separate actions in the UI so staff aren't confused; a redemption just doesn't block a stamp.

## Data model (sketch)

```sql
create type gift_card_status as enum ('unclaimed', 'active', 'depleted', 'void');

-- One row per card sold. Balance is denormalised from the ledger for fast reads.
create table gift_cards (
  id               uuid primary key default gen_random_uuid(),
  merchant_id      uuid not null references merchants(id),
  code             text unique,                  -- null once claimed to a PIN at issue time
  initial_cents    int  not null check (initial_cents > 0),
  balance_cents    int  not null check (balance_cents >= 0),
  status           gift_card_status not null default 'unclaimed',
  claimed_by       uuid references users(id),    -- null until claimed
  claimed_at       timestamptz,
  issued_by        uuid not null references auth.users(id),  -- merchant owner
  issued_staff_id  uuid references staff(id),
  expires_at       timestamptz,                  -- null = never (V1 default)
  created_at       timestamptz not null default now()
);

-- Immutable audit log. Same rules as stamp_events: never update or delete.
create type gift_card_event_type as enum ('issue', 'claim', 'redeem', 'void');

create table gift_card_events (
  id            uuid primary key default gen_random_uuid(),
  gift_card_id  uuid not null references gift_cards(id),
  merchant_id   uuid not null references merchants(id),
  type          gift_card_event_type not null,
  amount_cents  int,                               -- positive for issue, negative for redeem
  user_id       uuid references users(id),         -- customer involved, if any
  actor_id      uuid references auth.users(id),    -- who performed it (owner)
  staff_id      uuid references staff(id),
  created_at    timestamptz not null default now()
);

-- Per-merchant switch, same pattern as email_marketing_enabled.
alter table merchants add column gift_cards_enabled boolean not null default false;
```

Store cents, not decimals. Codes: short, uppercase, no ambiguous characters (no 0/O, 1/I), merchant prefix for recognisability, collision-retry loop like `handle_new_user`.

## RPCs (all SECURITY DEFINER, same auth pattern as `issue_stamp_by_personal_pin`)

| RPC | Caller | Does |
|---|---|---|
| `issue_gift_card(merchant_id, amount_cents, recipient_pin?, staff_id?)` | merchant | Creates card + `issue` event. If `recipient_pin` given, claims it immediately. Returns code or confirmation. Requires `gift_cards_enabled`, merchant `is_active`, and staff PIN if `require_staff_pin`. |
| `claim_gift_card(code)` | customer | Attaches unclaimed card to `auth.uid()`'s user row, creates membership if missing, `claim` event. Idempotent on already-claimed-by-me. |
| `redeem_gift_card(merchant_id, amount_cents, pin? / code?, staff_id?)` | merchant | Looks up by PIN (claimed) or code (unclaimed), checks balance, decrements, `redeem` event. Sets `depleted` at zero. |
| `void_gift_card(gift_card_id, reason)` | merchant owner only | Zeroes balance, `void` event. For mistakes at issue time; log the reason. |
| `my_gift_cards()` | customer | Balances per shop for the wallet screen. |

RLS: customers read cards where `claimed_by = auth.uid()`; merchants read cards/events where `merchant_id` is theirs. Nobody writes directly; RPCs only.

## Surfaces

### Stampd Business app (coral-merchant) + portal (coral-web)
- **Gift card** action next to **Stamp** on the lookup screen: amount keypad → PIN or "generate code".
- Balance shown on the customer lookup result alongside stamps.
- **Gift cards** tab: list of cards, status, outstanding balance total, daily log of issues/redemptions (fraud visibility — see below).
- Portal gets the same list + CSV export.

### Consumer app (this repo)
- `app/card/[id].tsx`: balance row above stamps when > 0.
- New **Redeem a gift card** entry (Profile tab, and a prompt on first open after install if we can pass a code via deep link later).
- Wallet summary: total gift balance across shops on the Home tab (small).
- Follow the crash-on-open checklist: new DB reads must tolerate null/old-shape cached data.

### Counter kit
- Small printed "gift card" cards with a blank for the code and the shop's name. Cheap, branded, and the buyer leaves with something physical.

## Risks even with zero money held

- **Staff fraud is now real.** Fake stamps are worth little; a fake $100 balance is theft. Loading requires owner or trusted-staff PIN; owner sees a daily issue log; portal flags unusual volume.
- **Disputes between merchant and customer.** The ledger is the referee. Make it visible to both sides.
- **Merchant closes or goes inactive.** Not Stampd's liability, but it's Stampd's screen: balance stays visible with "contact the shop" copy. Decide whether to hide inactive shops' balances after N months.
- **Expiry.** V1 default: never. It's a trust product and expiry is where paper cards get a bad name.
- **Reconciliation.** Merchant's outstanding balance total is a liability on their books. Show it plainly in the Gift cards tab so it's never a surprise.

## Rollout

1. **Validate (now, zero build):** ask Livity and Streatery: "If you could sell gift cards through Stampd before Christmas, would you?" Drop "coming soon" into pitches to Paws To Perfection and the next shops; watch reactions.
2. **If demand is clear:** apply schema + RPCs (instant), merchant-app UI, consumer-app UI (rides the next EAS build), counter-kit cards. Rough size: ~2 weeks focused.
3. Pilot with one shop for two weeks. Confirm the ledger matches their till.
4. Flip `gift_cards_enabled` per merchant as they buy the add-on.

## Pricing

Clean add-on revenue. Stampd takes no cut of the money, so a flat monthly add-on is the honest model. Open: included for founding 10, or add-on for everyone?

## V2 ideas (explicitly out of V1)

- **"Ask for this as a gift":** customer picks a shop in Discover → gets a link ("Jordy wants a Livity gift card") explaining how to buy one at the shop. Zero money moves; it's a wishlist and a merchant-discovery channel in one.
- **Deep-link claim codes** (`stampdbahamas.com/gift/LIV-7K3P-9Q` → app opens on the redeem screen).
- **Network card** redeemable at any Stampd shop. Requires settlement between merchants → payments partner + legal. Not before double-digit merchants.
- **Online purchase** (buyer pays Stampd, Stampd pays merchant). Same cliff as above.

## Open decisions

- [ ] Redemption earns a stamp by default? (Proposed: yes, merchant-configurable.)
- [ ] Expiry: never in V1? (Proposed: yes.)
- [ ] Code format and length (proposed: `<3-letter shop prefix>-<4>-<2>`, no 0/O/1/I).
- [ ] Minimum / maximum load amounts (fraud guard; proposed cap $500 without owner PIN).
- [ ] Pricing: included in founding tier or add-on?
- [ ] Partial redemption UX: merchant types amount, or picks "use full balance"? (Both.)
- [ ] What the consumer sees for an inactive shop's balance.
