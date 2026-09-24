import type { PdfTextItem } from "../core/types.ts";

/** Turn PDF/PostScript subset names into font families Word can resolve. */
export function wordFont(name = "", fallback = ""): string {
  const raw = name.replace(/^[A-Z]{6}\+/, "");
  if (/times|liberationserif|nimbusroman/i.test(raw)) return "Times New Roman";
  if (/courier|liberationmono|nimbusmono/i.test(raw)) return "Courier New";
  if (/arial|helvetica|liberationsans|nimbussans/i.test(raw)) return "Arial";
  if (/calibri|carlito/i.test(raw)) return "Calibri";
  if (/cambria|caladea/i.test(raw)) return "Cambria";
  const family = raw
    .replace(/[-,](?:bold|regular|roman|italic|oblique|medium|light|semibold|black|heavy).*$/i, "")
    .replace(/(?:PS)?(?:BoldItalic|Bold|Italic|Regular)?MT$/i, "");
  if (family && !/^(?:g_|f\d|sans-serif$|serif$|monospace$)/i.test(family)) return family;
  if (/mono/i.test(raw + fallback)) return "Courier New";
  if (/(^|[^-])serif/i.test(raw + fallback) && !/sans/i.test(raw + fallback))
    return "Times New Roman";
  return "Arial";
}

export function normalizePdfItem(
  item: { str: string; transform: number[]; width: number; height: number },
  viewport: { transform: number[]; height: number; scale: number },
  fontName: string,
  style?: { fontFamily?: string; ascent?: number; descent?: number },
): PdfTextItem {
  const [a, b, c, d, e, f] = viewport.transform as [number, number, number, number, number, number];
  const [ta, tb, tc, td, tx, ty] = item.transform as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const angle = (Math.atan2(b * ta + d * tb, a * ta + c * tb) * 180) / Math.PI;
  const fontHeight = Math.hypot(a * tc + c * td, b * tc + d * td);
  // Keep a bottom-up coordinate system for consumers, but apply crop, UserUnit and rotation first.
  const scale = Math.hypot(a, b);
  return {
    str: item.str,
    x: a * tx + c * ty + e,
    y: viewport.height - (b * tx + d * ty + f),
    w: Math.abs(item.width * scale),
    h: fontHeight || Math.abs(item.height * scale),
    fontName,
    fontFamily: wordFont(fontName, style?.fontFamily),
    ascent: style?.ascent,
    descent: style?.descent,
    angle,
    bold: /bold|black|heavy|demi/i.test(fontName),
    italic: /italic|oblique/i.test(fontName),
  };
}
