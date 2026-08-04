import type { Brand } from "@/lib/brands";

export interface CountSeriesInput {
  brand: Brand;
  data: { date: string; value: number }[];
}

export interface MergedRow {
  date: string;
  Total: number;
  [brandName: string]: string | number;
}

/**
 * Outer-joins per-brand count series by `date`, filling gaps with 0, and adds
 * a `Total` column summing every brand's value for that date.
 */
export function mergeCountSeries(perBrand: CountSeriesInput[]): MergedRow[] {
  const dateOrder: string[] = [];
  const byDate = new Map<string, MergedRow>();

  for (const { brand, data } of perBrand) {
    for (const point of data) {
      if (!byDate.has(point.date)) {
        byDate.set(point.date, { date: point.date, Total: 0 });
        dateOrder.push(point.date);
      }
      const row = byDate.get(point.date)!;
      row[brand.name] = point.value;
    }
  }

  dateOrder.sort();
  const rows = dateOrder.map((date) => byDate.get(date)!);
  for (const { brand } of perBrand) {
    for (const row of rows) {
      if (typeof row[brand.name] !== "number") row[brand.name] = 0;
    }
  }
  for (const row of rows) {
    row.Total = perBrand.reduce((sum, { brand }) => sum + (Number(row[brand.name]) || 0), 0);
  }

  return rows;
}

export interface RateSeriesInput {
  brand: Brand;
  numerator: { date: string; value: number }[];
  denominator: { date: string; value: number }[];
}

/**
 * Merges per-brand rate series (e.g. open rate, CTR) by date. Per-brand values
 * are numerator/denominator*100 for that date; `Total` is recomputed from the
 * summed numerator/denominator across brands for that date, not averaged.
 */
export function mergeRateSeries(perBrand: RateSeriesInput[]): MergedRow[] {
  const dateOrder: string[] = [];
  const numByDate = new Map<string, Map<string, number>>();
  const denomByDate = new Map<string, Map<string, number>>();

  for (const { brand, numerator, denominator } of perBrand) {
    const denomMap = new Map(denominator.map((d) => [d.date, d.value]));
    for (const point of numerator) {
      if (!numByDate.has(point.date)) {
        numByDate.set(point.date, new Map());
        denomByDate.set(point.date, new Map());
        dateOrder.push(point.date);
      }
      numByDate.get(point.date)!.set(brand.name, point.value);
      denomByDate.get(point.date)!.set(brand.name, denomMap.get(point.date) || 0);
    }
  }

  dateOrder.sort();
  return dateOrder.map((date) => {
    const nums = numByDate.get(date)!;
    const denoms = denomByDate.get(date)!;
    const row: MergedRow = { date, Total: 0 };
    let totalNum = 0;
    let totalDenom = 0;
    for (const { brand } of perBrand) {
      const n = nums.get(brand.name) || 0;
      const d = denoms.get(brand.name) || 0;
      row[brand.name] = d > 0 ? (n / d) * 100 : 0;
      totalNum += n;
      totalDenom += d;
    }
    row.Total = totalDenom > 0 ? (totalNum / totalDenom) * 100 : 0;
    return row;
  });
}

export function sumKpi(values: number[]): number {
  return values.reduce((sum, v) => sum + (Number(v) || 0), 0);
}

export function recomputeRateKpi(numeratorSum: number, denominatorSum: number): number {
  return denominatorSum > 0 ? (numeratorSum / denominatorSum) * 100 : 0;
}
