import { describe, expect, it } from "vitest";
import { PrivateQueryBuilder } from "./private-query";
import type { PrivateQuery } from "./private-sql";

function capture(): { query: PrivateQuery; sql: () => string; params: () => unknown[] } {
  let text = "";
  let params: unknown[] = [];
  const query: PrivateQuery = async (next, nextParams = []) => {
    text = next;
    params = nextParams;
    return { rows: [{ id: "1" }], rowCount: 1 };
  };
  return { query, sql: () => text, params: () => params };
}

describe("private query builder", () => {
  it("selects and filters a private table without string-building values", async () => {
    const captured = capture();
    const builder = new PrivateQueryBuilder("catalogos", "brands", captured.query);
    await builder.select("id, name").eq("slug", "glovecubs").order("name").limit(10);
    expect(captured.sql()).toBe(
      'SELECT "id", "name" FROM "catalogos"."brands" WHERE "slug" = $1 ORDER BY "name" ASC LIMIT 10'
    );
    expect(captured.params()).toEqual(["glovecubs"]);
  });

  it("rejects unsafe identifiers", () => {
    const captured = capture();
    const builder = new PrivateQueryBuilder("catalogos", "brands", captured.query);
    expect(() => builder.eq("slug;drop", "x").toSql()).toThrow(/Unsafe column/);
  });

  it("upserts without putting the conflict columns in the update list", () => {
    const captured = capture();
    const builder = new PrivateQueryBuilder("catalogos", "import_batches", captured.query);
    const sql = builder
      .upsert({ preview_session_id: "draft-1", source_filename: "new-family-wizard" }, { onConflict: "preview_session_id" })
      .toSql();
    expect(sql.text).toContain('ON CONFLICT ("preview_session_id") DO UPDATE SET "source_filename" = EXCLUDED."source_filename"');
    expect(sql.params[1]).toBe("new-family-wizard");
  });

  it("filters with ilike and jsonb contains", () => {
    const captured = capture();
    const builder = new PrivateQueryBuilder("catalog_v2", "catalog_products", captured.query);
    const sql = builder.select("id").ilike("name", "%violet%").contains("metadata", { category_id: "cat-1" }).toSql();
    expect(sql.text).toContain('"name" ILIKE $1');
    expect(sql.text).toContain('"metadata" @> $2::jsonb');
    expect(sql.params).toEqual(["%violet%", JSON.stringify({ category_id: "cat-1" })]);
  });

  it("joins an attribute definition embed", () => {
    const captured = capture();
    const builder = new PrivateQueryBuilder("catalogos", "product_attributes", captured.query);
    const sql = builder.select("value_text, attribute_definitions(attribute_key)").eq("product_id", "p1").toSql();
    expect(sql.text).toContain('LEFT JOIN "catalogos"."attribute_definitions"');
    expect(sql.text).toContain(`json_build_object('attribute_key', "attribute_definitions"."attribute_key")`);
    expect(sql.params).toEqual(["p1"]);
  });
});
