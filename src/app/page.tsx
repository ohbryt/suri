"use client";

import { useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { useChat } from "@/lib/hooks/useChat";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [keySet, setKeySet] = useState(false);
  const { messages, isLoading, totalCost, activeTools, sendMessage, cancel, clear } = useChat();

  if (!keySet) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🦅</div>
            <h1 className="text-3xl font-black mb-2">
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">SURI</span>
            </h1>
            <p className="text-zinc-500 text-sm">AI 에이전트 플랫폼</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
            <label className="block text-xs font-semibold text-zinc-400 mb-2">
              Claude API Key
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
              onKeyDown={(e) => {
                if (e.key === "Enter" && apiKey.trim()) setKeySet(true);
              }}
            />
            <p className="text-[10px] text-zinc-600 mt-2">
              API 키는 서버로만 전송되며 저장되지 않습니다 (BYOK)
            </p>
            <button
              onClick={() => apiKey.trim() && setKeySet(true)}
              disabled={!apiKey.trim()}
              className="w-full mt-4 px-4 py-3 bg-gradient-to-r from-primary to-primary-dark text-white rounded-xl font-semibold text-sm disabled:opacity-30 hover:shadow-lg hover:shadow-primary/20 transition-all"
            >
              시작하기
            </button>
          </div>
          <p className="text-center text-[10px] text-zinc-600 mt-4">
            Anthropic API 키가 필요합니다 ·{" "}
            <a href="https://console.anthropic.com" target="_blank" className="text-primary hover:underline">
              키 발급받기 →
            </a>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        activeTools={activeTools}
        totalCost={totalCost}
        onSend={(msg) => sendMessage(msg, apiKey)}
        onCancel={cancel}
      />
    </div>
  );
}
