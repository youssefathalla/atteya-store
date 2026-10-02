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
      const data = snapshot.data(options);
      return v.parse(schema, { ...data, id: snapshot.id });
    },
  };
}
