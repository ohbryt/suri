// ========== Messages ==========
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  isStreaming?: boolean;
  timestamp: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  output: string;
  isError?: boolean;
  durationMs?: number;
}

// ========== Agent Events (SSE) ==========
export type AgentEvent =
  | { type: "message"; content: string }
  | { type: "message_delta"; content: string }
  | { type: "tool_start"; tool: string; input: Record<string, any> }
  | { type: "tool_result"; tool: string; output: string; isError?: boolean; durationMs?: number }
  | { type: "thinking"; content: string }
  | { type: "token_usage"; input: number; output: number; cost: number }
  | { type: "error"; code: string; message: string }
  | { type: "done"; totalCost: number };

// ========== Tool Definitions ==========
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

// ========== Session ==========
export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  totalCost: number;
}

// ========== File Tree ==========
export interface FileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: FileNode[];
  size?: number;
}
