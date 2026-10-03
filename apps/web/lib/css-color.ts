/**
 * A theme colour as `rgba(...)`, read through a 1-pixel canvas: canvas libraries such as Lightweight Charts parse
 * hex and rgb but not the oklch values the theme is written in.
 */
export function themeColor(variable: string, alpha = 1): string {
  if (typeof document === "undefined") return `rgba(128, 128, 128, ${alpha})`;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx || !value) return `rgba(128, 128, 128, ${alpha})`;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${((a ?? 255) / 255) * alpha})`;
}
