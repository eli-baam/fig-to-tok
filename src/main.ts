import { showUI, onMessage, postJsonInChunks, } from "./ui-bridge";
import { getVariables, buildTokensByMode } from "./variables";
import { getLocalStyles, buildTypeStyles, buildShadows } from "./styles";
import { buildW3CFromVariables } from "./w3c";
import { buildScssVariables } from "./format-scss";

let C: VariableCollection[] = [];
let V: Variable[] = [];

async function refreshVariables() {
  const { collections, variables } = await getVariables();
  C = collections;
  V = variables;
}

// 파일명에서 위험한 문자만 정리 (한글/공백 허용)
function sanitizeFilename(s: string) {
  return (s || "figma")
    .replace(/[\\/:*?"<>|]+/g, "-")   // 금지문자 → -
    .replace(/\s+/g, "-")             // 공백 → -
    .replace(/-+/g, "-")              // 중복 하이픈 정리
    .replace(/^-|-$/g, "");           // 양끝 하이픈 제거
}

// 숫자 두 자리 패드
const pad2 = (n: number) => String(n).padStart(2, "0");

// yymmddhhmmss 포맷(로컬 시간 기준). UTC로 쓰고 싶으면 useUTC=true
function yymmddhhmmss(useUTC = false) {
  const d = new Date();
  const Y = (useUTC ? d.getUTCFullYear() : d.getFullYear()) % 100;
  const M = (useUTC ? d.getUTCMonth() + 1 : d.getMonth() + 1);
  const D = (useUTC ? d.getUTCDate() : d.getDate());
  const h = (useUTC ? d.getUTCHours() : d.getHours());
  const m = (useUTC ? d.getUTCMinutes() : d.getMinutes());
  const s = (useUTC ? d.getUTCSeconds() : d.getSeconds());
  return `${pad2(Y)}${pad2(M)}${pad2(D)}${pad2(h)}${pad2(m)}${pad2(s)}`;
}

// 확장자에 맞는 파일명 만들기
function buildExportName(ext: "json" | "scss") {
  const base = sanitizeFilename(figma.root.name || "figma");
  const stamp = yymmddhhmmss();        // ← "250824153712" 같은 형태
  return `tokens-${stamp}.${ext}`;
}

async function run() {
  try {
    const saved = await figma.clientStorage.getAsync("uiSize");
    showUI({ width: (saved?.w||380), height: (saved?.h||190) });

    await refreshVariables();

    // 메시지 수신(RESIZE/CLOSE)
    onMessage(async (msg:any) => {
      if (msg?.type === "RESIZE") {
        const w = Math.max(280, Math.min(1200, Math.round(msg.width)));
        const h = Math.max(160, Math.min(1000, Math.round(msg.height)));
        figma.ui.resize(w,h);
        await figma.clientStorage.setAsync("uiSize",{w,h});
      }
      if (msg === "CLOSE") figma.closePlugin();

      if (msg?.type === "REQUEST_SCSS") {
        if (!C.length || !V.length) await refreshVariables();
        const scss = await buildScssVariables(C, V, {
          preserveAliases: true,
          modeStrategy: "suffix",
        });
        const scssName = buildExportName("scss");

        figma.ui.postMessage({
          type: "EXPORT_TEXT",
          filename: scssName,
          mime: "text/x-scss",
          data: scss || "/* (No variables emitted) */\n"
        });
        return;
      }
      
      if (msg?.type === "REQUEST_JSON") {
        const tokensByMode = await buildTokensByMode(C, V);
        const { text, effect } = await getLocalStyles();
        const w3cVars   = await buildW3CFromVariables(C, V, tokensByMode);
        const w3cType   = await buildTypeStyles(text);
        const w3cShadow = buildShadows(effect);
        const json = JSON.stringify({ ...w3cVars, ...w3cType, ...w3cShadow }, null, 2);
        const jsonName = buildExportName("json");

        postJsonInChunks(json, 1 << 20, {
          filename: jsonName,               // ← 여기!
          mime: "application/json",
        });
      }
    });
  } catch (e) {
    console.error(e);
    figma.ui.postMessage({ type: "ERROR", message: (e as any)?.message || String(e) });
  }
}

run();