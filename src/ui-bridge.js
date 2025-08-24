let uiReady = false;
const outbox = [];
export function showUI(initial) {
    figma.showUI(__html__, initial);
}
export function onMessage(handler) {
    figma.ui.onmessage = (msg) => {
        if ((msg === null || msg === void 0 ? void 0 : msg.type) === "UI_READY") {
            uiReady = true;
            outbox.forEach(m => figma.ui.postMessage(m));
            outbox.length = 0;
            return;
        }
        handler(msg);
    };
}
export function send(msg) {
    if (uiReady)
        figma.ui.postMessage(msg);
    else
        outbox.push(msg);
}
export function postJsonInChunks(json, chunkSize = 1024 * 1024) {
    const chunks = Math.ceil(json.length / chunkSize);
    send({ type: "EXPORT_BEGIN", chunks });
    for (let i = 0; i < chunks; i++) {
        send({ type: "EXPORT_CHUNK", index: i, data: json.slice(i * chunkSize, (i + 1) * chunkSize) });
    }
    send({ type: "EXPORT_END" });
}
