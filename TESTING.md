# Stampd Bahamas — Beta Test Guide

A full end-to-end test script: set up realistic merchant and customer accounts,
then walk every flow a real user will hit. Run it top to bottom once, then keep
it around as a regression checklist before each new TestFlight build.

**What you need before starting:**

- [ ] The latest build installed from TestFlight on a real iPhone
- [ ] A laptop/desktop browser for the merchant dashboard: https://www.stampdbahamas.com
- [ ] Access to the Supabase dashboard (for approval fallback + verifying data)
- [ ] Your Gmail inbox open — all test accounts use plus-addressing (below)

**The email trick:** Gmail treats `knowlesjr95+anything@gmail.com` as a separate
address that still lands in your normal inbox. Supabase sees each as a distinct
account, so you can create every test account below without needing new inboxes.

---

## 1. The cast of accounts

| Account | Email | Type | Purpose |
|---|---|---|---|
| Da Coffee Spot | `knowlesjr95+coffee@gmail.com` | Business merchant | Simple 1-tier card (e.g. 10 stamps → free coffee) |
| Island Cutz Barbershop | `knowlesjr95+shop@gmail.com` | Business merchant | Multi-tier card (e.g. 5 → 25% off, 10 → free cut) |
| Marcus the Barber | `knowlesjr95+marcus@gmail.com` | Individual / Pro | Tests the Pros flow: trade, workplace, circular avatar, navy card |
| Ana (customer) | `knowlesjr95+ana@gmail.com` | Consumer (mobile) | Primary test customer, joins all 3 programs |
| Ben (customer) | `knowlesjr95+ben@gmail.com` | Consumer (mobile) | Second customer: sign-out/sign-in switching, cache isolation |

Use one password for everything (it's a test bench). Write it down.

---

## 2. Phase 1 — Merchant setup (web)

Repeat for all three merchants. Expected time: ~5 min each.

### 2.1 Register + confirm

- [ ] Go to `stampdbahamas.com/merchants` → sign up with the `+coffee` email and a business name
- [ ] "Check your email" screen appears
- [ ] Open the confirmation email → click the link
- [ ] You land on `stampdbahamas.com/confirmed` and see **"Email confirmed"** with a **Continue to dashboard** button (NOT a blank page, NOT a login form that ignores you)

### 2.2 Onboarding wizard

- [ ] Step 1 (Welcome): for the two shops pick **"I run a business"**; for Marcus pick **"I work for myself"**
- [ ] Step 2 (Card): Coffee Spot = single tier (10 stamps → "Free Coffee", visit label "drink"). Island Cutz = two tiers (5 → "25% Off", 10 → "Free Haircut", label "cut"). Marcus = single tier (8 → "Free Cut", label "cut")
- [ ] Live preview matches what you configured (teal card for businesses, navy for Marcus)
- [ ] Step 3 (Profile): fill name, category/trade, address (note: address is NOT required for Marcus — confirm the form doesn't demand it). For Marcus set a workplace ("@ Island Cutz, Freeport") and upload a photo
- [ ] Step 4 shows the setup summary with "Pending approval"

### 2.3 Approve the merchants

New merchants are `is_active = false` and cannot stamp until approved.

- [ ] Sign in with your admin account and open `stampdbahamas.com/admin` → approve all three
- [ ] Fallback if admin access misbehaves (that's a bug — log it): Supabase → Table Editor → `merchants` → set `is_active = true`
- [ ] Back in each merchant dashboard: the "pending approval" banner is gone and `/stamp` is usable

---

## 3. Phase 2 — Customer setup (mobile)

- [ ] Open the TestFlight build → welcome screen (image, "Grand Bahama" chip) looks right
- [ ] Sign up as Ana (`+ana`) — first/last name, email, password
- [ ] **iOS should NOT hijack the password field with the yellow "strong password" overlay** — you type your own password
- [ ] Terms checkbox is required before the button works
- [ ] "Check your email" state appears → open the email on ANY device (try the laptop deliberately) → link lands on `stampdbahamas.com/confirmed` → "open the Stampd app and sign in"
- [ ] Back in the app: sign in → you land on Home with **no flash of the welcome screen** in between
- [ ] Home shows your PIN card — tap to reveal/mask, tap copy, toast appears
- [ ] Repeat for Ben on the same phone later (Phase 6) or a second device now

---

## 4. Phase 3 — The core loop: stamping

Merchant side: laptop on `/stamp`. Customer side: phone on Home (PIN visible).

### 4.1 Stamp by personal PIN

- [ ] On Coffee Spot's `/stamp`, type Ana's 6-digit PIN → her name and card status appear
- [ ] Issue 1 stamp → success screen with new count
- [ ] On Ana's phone: pull to refresh → stamp count updated on Home stats, hero carousel slide, and card detail
- [ ] Ana got an in-app notification for the stamp
- [ ] Immediately try to stamp Ana again → **cooldown warning** appears ("stamped X seconds ago") with an override option
- [ ] Use the override → stamp goes through (you'll need this to fill cards fast in Phase 5)
- [ ] Try a garbage PIN (000000) → clean "No customer found" error, no crash

### 4.2 Guest PIN (customer-entered code)

- [ ] On `/stamp`, generate a guest PIN → code + expiry shown, copy works
- [ ] Ana: open the Coffee Spot card in the app → enter the code → stamp lands
- [ ] Try the same code again → "invalid or expired" error (single use)
- [ ] **Double-count check:** after a guest-PIN stamp, the card count went up by exactly 1 (this path had a double-counting bug that was fixed — verify it stayed fixed)

### 4.3 Multiple cards

- [ ] Stamp Ana from all three merchants
- [ ] Discover: all three appear; Marcus shows under the **Pros** chip with a circular photo and his workplace; "with Marcus" style copy on his detail page
- [ ] My Cards: three cards stack, swipe/tap to expand, no white flash or stretch on the bounce
- [ ] Home hero carousel: card slides + Get Started slides **auto-advance every ~4s**, touching one pauses it, it resumes ~10s after you let go

---

## 5. Phase 4 — Full card and reward redemption

- [ ] Fill Ana's Coffee Spot card to 10/10 (use cooldown override repeatedly)
- [ ] At 10/10: hero slide flips to "Claim your Free Coffee"; Rewards tab shows a ticket, "Ready to redeem" count is 1
- [ ] Island Cutz multi-tier: at 5 stamps the 25%-off tier reward appears while the card keeps counting toward 10
- [ ] **Tier editing survives:** on the dashboard `/card` page, edit the tiers (change a title, add a third tier) → save → reload the page and check the mobile card detail: ALL tiers are still there with the right thresholds (this page used to silently collapse multi-tier cards into one tier)
- [ ] Tap the reward ticket → "Show this to redeem" sheet opens (this is what a customer shows at the counter)
- [ ] Merchant side: Customers page → open Ana's drawer → pending reward is listed → mark it **redeemed**
- [ ] Ana's app: reward moves to history as "Redeemed", she gets a notification
- [ ] Ana's card reset for a new cycle; her lifetime totals (Home stats "Rewards"/"Stamps") did NOT reset
- [ ] Merchant dashboard/analytics reflect the stamps + redemption

---

## 6. Phase 5 — Auth flows (the fragile stuff)

### 6.1 Password reset (consumer, web-handled)

- [ ] App → Sign in → "Forgot password" → enter Ana's email → "Check your email"
- [ ] Open the email link on the laptop → `stampdbahamas.com/reset-password` shows the form
- [ ] Set a new password → success says **"open the Stampd app and sign in"** — it must NOT redirect to the merchant dashboard
- [ ] **Critical:** go to `stampdbahamas.com/dashboard` in that same browser tab right after — you should be signed out / sent to login, and under no circumstances should a merchant account get created for Ana (check Supabase `merchants` table: no row for Ana)
- [ ] Sign into the app with the NEW password → works. Old password → rejected
- [ ] Open a reset link a second time (or an old one) → "Link expired" state, not a broken form

### 6.2 Wrong door

- [ ] Sign in at `stampdbahamas.com/login` with Ana's credentials → you get the **"This dashboard is for businesses"** screen with a sign-out button — not merchant onboarding
- [ ] Again check `merchants` table: still no row for Ana

### 6.3 Merchant password reset

- [ ] Same reset flow with Coffee Spot's email → after resetting, it DOES continue to the dashboard

### 6.4 Session persistence + switching

- [ ] Force-quit the app, reopen → still signed in as Ana, straight to Home, no welcome flash
- [ ] Sign out → welcome screen appears **once** (no double-render)
- [ ] Sign in as Ben → Home shows Ben's (empty) data — **none of Ana's cards, stats, or PIN leak through** (cache isolation)
- [ ] Sign back in as Ana → everything's still there

### 6.5 Counter mode (kiosk)

- [ ] Dashboard Settings → Counter mode → "Turn on counter mode" → you land on the Stamp page with a minimal header ("Counter mode" badge, Exit button) and no sidebar
- [ ] Try to reach `/dashboard`, `/customers`, `/settings` by typing the URL → every one of them bounces you straight back to `/stamp`
- [ ] Stamping still works fully: staff picker, staff PIN (if required), quantity, guest PIN
- [ ] Refresh the page → still locked (survives reload)
- [ ] Exit with a WRONG password → "Incorrect password", still locked
- [ ] Exit with the right password → full dashboard is back
- [ ] Check another browser/device on the same account while one is locked → it is NOT locked (counter mode is per-device)

### 6.6 Account deletion

- [ ] Ben: Profile → delete account → confirm → signed out to welcome
- [ ] Try signing in as Ben → rejected (account gone)
- [ ] Supabase: Ben's rows are gone from `users`/`memberships`

---

## 7. Phase 6 — Rough conditions

- [ ] **Offline counter:** merchant laptop/tablet — kill the wifi, enter a customer PIN on `/stamp` → stamp queues with a clear offline notice; restore wifi → queue flushes automatically and the stamp appears on the customer's phone
- [ ] **Dead zone app behavior:** phone in airplane mode → app opens, cached Home/Cards data still renders (no infinite spinners, no crash); restore network → pull to refresh works
- [ ] **Slow images:** first open of Discover — logos fade in; second visit — instant (cache)
- [ ] **Push notifications**: after installing the build made AFTER the APNs key was added — sign in, tap Allow on the permission prompt, then verify a row exists in `push_tokens`; stamp Ana while the app is backgrounded → lock-screen push arrives; fill her card → reward push arrives
- [ ] **Merchant nudge push**: Customers → open a customer → send nudge → push arrives on their phone; a second nudge within 14 days is refused (cooldown)
- [ ] **Auto "almost there" reminder** (runs daily 16:30 UTC): to force one, run `select public.send_progress_reminders(0.0, 0)` in Supabase SQL editor → customers with part-filled cards get a "So close at …" push + feed entry (each user/merchant pair is then on the shared 14-day cooldown)

---

## 8. Sweep before sign-off

- [ ] Visit labels pluralize correctly everywhere ("1 cut", "3 cuts", never "classs")
- [ ] Merchant brand colors render on cards with readable text (try a light card color from `/card` to test adaptive text)
- [ ] Cover photo: upload one in dashboard Settings → Business profile → it appears behind the header on that merchant's page in the app (replace it once too — the app must show the NEW photo, not a cached old one)
- [ ] No screen shows raw error JSON, "[object Object]", or a dead spinner anywhere in the run
- [ ] New app icon on the home screen (stamp card, not the star), splash shows the card mark on teal
- [ ] Merchant PWA: on a phone, dashboard Settings → "Stampd on your phone" → install (iOS: Safari Share → Add to Home Screen) → opens full screen from its own stamp-card icon, stamping + counter mode work inside it

---

## 9. Bug log

Copy a row per issue as you go. Severity: **P0** blocks launch, **P1** fix before public beta, **P2** cosmetic/later.

| # | Where (screen/flow) | What happened | Expected | Severity |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |

**When you hit something:** screenshot it, note which account you were on and the
exact step number above. Sentry catches crashes automatically, but UX bugs only
get caught here.
