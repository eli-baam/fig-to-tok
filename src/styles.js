import { kebab } from "@utils/naming";
export async function getLocalStyles() {
    const g = figma;
    const paint = g.getLocalPaintStylesAsync ? await g.getLocalPaintStylesAsync() : figma.getLocalPaintStyles();
    const text = g.getLocalTextStylesAsync ? await g.getLocalTextStylesAsync() : figma.getLocalTextStyles();
    const effect = g.getLocalEffectStylesAsync ? await g.getLocalEffectStylesAsync() : figma.getLocalEffectStyles();
    return { paint, text, effect };
}
export function buildShadows(effectStyles) {
    var _a, _b;
    const out = {};
    const H = (n) => { const v = Math.round(n * 255); return v.toString(16).padStart(2, "0"); };
    for (const s of effectStyles) {
        const arr = [];
        for (const ef of s.effects) {
            if (ef.type !== "DROP_SHADOW" && ef.type !== "INNER_SHADOW")
                continue;
            const col = ef.color;
            const hex = `#${H(col.r)}${H(col.g)}${H(col.b)}${H(col.a)}`;
            arr.push({
                color: hex,
                offsetX: { value: ((_a = ef.offset) === null || _a === void 0 ? void 0 : _a.x) || 0, unit: "px" },
                offsetY: { value: ((_b = ef.offset) === null || _b === void 0 ? void 0 : _b.y) || 0, unit: "px" },
                blur: { value: ef.radius || 0, unit: "px" },
                spread: { value: ef.spread || 0, unit: "px" },
                inset: ef.type === "INNER_SHADOW"
            });
        }
        if (arr.length)
            out[kebab(s.name)] = { $type: "shadow", $value: arr };
    }
    return { shadows: out };
}
export function weightFromStyle(style) {
    const s = style.toLowerCase();
    if (s.includes("thin"))
        return 100;
    if (s.includes("extralight") || s.includes("ultralight"))
        return 200;
    if (s.includes("light"))
        return 300;
    if (s.includes("regular") || s.includes("book") || s.includes("normal"))
        return 400;
    if (s.includes("medium"))
        return 500;
    if (s.includes("semibold") || s.includes("demibold"))
        return 600;
    if (s.includes("bold"))
        return 700;
    if (s.includes("extrabold") || s.includes("ultrabold"))
        return 800;
    if (s.includes("black") || s.includes("heavy"))
        return 900;
    return 400;
}
export async function buildTypeStyles(textStyles) {
    var _a;
    const out = {};
    for (const s of textStyles) {
        out[kebab(s.name)] = {
            $type: "typography",
            $value: {
                fontFamily: "{typography.font-family}",
                fontWeight: weightFromStyle(s.fontName.style),
                fontSize: { value: Number(s.fontSize) || 0, unit: "px" },
                lineHeight: (typeof s.lineHeight === "object"
                    ? (s.lineHeight.unit === "AUTO" ? 1
                        : { value: Number(s.lineHeight.value || 0), unit: "px" })
                    : Number(s.lineHeight) || 1),
                letterSpacing: { value: Number(((_a = s.letterSpacing) === null || _a === void 0 ? void 0 : _a.value) || 0), unit: "px" }
            }
        };
    }
    return { "type styles": out };
}
