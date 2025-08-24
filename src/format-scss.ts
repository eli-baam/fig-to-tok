import { pathify } from "@utils/naming";
import { resolveValueAsync } from "./variables";

// ── 설정 ──────────────────────────────────────────────
type ModeStrategy = "suffix" | "first"; // semantic 모드는 suffix로 모두, 또는 첫 모드만
type Options = {
  preserveAliases?: boolean;        // 별칭이면 $alias로 출력
  modeStrategy?: "suffix" | "first"; // semantic 모드: suffix(모든 모드에 --mode) / first(첫 모드만)
};


const norm = (s: string) => s.toLowerCase().trim();
const H = (n:number)=> Math.round(n*255).toString(16).padStart(2,"0");
const toHex = (c: RGBA) => `#${H(c.r)}${H(c.g)}${H(c.b)}${c.a < 1 ? H(c.a) : ""}`;

function groupFromPath(dotted: string) {
  const head = dotted.split(".")[0];
  if (head === "palette") return "palette";
  if (head === "spacing") return "spacing";
  if (head === "border radius" || head === "border-radius") return "radius";
  if (head === "typography" || head === "font") return "typography";
  return "misc";
}

// 네 구조( core / mode colors )에 맞는 분류기
const groupFor = (c: VariableCollection, v: Variable) => {
  const cn = norm(c.name);
  if (cn.includes("mode") && cn.includes("color")) return "semantic"; // "mode colors"
  const head = norm(v.name).split("/")[0] || "";
  if (head === "palette") return "palette";
  if (head === "spacing") return "spacing";
  if (head === "border radius") return "radius";
  if (head === "typography") return "typography";
  return "misc";
};

// SCSS 변수명 만들기
function nameFor(group: string, dottedPath: string) {
  const parts = dottedPath.split(".").map(p => p.replace(/\s+/g,"-"));
  if (group === "palette") {
    const arr = parts[0] === "palette" ? parts.slice(1) : parts;
    return `color-${arr.join("-")}`;
  }
  if (group === "semantic") return `color-${parts.join("-")}`;
  if (group === "spacing") {
    const arr = parts[0] === "spacing" ? parts.slice(1) : parts;
    return `spacing-${arr.join("-")}`;
  }
  if (group === "radius") {
    // "border radius" 계층 보정
    const arr = (parts[0] === "border" && parts[1] === "radius") ? parts.slice(2)
              : (parts[0] === "border-radius") ? parts.slice(1)
              : (parts[0] === "radius") ? parts.slice(1)
              : parts;
    return `radius-${arr.join("-")}`;
  }
  if (group === "typography") {
    const arr = parts[0] === "typography" ? parts.slice(1) : parts;
    return `${arr.join("-")}`;
  }
  return parts.join("-");
}

// 값 -> SCSS 문자열
function formatValue(group: string, v: Variable, resolved: any, dotted: string): string {
  if (v.resolvedType === "COLOR") return (typeof resolved === "string") ? resolved : toHex(resolved as RGBA);
  if (v.resolvedType === "FLOAT") {
    const p = dotted.toLowerCase();
    const isWeight = p.includes("font-weight");
    return isWeight ? String(Number(resolved) || 0) : `${Number(resolved) || 0}px`;
  }
  if (v.resolvedType === "STRING") return `"${String(resolved).replace(/"/g,'\\"')}"`;
  if (v.resolvedType === "BOOLEAN") return (resolved ? "true" : "false");
  return String(resolved);
}

// 별칭 id -> 경로 캐시
const aliasPathCache = new Map<string,string>();
async function varPathById(id: string) {
  if (aliasPathCache.has(id)) return aliasPathCache.get(id)!;
  const v = await figma.variables.getVariableByIdAsync(id);
  const p = v ? pathify(v.name) : id;
  aliasPathCache.set(id, p);
  return p;
}

// 별칭 타입 가드
type AliasLike = { type: "VARIABLE_ALIAS"; id: string };
const isAlias = (x:any): x is AliasLike => !!x && typeof x === "object" && x.type === "VARIABLE_ALIAS";




export async function buildScssVariables(
  collections: VariableCollection[],
  variables: Variable[],
  opts: Options = {}
) {
  const { preserveAliases = true, modeStrategy = "suffix" } = opts;
  const colById = new Map(collections.map(c => [c.id, c]));

  const lines: string[] = [];
  lines.push("// Generated from Figma Variables");
  lines.push("");

  let emitted = 0;

  for (const v of variables) {
    const col = colById.get(v.variableCollectionId)!;
    const group = groupFor(col, v);
    if (group === "misc") continue;

    const dotted = pathify(v.name);     // 예: "palette.gray.100"
    const baseName = nameFor(group, dotted);
    const modes = col.modes;
    const firstModeId = modes[0]?.modeId;

    for (const m of modes) {
      const modeId = m.modeId;
      const raw = v.valuesByMode?.[modeId] ?? (firstModeId ? v.valuesByMode?.[firstModeId] : undefined);
      if (raw === undefined) continue;

      // semantic이 아니면 첫 모드만 찍음
      if (group !== "semantic" && m !== modes[0]) continue;

      const modeSuffix = (group === "semantic" && modeStrategy === "suffix")
        ? `--${norm(m.name).replace(/\s+/g,"-")}` : "";
      const name = `${baseName}${modeSuffix}`;

      if (preserveAliases && isAlias(raw)) {
        // 별칭은 $alias 변수로 출력
        const aliasPath = await varPathById(raw.id);      // "palette.gray.700" 등
        const aliasGroup = groupFromPath(aliasPath);
        const aliasName = nameFor(aliasGroup, aliasPath); // color-gray-700 …
        lines.push(`$${name}: $${aliasName};`);
        emitted++;
        continue;
      }

      // 별칭 해소 후 리터럴 값 출력
      const resolved = await resolveValueAsync(raw as VariableValue, modeId);
      const valueStr = formatValue(group, v, resolved, dotted);
      lines.push(`$${name}: ${valueStr};`);
      emitted++;
    }
  }

  if (emitted === 0) lines.push("/* (No variables emitted) */");
  return lines.join("\n") + "\n";
}

