/** Shared composite-index helpers for guard and index check. */

export function normalizeFields(fields) {
  return fields
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => {
      if (f.order) return `${f.fieldPath}:${f.order}`;
      if (f.arrayConfig) return `${f.fieldPath}:array:${f.arrayConfig}`;
      if (f.vectorConfig) return `${f.fieldPath}:vector:${JSON.stringify(f.vectorConfig)}`;
      return `${f.fieldPath}:?`;
    });
}

export function compositeKey(idx) {
  const scope = idx.queryScope ?? 'COLLECTION';
  const fields = normalizeFields(idx.fields ?? []);
  return `${idx.collectionGroup}|${scope}|${fields.join(';')}`;
}

export function formatComposite(idx) {
  const parts = (idx.fields ?? [])
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => {
      if (f.order) return `${f.fieldPath} ${f.order}`;
      if (f.arrayConfig) return `${f.fieldPath} ${f.arrayConfig}`;
      if (f.vectorConfig) return `${f.fieldPath} vector`;
      return f.fieldPath;
    });
  return `${idx.collectionGroup} (${parts.join(', ')})`;
}
