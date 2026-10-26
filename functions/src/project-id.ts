import { projectID } from 'firebase-functions/params';

/**
 * Active Firebase project id.
 * 2nd-gen functions often leave GCLOUD_PROJECT unset; projectID reads FIREBASE_CONFIG.
 */
export function currentProjectId(): string {
  return (process.env['GCLOUD_PROJECT'] || projectID.value() || '').trim();
}
