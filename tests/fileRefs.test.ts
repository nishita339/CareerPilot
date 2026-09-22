import { describe, expect, test } from "bun:test";
import { parseFileRefs, withFileRef } from "../src/convex/fileRefs";

describe("file references in the audit trail", () => {
  test("tags a detail string with the stored file id", () => {
    const detail = withFileRef("Student_Applications_Master.xlsx · 12 rows", "kg2abc123");
    expect(detail).toContain("kg2abc123");
    expect(detail).toContain("12 rows");
    expect(parseFileRefs([detail])).toEqual(["kg2abc123"]);
  });

  test("collects every id across rows and de-duplicates", () => {
    const refs = parseFileRefs([
      withFileRef("export A", "id_one"),
      undefined,
      withFileRef("export B", "id_two"),
      "scored 3 jobs",
      withFileRef("export A again", "id_one"),
    ]);
    expect(refs.sort()).toEqual(["id_one", "id_two"]);
  });

  test("ignores rows with no reference", () => {
    expect(parseFileRefs(["applied (email) · Acme", undefined, ""])).toEqual([]);
  });
});
