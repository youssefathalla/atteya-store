import * as v from 'valibot';
import { TimestampSchema } from '@shared/schemas/common.schema';

export const UserProfileSchema = v.object({
  termsAcceptedAt: TimestampSchema,
  termsVersion: v.pipe(v.string(), v.minLength(1), v.maxLength(64)),
  marketingOptIn: v.boolean(),
  marketingOptInAt: TimestampSchema,
});
