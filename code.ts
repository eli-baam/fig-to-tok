const DEFAULT_W = 400, DEFAULT_H = 560;

// 1) UI 먼저 띄우기 (기본 크기)
figma.showUI(__html__, { width: DEFAULT_W, height: DEFAULT_H });

// 2) 저장된 크기 있으면 적용(비동기)
figma.clientStorage.getAsync('uiSize').then(saved => {
  const w = saved?.w ?? DEFAULT_W;
  const h = saved?.h ?? DEFAULT_H;
  figma.ui.resize(w, h);
});

let uiReady = false;
const outbox:any[] = [];
function send(msg:any){ uiReady ? figma.ui.postMessage(msg) : outbox.push(msg); }

figma.ui.onmessage = async (msg) => {
  if (msg?.type === 'UI_READY') {
    uiReady = true; outbox.forEach(m => figma.ui.postMessage(m)); outbox.length = 0; return;
  }
  if (msg?.type === 'RESIZE') {
    const w = Math.max(280, Math.min(1200, Math.round(msg.width)));
    const h = Math.max(160, Math.min(1000, Math.round(msg.height)));
    figma.ui.resize(w, h);
    await figma.clientStorage.setAsync('uiSize', { w, h });
    return;
  }
  if (msg === 'CLOSE') figma.closePlugin();
};


function toHexByte(n: number): string {
  const v = Math.round(n * 255);
  const hex = v.toString(16);
  return hex.length === 1 ? "0" + hex : hex;
}
function rgbaToHex(rgba: RGBA): string {
  const hex = `#${toHexByte(rgba.r)}${toHexByte(rgba.g)}${toHexByte(rgba.b)}`;
  return rgba.a < 1 ? `${hex}${toHexByte(rgba.a)}` : hex;
}
function normalizePath(name: string): string {
  return name.split("/").map(s => s.trim()).filter(Boolean).join(".");
}
function getModeNameMap(collection: VariableCollection): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of collection.modes) map.set(m.modeId, m.name);
  return map;
}

// --- 별칭 해소 캐시 (aliasId + modeId -> 값) ---
const aliasCache = new Map<string, any>();

async function resolveValueAsync(
  v: VariableValue,
  modeId: string,
  seen: Set<string> = new Set()
): Promise<any> {
  if (typeof v !== "object" || v === null) return v;

  // 별칭 처리
  if ((v as any).type === "VARIABLE_ALIAS") {
    const aliasId = (v as any).id as string;
    const cacheKey = aliasId + "::" + modeId;
    if (aliasCache.has(cacheKey)) return aliasCache.get(cacheKey);

    if (seen.has(aliasId)) return null; // 순환 참조 방지
    seen.add(aliasId);

    const aliasVar = await figma.variables.getVariableByIdAsync(aliasId);
    if (!aliasVar) return null;

    const modeIds = Object.keys(aliasVar.valuesByMode || {});
    const fallback = modeIds.length > 0 ? modeIds[0] : "";

    const hasMode =
      aliasVar.valuesByMode &&
      aliasVar.valuesByMode[modeId] !== undefined &&
      aliasVar.valuesByMode[modeId] !== null;

    const aliased = hasMode
      ? aliasVar.valuesByMode[modeId]
      : (aliasVar.valuesByMode ? aliasVar.valuesByMode[fallback] : undefined);

    if (aliased === undefined) return null;

    const resolved = await resolveValueAsync(aliased, modeId, seen);
    aliasCache.set(cacheKey, resolved);
    return resolved;
  }

  if ("r" in v && "g" in v && "b" in v && "a" in v) return rgbaToHex(v as RGBA);
  return v;
}

// --- 큰 문자열을 청크로 UI에 전송 ---
function postJsonInChunks(json: string) {
  const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB
  const total = json.length;
  const chunks = Math.ceil(total / CHUNK_SIZE);
  figma.ui.postMessage({ type: "EXPORT_BEGIN", chunks });

  for (let i = 0; i < chunks; i++) {
    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, total);
    figma.ui.postMessage({
      type: "EXPORT_CHUNK",
      index: i,
      data: json.slice(start, end)
    });
  }
  figma.ui.postMessage({ type: "EXPORT_END" });
}


// --- Styles 읽기(신/구 API 모두 호환) ---
async function getLocalStyles() {
  const g: any = figma as any;
  const paint = g.getLocalPaintStylesAsync ? await g.getLocalPaintStylesAsync() : figma.getLocalPaintStyles();
  const text  = g.getLocalTextStylesAsync  ? await g.getLocalTextStylesAsync()  : figma.getLocalTextStyles();
  const effect= g.getLocalEffectStylesAsync? await g.getLocalEffectStylesAsync(): figma.getLocalEffectStyles();
  const grid  = g.getLocalGridStylesAsync  ? await g.getLocalGridStylesAsync()  : figma.getLocalGridStyles();
  return { paint, text, effect, grid };
}

// --- 변수 메타 캐시: id -> { id, namePath, collection, byMode } ---
const varMetaCache = new Map<string, any>();

async function getVariableMetaById(
  id: string,
  collectionsById: Map<string, VariableCollection>,
  modeNameById: Map<string, Map<string,string>> // collectionId -> (modeId -> modeName)
) {
  if (varMetaCache.has(id)) return varMetaCache.get(id);

  const v = await figma.variables.getVariableByIdAsync(id);
  if (!v) return null;

  const col = collectionsById.get(v.variableCollectionId);
  const modeMap = modeNameById.get(v.variableCollectionId) || new Map();

  // 모드별 해석값
  const byMode: Record<string, any> = {};
  const modeIds = Object.keys(v.valuesByMode || {});
  const fallback = modeIds[0] || "";

  for (const [modeId, modeName] of modeMap.entries()) {
    const raw = (v.valuesByMode && v.valuesByMode[modeId] != null)
      ? v.valuesByMode[modeId]
      : (v.valuesByMode ? v.valuesByMode[fallback] : undefined);

    if (raw === undefined) continue;
    byMode[modeName] = await resolveValueAsync(raw, modeId);
  }

  const namePath = normalizePath(v.name);
  const meta = {
    id,
    namePath,
    collection: col ? col.name : "",
    byMode
  };
  varMetaCache.set(id, meta);
  return meta;
}

// Paint 내 변수 바인딩을 찾아서 alias로 보관 (SOLID만 우선 지원)
async function serializePaint(p: Paint, ctx: {
  collectionsById: Map<string, VariableCollection>,
  modeNameById: Map<string, Map<string,string>>,
}) {
  const base: any = { type: p.type, opacity: (p as any).opacity ?? 1 };

  if (p.type === "SOLID") {
    const anyP: any = p;
    const alias = anyP.boundVariables && anyP.boundVariables.color; // VariableAlias?
    if (alias && alias.type === "VARIABLE_ALIAS") {
      const meta = await getVariableMetaById(alias.id, ctx.collectionsById, ctx.modeNameById);
      base.color = { $alias: meta?.namePath || alias.id, variableId: alias.id, byMode: meta?.byMode || {} };
    } else {
      base.color = rgbaToHex(anyP.color as RGBA);
    }
  } else {
    // 그라데언트/이미지 등은 그대로 요약(필요시 확장)
    base.summary = p.type;
  }
  return base;
}

async function serializePaintStyle(s: PaintStyle, ctx: any) {
  const paints: any[] = [];
  for (const p of s.paints) paints.push(await serializePaint(p, ctx));
  return {
    id: s.id,
    name: s.name,
    description: s.description || "",
    paints
  };
}

async function serializeTextStyle(s: TextStyle, ctx: any) {
  const anyS: any = s;
  const out: any = {
    id: s.id,
    name: s.name,
    description: s.description || "",
    fontName: s.fontName,
  };

  // 변수 바인딩된 텍스트 속성들만 기록
  const bind = (prop: string, val: any) => {
    const alias = anyS.boundVariables && anyS.boundVariables[prop];
    if (alias && alias.type === "VARIABLE_ALIAS") return { $aliasOf: prop, variableId: alias.id };
    return val;
  };
  out.fontSize = bind("fontSize", s.fontSize);
  out.lineHeight = bind("lineHeight", s.lineHeight);
  out.letterSpacing = bind("letterSpacing", s.letterSpacing);
  out.paragraphSpacing = bind("paragraphSpacing", s.paragraphSpacing);
  out.textCase = bind("textCase", s.textCase);
  out.textDecoration = bind("textDecoration", s.textDecoration);

  // ⛔️ 여기에 있던 s.fills 처리 블록은 제거
  return out;
}

// 폰트 웨이트 매핑 (필요하면 추가)
function weightFromStyle(style: string): number {
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

// W3C dimension 포맷 헬퍼 (px 고정; 필요 시 unit 스위치 가능)
function dimRef(path: string) {
  return { value: `{${path}}`, unit: "px" };
}

async function getTokenPathByVarId(
  variableId: string,
  collectionsById: Map<string, VariableCollection>
): Promise<string | null> {
  const v = await figma.variables.getVariableByIdAsync(variableId);
  if (!v) return null;
  // "color/bg/default" → "color.bg.default"
  return v.name.split("/").map(s=>s.trim()).filter(Boolean).join(".");
}

type ModeName = string;

// textStyles: run()에서 수집한 로컬 텍스트 스타일 목록
async function buildW3CTypography(
  textStyles: TextStyle[],
  collectionsById: Map<string, VariableCollection>,
  baseModeName: ModeName = "Mode 1" // 숫자/이름: 네 파일의 기본 모드 이름으로
) {
  // 폰트 패밀리는 공통 변수 하나로 묶여 있으면 그걸 참조 (없으면 실제 값 사용)
  // 예: { "typography.font-family": "Pretendard" } → "{typography.font-family}"
  const defaultFontFamilyRef = "{typography.font-family}"; // 네 토큰 구조를 기준으로 함 :contentReference[oaicite:1]{index=1}

  const out: Record<string, any> = {}; // "type styles": {...}

  for (const s of textStyles) {
    const anyS: any = s;
    const styleName = s.name; // 그대로 쓰거나 normalize 필요하면 여기서 처리

    // 변수 바운드 가져오기 (없으면 리터럴 값 사용)
    const fontSizeVar = anyS.boundVariables?.fontSize;
    const lineHeightVar = anyS.boundVariables?.lineHeight;
    const letterSpVar = anyS.boundVariables?.letterSpacing;

    // 경로 참조 만들기
    const fontSizePath = fontSizeVar?.type === "VARIABLE_ALIAS"
      ? await getTokenPathByVarId(fontSizeVar.id, collectionsById)
      : null;

    const lineHeightPath = lineHeightVar?.type === "VARIABLE_ALIAS"
      ? await getTokenPathByVarId(lineHeightVar.id, collectionsById)
      : null;

    const letterSpPath = letterSpVar?.type === "VARIABLE_ALIAS"
      ? await getTokenPathByVarId(letterSpVar.id, collectionsById)
      : null;

    // 값 채우기: 레퍼런스 있으면 참조, 없으면 리터럴
    const fontSize = fontSizePath ? dimRef(fontSizePath) : { value: Number(s.fontSize) || 0, unit: "px" };
    const lineHeight = lineHeightPath ? dimRef(lineHeightPath)
                                      : (typeof s.lineHeight === "object" && (s.lineHeight as any).unit === "AUTO"
                                          ? 1 : { value: Number((s.lineHeight as any)?.value || 0), unit: "px" });

    const letterSpacing = letterSpPath ? dimRef(letterSpPath)
                                       : { value: Number((s.letterSpacing as any)?.value || 0), unit: "px" };

    // 폰트 패밀리 & 웨이트
    const fontFamily = (s.fontName as FontName).family
      ? (defaultFontFamilyRef) // 공통 토큰이 있으면 참조로
      : (s.fontName as FontName).family;

    const fontWeight = weightFromStyle((s.fontName as FontName).style);

    out[styleName] = {
      $type: "typography",
      $value: {
        fontFamily,                // "{typography.font-family}" 형태의 참조
        fontSize,                  // { value: "{...}", unit: "px" } 또는 리터럴
        fontWeight,                // 700 같은 숫자
        letterSpacing,             // { value, unit: "px" }
        lineHeight                 // { value, unit: "px" } 혹은 1(자동)
      }
    };
  }

  return { "type styles": out };
}




async function run() {
  try {
    if (!(figma as any).variables) {
      figma.notify("이 환경에선 Variables API를 사용할 수 없습니다.");
      figma.closePlugin();
      return;
    }

    const allCollections = await figma.variables.getLocalVariableCollectionsAsync();
    const allVariables = await figma.variables.getLocalVariablesAsync();

    // collectionId → collection, modeId → modeName 맵
    const collectionsById = new Map<string, VariableCollection>();
    const modeNameById = new Map<string, Map<string,string>>();
    for (const c of allCollections) {
      collectionsById.set(c.id, c);
      const m = new Map<string,string>();
      for (const mm of c.modes) m.set(mm.modeId, mm.name);
      modeNameById.set(c.id, m);
    }

    // collectionId -> Variable[]
    const varsByCollection = new Map<string, Variable[]>();
    for (const v of allVariables) {
      const arr = varsByCollection.get(v.variableCollectionId) || [];
      arr.push(v);
      varsByCollection.set(v.variableCollectionId, arr);
    }

    const tokensByMode: Record<string, Record<string, any>> = {};

    for (const col of allCollections) {
      const modeNameMap = getModeNameMap(col);
      const colVars = varsByCollection.get(col.id) || [];

      for (const kv of modeNameMap.entries()) {
        const modeId = kv[0];
        const modeName = kv[1];
        if (!tokensByMode[modeName]) tokensByMode[modeName] = {};

        for (const v of colVars) {
          const modeIds = Object.keys(v.valuesByMode || {});
          const fallback = modeIds.length > 0 ? modeIds[0] : "";
          const hasMode =
            v.valuesByMode &&
            v.valuesByMode[modeId] !== undefined &&
            v.valuesByMode[modeId] !== null;

          const raw = hasMode
            ? v.valuesByMode[modeId]
            : (v.valuesByMode ? v.valuesByMode[fallback] : undefined);

          if (raw === undefined) continue;

          const value = await resolveValueAsync(raw, modeId);

          const $type =
            v.resolvedType === "COLOR" ? "color" :
            v.resolvedType === "FLOAT" ? "number" :
            v.resolvedType === "STRING" ? "string" :
            v.resolvedType === "BOOLEAN" ? "boolean" : "unknown";

          const key = normalizePath(v.name);
          tokensByMode[modeName][key] = { $type, $value: value };
        }
      }
    }

    const { paint: paintStyles, text: textStyles, effect: effectStyles, grid: gridStyles } = await getLocalStyles();

    const styles = {
      paints: [] as any[],
      text: [] as any[],
      effects: [] as any[],
      grids: [] as any[],
    };

    for (const ps of paintStyles) styles.paints.push(await serializePaintStyle(ps, { collectionsById, modeNameById }));
    for (const ts of textStyles)  styles.text.push(await serializeTextStyle(ts, { collectionsById, modeNameById }));

    // 효과/그리드는 요약(필요시 확장)
    for (const es of effectStyles) styles.effects.push({ id: es.id, name: es.name, description: es.description || "", effects: es.effects });
    for (const gs of gridStyles)   styles.grids.push({ id: gs.id, name: gs.name, description: gs.description || "", layoutGrids: gs.layoutGrids });


    const payload = {
      $schema: "https://design-tokens.org/schema.json",
      $collections: allCollections.map(c => ({
        id: c.id, name: c.name, modes: c.modes.map(m => m.name)
      })),
      tokensByMode,
      styles
    };


    const w3c = await buildW3CTypography(textStyles, collectionsById);

    // 큰 JSON → 청크 전송
    // const json = JSON.stringify(payload, null, 2);
    const json = JSON.stringify(w3c, null, 2);
    postJsonInChunks(json);

  } catch (err) {
    console.error(err);
    const msg = (err && (err as any).message) ? (err as any).message : String(err);
    figma.ui.postMessage({ type: "ERROR", message: msg });
  }
}

run();