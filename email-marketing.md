# Merchant Email Marketing — V1.1 Spec

**Status:** Spec — not built yet
**Driver:** Prospective merchant asked for the ability to email their customer base. This is the consented version, scoped per merchant, that becomes a sellable feature for every future signing.

## What the merchant gets

> "Every customer who joins your card gets asked once if they want your emails.
> Everyone who says yes is on your export."

- A mailing list built automatically from their real, stamped, walk-in customers.
- Only customers who explicitly said yes — no spam complaints, no "how did they get my email" moments.
- Delivered as a CSV export (admin-run for now; dashboard button later).

## Why it works this way

- Customer emails live only in `auth.users` (Supabase auth). Merchants can't see them
  anywhere in the app today, and there is no consent flag in the schema. A raw export
  would share emails customers gave to Stampd for login — not to the merchant.
- Customers never explicitly "join" a card: the membership row is created server-side
  by their **first stamp** at the shop. So there's no join screen to put a checkbox on —
  the consent ask has to happen in-app, after the fact.

## The three pieces

### 1. Database (instant — no app build)

```sql
-- Per-merchant switch. OFF for everyone except merchants who bought the feature.
alter table merchants
  add column email_marketing_enabled boolean not null default false;

-- Per-customer answer. NULL = never asked, true = yes, false = no thanks.
alter table memberships
  add column marketing_opt_in boolean;
```

Scoping to one merchant = flip `email_marketing_enabled` on for them only.
No other shop's customers are ever prompted.

### 2. Consent prompt (mobile app — waits for next EAS build)

- **Where:** the customer's card screen (`app/card/[id].tsx`) — the first place they
  land after their first stamp auto-joins them.
- **When:** membership's `marketing_opt_in IS NULL` **and** the merchant has
  `email_marketing_enabled = true`. Shows once; either answer writes the column and
  it never appears again.
- **Copy (Joyn style, keep it warm):**
  > **Stay in the loop?**
  > [Shop name] would like to email you offers and updates.
  > [ Yes, keep me posted ]  [ No thanks ]
- Both buttons write `marketing_opt_in` on that membership only. No app-wide setting,
  no effect on other cards.

### 3. Export (instant — admin query, run on request)

```sql
select u.email,
       coalesce(u.raw_user_meta_data->>'full_name', '') as name,
       m.total_stamps_earned,
       m.created_at as customer_since
from memberships m
join auth.users u on u.id = m.user_id
where m.merchant_id = '<MERCHANT_ID>'
  and m.marketing_opt_in = true
order by m.total_stamps_earned desc;
```

Export to CSV and hand to the merchant (monthly, or on request).
Later: "Export mailing list" button in a merchant dashboard, gated on the same flag.

## Rollout

1. Apply the two-column migration (safe, additive, instant).
2. Add the prompt to the card screen; rides along in the next EAS build.
3. When the prospect signs: flip `email_marketing_enabled = true` for their merchant row.
4. First export whenever they ask — list grows as customers get stamped and answer yes.

## Caveats to set expectations with the merchant

- **List starts at zero** and grows as customers (a) get stamped, (b) open the app,
  (c) tap yes. For a shop with regulars it accumulates quickly, but it is not
  "all my customers on day one."
- Consent lives per-shop: a yes for one merchant never leaks to another.
- If a customer deletes their account (`delete_own_account` RPC), their membership
  rows go with it — re-run the export before each send rather than reusing old CSVs.

## Open decisions

- [ ] Prompt default: currently spec'd as an explicit ask (no pre-checked box). Fine to keep.
- [ ] Pricing: included in $29 founding tier, or an add-on for later merchants?
- [ ] Who sends the actual emails? V1.1 = merchant's own tool (Mailchimp, Gmail BCC).
      A future "Stampd sends it for you" announcement feature keeps emails in-platform
      and is the stickier long-term play.
