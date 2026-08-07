type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: any;
};

declare global {
  interface Window {
    openai?: {
      toolOutput?: any;
      widgetState?: any;
      setWidgetState?: (state: any) => void;
      callTool?: (name: string, args: any) => Promise<any>;
      sendFollowUpMessage?: (args: { prompt: string; scrollToBottom?: boolean } | string) => Promise<void> | void;
      openExternal?: (args: { href: string; redirectUrl?: boolean }) => Promise<void> | void;
    };
  }
}

let requestId = 0;
const pending = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();

function post(method: string, params: any) {
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
}

function request(method: string, params: any) {
  requestId += 1;
  const id = requestId;
  window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  return new Promise<any>((resolve, reject) => pending.set(id, { resolve, reject }));
}

export function subscribeToolOutput(listener: (output: any) => void) {
  const initial = window.openai?.toolOutput;
  if (initial) listener(initial.structuredContent ?? initial.structured_content ?? initial);

  const onMessage = (event: MessageEvent<JsonRpcMessage>) => {
    if (event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.jsonrpc !== "2.0") return;
    if (message.id !== undefined && pending.has(message.id)) {
      const handler = pending.get(message.id)!;
      pending.delete(message.id);
      if (message.error) handler.reject(message.error);
      else handler.resolve(message.result);
      return;
    }
    if (message.method === "ui/initialize" && message.id !== undefined) {
      window.parent.postMessage({ jsonrpc: "2.0", id: message.id, result: {} }, "*");
      return;
    }
    if (message.method === "ui/notifications/tool-result") {
      const output = message.params?.structuredContent ?? message.params?.structured_content;
      if (output) listener(output);
    }
  };
  window.addEventListener("message", onMessage, { passive: true });
  return () => window.removeEventListener("message", onMessage);
}

export async function callTool(name: string, args: any) {
  if (window.openai?.callTool) return window.openai.callTool(name, args);
  return request("tools/call", { name, arguments: args });
}

export function saveWidgetState(state: any) {
  window.openai?.setWidgetState?.(state);
}

export function restoredWidgetState() {
  return window.openai?.widgetState;
}

export async function openExternalLink(href: string) {
  if (window.openai?.openExternal) {
    try {
      await window.openai.openExternal({ href, redirectUrl: false });
      return;
    } catch {
      // Fall through when a host exposes the extension but declines this URL.
    }
  }
  const opened = window.open(href, "_blank", "noopener,noreferrer");
  if (opened) opened.opener = null;
}

export function publishConfirmedPlan(plan: any) {
  const text = `用户已确认资产来源方案: ${JSON.stringify(plan)}\n请仅导入 source=reuse_asset_center 的最终选择，并仅生成 source=generate_new/generate_action 的缺口。`;
  post("ui/update-model-context", { content: [{ type: "text", text }] });
  if (window.openai?.sendFollowUpMessage) {
    void window.openai.sendFollowUpMessage({ prompt: "我已确认资产方案，请按最终选择开始复用和制作。" });
  } else {
    post("ui/message", { content: [{ type: "text", text: "我已确认资产方案，请按最终选择开始复用和制作。" }] });
  }
}
