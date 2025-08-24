import { showUI, onMessage, postJsonInChunks } from "./ui-bridge";
import { getVariables, buildTokensByMode } from "./variables";
import { getLocalStyles, buildTypeStyles, buildShadows } from "./styles";
import { buildW3CFromVariables } from "./w3c";

async function run() {
  try {
    const saved = await figma.clientStorage.getAsync("uiSize");
    showUI({ width: (saved?.w||380), height: (saved?.h||190) });

    // 메시지 수신(RESIZE/CLOSE)
    onMessage(async (msg:any) => {
      if (msg?.type === "RESIZE") {
        const w = Math.max(280, Math.min(1200, Math.round(msg.width)));
        const h = Math.max(160, Math.min(1000, Math.round(msg.height)));
        figma.ui.resize(w,h);
        await figma.clientStorage.setAsync("uiSize",{w,h});
      }
      if (msg === "CLOSE") figma.closePlugin();
    });

    // 1) variables
    const { collections, variables } = await getVariables();
    const tokensByMode = await buildTokensByMode(collections, variables);

    // 2) styles
    const { text, effect } = await getLocalStyles();

    // 3) W3C 포맷
    const w3cVars   = await buildW3CFromVariables(collections, variables, tokensByMode);
    const w3cType   = await buildTypeStyles(text);
    const w3cShadow = buildShadows(effect);

    const payload = { ...w3cVars, ...w3cType, ...w3cShadow };
    const json = JSON.stringify(payload, null, 2);
    postJsonInChunks(json);
  } catch (e) {
    console.error(e);
    figma.ui.postMessage({ type: "ERROR", message: (e as any)?.message || String(e) });
  }
}

run();
