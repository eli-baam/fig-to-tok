import { rgbaToHex } from "@utils/colors";
import { pathify } from "@utils/naming";
const aliasCache = new Map();
export async function getVariables() {
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const variables = await figma.variables.getLocalVariablesAsync();
    return { collections, variables };
}
async function resolveValueAsync(v, modeId, seen = new Set()) {
    var _a, _b, _c;
    if (typeof v !== "object" || v === null)
        return v;
    const anyV = v;
    if (anyV.type === "VARIABLE_ALIAS") {
        const cacheKey = anyV.id + "::" + modeId;
        if (aliasCache.has(cacheKey))
            return aliasCache.get(cacheKey);
        const ali = await figma.variables.getVariableByIdAsync(anyV.id);
        if (!ali)
            return null;
        const modeIds = Object.keys(ali.valuesByMode || {});
        const fallback = modeIds[0] || "";
        const raw = (_b = (_a = ali.valuesByMode) === null || _a === void 0 ? void 0 : _a[modeId]) !== null && _b !== void 0 ? _b : (_c = ali.valuesByMode) === null || _c === void 0 ? void 0 : _c[fallback];
        if (raw === undefined)
            return null;
        const resolved = await resolveValueAsync(raw, modeId, seen.add(anyV.id));
        aliasCache.set(cacheKey, resolved);
        return resolved;
    }
    if ("r" in anyV && "g" in anyV && "b" in anyV && "a" in anyV)
        return rgbaToHex(anyV);
    return v;
}
export async function buildTokensByMode(collections, variables) {
    var _a, _b, _c, _d;
    const varsByCol = new Map();
    for (const v of variables)
        ((_a = varsByCol.get(v.variableCollectionId)) !== null && _a !== void 0 ? _a : varsByCol.set(v.variableCollectionId, []).get(v.variableCollectionId)).push(v);
    const tokensByMode = {};
    for (const col of collections) {
        for (const m of col.modes) {
            const modeId = m.modeId;
            const modeName = m.name;
            tokensByMode[modeName] || (tokensByMode[modeName] = {});
            const colVars = varsByCol.get(col.id) || [];
            for (const v of colVars) {
                const ids = Object.keys(v.valuesByMode || {});
                const fb = ids[0] || "";
                const raw = (_c = (_b = v.valuesByMode) === null || _b === void 0 ? void 0 : _b[modeId]) !== null && _c !== void 0 ? _c : (_d = v.valuesByMode) === null || _d === void 0 ? void 0 : _d[fb];
                if (raw === undefined)
                    continue;
                const val = await resolveValueAsync(raw, modeId);
                tokensByMode[modeName][pathify(v.name)] = {
                    $type: v.resolvedType === "COLOR" ? "color" :
                        v.resolvedType === "FLOAT" ? "dimension" :
                            v.resolvedType === "STRING" ? "string" :
                                v.resolvedType === "BOOLEAN" ? "boolean" : "unknown",
                    $value: val
                };
            }
        }
    }
    return tokensByMode;
}
