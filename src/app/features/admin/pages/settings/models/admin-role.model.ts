import * as v from 'valibot';
import { AdminRecordSchema, RoleAuditSchema, SetUserRoleResultSchema } from '../schemas/admin-role.schema';

export type AdminRecord = v.InferOutput<typeof AdminRecordSchema>;
export type RoleAudit = v.InferOutput<typeof RoleAuditSchema>;
export type SetUserRoleResult = v.InferOutput<typeof SetUserRoleResultSchema>;
/** Admin: the whole dashboard. Staff: the same, except deleting orders and this Team page. */
export type TeamRole = 'admin' | 'staff';
export type AssignableRole = TeamRole | 'user';

export interface AdminTableRow {
  readonly id: string;
  readonly email: string;
  readonly role: TeamRole;
  readonly roleLabel: string;
  readonly since: string;
  readonly grantedBy: string;
  readonly action: string;
}
