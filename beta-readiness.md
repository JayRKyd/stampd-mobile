# Stampd — Launch Checklist

_Final state: July 11, 2026. Code is done; everything below needs YOUR accounts or eyes._

## Code status: COMPLETE ✅

Both repos type-check clean; web production build verified (`vite build` passes).

- Mobile: every screen on the design system · auth flow w/ forgot-password ·
  account deletion · individuals ("Pros") support · SWR data cache ·
  expo-image caching · transition bugs fixed · splash/icon/notification
  colors on new teal · npm audit critical+high cleared · dead deps removed ·
  **session tokens encrypted (LargeSecureStore — AES key in keychain)**
- Web: all pages professional · brand aligned w/ mobile · onboarding
  production-ready · upload-side image resizing · RLS hardening migrations ·
  Sentry wired (needs DSN env) · vercel.json SPA rewrites in place ·
  **offline stamp queue at the counter (queue locally, auto-deliver on reconnect)**

---

## 1. Supabase — ✅ DONE July 11 (one click left)

- [x] Stamp counters verified: `on_stamp_issued` trigger handles all
      bookkeeping (current/total stamps, rewards, cycles). Main path correct.
- [x] **Bug found & fixed:** `redeem_generated_pin` double-counted (manual
      bookkeeping + trigger both ran) and a legacy overload made the RPC
      ambiguous — replaced with trigger-delegating version, legacy dropped
      (migration `fix_redeem_generated_pin_double_count`)
- [x] `delete_own_account` RPC created (authenticated-only)
- [x] `merchants.cover_image_url` column added
- [x] Advisors re-run: last `anon` EXECUTE hole (`redeem_customer_reward`)
      revoked. Remaining warns are intentional (app RPCs gate internally;
      public bucket listing accepted)
- [ ] Authentication → Attack Protection → enable leaked password protection
      (dashboard toggle — can't be done via SQL)

## 2. Deploy web (Vercel, ~15 min)

- [ ] Import repo, root directory `vite-react` (build: `npm run build`, output `dist`)
- [ ] Env vars: copy from local `.env.local` (Supabase URL + anon key) and set
      `VITE_SENTRY_DSN` (create the Sentry project if not yet)
- [ ] After deploy: Supabase → Auth → URL Configuration → set Site URL to the
      deployed domain (this makes mobile password-reset emails land correctly)

## 3. Mobile build pipeline (EAS, ~30 min first time)

- [ ] `npm i -g eas-cli` → `eas login` → `eas init` (fills the empty projectId)
- [ ] Add crash reporting IN THE SAME STEP (it needs a dev build; it will not
      run in Expo Go — that's why it isn't installed yet):
      `npx expo install @sentry/react-native` → add `"@sentry/react-native/expo"`
      to app.json plugins with your DSN → `Sentry.init` at top of `app/_layout.tsx`
- [ ] `eas build --platform ios --profile preview` → TestFlight
      (`eas submit`), Android APK for sideload testing
- [ ] Store listing needs: privacy policy URL (Apple requires it), screenshots

## 4. Device pass (your eyes, one session)

- [ ] Full loop on iPhone: welcome photo framing → sign up → OTP → Home →
      wallet bounce → card detail → stamp via portal → notification → sign out
- [ ] Same loop once on an Android phone (never tested on Android)
- [ ] Marcus Brown (test Pro): Pros chip, circle avatar, "Works at…" line,
      Directions button
- [ ] Account deletion end-to-end (after the RPC exists)
- [ ] Large accessibility font size — spot-check Home + Stamp pages for clipping

## 5. Content (rolling, not blocking)

- [ ] Merchant cover photos (~1200×600) once the column exists
- [ ] Real merchant descriptions, colors, logos for the beta cohort
- [ ] Verify admin approval flow end-to-end once before first stranger signs up
      (the "~24 hours" promise in onboarding depends on it)

## Known accepted gaps (documented, not blocking beta)

- 90-day trial has no billing mechanism behind it yet
- 16 moderate npm advisories — all Expo dev-server chain, not shipped code
- Offline queue covers PIN stamping only (guest PINs + lookups still need
  network — inherent, they're server-validated)

## Note for mobile testers after this update

The SecureStore migration invalidates existing sessions once — everyone
signs in again on next launch. New sessions are encrypted from then on.
