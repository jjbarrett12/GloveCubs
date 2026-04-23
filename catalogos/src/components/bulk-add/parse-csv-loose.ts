/**
 * Minimal CSV parser (comma-delimited, optional double-quote wrapping).
 * Sufficient for operator CSVs; doubled quotes inside fields become a single quote.
 */
export function parseCsvLoose(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const flushRow = () => {
    row.push(field);
    field = "";
    if (row.some((cell) => String(cell).trim() !== "")) {
      rows.push(row);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
        continue;
      }
      if (c === '"') {
        inQuotes = false;
        continue;
      }
      field += c;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      flushRow();
      continue;
    }
    if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      flushRow();
      continue;
    }
    field += c;
  }

  row.push(field);
  if (row.some((cell) => String(cell).trim() !== "")) {
    rows.push(row);
  }

  return rows;
}
