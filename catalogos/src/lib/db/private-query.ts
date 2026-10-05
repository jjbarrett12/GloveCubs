/**
 * Small PostgREST-shaped query builder that runs against private schemas
 * through the server database connection. It is not a general SQL API.
 */

import type { PrivateQuery } from "./private-sql";

type Result = { data: unknown; error: { message: string } | null; count?: number | null };

type Order = { column: string; ascending: boolean; nullsFirst: boolean; explicitNulls: boolean };

const IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const JSON_TEXT = /^([a-zA-Z_][a-zA-Z0-9_]*)->>[a-zA-Z_][a-zA-Z0-9_]*$/;

function ident(value: string, label: string): string {
  if (!IDENT.test(value)) throw new Error(`Unsafe ${label}: ${value}`);
  return `"${value}"`;
}

function schemaTable(schema: string, table: string): string {
  return `${ident(schema, "schema")}.${ident(table, "table")}`;
}

function columnSql(column: string): string {
  if (IDENT.test(column)) return ident(column, "column");
  const match = column.match(JSON_TEXT);
  if (!match) throw new Error(`Unsafe column: ${column}`);
  const [base, key] = column.split("->>");
  return `${ident(base!, "column")}->>${ident(key!, "json key")}`;
}

function bind(value: unknown): unknown {
  if (value != null && typeof value === "object") return JSON.stringify(value);
  return value;
}

function selectList(columns: string): string {
  if (columns.trim() === "*") return "*";
  return columns.split(",").map((part) => columnSql(part.trim())).join(", ");
}

function parseSelect(columns: string, schema: string, table: string): { list: string; joins: string } {
  if (columns.trim() === "*") return { list: "*", joins: "" };
  const joins: string[] = [];
  const exprs: string[] = [];
  for (const part of columns.split(",").map((item) => item.trim()).filter(Boolean)) {
    const embed = part.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\(([^)]+)\)$/);
    if (!embed) {
      exprs.push(columnSql(part));
      continue;
    }
    const relation = embed[1]!;
    const fk = EMBED_FK[relation];
    if (!fk) throw new Error(`Unsafe column: ${part}`);
    const cols = embed[2]!.split(",").map((item) => item.trim());
    cols.forEach((col) => ident(col, "column"));
    const alias = ident(relation, "table");
    joins.push(
      ` LEFT JOIN ${schemaTable(schema, relation)} AS ${alias} ON ${alias}.${ident("id", "column")} = ${ident(table, "table")}.${ident(fk.local, "column")}`
    );
    const objectArgs = cols.map((col) => `'${col}', ${alias}.${ident(col, "column")}`).join(", ");
    exprs.push(`json_build_object(${objectArgs}) AS ${alias}`);
  }
  return { list: exprs.join(", "), joins: joins.join("") };
}

function stripCount(rows: Record<string, unknown>[]): { rows: Record<string, unknown>[]; count: number | undefined } {
  let count: number | undefined;
  const next = rows.map((row) => {
    if (!("__count" in row)) return row;
    const value = Number(row.__count);
    if (count == null && Number.isFinite(value)) count = value;
    const copy = { ...row };
    delete copy.__count;
    return copy;
  });
  return { rows: next, count };
}

type Filter =
  | { op: "eq" | "neq" | "gte" | "lte" | "gt" | "lt" | "ilike"; column: string; value: unknown }
  | { op: "contains"; column: string; value: Record<string, unknown> }
  | { op: "in"; column: string; value: unknown[] }
  | { op: "is"; column: string; value: null }
  | { op: "not-is"; column: string; value: null }
  | { op: "or"; sql: string; params: unknown[] };

const EMBED_FK: Record<string, { local: string }> = {
  attribute_definitions: { local: "attribute_definition_id" },
};

export class PrivateQueryBuilder implements PromiseLike<Result> {
  private operation: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private columns = "*";
  private filters: Filter[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private onConflict: string | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private head = false;
  private countExact = false;

  constructor(
    private readonly schema: string,
    private readonly table: string,
    private readonly execute: PrivateQuery
  ) {}

  select(columns = "*", options?: { count?: "exact"; head?: boolean }): this {
    if (this.operation === "select") this.operation = "select";
    this.columns = columns;
    this.countExact = options?.count === "exact";
    this.head = options?.head === true;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]): this {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>): this {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: Record<string, unknown>, options?: { onConflict?: string }): this {
    this.operation = "upsert";
    this.payload = payload;
    this.onConflict = options?.onConflict ?? null;
    return this;
  }

  delete(): this {
    this.operation = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown): this {
    this.filters.push({ op: "neq", column, value });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ op: "gt", column, value });
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push({ op: "gte", column, value });
    return this;
  }

  ilike(column: string, value: unknown): this {
    this.filters.push({ op: "ilike", column, value });
    return this;
  }

  contains(column: string, value: Record<string, unknown>): this {
    this.filters.push({ op: "contains", column, value });
    return this;
  }

  lte(column: string, value: unknown): this {
    this.filters.push({ op: "lte", column, value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ op: "in", column, value });
    return this;
  }

  is(column: string, value: null): this {
    this.filters.push({ op: "is", column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator === "is" && value === null) {
      this.filters.push({ op: "not-is", column, value: null });
      return this;
    }
    throw new Error(`Unsupported not() filter: ${operator}`);
  }

  filter(column: string, operator: string, value: unknown): this {
    if (operator === "eq") return this.eq(column, value);
    throw new Error(`Unsupported filter operator: ${operator}`);
  }

  or(expression: string): this {
    const parts = expression.split(",").map((part) => part.trim()).filter(Boolean);
    const params: unknown[] = [];
    const sql = parts
      .map((part) => {
        const bits = part.split(".");
        if (bits.length < 3) throw new Error(`Unsupported or() clause: ${part}`);
        const column = bits[0]!;
        const op = bits[1]!;
        const raw = bits.slice(2).join(".");
        if (op === "is" && raw === "null") return `${columnSql(column)} IS NULL`;
        if (op === "lt" || op === "lte" || op === "gt" || op === "gte" || op === "eq") {
          params.push(Number.isFinite(Number(raw)) && raw.trim() !== "" ? Number(raw) : raw);
          const symbol = op === "lt" ? "<" : op === "lte" ? "<=" : op === "gt" ? ">" : op === "gte" ? ">=" : "=";
          return `${columnSql(column)} ${symbol} $${params.length}`;
        }
        throw new Error(`Unsupported or() clause: ${part}`);
      })
      .join(" OR ");
    this.filters.push({ op: "or", sql, params });
    return this;
  }

  order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean }): this {
    this.orders.push({
      column,
      ascending: options?.ascending !== false,
      nullsFirst: options?.nullsFirst === true,
      explicitNulls: options?.nullsFirst != null,
    });
    return this;
  }

  limit(count: number): this {
    this.limitN = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }

  single(): PromiseLike<Result> {
    this.mode = "single";
    return this;
  }

  maybeSingle(): PromiseLike<Result> {
    this.mode = "maybe";
    return this;
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<Result> {
    try {
      const { text, params } = this.toSql();
      const result = await this.execute(text, params);
      if (this.head) {
        const count = Number(result.rows[0]?.count ?? result.rowCount ?? 0);
        return { data: null, error: null, count };
      }
      const counted = this.countExact && !this.head ? stripCount(result.rows) : { rows: result.rows, count: undefined as number | undefined };
      const rows = counted.rows;
      if (this.mode === "single") {
        if (rows.length !== 1) {
          return { data: null, error: { message: rows.length === 0 ? "No rows" : "Multiple rows" }, count: this.countExact ? rows.length : undefined };
        }
        return { data: rows[0], error: null, count: counted.count };
      }
      if (this.mode === "maybe") {
        if (rows.length > 1) return { data: null, error: { message: "Multiple rows" } };
        return { data: rows[0] ?? null, error: null, count: counted.count };
      }
      return { data: rows, error: null, count: this.countExact ? (counted.count ?? rows.length) : undefined };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "Query failed" } };
    }
  }

  toSql(): { text: string; params: unknown[] } {
    const params: unknown[] = [];
    const where = this.whereSql(params);
    const target = schemaTable(this.schema, this.table);

    if (this.operation === "select" && this.head && this.countExact) {
      return { text: `SELECT count(*)::int AS count FROM ${target}${where}`, params };
    }

    if (this.operation === "select") {
      const order = this.orders.length
        ? ` ORDER BY ${this.orders
            .map((item) => {
              const nulls = item.explicitNulls ? (item.nullsFirst ? " NULLS FIRST" : " NULLS LAST") : "";
              return `${columnSql(item.column)} ${item.ascending ? "ASC" : "DESC"}${nulls}`;
            })
            .join(", ")}`
        : "";
      const limit = this.limitN != null ? ` LIMIT ${Math.trunc(this.limitN)}` : "";
      const offset = this.offsetN != null ? ` OFFSET ${Math.trunc(this.offsetN)}` : "";
      const parsed = parseSelect(this.columns, this.schema, this.table);
      const countSql = this.countExact ? `, count(*) OVER()::int AS "__count"` : "";
      return { text: `SELECT ${parsed.list}${countSql} FROM ${target}${parsed.joins}${where}${order}${limit}${offset}`, params };
    }

    if (this.operation === "insert" || this.operation === "upsert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
      const keys = Object.keys(rows[0] ?? {});
      if (keys.length === 0) throw new Error("Insert requires columns");
      keys.forEach((key) => ident(key, "column"));
      const values = rows
        .map((row) => {
          const placeholders = keys.map((key) => {
            params.push(bind(row[key] ?? null));
            return `$${params.length}`;
          });
          return `(${placeholders.join(", ")})`;
        })
        .join(", ");
      let conflict = "";
      if (this.operation === "upsert") {
        const conflictCols = (this.onConflict ?? keys.join(",")).split(",").map((col) => ident(col.trim(), "conflict"));
        const updates = keys
          .filter((key) => !conflictCols.includes(`"${key}"`))
          .map((key) => `${ident(key, "column")} = EXCLUDED.${ident(key, "column")}`);
        conflict = ` ON CONFLICT (${conflictCols.join(", ")}) DO UPDATE SET ${updates.join(", ")}`;
      }
      const returning = this.columns && this.columns !== "*" ? ` RETURNING ${selectList(this.columns)}` : " RETURNING *";
      return {
        text: `INSERT INTO ${target} (${keys.map((key) => ident(key, "column")).join(", ")}) VALUES ${values}${conflict}${returning}`,
        params,
      };
    }

    if (this.operation === "update") {
      const row = (this.payload ?? {}) as Record<string, unknown>;
      const keys = Object.keys(row);
      if (keys.length === 0) throw new Error("Update requires columns");
      const sets = keys.map((key) => {
        params.push(bind(row[key] ?? null));
        return `${ident(key, "column")} = $${params.length}`;
      });
      return { text: `UPDATE ${target} SET ${sets.join(", ")}${where}`, params };
    }

    return { text: `DELETE FROM ${target}${where}`, params };
  }

  private whereSql(params: unknown[]): string {
    if (this.filters.length === 0) return "";
    const parts = this.filters.map((filter) => {
      if (filter.op === "or") return this.orSql(filter, params);
      if (filter.op === "in") {
        if (filter.value.length === 0) return "FALSE";
        const placeholders = filter.value.map((value) => {
          params.push(value);
          return `$${params.length}`;
        });
        return `${columnSql(filter.column)} IN (${placeholders.join(", ")})`;
      }
      if (filter.op === "is") return `${columnSql(filter.column)} IS NULL`;
      if (filter.op === "not-is") return `${columnSql(filter.column)} IS NOT NULL`;
      if (filter.op === "ilike") {
        params.push(filter.value);
        return `${columnSql(filter.column)} ILIKE $${params.length}`;
      }
      if (filter.op === "contains") {
        params.push(JSON.stringify(filter.value));
        return `${columnSql(filter.column)} @> $${params.length}::jsonb`;
      }
      params.push(filter.value);
      const symbol =
        filter.op === "eq" ? "=" : filter.op === "neq" ? "<>" : filter.op === "gte" ? ">=" : filter.op === "lte" ? "<=" : filter.op === "gt" ? ">" : "<";
      return `${columnSql(filter.column)} ${symbol} $${params.length}`;
    });
    return ` WHERE ${parts.join(" AND ")}`;
  }

  private orSql(filter: Extract<Filter, { op: "or" }>, params: unknown[]): string {
    let index = 0;
    const sql = filter.sql.replace(/\$(\d+)/g, () => {
      params.push(filter.params[index]!);
      index += 1;
      return `$${params.length}`;
    });
    return `(${sql})`;
  }
}

export function createPrivateClient(defaultSchema: string, execute: PrivateQuery) {
  return {
    schema(next: string) {
      return createPrivateClient(next, execute);
    },
    from(table: string) {
      return new PrivateQueryBuilder(defaultSchema, table, execute);
    },
  };
}
