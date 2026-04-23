/**
 * Parser abstraction: detect format from content-type or body, dispatch to CSV or JSON parser.
 */

import type { FetchedFeed } from "../types";
import type { ParserResult } from "../types";
import { parseCsv } from "./csv-parser";
import { parseJson } from "./json-parser";

/**
 * Parse fetched feed body into rows.
 * - content-type contains "json" or body starts with [ or { -> JSON/JSONL
 * - else -> CSV (comma or tab)
 */
export function parseFeed(fetched: FetchedFeed): ParserResult {
  const { body, contentType } = fetched;
  const ct = contentType.toLowerCase();

  if (ct.includes("json") || body.trimStart().startsWith("[") || body.trimStart().startsWith("{")) {
    return parseJson(body);
  }

  const delimiter = body.includes("\t") ? "\t" : ",";
  return parseCsv(body, delimiter);
}

export { parseCsv } from "./csv-parser";
export { parseJson } from "./json-parser";
