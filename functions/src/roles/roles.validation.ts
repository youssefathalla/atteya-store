import { HttpsError } from 'firebase-functions/v2/https';
import type { Role } from '../auth/require-role.js';

const MAX_EMAIL_LENGTH = 254;

// Bounded quantifiers only, so the check stays linear.
const EMAIL_PATTERN = /^[a-z0-9._%+-]{1,64}@[a-z0-9.-]{1,190}\.[a-z]{2,24}$/i;

export interface SetUserRoleInput {
  readonly email: string;
  readonly role: Role;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseSetUserRoleInput(data: unknown): SetUserRoleInput {
  if (!isRecord(data) || typeof data['email'] !== 'string' || typeof data['role'] !== 'string') {
    throw new HttpsError('invalid-argument', 'Enter an email address and choose Admin, Staff or no access.');
  }

  const email = data['email'].trim().toLowerCase();
  const role = data['role'];

  if (email.length === 0 || email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.');
  }

  if (role !== 'admin' && role !== 'staff' && role !== 'user') {
    throw new HttpsError('invalid-argument', 'Choose Admin, Staff or no access.');
  }

  return { email, role };
}
