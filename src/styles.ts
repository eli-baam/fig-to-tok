import { rgbaToHex } from "@utils/colors";
import { kebab } from "@utils/naming";

export async function getLocalStyles() {
  const g: any = figma as any;
  const paint  = g.getLocalPaintStylesAsync  ? await g.getLocalPaintStylesAsync()  : figma.getLocalPaintStyles();
  const text   = g.getLocalTextStylesAsync   ? await g.getLocalTextStylesAsync()   : figma.getLocalTextStyles();
  const effect = g.getLocalEffectStylesAsync ? await g.getLocalEffectStylesAsync() : figma.getLocalEffectStyles();
  return { paint, text, effect };
}

export function buildShadows(effectStyles: EffectStyle[]) {
  const out: Record<string, any> = {};
  const H = (n:number)=>{const v=Math.round(n*255);return v.toString(16).padStart(2,"0");};
  for (const s of effectStyles) {
    const arr: any[] = [];
    for (const ef of s.effects) {
      if (ef.type !== "DROP_SHADOW" && ef.type !== "INNER_SHADOW") continue;
      const col = (ef as any).color as RGBA;
      const hex = `#${H(col.r)}${H(col.g)}${H(col.b)}${H(col.a)}`;
      arr.push({
        color: hex,
        offsetX: { value: ef.offset?.x || 0, unit: "px" },
        offsetY: { value: ef.offset?.y || 0, unit: "px" },
        blur:    { value: ef.radius || 0, unit: "px" },
        spread:  { value: (ef as any).spread || 0, unit: "px" },
        inset: ef.type === "INNER_SHADOW"
      });
    }
    if (arr.length) out[kebab(s.name)] = { $type: "shadow", $value: arr };
  }
  return { shadows: out };
}

export function weightFromStyle(style: string): number {
  const s = style.toLowerCase();
  if (s.includes("thin")) return 100;
  if (s.includes("extralight") || s.includes("ultralight")) return 200;
  if (s.includes("light")) return 300;
  if (s.includes("regular") || s.includes("book") || s.includes("normal")) return 400;
  if (s.includes("medium")) return 500;
  if (s.includes("semibold") || s.includes("demibold")) return 600;
  if (s.includes("bold")) return 700;
  if (s.includes("extrabold") || s.includes("ultrabold")) return 800;
  if (s.includes("black") || s.includes("heavy")) return 900;
  return 400;
}

export async function buildTypeStyles(textStyles: TextStyle[]) {
  const out: Record<string, any> = {};
  const toDim = (n:number)=> `${n||0}px`;

  for (const s of textStyles) {
    out[kebab(s.name)] = {
      $type: "typography",
      $value: {
        fontFamily: "{typography.font-family}",
        fontWeight: weightFromStyle((s.fontName as FontName).style),
        fontSize: toDim(Number(s.fontSize)),
        lineHeight: (typeof s.lineHeight === "object"
          ? ((s.lineHeight as any).unit === "AUTO" ? 1
             : toDim((s.lineHeight as any).value))
          : Number(s.lineHeight)||1),
        letterSpacing: Number((s.letterSpacing as any)?.value || 0)
      }
    };
  }
  return { "type styles": out };
}
