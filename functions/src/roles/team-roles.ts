import type { Role } from '../auth/require-role.js';

/** Roles that open the dashboard. Kept as a list so a Firestore `in` query can use it. */
export const TEAM_ROLES = ['admin', 'staff'] as const;

export type TeamRole = (typeof TEAM_ROLES)[number];

export function isTeamRole(value: unknown): value is TeamRole {
  return value === 'admin' || value === 'staff';
}

const RANK: Record<Role, number> = { user: 0, staff: 1, admin: 2 };

/**
 * The change takes the store's last admin away (to staff or to a normal account).
 * `otherAdmins` counts admins other than the person being changed.
 */
export function isLastAdminRemoval(before: Role, after: Role, otherAdmins: number): boolean {
  return before === 'admin' && after !== 'admin' && otherAdmins === 0;
}

/**
 * Less access than before: end that person's current sign-in, because their ID token keeps the
 * old `role` claim for up to an hour (an admin made staff could otherwise still delete orders).
 */
export function endsSession(before: Role, after: Role): boolean {
  return RANK[after] < RANK[before];
}
