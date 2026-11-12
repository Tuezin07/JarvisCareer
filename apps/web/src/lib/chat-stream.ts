import type { ChatStreamEvent } from "@jarvis/shared";
import { API_URL, ApiError, refreshSession } from "./api";

/**
 * Envia uma mensagem e consome a resposta em streaming (text/event-stream via POST,
 * que o EventSource não suporta). Erros antes do stream viram ApiError.
 */
export async function sendChatMessage(
  conversationId: string,
  text: string,
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const post = () =>
    fetch(`${API_URL}/conversations/${conversationId}/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });

  let res = await post();
  if (res.status === 401 && (await refreshSession())) res = await post();
  if (!res.ok || !res.body) {
    let message = `Erro ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      message = Array.isArray(body.message) ? body.message[0] : (body.message ?? message);
    } catch {
      // corpo não-JSON
    }
    throw new ApiError(res.status, message);
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const line of frame.split("\n")) {
        if (line.startsWith("data: ")) onEvent(JSON.parse(line.slice(6)) as ChatStreamEvent);
      }
    }
  }
}
