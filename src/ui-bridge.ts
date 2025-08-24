let uiReady = false;
const outbox: any[] = [];

export function showUI(initial: {width:number; height:number}) {
  figma.showUI(__html__, initial);
}

export function onMessage(handler: (msg:any)=>void) {
  figma.ui.onmessage = (msg) => {
    if (msg?.type === "UI_READY") {
      uiReady = true;
      outbox.forEach(m => figma.ui.postMessage(m));
      outbox.length = 0;
      return;
    }
    handler(msg);
  };
}

export function send(msg:any) {
  if (uiReady) figma.ui.postMessage(msg);
  else outbox.push(msg);
}

export function postJsonInChunks(json: string, chunkSize = 1024*1024) {
  const chunks = Math.ceil(json.length / chunkSize);
  send({ type: "EXPORT_BEGIN", chunks });
  for (let i = 0; i < chunks; i++) {
    send({ type: "EXPORT_CHUNK", index: i, data: json.slice(i*chunkSize, (i+1)*chunkSize) });
  }
  send({ type: "EXPORT_END" });
}
