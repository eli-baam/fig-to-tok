import { rgbaToHex } from "@utils/colors";
import { pathify } from "@utils/naming";

const aliasCache = new Map<string, any>();

export async function getVariables() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables   = await figma.variables.getLocalVariablesAsync();
  return { collections, variables };
}

export async function resolveValueAsync(v: VariableValue, modeId: string, seen = new Set<string>()): Promise<any> {
  if (typeof v !== "object" || v === null) return v;
  const anyV: any = v;

  if (anyV.type === "VARIABLE_ALIAS") {
    const cacheKey = anyV.id + "::" + modeId;
    if (aliasCache.has(cacheKey)) return aliasCache.get(cacheKey);

    const ali = await figma.variables.getVariableByIdAsync(anyV.id);
    if (!ali) return null;
    const modeIds = Object.keys(ali.valuesByMode || {});
    const fallback = modeIds[0] || "";
    const raw = ali.valuesByMode?.[modeId] ?? ali.valuesByMode?.[fallback];
    if (raw === undefined) return null;
    const resolved = await resolveValueAsync(raw, modeId, seen.add(anyV.id));
    aliasCache.set(cacheKey, resolved);
    return resolved;
  }

  if ("r" in anyV && "g" in anyV && "b" in anyV && "a" in anyV) return rgbaToHex(anyV as RGBA);
  return v;
}

export async function buildTokensByMode(collections: VariableCollection[], variables: Variable[]) {
  const varsByCol = new Map<string, Variable[]>();
  for (const v of variables) (varsByCol.get(v.variableCollectionId) ?? varsByCol.set(v.variableCollectionId, []).get(v.variableCollectionId)!).push(v);

  const tokensByMode: Record<string, Record<string, any>> = {};
  for (const col of collections) {
    for (const m of col.modes) {
      const modeId = m.modeId;
      const modeName = m.name;
      tokensByMode[modeName] ||= {};
      const colVars = varsByCol.get(col.id) || [];
      for (const v of colVars) {
        const ids = Object.keys(v.valuesByMode || {});
        const fb = ids[0] || "";
        const raw = v.valuesByMode?.[modeId] ?? v.valuesByMode?.[fb];
        if (raw === undefined) continue;
        const val = await resolveValueAsync(raw, modeId);
        tokensByMode[modeName][pathify(v.name)] = {
          $type:
            v.resolvedType === "COLOR" ? "color" :
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
