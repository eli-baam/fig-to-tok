import { resolveValueAsync } from "./variables";
import { pathify } from "@utils/naming";
import { kebab } from "@utils/naming";

const toDim = (n: number) => `${Number(n) || 0}px`;
const toRefDim = (path: string) => `{${path}}`; 
const H = (n:number)=>{const x=Math.round(n*255); return x.toString(16).padStart(2,"0")};
const toHex = (c: RGBA) => `#${H(c.r)}${H(c.g)}${H(c.b)}${c.a < 1 ? H(c.a) : ""}`;
const firstModeId = (c: VariableCollection) => c.modes.length ? c.modes[0].modeId : "";

// 콜렉션/변수명 정규화
const norm = (s: string) => s.toLowerCase().trim();

// head == 첫 세그먼트, sub == 두 번째 세그먼트
const splitHead = (name: string) => {
  const seg = name.split("/").map(s => norm(s));
  return { head: seg[0] || "", sub: seg[1] || "", rest: seg.slice(2) };
};

// ★ 컬렉션+변수 경로로 분류
const groupFor = (c: VariableCollection, v: Variable) => {
  const cn = norm(c.name);
  // "mode colors" 컬렉션 → mode-colors
  if (cn.includes("mode") && cn.includes("color")) return "mode-colors";

  // core 같은 경우는 변수 경로의 첫 세그먼트로 구분
  const { head } = splitHead(v.name);
  if (head === "palette") return "palette";
  if (head === "spacing") return "spacing";
  if (head === "border radius") return "radius";
  if (head === "typography") return "typography";
  return "misc";
};

const catMap: Record<string, string> = {
  "font family": "font-family",
  "font weight": "font-weight",
  "font size": "font-size",
  "line height": "line-height",
  "letter spacing": "letter-spacing"
};

const joinRest = (seg: string[]) =>
  seg.map(s => s.replace(/\s+/g, "-")).join(".");
  
export async function buildW3CFromVariables(
  collections: VariableCollection[],
  variables: Variable[],
  tokensByMode: Record<string, Record<string, any>>
) {
  const core:any = { color:{ palette:{} }, radius:{}, spacing:{}, typography:{
    "font-family": { $type:"fontFamily", $value:"Inter" },
    "font-size":{}, "line-height":{}, "letter-spacing":{}, "font-weight":{}
  }};
  const modeColors:any = { color:{} };
  const colById = new Map(collections.map(c=>[c.id,c]));

  for (const v of variables) {
    
    const col = colById.get(v.variableCollectionId)!;
    const g = groupFor(col, v);

    const modeId = firstModeId(col);
    const ids = Object.keys(v.valuesByMode || {});
    const fb = ids[0] || modeId;
    const raw = v.valuesByMode?.[modeId] ?? v.valuesByMode?.[fb];
    if (raw === undefined) continue;
    const resolved = await resolveValueAsync(raw as VariableValue, modeId);

    // 경로 세그먼트
    const { head, sub, rest } = splitHead(v.name);

    const key = pathify(v.name);

    const put = (obj:any, leaf:string, type:string, val:any)=>{ obj[leaf]={ $type:type, $value: val }; };

    if (g === "palette" && v.resolvedType === "COLOR") {
      const hex = typeof resolved === "string" ? resolved : toHex(resolved as RGBA);
      const leaf = joinRest([sub, ...rest]);   // "palette/gray/100" → "gray.100"
      put(core.color.palette as any, leaf, "color", hex);
      continue;
    }

    if (g === "mode-colors" && v.resolvedType === "COLOR") {
      const hex = typeof resolved === "string" ? resolved : toHex(resolved as RGBA);
      const leaf = pathify(v.name);            // mode-colors은 전체 경로 유지해도 OK
      put(modeColors.color as any, leaf, "color", hex);
      continue;
    }

    if (g === "spacing" && v.resolvedType === "FLOAT") {
      const leaf = joinRest(rest.length ? [sub, ...rest] : [sub]); // "spacing/4" → "4"
      put(core.spacing as any, leaf, "dimension", toDim(Number(resolved)));
      continue;
    }

    if (g === "radius" && v.resolvedType === "FLOAT") {
      const leaf = joinRest(rest.length ? [sub, ...rest] : [sub]); // "border radius/md" → "md"
      put(core.radius as any, leaf, "dimension", toDim(Number(resolved)));
      continue;
    }

    if (g === "typography") {
      const cat = catMap[sub] || sub.replace(/\s+/g, "-"); // "font size" → "font-size"
      const leaf = joinRest(rest.length ? rest : ["value"]);
      if (cat === "font-family" && typeof resolved === "string") {
        core.typography["font-family"] = { $type: "fontFamily", $value: resolved };
      } else if (cat === "font-weight") {
        (core.typography["font-weight"] as any)[leaf] = { $type: "number", $value: Number(resolved) };
      } else if (cat === "font-size") {
        (core.typography["font-size"] as any)[leaf] = { $type: "dimension", $value: toDim(Number(resolved)) };
      } else if (cat === "line-height") {
        (core.typography["line-height"] as any)[leaf] = { $type: "dimension", $value: toDim(Number(resolved)) };
      } else if (cat === "letter-spacing") {
        (core.typography["letter-spacing"] as any)[leaf] = { $type: "dimension", $value: toDim(Number(resolved)) };
      }
      continue;
    }
  }

  const themeMap = new Map<string, { id:string; name:string; overrides:any }>();
  for (const c of collections) {
    if (!(norm(c.name).includes("mode") && norm(c.name).includes("color"))) continue;
    for (const m of c.modes) {
      const id = m.name.toLowerCase().replace(/\s+/g, "-");
      themeMap.set(m.name, { id, name: m.name, overrides: { modeColors: { color: {} } } });
    }
  }

  for (const v of variables) {
    const col = colById.get(v.variableCollectionId)!;
    if (groupFor(col, v) !== "mode-colors" || v.resolvedType !== "COLOR") continue;

    const key = pathify(v.name); // 예: "accent.saju"
    const ids = Object.keys(v.valuesByMode || {});
    const fb = ids[0] || firstModeId(col);

    for (const m of col.modes) {
      const raw = v.valuesByMode?.[m.modeId] ?? v.valuesByMode?.[fb];
      if (raw === undefined) continue;
      const val = await resolveValueAsync(raw as VariableValue, m.modeId);
      const hex = typeof val === "string" ? val : toHex(val as RGBA);
      const theme = themeMap.get(m.name)!;
      theme.overrides.modeColors.color[key] = { $value: hex };
    }
  }

  const themes = Array.from(themeMap.values());

    return { core, modeColors, $themes: themes };
  }
