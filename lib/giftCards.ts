import { Share } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useCachedData } from '@/lib/dataCache';

// Gift cards: the shop sells one at the counter, the buyer carries a claim
// code, the recipient claims it here, and the counter spends from it with a
// 6-digit code that changes every minute. Stampd only keeps the numbers.

export type GiftCard = {
  id: string;
  merchant_id: string;
  business_name: string;
  logo_url: string | null;
  card_color: string;
  for_name: string | null;
  from_name: string | null;
  note: string | null;
  amount_cents: number;
  balance_cents: number;
  status: 'unclaimed' | 'active' | 'used' | 'void';
  claim_code: string | null; // only while unclaimed
  claimed_at: string | null;
  expires_at: string | null;
  created_at: string;
  is_mine: boolean;
  is_sent: boolean;
};

export type GiftEvent = {
  id: string;
  type: 'issue' | 'claim' | 'redeem' | 'void';
  amount_cents: number | null;
  balance_after_cents: number | null;
  created_at: string;
  staff_name: string | null;
};

// Cached rows can be from an older app shape; keep only well-formed cards
export function saneCard(r: unknown): r is GiftCard {
  const c = r as any;
  return !!c && typeof c === 'object'
    && typeof c.id === 'string' && typeof c.merchant_id === 'string'
    && typeof c.business_name === 'string'
    && typeof c.amount_cents === 'number' && typeof c.balance_cents === 'number'
    && typeof c.status === 'string';
}

function saneList(v: unknown): GiftCard[] {
  return Array.isArray(v) ? v.filter(saneCard) : [];
}

export function useMyGiftCards() {
  const { data, isLoading, refresh } = useCachedData<{ held: GiftCard[]; sent: GiftCard[] }>('gift-cards', async () => {
    const { data, error } = await supabase.rpc('my_gift_cards');
    if (error) return null; // keep whatever was cached
    const d = (data ?? {}) as any;
    return { held: saneList(d.held), sent: saneList(d.sent) };
  });
  const held = saneList(data?.held);
  const sent = saneList(data?.sent);
  return { held, sent, active: held.filter(c => c.status === 'active'), isLoading, refresh };
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Typed claim code → "XXXX-XXXX", uppercase, no ambiguous characters allowed in. */
export function formatClaimInput(raw: string): string {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return clean.length > 4 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/** The counter code, spaced like a PIN with a G so staff know which box it goes in. */
export function giftCodeDisplay(code: string): string {
  return `G ${code.slice(0, 3)} ${code.slice(3)}`;
}

export function shareGiftCard(card: GiftCard) {
  const code = card.claim_code ?? '';
  const who = card.from_name ? `${card.from_name} sent you` : "You've got";
  const message =
    `${who} a ${money(card.amount_cents)} gift card for ${card.business_name} on Stampd.\n\n` +
    `Your code: ${code}\n\n` +
    `Open Stampd, go to Rewards, tap "Have a gift card code?" and type it in. ` +
    `Don't have Stampd yet? Get it here: https://stampdbahamas.com/gift/${code.replace('-', '')}`;
  return Share.share({ message }).catch(() => {});
}
