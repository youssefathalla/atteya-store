import * as v from 'valibot';
import { timestampSchema } from '@shared/schemas/common.schema';

export const AdminRecordSchema = v.object({
  uid: v.pipe(v.string(), v.trim(), v.nonEmpty('Admin id is required')),
  email: v.pipe(v.string(), v.trim()),
  updatedAt: v.nullable(v.pipe(v.string(), v.trim())),
  updatedBy: v.nullable(v.pipe(v.string(), v.trim())),
});

export const ListAdminsSchema = v.array(AdminRecordSchema);

export const SetUserRoleResultSchema = v.object({
  changed: v.boolean(),
});

export const RoleAuditSchema = v.object({
  id: v.pipe(v.string(), v.trim(), v.nonEmpty('Activity id is required')),
  action: v.optional(v.string(), 'role.set'),
  targetUid: v.pipe(v.string(), v.trim()),
  targetEmail: v.pipe(v.string(), v.trim()),
  from: v.picklist(['admin', 'user']),
  to: v.picklist(['admin', 'user']),
  actorUid: v.optional(v.nullable(v.string()), null),
  actorEmail: v.optional(v.pipe(v.string(), v.trim()), ''),
  at: timestampSchema,
});
