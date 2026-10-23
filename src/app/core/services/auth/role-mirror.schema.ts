import * as v from 'valibot';

/** `roles/{uid}` mirror written by the Admin SDK. The claim stays the source of truth. */
export const RoleMirrorSchema = v.object({
  role: v.picklist(['admin', 'user']),
  email: v.optional(v.string(), ''),
});

export type RoleMirror = v.InferOutput<typeof RoleMirrorSchema>;

export function parseRoleMirror(data: unknown): RoleMirror | null {
  const parsed = v.safeParse(RoleMirrorSchema, data);
  return parsed.success ? parsed.output : null;
}
