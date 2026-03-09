"use client";

import { useState, useRef, useEffect } from "react";
import type { ChatMessage } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { ToolCallCard } from "./ToolCallCard";

interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  activeTools: string[];
  totalCost: number;
  onSend: (message: string) => void;
  onCancel: () => void;
}

export function ChatPanel({
  messages,
  isLoading,
  activeTools,
  totalCost,
  onSend,
  onCancel,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeTools]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4 scrollbar-hide">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-6xl mb-4">🦅</div>
            <h2 className="text-2xl font-bold mb-2">
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                SURI
              </span>
            </h2>
            <p className="text-text-muted text-sm max-w-md">
              코드를 작성하고 실행하는 AI 에이전트<br />
              무엇을 도와드릴까요?
            </p>
            <div className="flex gap-2 mt-6 flex-wrap justify-center">
              {[
                "React 앱 만들어줘",
                "Python으로 데이터 분석",
                "웹 스크래핑 해줘",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus(); }}
                  className="px-3 py-2 text-xs rounded-xl bg-white/[0.04] border border-white/[0.08] text-text-secondary hover:bg-white/[0.08] hover:border-white/[0.15] transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className="animate-fade-in">
            <MessageBubble message={msg} />
            {/* Tool calls & results */}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div className="ml-2 mt-2 space-y-2">
                {msg.toolCalls.map((tc, i) => (
                  <ToolCallCard
                    key={tc.id}
                    toolCall={tc}
                    result={msg.toolResults?.[i]}
                    isActive={activeTools.includes(tc.name)}
                  />
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Active tool indicator */}
        {isLoading && activeTools.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-text-muted animate-fade-in ml-2">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin-slow" />
            <span>{activeTools[activeTools.length - 1]} 실행 중...</span>
          </div>
        )}

        {/* Typing indicator */}
        {isLoading && activeTools.length === 0 && (
          <div className="flex items-center gap-1.5 ml-2 animate-fade-in">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-primary/60"
                style={{ animation: `pulse-dot 1.4s ${i * 0.2}s ease-in-out infinite` }}
              />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Cost bar */}
      {totalCost > 0 && (
        <div className="px-4 py-1 text-[10px] text-text-muted text-right border-t border-white/[0.04]">
          💰 ${totalCost.toFixed(4)}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-white/[0.06] p-4">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요... (Shift+Enter: 줄바꿈)"
              rows={1}
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-2xl text-sm text-text resize-none focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 placeholder:text-text-muted/50 transition-all"
              style={{ maxHeight: "160px" }}
            />
          </div>
          {isLoading ? (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-3 bg-red-500/20 text-red-400 rounded-2xl text-sm font-semibold hover:bg-red-500/30 transition-all shrink-0"
            >
              ■ 중지
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="px-4 py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-2xl text-sm font-semibold hover:shadow-lg hover:shadow-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all shrink-0"
            >
              전송 ↑
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
