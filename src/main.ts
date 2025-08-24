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

        console.log("[FIG to TOK] SCSS length =", scss.length); // 🔎 확인

        figma.ui.postMessage({
          type: "EXPORT_TEXT",
          filename: "tokens.scss",
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
        const payload = { ...w3cVars, ...w3cType, ...w3cShadow };
        const json = JSON.stringify(payload, null, 2);
        postJsonInChunks(json, 1024 * 1024, { filename: "tokens.json" });
        return;
      }
    });
  } catch (e) {
    console.error(e);
    figma.ui.postMessage({ type: "ERROR", message: (e as any)?.message || String(e) });
  }
}

run();