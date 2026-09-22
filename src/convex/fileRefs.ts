// Storage-file bookkeeping. Export actions record the id of every file they
// write as `file:<id>` in the audit trail; "Delete all my data" then removes
// those blobs too, so deletion really is complete rather than just row-level.
//
// Pure module (no Convex imports) so it is unit-testable.

const FILE_REF = /file:([A-Za-z0-9_]+)/g;

/** Tag a human-readable audit detail with the id of the file it produced. */
export function withFileRef(detail: string, storageId: string): string {
  return `${detail} · file:${storageId}`;
}

/** Every storage id referenced by a list of audit details. */
export function parseFileRefs(details: (string | undefined)[]): string[] {
  const ids = new Set<string>();
  for (const detail of details) {
    if (!detail) continue;
    for (const match of detail.matchAll(FILE_REF)) ids.add(match[1]);
  }
  return [...ids];
}
