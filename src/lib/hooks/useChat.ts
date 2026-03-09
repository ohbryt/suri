"use client";

import { useState, useCallback, useRef } from "react";
import type { ChatMessage, AgentEvent } from "@/lib/types";

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCost, setTotalCost] = useState(0);
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (content: string, apiKey: string, provider: string = "claude") => {
    if (!content.trim() || !apiKey) return;
    setIsLoading(true);
    abortRef.current = new AbortController();

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      timestamp: Date.now(),
    };

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      isStreaming: true,
      toolCalls: [],
      toolResults: [],
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    const allMessages = [...messages, userMsg];

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: allMessages, apiKey, provider }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        let currentEvent = "";
        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7);
          } else if (line.startsWith("data: ") && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6)) as AgentEvent;
              handleEvent(data, assistantMsg.id);
            } catch {}
            currentEvent = "";
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, content: m.content + `\n\n❌ Error: ${err.message}`, isStreaming: false }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      setActiveTools([]);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id ? { ...m, isStreaming: false } : m
        )
      );
    }
  }, [messages]);

  function handleEvent(event: AgentEvent, assistantId: string) {
    switch (event.type) {
      case "message_delta":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + event.content }
              : m
          )
        );
        break;

      case "tool_start":
        setActiveTools((prev) => [...prev, event.tool]);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  toolCalls: [
                    ...(m.toolCalls || []),
                    { id: crypto.randomUUID(), name: event.tool, input: event.input },
                  ],
                }
              : m
          )
        );
        break;

      case "tool_result":
        setActiveTools((prev) => prev.filter((t) => t !== event.tool));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  toolResults: [
                    ...(m.toolResults || []),
                    {
                      toolCallId: "",
                      toolName: event.tool,
                      output: event.output,
                      isError: event.isError,
                      durationMs: event.durationMs,
                    },
                  ],
                }
              : m
          )
        );
        break;

      case "token_usage":
        setTotalCost((prev) => prev + event.cost);
        break;

      case "error":
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content + `\n\n❌ ${event.message}` }
              : m
          )
        );
        break;

      case "done":
        setTotalCost(event.totalCost);
        break;
    }
  }

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setActiveTools([]);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setTotalCost(0);
  }, []);

  return { messages, isLoading, totalCost, activeTools, sendMessage, cancel, clear };
}
