export type InvoiceExtractLineInput = {
  quantity: number;
  unit_price: number | null;
  total: number | null;
};

/** Sum line totals when each line has a computable amount (line total or unit_price × quantity). */
export function sumComputableLineTotals(lines: InvoiceExtractLineInput[]): number | null {
  let sum = 0;
  for (const line of lines) {
    if (line.total != null && Number.isFinite(line.total)) {
      sum += line.total;
      continue;
    }
    const up = line.unit_price;
    const q = line.quantity;
    if (up != null && Number.isFinite(up) && q != null && Number.isFinite(q)) {
      sum += up * q;
      continue;
    }
    return null;
  }
  return sum;
}

/**
 * True when invoice total is missing or does not reconcile with summed line amounts.
 */
export function totalsNeedReview(
  totalAmount: number | null | undefined,
  lines: InvoiceExtractLineInput[]
): boolean {
  if (totalAmount == null || !Number.isFinite(totalAmount)) return true;
  const lineSum = sumComputableLineTotals(lines);
  if (lineSum == null) return true;
  const tol = Math.max(2, Math.abs(totalAmount) * 0.02, Math.abs(lineSum) * 0.02);
  return Math.abs(totalAmount - lineSum) > tol;
}
