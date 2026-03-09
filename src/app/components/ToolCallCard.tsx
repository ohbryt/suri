"use client";

import type { ToolCall, ToolResult } from "@/lib/types";

const TOOL_META: Record<string, { icon: string; label: string }> = {
  shell_execute: { icon: "⚡", label: "명령 실행" },
  file_read: { icon: "📖", label: "파일 읽기" },
  file_write: { icon: "✏️", label: "파일 생성" },
  file_edit: { icon: "🔧", label: "파일 수정" },
  file_list: { icon: "📁", label: "파일 목록" },
  web_search: { icon: "🔍", label: "웹 검색" },
  web_search_deep: { icon: "🔬", label: "심층 검색" },
  create_document: { icon: "📊", label: "문서 생성" },
  deploy_preview: { icon: "🚀", label: "미리보기 배포" },
  create_project: { icon: "🏗️", label: "프로젝트 생성" },
  think: { icon: "🧠", label: "사고 중" },
  web_crawl: { icon: "🌐", label: "페이지 읽기" },
  bulk_file_write: { icon: "📦", label: "파일 일괄 생성" },
  message_user: { icon: "💬", label: "메시지" },
  idle: { icon: "✅", label: "완료" },
};

export function ToolCallCard({
  toolCall,
  result,
  isActive,
}: {
  toolCall: ToolCall;
  result?: ToolResult;
  isActive: boolean;
}) {
  const meta = TOOL_META[toolCall.name] || { icon: "🔨", label: toolCall.name };

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/[0.04]">
        <span className="text-sm">{meta.icon}</span>
        <span className="text-xs font-semibold text-zinc-300">{meta.label}</span>
        {isActive && (
          <div className="flex gap-1 ml-auto">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1 h-1 rounded-full bg-primary"
                style={{ animation: `pulse-dot 1.4s ${i * 0.2}s ease-in-out infinite` }}
              />
            ))}
          </div>
        )}
        {result && !isActive && (
          <span className={`ml-auto text-[10px] font-mono ${result.isError ? "text-red-400" : "text-emerald-400"}`}>
            {result.isError ? "ERROR" : "OK"}
            {result.durationMs ? ` · ${result.durationMs}ms` : ""}
          </span>
        )}
      </div>

      {/* Input preview */}
      {toolCall.name === "shell_execute" && toolCall.input.command && (
        <div className="px-3 py-2 bg-black/30">
          <code className="text-[11px] text-emerald-300 font-mono break-all">
            $ {String(toolCall.input.command)}
          </code>
        </div>
      )}
      {toolCall.name === "file_write" && toolCall.input.path && (
        <div className="px-3 py-1.5">
          <span className="text-[11px] text-zinc-400 font-mono">{String(toolCall.input.path)}</span>
        </div>
      )}
      {toolCall.name === "web_search" && toolCall.input.query && (
        <div className="px-3 py-1.5">
          <span className="text-[11px] text-zinc-400">🔎 {String(toolCall.input.query)}</span>
        </div>
      )}
      {toolCall.name === "web_search_deep" && toolCall.input.queries && (
        <div className="px-3 py-2 space-y-1">
          {(toolCall.input.queries as string[]).map((q: string, i: number) => (
            <div key={i} className="text-[11px] text-cyan-400 font-mono">
              🔬 {q}
            </div>
          ))}
          {toolCall.input.max_sources && (
            <div className="text-[10px] text-zinc-500">
              최대 {String(toolCall.input.max_sources)}개 소스
            </div>
          )}
        </div>
      )}

      {toolCall.name === "create_document" && (
        <div className="px-3 py-2 space-y-1">
          <div className="text-[11px] text-purple-400 font-mono">
            📊 {String(toolCall.input.type || "").toUpperCase()} &middot; {String(toolCall.input.filename || "")}
          </div>
          <div className="text-[10px] text-zinc-500 truncate">{String(toolCall.input.title || "")}</div>
        </div>
      )}
      {toolCall.name === "deploy_preview" && toolCall.input.path && (
        <div className="px-3 py-1.5">
          <span className="text-[11px] text-amber-400 font-mono">🚀 {String(toolCall.input.path)}</span>
        </div>
      )}

      {/* Artifact download links in output */}
      {result && result.output && /\/api\/artifacts\//.test(result.output) && !result.isError && (
        <div className="px-3 py-2 border-t border-white/[0.04]">
          {result.output.match(/\/api\/artifacts\/[^\s)]+/g)?.map((link, i) => (
            <a
              key={i}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-primary/10 hover:bg-primary/20 transition-colors mb-1 last:mb-0"
            >
              <span className="text-[11px]">{link.endsWith(".zip") ? "📦" : link.endsWith(".pptx") ? "📊" : "🔗"}</span>
              <span className="text-[11px] text-primary font-medium truncate">{link.split("/").pop()}</span>
              <svg className="w-3 h-3 text-primary/60 ml-auto flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </a>
          ))}
        </div>
      )}

      {/* Output */}
      {result && result.output && !/\/api\/artifacts\//.test(result.output) && (
        <div className="px-3 py-2 border-t border-white/[0.04] max-h-[200px] overflow-y-auto scrollbar-hide">
          <pre className={`text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed ${result.isError ? "text-red-300" : "text-zinc-400"}`}>
            {result.output.length > 2000 ? result.output.slice(0, 2000) + "\n...(truncated)" : result.output}
          </pre>
        </div>
      )}
    </div>
  );
}
