# Merchant Specials ("Running a special today, stop by") — V1 Spec

**Status:** Spec — not built yet. Strong candidate for the next build phase; most of the plumbing already exists.
**Driver:** A merchant's only way to reach customers today is to hope they walk past. A one-tap "special today" push turns Stampd into a direct line to the phones of people who have *already bought from them*. It is the most sellable merchant feature on the list, it produces a number the merchant can see ("14 people came in after your message"), and it is the natural reason to move from $50 to the $75 tier.
**Core principle:** **Stampd is a shared app. One spammy merchant taxes the whole network.** A customer annoyed by one shop does not mute that shop, they uninstall Stampd, and every other shop loses them. The guardrails are the feature, not polish.

## What the merchant gets

> "Slow afternoon? Tell every customer who has ever been stamped at your shop, with one tap.
> Then watch how many walk in."

- A **Send a special** button in Stampd Business (and the portal).
- Reaches only *their* customers: people with a membership at that shop.
- Fixed, short message shape so it never reads like spam.
- A result card afterwards: sent to N customers, M visited today.
- A hard daily cap, so it stays rare and therefore gets read.

## What already exists (do not rebuild)

From the push rails built 2026-09-28:

- `push_tokens` table, ~200 registered devices; `lib/pushNotifications.ts` registers Expo tokens.
- `notifications` table with `type` enum `notification_type` that already includes **`merchant_promo`**, and `channel` (`push` / `whatsapp`).
- `queue_consumer_push()` → pg_net POST to the **`send-consumer-push`** edge function (secret in `app_internal_config` key `notify_secret`, header `x-internal-secret`) → Expo push API. Per-user path and a `{broadcast: true}` all-users path (chunked 100/request).
- `announce_merchant_launch(merchant_id, dry_run)` — the one-to-many pattern with dry-run, inactive-merchant refusal, 30-day cooldown, and EXECUTE revoked from clients. **Specials are the merchant-scoped sibling of this function.**
- Daily lapsed reminders via pg_cron (`send_progress_reminders()`), proving scheduled sends work.

Specials need a **new edge-function path** (or a loop over the per-user path): "push to this list of user_ids", which is between the existing per-user and broadcast modes.

## The flow

### Merchant (Stampd Business / portal)

1. Taps **Send a special**.
2. Sees the fixed shape with their shop name already in place:
   > **Livity:** [ ___________________ ] **Stop by.**
   Fills the middle, 80 characters max. Live preview of the exact notification.
3. Sees who gets it: "Goes to 171 customers who have been stamped at Livity."
4. Taps **Send**. Button greys out: "You can send again tomorrow at 9am."
5. Later that day the result card fills in: "Sent to 171 · 14 visited today."

### Customer (consumer app, this repo)

- Push arrives: title `Livity`, body `Half-price fritters until 3pm. Stop by.`
- Tapping opens the shop's card screen (`app/card/[id].tsx`).
- Also appears in the in-app Notifications list (already renders `merchant_promo` with the bell icon).
- Card screen gets a small **Mute specials from this shop** toggle. Per-shop, never app-wide, so a tired customer silences one shop instead of leaving.

## Guardrails (non-negotiable for V1)

| Rule | Value | Why |
|---|---|---|
| Daily cap | 1 per merchant per calendar day (Nassau time) | Rare = read |
| Monthly cap | 8 (base tier), higher on $75 tier | Upgrade hook; stops habitual sending |
| Audience | Memberships at that merchant only, excluding muted | Never the whole network |
| Shape | `{business_name}: {text}. Stop by.` | Recognisable, short, hard to make spammy |
| Length | 80 characters for the merchant's part | Fits one notification line on most phones |
| Content filter | No URLs, no phone numbers, no ALL CAPS runs > 3 words, no repeated `!` | Cheap spam heuristics; reject with a plain message |
| Quiet hours | Sends allowed 9:00–20:00 Nassau time only | Nobody wants a 6am fritter alert |
| Merchant state | `is_active = true` and subscription not `inactive`/`cancelled` | Same as stamping |
| Staff | Owner only in V1 (no staff PIN path) | It's a marketing action, not a counter action |
| Dry run | Preview endpoint returns recipient count + exact copy, sends nothing | Same pattern as `announce_merchant_launch` |

## Data model (sketch)

```sql
-- One row per special sent. The send itself is the audit log.
create table merchant_specials (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references merchants(id),
  text           text not null check (char_length(text) <= 80),
  sent_at        timestamptz not null default now(),
  recipients     int  not null,          -- memberships targeted at send time
  visits_24h     int,                    -- filled by a job the next day (stamps within 24h)
  sent_by        uuid not null references auth.users(id)
);

-- Per-customer, per-shop mute. Reuses the memberships row, same as marketing_opt_in.
alter table memberships add column specials_muted boolean not null default false;

-- Per-merchant monthly allowance (tier-driven; stored so it can be overridden per shop).
alter table merchants add column specials_monthly_cap int not null default 8;
```

No new notification type needed: write `notifications` rows with `type = 'merchant_promo'`, `merchant_id` set, so they appear in the customer's in-app list and dedupe like everything else.

## RPCs (SECURITY DEFINER, same auth pattern as `issue_stamp_by_personal_pin`)

| RPC | Does |
|---|---|
| `preview_special(merchant_id, text)` | Validates text (length, filter), checks caps and quiet hours, returns `{ok, copy, recipients, next_allowed_at, reason}`. Sends nothing. Powers the live preview. |
| `send_special(merchant_id, text)` | Re-runs the same checks, inserts `merchant_specials`, inserts one `notifications` row per recipient, calls the edge function with the recipient list in chunks. Returns the special id and recipient count. |
| `special_results(merchant_id)` | Last 30 specials with `recipients` and `visits_24h`. Powers the result cards. |
| `set_specials_muted(merchant_id, muted)` | Customer-side toggle on their own membership. |
| `fill_special_visits()` | pg_cron nightly: for yesterday's specials, count distinct `stamp_events.user_id` at that merchant within 24h of `sent_at` among recipients → `visits_24h`. |

Caller checks: `merchants.owner_id = auth.uid()` for merchant RPCs; `memberships.user_id = auth.uid()` for the mute.

## Edge function change

`send-consumer-push` gains a third mode: `{user_ids: [...], title, body, data: {merchant_id}}`. Looks up tokens for those users, dedupes, chunks 100/request, same secret check. Per-user and broadcast modes unchanged.

## Surfaces

### Stampd Business (coral-merchant) + portal (coral-web)
- **Send a special** on the merchant home screen. Text field with the fixed prefix/suffix rendered around it, counter (80), live preview, recipient count, Send.
- Disabled state with the reason: "Next special available tomorrow 9am" / "You've used 8 of 8 this month" / "Specials send between 9am and 8pm".
- **Specials** history list with result cards. The `visits_24h` number is the whole point; make it big.

### Consumer app (this repo)
- Notification tap → deep link to that shop's card screen.
- Card screen: **Mute specials from this shop** toggle (reads/writes `memberships.specials_muted`).
- Follow the crash-on-open checklist for the new column read: tolerate null/old-shape cached data.

## Rollout

1. **Validate (zero build):** ask Livity and Streatery: "If you could send one message a day to everyone who's ever been stamped at your shop, would you use it? What would you say?" Their answers are the copy for the carousel slide later.
2. Schema + RPCs + edge-function mode (instant, no app build). Test with dry runs against Island Cutz (demo shop).
3. Merchant-app UI; consumer mute toggle rides the next EAS build. Until the mute ships, keep the cap at 1/day and 4/month.
4. Pilot with Livity for two weeks. Watch two numbers: `visits_24h` per special, and consumer uninstalls / token churn after sends.
5. Raise caps per tier once the pilot shows customers tolerate it.

## Pricing

- Base ($50): 8 specials a month.
- $75 tier: 20 a month (never unlimited; the daily cap stays).
- This is the cleanest upgrade reason in the product. Say so in the merchant pitch once it's live.

## Marketing (after it ships, not before)

Earns its own carousel slide, probably replacing or joining slide 4 ("Stampd brings them back for you"):
> **Slow afternoon? Tell every customer with one tap.**
> - Only people who've already been stamped at your shop.
> - "Half-price fritters until 3pm. Stop by." Sent at noon.
> - See how many walked in that afternoon.

Rule from the carousel build stands: nothing goes on a slide until it is live.

## V2 ideas (out of V1)

- Scheduled specials ("send at 11:30 every Friday").
- Segment targeting from the portal CRM (lapsed only, regulars only, close-to-reward only).
- Photo attached to the special.
- Merchant-to-merchant cross-promos ("show your Livity stamp card at Streatery for 10% off"), which is the network-only version nobody else can offer.
- WhatsApp channel for customers who turned off push (the `channel` enum already has `whatsapp`).

## Open decisions

- [ ] Daily cap: 1 (proposed) or allow 2 on weekends?
- [ ] Monthly caps per tier: 8 / 20 proposed.
- [ ] Quiet hours: 9am–8pm proposed. Restaurants may want 8am for breakfast specials.
- [ ] Should a special also be visible on the shop's Discover page for the day ("Today: half-price fritters")? Cheap, and reaches people who muted push. Proposed: yes, V1.
- [ ] Owner-only, or allow a named staff member with PIN to send?
- [ ] Count `visits_24h` from send time, or until close of that day?
- [ ] Do specials count toward the lapsed-reminder cooldown so a customer never gets two pushes from the same shop in one day? Proposed: yes.

## Mockups

Design canvas (merchant portal compose / sent / capped states, customer lock screen, card screen with "Today at" + mute toggle, and the four-stage roadmap): https://claude.ai/artifact/8Lf8KgWEdnpzZPCC8VdYMS

## Update 2026-10-12: the public Specials tab (decided with the user)

The push stays private (a shop's stamped customers only). Every special ALSO goes onto a public **Specials** tab in the consumer app (fifth tab; screen headline "What's on today"): every shop's specials for today, the customer's own shops first, newest first within each group, everything expiring at midnight Nassau time (or ended early by the merchant). Only today's specials, never evergreen deals. Tab badge counts specials from the customer's own shops only. Rows open the shop's card, or its Discover page if the customer has no card yet. Needs a public read policy on today's unexpired specials of active merchants, and `end_special`. Result card gains "new customers from the board" (first stamps at the shop within 24h). Full plan with mockups: https://claude.ai/artifact/NvbzWWTtguZvVDZAJb6tvc

**Correction 2026-10-12 (same day):** NO fifth tab. Specials from the customer's own shops become slides in the existing Home hero carousel (deep-teal slide, gold "SPECIAL · UNTIL 3PM" tag, shop name, the special as the title, stamp progress underneath; special slides first, max two, tap → card screen). The existing Home promo banner is the door to the board: when any shop has a special today it reads "What's on today · N specials across Grand Bahama" and opens the "What's on today" screen (a stack screen, not a tab); when nothing is on it falls back to today's static banner, so Home never shows an empty state. Second door: a strip at the top of Discover. Promote to a tab later only if usage demands it.

**Update 2026-10-15: the board is flyers, not text rows.** Merchants already make a promo image for every special (Instagram/WhatsApp); the compose screen gains an optional image upload (4:5 or 1:1), and the "What's on today" screen shows each special as that image in a card with the shop logo + name over the bottom edge (your spots as one wide card first, then a 2-column grid for the rest). Tap = the flyer full screen with shop name, sent time, the 80-char line as caption, "Open their card" and "Directions", swipe for the next. No hearts, no comments, no share button. A special sent without an image gets a card drawn from the shop's brand colour with the text, so the board is never half-empty. Still a board (expires at midnight, your spots first), not a feed. Canvas boards 6 and 7: https://claude.ai/artifact/8Lf8KgWEdnpzZPCC8VdYMS

**Update 2026-10-17: timing and tags.** A special runs today by default (gone at midnight). Optional end time ("Ends: 3pm") drops it off the board/carousel at that time and bounds the results window. Optional run length up to 7 days for real sales: the push goes out ONCE on day one, the board and carousel list it every day it runs; the daily cap applies to pushes, not listings. "End early" for sold out. The gold tag is chosen by the merchant, never computed: SPECIAL (default) / UNTIL 3PM (only if an end time is set) / ENDS FRIDAY (only if a run length is set) / 3 DAYS LEFT (countdown, off by default). Home: special slides are a third slide kind in the existing hero carousel (first, max two, then card slides, then Get Started steps), never a Get Started step. Full revised plan: https://claude.ai/artifact/NvbzWWTtguZvVDZAJb6tvc

**FINAL shape (2026-10-17, supersedes the Home/board notes above):**
- NAMES: customer-facing = **"Today"** (one word; "Specials"/"Deals" rejected because customers tie them to discounts and half the posts are announcements). Merchant-facing = **"Post a special or update"**, with a Special/Update choice that sets the default tag (SPECIAL or TODAY).
- HOME: a third pill next to PIN | Cards → **Today**, with a count only when one of the customer's own shops has posted. Tapping shows those posts in the sheet (no navigation). "See all ›" top right and the empty state's button ("Nothing from your spots yet" → "See what's going on today") open the island view "Today in Grand Bahama" (everyone's posts, your spots first). The promo banner is UNTOUCHED. Your shops' posts can also be the first carousel slide (max two), never a Get Started step.
- TILES: every flyer is the same 4:5 tile (the wide "your spot" card was dropped because it would crop a 4:5 flyer). Your spots first with a thin teal border. Square flyers letterbox in brand colour. Text-only posts get a brand-colour card.
- STAMPS: no stamp progress on a post (a special doesn't earn a stamp unless the program says so). Compose gets a checkbox **"This earns a stamp"**, off by default; only then does the card/slide show "Earns a stamp".
- Timing/tags as in the 2026-10-17 update above. Plan: https://claude.ai/artifact/NvbzWWTtguZvVDZAJb6tvc
- MERCHANT PAGE (app/discover/[id]): a "Today at {shop}" block under the photos, above the earn/reward pills: flyer thumbnail + the line, tap → full screen. Absent when nothing is running. DISCOVER LIST: small gold dot on tiles of shops with a running post. One query feeds: Today pill, carousel slide, island view, card screen block, merchant page block, Discover dot. Full-screen flyer = modal, X top-left in the white-circle style, swipe down closes, swipe sideways = next. No skeletons (design bible): cache-first render + teal spinner on first island-view open + image fade-in.
- ADMIN: the admin panel gets the same compose with a merchant picker (post on behalf of busy owners), counts against the merchant's caps, shown in their history as "posted by Stampd"; admin can end any running post.
- BUILD STARTED 2026-10-17: server first (table, bucket, policies, RPCs, cron, edge-function list mode), then portal + admin, then consumer app.
