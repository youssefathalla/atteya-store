import { Timestamp } from 'firebase/firestore';
import { firebaseErrors } from '@shared/utils/firebase/firebase-errors';
import { AdminRecord, AdminTableRow, RoleAudit } from '../models/admin-role.model';

const WHEN_FORMAT = new Intl.DateTimeFormat('en', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return WHEN_FORMAT.format(date);
}

export function adminSinceLabel(updatedAt: string | null): string {
  if (!updatedAt) return 'Not recorded';
  return formatDate(new Date(updatedAt));
}

export function grantedByLabel(updatedBy: string | null): string {
  if (!updatedBy) return 'Not recorded';
  if (updatedBy === 'cli') return 'Setup script';
  if (updatedBy === 'claim') return 'Already an admin';
  return updatedBy;
}

export function toAdminTableRow(admin: AdminRecord): AdminTableRow {
  return {
    id: admin.uid,
    email: admin.email || 'No email on the account',
    since: adminSinceLabel(admin.updatedAt),
    grantedBy: grantedByLabel(admin.updatedBy),
    action: '',
  };
}

function actorLabel(actorEmail: string): string {
  if (actorEmail === 'cli') return 'The setup script';
  if (!actorEmail) return 'An admin';
  return actorEmail;
}

export function describeRoleChange(entry: RoleAudit): string {
  const actor = actorLabel(entry.actorEmail);
  if (entry.to === 'admin') {
    return `${actor} gave ${entry.targetEmail} admin access.`;
  }
  return `${actor} removed admin access from ${entry.targetEmail}.`;
}

export function formatAuditWhen(value: RoleAudit['at']): string {
  if (value instanceof Timestamp) return formatDate(value.toDate());
  if (value instanceof Date) return formatDate(value);
  return formatDate(new Date(value));
}

function isSdkStatusMessage(message: string, bareCode: string): boolean {
  const normalized = message.trim().toLowerCase();
  const code = bareCode.toLowerCase();
  return normalized === code || normalized.startsWith(`${code} (`) || normalized.startsWith(`${code}:`);
}

export function roleActionError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && 'code' in error) {
    const message = (error as { message?: unknown }).message;
    const code = (error as { code?: unknown }).code;
    if (typeof message === 'string' && typeof code === 'string' && code.startsWith('functions/')) {
      const bareCode = code.slice('functions/'.length);
      if (message.length > 0 && !isSdkStatusMessage(message, bareCode)) {
        return message;
      }
      if (bareCode === 'internal' || bareCode === 'unknown' || bareCode === 'unavailable') {
        return 'That did not work. Please try again.';
      }
    }
  }
  return firebaseErrors(error);
}
