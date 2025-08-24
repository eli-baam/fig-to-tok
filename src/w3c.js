import { pathify } from "@utils/naming";
const isPalette = (n) => /palette/i.test(n);
const isSemantic = (n) => /(mode|semantic)/i.test(n);
const isRadius = (n) => /radius/i.test(n);
const isSpacing = (n) => /spac(e|ing)/i.test(n);
const isTypoVars = (n) => /typograph|font/i.test(n);
const toDim = (n) => ({ value: n || 0, unit: "px" });
export function buildW3CFromVariables(collections, variables, tokensByMode) {
    var _a;
    const core = { color: { palette: {} }, radius: {}, spacing: {}, typography: {
            "font-family": { $type: "fontFamily", $value: "Inter" },
            "font-size": {}, "line-height": {}, "letter-spacing": {}, "font-weight": {}
        } };
    const semantic = { color: {} };
    const colById = new Map(collections.map(c => [c.id, c]));
    const groupFor = (c) => isPalette(c.name) ? "palette"
        : isSemantic(c.name) ? "semantic" : isRadius(c.name) ? "radius"
            : isSpacing(c.name) ? "spacing" : isTypoVars(c.name) ? "typography" : "misc";
    for (const v of variables) {
        const col = colById.get(v.variableCollectionId);
        const g = groupFor(col);
        const key = pathify(v.name);
        const ids = Object.keys(v.valuesByMode || {});
        const fb = ids[0] || "";
        const base = (_a = v.valuesByMode) === null || _a === void 0 ? void 0 : _a[fb];
        if (base == null)
            continue;
        const put = (obj, leaf, type, val) => { obj[leaf] = { $type: type, $value: val }; };
        if (g === "palette" && v.resolvedType === "COLOR") {
            const c = base;
            const H = (n) => { const x = Math.round(n * 255); return x.toString(16).padStart(2, "0"); };
            put(core.color.palette, key, "color", `#${H(c.r)}${H(c.g)}${H(c.b)}${c.a < 1 ? H(c.a) : ""}`);
            continue;
        }
        if (g === "semantic" && v.resolvedType === "COLOR") {
            const c = base;
            const H = (n) => { const x = Math.round(n * 255); return x.toString(16).padStart(2, "0"); };
            put(semantic.color, key, "color", `#${H(c.r)}${H(c.g)}${H(c.b)}${c.a < 1 ? H(c.a) : ""}`);
            continue;
        }
        if (g === "radius" && v.resolvedType === "FLOAT") {
            put(core.radius, key, "dimension", toDim(Number(base)));
            continue;
        }
        if (g === "spacing" && v.resolvedType === "FLOAT") {
            put(core.spacing, key, "dimension", toDim(Number(base)));
            continue;
        }
        if (g === "typography") {
            const p = key.split(".");
            const cat = p[1] || "";
            const leaf = p.slice(2).join(".") || "value";
            if (cat === "font-family" && typeof base === "string")
                core.typography["font-family"] = { $type: "fontFamily", $value: String(base) };
            else if (cat === "font-weight")
                core.typography["font-weight"][leaf] = { $type: "number", $value: Number(base) };
            else if (cat === "font-size")
                core.typography["font-size"][leaf] = { $type: "dimension", $value: toDim(Number(base)) };
            else if (cat === "line-height")
                core.typography["line-height"][leaf] = { $type: "dimension", $value: toDim(Number(base)) };
            else if (cat === "letter-spacing")
                core.typography["letter-spacing"][leaf] = { $type: "dimension", $value: toDim(Number(base)) };
        }
    }
    // themes: 각 모드 컬러 오버라이드
    const themes = Object.keys(tokensByMode).map(mode => {
        const overrides = { semantic: { color: {} } };
        for (const [path, tok] of Object.entries(tokensByMode[mode])) {
            if (tok.$type === "color" && path.startsWith("color.")) {
                overrides.semantic.color[path.slice("color.".length)] = { $value: tok.$value };
            }
        }
        return { id: mode.toLowerCase().replace(/\s+/g, "-"), name: mode, overrides };
    });
    return { core, semantic, $themes: themes };
}
