# Gift Cards

**Status:** Built (Oct 29, 2026). Server live; portal and admin built; app side rides the next EAS build. Switched on per shop with `merchants.gift_cards_enabled` (Island Cutz on for testing).
**Core principle:** Stampd is the ledger, never the wallet. The shop takes the money however it already does. Stampd remembers a number, the way it remembers stamps. No funds are held, moved or settled by Stampd.

## The flow, in one line

The merchant creates it, the buyer carries it, the recipient claims it, the counter spends from it.

## Two codes, two jobs

| | What it is | Where it's used | How many times |
|---|---|---|---|
| **Claim code** (`7KQ2-M4RY`) | Made when the card is issued. It *is* the card until someone claims it. | In the app, Rewards → "Have a gift card code?" | Once |
| **Counter code** (`G 482 193`) | 6 digits, changes every minute, only for that card at that shop. | Typed by staff on the Redeem page with the amount | Every visit |

Neither code is the customer's PIN. The counter code generator skips any value that is currently a live PIN, and the Redeem page only ever searches gift cards, so a PIN typed there finds nothing.

## Walk-through

1. **At the counter.** Sarah pays Livity $50. Staff open Gift cards → Issue: amount, "For Mary", "From Sarah", a note, expiry (12 months default), optionally Sarah's Stampd PIN. They tick "I've taken $50 from the customer" and issue. The screen shows the claim code with Copy and Share.
2. **The buyer carries it.** If Sarah's PIN was entered, the card is also in her app under Rewards as "For Mary · not claimed yet" with a Share button. Otherwise staff write the code on the receipt or share it from the counter.
3. **Mary claims it.** Rewards → Have a gift card code? → type it → "Found it" preview → Add to my gift cards. If she doesn't have Stampd, the share message links to `stampdbahamas.com/gift/CODE`, which shows the code, the steps and the store links. Claiming also creates her membership at the shop.
4. **Mary spends it.** Opens the card → Show code → staff type the 6 digits and the amount on Redeem. Balance drops, she gets a push and a stamp for the visit. Partial spends just reduce the balance; `used` when it hits zero.
5. **The shop sees it all.** Outstanding & history: outstanding balance (the year-end number), issued and used this month, open cards with Cancel, and the ledger.

## Rules

- Before claiming, the code is a bearer thing, like a paper certificate. After claiming, only the holder's rotating code can spend it. No transfers in v1.
- Amount $5 to $500. Expiry 12 months by default, 6 or never as options.
- Redeem more than the balance → rejected, balance shown, nothing taken. Expired or another shop's code → "no card matches".
- Void only while unclaimed or active; balance goes to zero, holder gets a push. For mistakes at issue time; re-issue a fresh card instead of reversing.
- A redemption also issues a stamp (`p_earn_stamp`, default true), never letting a stamp problem undo the redemption.
- Buyer's PIN is optional. If given, the buyer sees the card under Rewards and a push when it's claimed.
- Shop closes or leaves Stampd: not Stampd's liability; copy on the Issue page says the card stays redeemable for 30 days.

## Where it lives

**Server** (`supabase/specials/005_gift_cards.sql`): `gift_cards`, `gift_card_events` (append-only), RLS reads only. RPCs: `issue_gift_card`, `peek_gift_card`, `claim_gift_card`, `gift_card_code`, `my_gift_cards`, `gift_card_detail`, `lookup_gift_card_code`, `redeem_gift_card`, `void_gift_card`, `list_gift_cards`. Permissions reuse `specials_can_manage` (owner or app admin).

**App:** Rewards tab (Gift cards section + claim row), `app/gift/claim.tsx`, `app/gift/[id].tsx` (card, history, code sheet), gift balance row on the card screen. Deep link `stampd://gift/claim?code=…`.

**Portal:** Gift cards in the sidebar with Issue / Redeem / Outstanding & history nested under it; hidden until the shop is switched on. Staff attribution and PIN gate match the stamp page.

**Admin:** Gift button per active merchant opens the same workspace with internal tabs. Admins skip the staff PIN gate.

**Website:** `/gift/:code` landing page for the shared link.

## Still open

- Pricing: included for founding shops or an add-on.
- Printed counter slips for the code (cheap, branded, the buyer leaves with something physical).
- "Pass it on" after claiming (re-mint a claim code for the remaining balance). Build only when asked.
- Network-wide card and online purchase stay out; both mean holding money.
