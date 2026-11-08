import {
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
  WithFieldValue,
} from 'firebase/firestore';
import * as v from 'valibot';

/**
 * Creates a type-safe FirestoreDataConverter validated by a Valibot schema.
 * Automatically injects the document `id` during deserialization.
 * Throws a Valibot ValidationError if Firestore data doesn't conform to the schema.
 *
 * A `serverTimestamp()` written from this browser is not known until the server
 * confirms it. Firestore still delivers the change to listeners at once, with that
 * field set to `null` by default, which no timestamp schema accepts. The converter
 * reads such fields as Firestore's local estimate instead (`serverTimestamps:
 * 'estimate'`); the confirmed snapshot replaces it a moment later. A caller can still
 * pass its own `serverTimestamps` option to `data()`.
 */
export function createValibotConverter<T>(
  schema: v.BaseSchema<unknown, T, v.BaseIssue<unknown>>,
): FirestoreDataConverter<T> {
  return {
    toFirestore(modelObject: WithFieldValue<T>) {
      return modelObject as Record<string, unknown>;
    },
    fromFirestore(
      snapshot: QueryDocumentSnapshot,
      options?: SnapshotOptions,
    ): T {
      const data = snapshot.data({
        ...options,
        serverTimestamps: options?.serverTimestamps ?? 'estimate',
      });
      return v.parse(schema, { ...data, id: snapshot.id });
    },
  };
}
