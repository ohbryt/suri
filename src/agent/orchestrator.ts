import { TOOL_DEFINITIONS } from "./tools/definitions";
import { handleToolCall } from "./tools/handlers";
import type { AgentEvent, ChatMessage } from "@/lib/types";

const SYSTEM_PROMPT = `You are SURI (수리), an AI agent that can execute code, manage files, and search the web.

You have access to these tools:
- shell_execute: Run shell commands (Python, Node.js, bash)
- file_read: Read file contents
- file_write: Create or overwrite files
- file_edit: Edit specific parts of files
- file_list: List directory contents
- web_search: Quick search for simple facts
- web_search_deep: Deep research search with multi-source fetching (Perplexity-style)
- message_user: Send messages to the user
- idle: Signal task completion

## SEARCH MODE (Perplexity-style)
When the user asks a research question, knowledge question, or "~에 대해 알려줘 / ~가 뭐야 / explain ~ / what is ~":

1. Use web_search_deep with 1-3 search queries covering different angles
2. Read the numbered sources [1][2][3]... in the result
3. Synthesize a comprehensive answer using INLINE CITATIONS:
   - Format: "React 19에서 서버 컴포넌트가 기본값이 되었습니다[1]. 이로 인해 번들 크기가 30% 감소했습니다[2][3]."
   - EVERY factual claim MUST have at least one citation
   - Place citations IMMEDIATELY after the relevant sentence
   - Use [1], [2], etc. matching the source numbers
4. At the END of your response, add a "## 📚 Sources" section listing all cited sources:
   - Format: "[1] Title - URL"
   - Only list sources you actually cited
5. If sources conflict, mention the disagreement and cite both sides

For simple factual lookups (날씨, 시간, 단순 사실), use web_search instead.

## GENERAL RULES
1. Always think step-by-step before acting
2. Use tools to accomplish tasks - don't just describe what you'd do
3. After creating/modifying files, verify the result
4. If a command fails, analyze the error and try a different approach
5. Keep the user informed of progress with message_user
6. When done, use the idle tool
7. Respond in Korean (한국어) by default unless the user writes in English
8. Write clean, well-structured code with comments`;

interface ConversationMessage {
  role: "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
  name?: string;
}

export async function* runAgent(
  userMessages: ChatMessage[],
  apiKey: string
): AsyncGenerator<AgentEvent> {
  const MAX_ITERATIONS = 20;
  let iteration = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Build conversation
  const conversation: ConversationMessage[] = userMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    // Call Claude API
    const tools = TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));

    let response: any;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: conversation,
          tools,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        yield { type: "error", code: "api_error", message: `Claude API error: ${res.status} ${errText}` };
        return;
      }

      response = await res.json();
    } catch (err: any) {
      yield { type: "error", code: "network_error", message: err.message };
      return;
    }

    // Track tokens
    if (response.usage) {
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      const cost =
        (response.usage.input_tokens * 3) / 1_000_000 +
        (response.usage.output_tokens * 15) / 1_000_000;
      yield {
        type: "token_usage",
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        cost,
      };
    }

    // Process response content blocks
    const contentBlocks = response.content || [];
    let hasToolUse = false;
    const assistantContent: any[] = [];

    for (const block of contentBlocks) {
      if (block.type === "text" && block.text) {
        yield { type: "message_delta", content: block.text };
        assistantContent.push(block);
      }
      if (block.type === "tool_use") {
        hasToolUse = true;
        assistantContent.push(block);
      }
    }

    // Add assistant message to conversation
    conversation.push({ role: "assistant", content: assistantContent as any });

    // If no tool use, we're done
    if (response.stop_reason === "end_turn" || !hasToolUse) {
      break;
    }

    // Execute tool calls
    for (const block of contentBlocks) {
      if (block.type !== "tool_use") continue;

      const toolName = block.name;
      const toolInput = block.input;

      yield { type: "tool_start", tool: toolName, input: toolInput };

      // Check for idle
      if (toolName === "idle") {
        yield {
          type: "tool_result",
          tool: toolName,
          output: `Task complete: ${toolInput.reason}`,
        };
        // Add tool result to conversation
        conversation.push({
          role: "tool" as any,
          tool_call_id: block.id,
          content: `Task complete: ${toolInput.reason}`,
        } as any);

        const totalCost =
          (totalInputTokens * 3) / 1_000_000 +
          (totalOutputTokens * 15) / 1_000_000;
        yield { type: "done", totalCost };
        return;
      }

      // Execute tool
      const startTime = Date.now();
      const result = await handleToolCall(toolName, toolInput);
      const durationMs = Date.now() - startTime;

      yield {
        type: "tool_result",
        tool: toolName,
        output: result.output,
        isError: result.isError,
        durationMs,
      };

      // Add tool result to conversation (Claude Messages API format)
      conversation.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: block.id,
            content: result.output.slice(0, 10000), // Limit output size
          },
        ],
      } as any);
    }
  }

  const totalCost =
    (totalInputTokens * 3) / 1_000_000 +
    (totalOutputTokens * 15) / 1_000_000;
  yield { type: "done", totalCost };
}
