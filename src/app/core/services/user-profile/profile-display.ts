import type { UserProfile } from './user-profile.model';

/** Name shown in the account panel and on `/account`: profile name, then the sign-in name, then the email. */
export function accountDisplayName(
  profileName: string | null | undefined,
  authName: string | null | undefined,
  email: string,
): string {
  return profileName?.trim() || authName?.trim() || email || 'Your account';
}

/** First letter for the round account badge. */
export function accountInitial(name: string): string {
  return (name.trim().charAt(0) || '?').toLocaleUpperCase();
}

/** "Complete Your Profile" shows while the name or phone is still missing. */
export function isProfileIncomplete(profile: UserProfile | null | undefined): boolean {
  return !profile?.name?.trim() || !profile?.phone?.trim();
}
