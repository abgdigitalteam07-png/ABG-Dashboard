// Cycling color palette for per-brand lines in multi-brand comparison charts.
const BRAND_LINE_PALETTE = [
  "#3B82F6", // blue
  "#7C3AED", // violet
  "#059669", // emerald
  "#F97316", // orange
  "#EC4899", // pink
  "#0EA5E9", // sky
  "#EAB308", // yellow
  "#EF4444", // red
  "#14B8A6", // teal
  "#8B5CF6", // purple
];

export function getBrandColor(index: number): string {
  return BRAND_LINE_PALETTE[index % BRAND_LINE_PALETTE.length];
}

export const TOTAL_COLOR = "#111827";

export const TOTAL_LINE_PROPS = {
  strokeDasharray: "5 3",
  strokeWidth: 2.5,
};
