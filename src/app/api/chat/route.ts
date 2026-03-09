import { NextRequest } from "next/server";
import { runAgent } from "@/agent/orchestrator";
import type { ChatMessage } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { messages, apiKey } = (await req.json()) as {
    messages: ChatMessage[];
    apiKey: string;
  };

  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        for await (const event of runAgent(messages, apiKey)) {
          send(event.type, event);
        }
      } catch (err: any) {
        send("error", { type: "error", code: "internal", message: err.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
