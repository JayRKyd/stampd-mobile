// Name profanity check. Names are a special case (the "Scunthorpe problem"):
// real names legitimately contain rude substrings (Cassandra, Dickson,
// Hitchcock), so short/ambiguous words are only blocked when a whole name
// token IS the word, while long unambiguous profanity is blocked anywhere.

// Blocked wherever they appear inside a name.
const SUBSTRING_BLOCKED = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'asshole',
  'motherfuck', 'dickhead', 'pussy', 'whore', 'wanker', 'blowjob', 'handjob',
  'bullshit', 'dildo', 'jackass', 'dumbass',
];

// Blocked only when the entire name token is exactly this word.
const EXACT_BLOCKED = new Set([
  'ass', 'arse', 'fag', 'fags', 'cock', 'cocks', 'dick', 'dicks', 'tit',
  'tits', 'cum', 'sex', 'anal', 'anus', 'hoe', 'slut', 'sluts', 'twat',
  'prick', 'penis', 'vagina', 'porn', 'rape', 'rapist', 'nazi', 'hitler',
  'retard', 'boob', 'boobs', 'nut', 'nuts', 'butthole', 'scrotum', 'semen',
]);

// Common letter/number swaps used to sneak words past filters.
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
  '@': 'a', '$': 's', '!': 'i',
};

function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .split('')
    .map((c) => LEET[c] ?? c)
    .join('')
    .replace(/[^a-z\s'-]/g, '');
}

// Collapse letter runs of 3+ so "fuuuuck" still matches "fuck".
function collapseRuns(v: string): string {
  return v.replace(/([a-z])\1{2,}/g, '$1');
}

export function isProfaneName(raw: string): boolean {
  const normalized = normalize(raw);
  const flat = normalized.replace(/[\s'-]/g, '');
  const candidates = [flat, collapseRuns(flat)];

  for (const value of candidates) {
    for (const word of SUBSTRING_BLOCKED) {
      if (value.includes(word)) return true;
    }
  }

  const tokens = normalized.split(/[\s'-]+/).filter(Boolean);
  for (const token of tokens) {
    if (EXACT_BLOCKED.has(token) || EXACT_BLOCKED.has(collapseRuns(token))) return true;
  }

  return false;
}

// Shared validation for the name forms. Returns an error message or null.
export function nameProfanityError(first: string, last: string): string | null {
  if (isProfaneName(first) || isProfaneName(last)) {
    return "That name can't be used — merchants and their staff will see it. Please use your real name.";
  }
  return null;
}
