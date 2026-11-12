import * as v from 'valibot';
import { timestampSchema } from '@shared/schemas/common.schema';

const ROLE = v.picklist(['admin', 'staff', 'user']);

export const AdminRecordSchema = v.object({
  uid: v.pipe(v.string(), v.trim(), v.nonEmpty('Admin id is required')),
  email: v.pipe(v.string(), v.trim()),
  // Older functions sent admins only, without a role.
  role: v.optional(v.picklist(['admin', 'staff']), 'admin'),
  updatedAt: v.nullable(v.pipe(v.string(), v.trim())),
  updatedBy: v.nullable(v.pipe(v.string(), v.trim())),
});

export const ListAdminsSchema = v.array(AdminRecordSchema);

export const SetUserRoleResultSchema = v.object({
  changed: v.boolean(),
});

const auditBase = {
  id: v.pipe(v.string(), v.trim(), v.nonEmpty('Activity id is required')),
  actorUid: v.optional(v.nullable(v.string()), null),
  actorEmail: v.optional(v.pipe(v.string(), v.trim()), ''),
  at: timestampSchema,
};

/** `auditLogs` rows the Team page shows: role changes, deleted orders and deleted products. */
export const RoleAuditSchema = v.variant('action', [
  v.object({
    ...auditBase,
    action: v.literal('role.set'),
    targetUid: v.pipe(v.string(), v.trim()),
    targetEmail: v.pipe(v.string(), v.trim()),
    from: ROLE,
    to: ROLE,
  }),
  v.object({
    ...auditBase,
    action: v.literal('order.delete'),
    orderId: v.pipe(v.string(), v.trim()),
  }),
  v.object({
    ...auditBase,
    action: v.literal('product.delete'),
    name: v.optional(v.nullable(v.string()), null),
    productId: v.pipe(v.string(), v.trim()),
  }),
]);
