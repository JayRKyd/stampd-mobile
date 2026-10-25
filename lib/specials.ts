import { supabase } from '@/lib/supabase';
import { useCachedData } from '@/lib/dataCache';
import { useIsland } from '@/lib/island';

// Everything merchants have posted that is running today. One read feeds the
// Today pill and view on Home, the carousel slide, the island view, the card
// and shop page blocks, and the Discover dot.

export type Special = {
  id: string;
  merchant_id: string;
  business_name: string;
  logo_url: string | null;
  card_color: string;
  kind: 'special' | 'update';
  text: string;
  image_url: string | null;
  earns_stamp: boolean;
  starts_on: string;   // YYYY-MM-DD
  ends_on: string;     // YYYY-MM-DD
  ends_at_time: string | null; // HH:MM:SS
  tag: 'SPECIAL' | 'TODAY' | 'UNTIL' | 'ENDS' | 'COUNTDOWN';
  sent_at: string;
  is_mine: boolean;
};

const CACHE_KEY = 'specials-today';

function localYmd(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Cached rows can be a day old or from an older app shape; keep only what
// is well-formed and still inside its window on this device's clock.
function sane(rows: unknown): Special[] {
  if (!Array.isArray(rows)) return [];
  const today = localYmd();
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return rows.filter((r: any): r is Special => {
    if (!r || typeof r !== 'object') return false;
    if (typeof r.id !== 'string' || typeof r.merchant_id !== 'string') return false;
    if (typeof r.text !== 'string' || typeof r.business_name !== 'string') return false;
    if (typeof r.starts_on !== 'string' || typeof r.ends_on !== 'string') return false;
    if (today < r.starts_on || today > r.ends_on) return false;
    if (r.ends_at_time && today === r.ends_on && hhmm >= String(r.ends_at_time).slice(0, 5)) return false;
    return true;
  });
}

export function useSpecialsToday() {
  // One board per island; the cache key keeps the two apart
  const { island } = useIsland();
  const { data, isLoading, refresh } = useCachedData<{ rows: Special[] }>(`${CACHE_KEY}:${island}`, async () => {
    const { data: rows, error } = await supabase.rpc('specials_today', { p_island: island });
    if (error) return null; // keep whatever was cached
    return { rows: sane(rows) };
  });
  const specials = sane(data?.rows);
  const mine = specials.filter(s => s.is_mine);
  const others = specials.filter(s => !s.is_mine);
  return { specials, mine, others, isLoading, refresh };
}

export function specialForMerchant(specials: Special[], merchantId: string | null | undefined): Special | null {
  if (!merchantId) return null;
  return specials.find(s => s.merchant_id === merchantId) ?? null;
}

// The gold tag text. Only ever says what the merchant chose.
export function tagLabel(s: Special): string {
  const to12 = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    const hour = ((h + 11) % 12) + 1;
    return `${hour}${m ? ':' + String(m).padStart(2, '0') : ''}${h >= 12 ? 'PM' : 'AM'}`;
  };
  if (s.tag === 'UNTIL' && s.ends_at_time) return `UNTIL ${to12(s.ends_at_time)}`;
  if (s.tag === 'ENDS' && s.ends_on !== s.starts_on) {
    const d = new Date(s.ends_on + 'T12:00:00');
    return `ENDS ${d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase()}`;
  }
  if (s.tag === 'COUNTDOWN') {
    const end = new Date(s.ends_on + 'T12:00:00');
    const today = new Date(localYmd() + 'T12:00:00');
    const left = Math.max(1, Math.round((end.getTime() - today.getTime()) / 86400000) + 1);
    return `${left} DAY${left === 1 ? '' : 'S'} LEFT`;
  }
  return s.tag === 'TODAY' ? 'TODAY' : 'SPECIAL';
}

export function postedWhen(s: Special): string {
  const d = new Date(s.sent_at);
  const t = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  return localYmd(d) === localYmd() ? `Posted ${t}` : `Posted ${d.toLocaleDateString('en-US', { weekday: 'short' })} ${t}`;
}

export function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}
