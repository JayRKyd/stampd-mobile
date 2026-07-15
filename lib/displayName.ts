export type UserNameFields = {
  first_name?: string | null;
  last_name?: string | null;
};

export function firstName(user: UserNameFields | null | undefined, fallback = 'Welcome'): string {
  const name = user?.first_name?.trim();
  return name || fallback;
}

export function fullName(user: UserNameFields | null | undefined, fallback = 'Not set'): string {
  const combined = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return combined || fallback;
}

export function hasCompleteName(user: UserNameFields | null | undefined): boolean {
  return !!(user?.first_name?.trim() && user?.last_name?.trim());
}
