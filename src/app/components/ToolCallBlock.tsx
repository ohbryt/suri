"use client";

import type { ToolCall, ToolResult } from "@/lib/types";

const TOOL_ICONS: Record<string, string> = {
  shell_execute: "⚡",
  file_read: "📖",
  file_write: "✏️",
  file_edit: "🔧",
  file_list: "📁",
  web_search: "🔍",
  message_user: "💬",
  idle: "✅",
};

const TOOL_LABELS: Record<string, string> = {
  shell_execute: "명령 실행",
  file_read: "파일 읽기",
  file_write: "파일 생성",
  file_edit: "파일 수정",
  file_list: "파일 목록",
  web_search: "웹 검색",
  message_user: "메시지",
  idle: "완료",
};

export function ToolCallBlock({
  call,
  result,
  isRunning,
}: {
  call: ToolCall;
  result?: ToolResult;
  isRunning: boolean;
}) {
  const icon: string = TOOL_ICONS[call.name] || "🔨";
  const label: string = TOOL_LABELS[call.name] || call.name;
  const input = call.input as Record<string, string>;

  return (
    <div className="my-2 rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-semibold text-zinc-300">{label}</span>
        {isRunning && (
          <div className="flex gap-1 ml-auto">
            <div className="w-1 h-1 rounded-full bg-primary" style={{ animation: "pulse-dot 1.4s infinite ease-in-out" }} />
            <div className="w-1 h-1 rounded-full bg-primary" style={{ animation: "pulse-dot 1.4s infinite ease-in-out 0.2s" }} />
            <div className="w-1 h-1 rounded-full bg-primary" style={{ animation: "pulse-dot 1.4s infinite ease-in-out 0.4s" }} />
          </div>
        )}
        {result && !isRunning && (
          <span className={`ml-auto text-[10px] font-mono ${result.isError ? "text-red-400" : "text-emerald-400"}`}>
            {result.isError ? "ERROR" : "OK"}{result.durationMs ? ` · ${result.durationMs}ms` : ""}
          </span>
        )}
      </div>

      {/* Input */}
      {call.name === "shell_execute" && input.command && (
        <div className="px-3 py-2 bg-black/30">
          <code className="text-[11px] text-emerald-300 font-mono break-all">
            $ {String(input.command)}
          </code>
        </div>
      )}
      {call.name === "file_write" && input.path && (
        <div className="px-3 py-1.5">
          <span className="text-[11px] text-zinc-400 font-mono">{String(input.path)}</span>
        </div>
      )}
      {call.name === "web_search" && input.query && (
        <div className="px-3 py-1.5">
          <span className="text-[11px] text-zinc-400">🔎 {String(input.query)}</span>
        </div>
      )}

      {/* Output */}
      {result && result.output && (
        <div className="px-3 py-2 border-t border-white/[0.04] max-h-[200px] overflow-y-auto scrollbar-hide">
          <pre className={`text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed ${result.isError ? "text-red-300" : "text-zinc-400"}`}>
            {result.output.length > 2000 ? result.output.slice(0, 2000) + "\n...(truncated)" : result.output}
          </pre>
        </div>
      )}
    </div>
  );
}
