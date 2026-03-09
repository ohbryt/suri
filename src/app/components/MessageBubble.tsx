"use client";

import type { ChatMessage } from "@/lib/types";

// Parse inline citations [1][2] and source blocks into rich elements
function renderContent(text: string) {
  const parts: Array<{ type: "text" | "citation" | "source-header" | "source-item"; value: string; num?: number; url?: string }> = [];

  const lines = text.split("\n");
  let inSources = false;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];

    // Detect sources section header
    if (/^##\s*📚\s*Sources?/i.test(line) || /^##\s*소스/i.test(line)) {
      inSources = true;
      parts.push({ type: "source-header", value: "📚 Sources" });
      continue;
    }

    // Parse source items: [1] Title - URL
    if (inSources) {
      const sourceMatch = line.match(/^\[(\d+)\]\s*(.+?)\s*[-–]\s*(https?:\/\/\S+)/);
      if (sourceMatch) {
        parts.push({
          type: "source-item",
          value: sourceMatch[2],
          num: parseInt(sourceMatch[1]),
          url: sourceMatch[3],
        });
        continue;
      }
      // Also handle [1] URL format
      const sourceMatch2 = line.match(/^\[(\d+)\]\s*(https?:\/\/\S+)/);
      if (sourceMatch2) {
        const domain = new URL(sourceMatch2[2]).hostname.replace("www.", "");
        parts.push({
          type: "source-item",
          value: domain,
          num: parseInt(sourceMatch2[1]),
          url: sourceMatch2[2],
        });
        continue;
      }
      if (line.trim() === "") continue;
    }

    // Parse inline citations [1][2] in normal text
    const segments = line.split(/(\[\d+\])/g);
    for (const seg of segments) {
      const citMatch = seg.match(/^\[(\d+)\]$/);
      if (citMatch) {
        parts.push({ type: "citation", value: seg, num: parseInt(citMatch[1]) });
      } else if (seg) {
        parts.push({ type: "text", value: seg });
      }
    }
    if (li < lines.length - 1) {
      parts.push({ type: "text", value: "\n" });
    }
  }

  return parts;
}

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  const hasCitations = !isUser && message.content && /\[\d+\]/.test(message.content);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-primary/90 text-white"
            : "bg-white/[0.04] border border-white/[0.06] text-zinc-200"
        }`}
      >
        {message.content ? (
          hasCitations ? (
            <CitationContent content={message.content} />
          ) : (
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {message.content}
            </div>
          )
        ) : message.isStreaming ? (
          <div className="flex gap-1.5 py-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-zinc-500"
                style={{ animation: `pulse-dot 1.4s ${i * 0.2}s ease-in-out infinite` }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CitationContent({ content }: { content: string }) {
  const parts = renderContent(content);
  const sources = parts.filter((p) => p.type === "source-item");
  const mainParts = parts.filter((p) => p.type !== "source-item" && p.type !== "source-header");

  return (
    <div className="space-y-3">
      {/* Main content with inline citations */}
      <div className="text-sm leading-relaxed break-words">
        {mainParts.map((part, i) => {
          if (part.type === "citation") {
            return (
              <span
                key={i}
                className="inline-flex items-center justify-center mx-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 cursor-pointer hover:bg-cyan-500/30 transition-colors align-top leading-none"
                title={sources.find((s) => s.num === part.num)?.url || ""}
                onClick={() => {
                  const src = sources.find((s) => s.num === part.num);
                  if (src?.url) window.open(src.url, "_blank");
                }}
              >
                {part.num}
              </span>
            );
          }
          if (part.type === "text") {
            return <span key={i} className="whitespace-pre-wrap">{part.value}</span>;
          }
          return null;
        })}
      </div>

      {/* Sources section */}
      {sources.length > 0 && (
        <div className="border-t border-white/[0.06] pt-3 mt-2">
          <div className="text-[11px] font-semibold text-zinc-400 mb-2">📚 Sources</div>
          <div className="flex flex-wrap gap-2">
            {sources.map((src, i) => (
              <a
                key={i}
                href={src.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08] transition-colors group"
              >
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 text-[9px] font-bold">
                  {src.num}
                </span>
                <span className="text-[11px] text-zinc-400 group-hover:text-zinc-200 max-w-[160px] truncate">
                  {src.value}
                </span>
                <svg className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
