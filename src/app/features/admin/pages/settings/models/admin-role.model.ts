import * as v from 'valibot';
import {
  AdminRecordSchema,
  RoleAuditSchema,
  SetUserRoleResultSchema,
} from '../schemas/admin-role.schema';

export type AdminRecord = v.InferOutput<typeof AdminRecordSchema>;
export type RoleAudit = v.InferOutput<typeof RoleAuditSchema>;
export type SetUserRoleResult = v.InferOutput<typeof SetUserRoleResultSchema>;
export type AssignableRole = 'admin' | 'user';

export interface AdminTableRow {
  readonly id: string;
  readonly email: string;
  readonly since: string;
  readonly grantedBy: string;
  readonly action: string;
}
