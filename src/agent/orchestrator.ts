import { TOOL_DEFINITIONS } from "./tools/definitions";
import { handleToolCall } from "./tools/handlers";
import type { AgentEvent, ChatMessage } from "@/lib/types";

const SYSTEM_PROMPT = `You are SURI (수리), a powerful AI agent like Manus. You can execute code, manage files, search the web, create documents, and build & preview websites.

## TOOLS
- think: Reason through complex problems before acting (internal, not shown to user)
- shell_execute: Run shell commands (Python, Node.js, bash)
- file_read / file_write / file_edit / file_list: File operations
- bulk_file_write: Write multiple files at once (efficient for scaffolding)
- web_search: Quick search for simple facts
- web_search_deep: Deep research with multi-source fetching (Perplexity-style)
- web_crawl: Fetch and extract content from a specific URL
- create_document: Create PPTX presentations, HTML pages, Markdown docs
- deploy_preview: Package a project for preview/download
- message_user: Send messages to the user
- idle: Signal task completion

## THINKING MODE
For complex tasks, ALWAYS use the think tool first to:
- Break down the problem into steps
- Consider edge cases and potential issues
- Plan your approach before writing any code

## WEBSITE BUILD MODE (Same.dev-style)
When asked to build a website, landing page, or web app:
1. Use think to plan the architecture and design
2. Use create_project to scaffold from a template (html-tailwind, react-vite, nextjs)
3. Use bulk_file_write or file_write to build all pages and components
4. Design BEAUTIFUL, modern UIs by default:
   - Use Tailwind CSS, dark mode, smooth animations
   - Mobile-first responsive design
   - Professional typography and spacing
5. Use deploy_preview to package it for the user
6. Share the preview link and download link

## WEBSITE CLONE MODE
When the user sends a URL and asks to clone/copy it:
1. Use web_crawl to fetch the page content and analyze the design
2. Use think to plan the structure: layout, colors, fonts, sections
3. Use create_project with html-tailwind template
4. Rebuild the UI pixel-perfect using Tailwind CSS
5. Use deploy_preview to deliver the result

## DOCUMENT MODE
When asked to create a presentation (PPT), report, or document:
1. Use create_document with type "pptx" for presentations
   - Provide slides as JSON: [{"title":"...", "body":"...", "bullets":["..."], "notes":"..."}]
2. Use create_document with type "html" for rich documents / reports
3. Use create_document with type "markdown" for text documents
4. Always share the download link: /api/artifacts/filename

## SEARCH MODE (Perplexity-style)
When the user asks a research question ("~에 대해 알려줘 / ~가 뭐야 / explain ~"):
1. Use web_search_deep with 1-3 search queries
2. Synthesize with INLINE CITATIONS: "사실[1]." — every claim needs [N]
3. End with "## 📚 Sources" listing "[1] Title - URL"
For reading a specific page, use web_crawl instead.

## GENERAL RULES
1. Use think tool before complex tasks
2. Use tools to accomplish tasks - don't just describe what you'd do
3. After creating/modifying files, verify the result
4. If a command fails, analyze the error and try a different approach
5. Keep the user informed of progress with message_user
6. When done, use the idle tool
7. Respond in Korean (한국어) by default unless the user writes in English
8. Write clean, production-quality code with modern best practices`;

export type Provider = "claude" | "openai" | "zhipu";

// ==================== Pricing ====================
const PRICING: Record<Provider, { input: number; output: number }> = {
  claude: { input: 3 / 1_000_000, output: 15 / 1_000_000 },     // Sonnet 4
  openai: { input: 10 / 1_000_000, output: 40 / 1_000_000 },    // o3
  zhipu:  { input: 0.38 / 1_000_000, output: 1.98 / 1_000_000 }, // GLM-4.7
};

// ==================== OpenAI-compatible config ====================
const OPENAI_COMPAT: Record<string, { endpoint: string; model: string }> = {
  openai: { endpoint: "https://api.openai.com/v1/chat/completions", model: "o3" },
  zhipu:  { endpoint: "https://api.z.ai/api/paas/v4/chat/completions", model: "glm-4.7" },
};

// ==================== Main Agent Loop ====================
export async function* runAgent(
  userMessages: ChatMessage[],
  apiKey: string,
  provider: Provider = "claude"
): AsyncGenerator<AgentEvent> {
  const MAX_ITERATIONS = 20;
  let iteration = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const pricing = PRICING[provider];

  if (provider === "openai" || provider === "zhipu") {
    yield* runOpenAICompat(userMessages, apiKey, pricing, OPENAI_COMPAT[provider]);
    return;
  }

  // ==================== Claude Path ====================
  const conversation: any[] = userMessages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  while (iteration < MAX_ITERATIONS) {
    iteration++;

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

    if (response.usage) {
      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;
      const cost = response.usage.input_tokens * pricing.input + response.usage.output_tokens * pricing.output;
      yield { type: "token_usage", input: response.usage.input_tokens, output: response.usage.output_tokens, cost };
    }

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

    conversation.push({ role: "assistant", content: assistantContent });

    if (response.stop_reason === "end_turn" || !hasToolUse) break;

    for (const block of contentBlocks) {
      if (block.type !== "tool_use") continue;
      const { name: toolName, input: toolInput, id: toolId } = block;

      yield { type: "tool_start", tool: toolName, input: toolInput };

      if (toolName === "idle") {
        yield { type: "tool_result", tool: toolName, output: `Task complete: ${toolInput.reason}` };
        conversation.push({ role: "user", content: [{ type: "tool_result", tool_use_id: toolId, content: `Task complete: ${toolInput.reason}` }] });
        const totalCost = totalInputTokens * pricing.input + totalOutputTokens * pricing.output;
        yield { type: "done", totalCost };
        return;
      }

      const startTime = Date.now();
      const result = await handleToolCall(toolName, toolInput);
      const durationMs = Date.now() - startTime;
      yield { type: "tool_result", tool: toolName, output: result.output, isError: result.isError, durationMs };

      conversation.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolId, content: result.output.slice(0, 10000) }],
      });
    }
  }

  const totalCost = totalInputTokens * pricing.input + totalOutputTokens * pricing.output;
  yield { type: "done", totalCost };
}

// ==================== OpenAI Path ====================
async function* runOpenAICompat(
  userMessages: ChatMessage[],
  apiKey: string,
  pricing: { input: number; output: number },
  config: { endpoint: string; model: string }
): AsyncGenerator<AgentEvent> {
  const MAX_ITERATIONS = 20;
  let iteration = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Convert tool definitions to OpenAI format
  const tools = TOOL_DEFINITIONS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  // Build OpenAI conversation
  const conversation: any[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...userMessages.map((m) => ({ role: m.role, content: m.content })),
  ];

  while (iteration < MAX_ITERATIONS) {
    iteration++;

    let response: any;
    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 4096,
          messages: conversation,
          tools,
          tool_choice: "auto",
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        yield { type: "error", code: "api_error", message: `OpenAI API error: ${res.status} ${errText}` };
        return;
      }
      response = await res.json();
    } catch (err: any) {
      yield { type: "error", code: "network_error", message: err.message };
      return;
    }

    // Track tokens
    if (response.usage) {
      totalInputTokens += response.usage.prompt_tokens;
      totalOutputTokens += response.usage.completion_tokens;
      const cost = response.usage.prompt_tokens * pricing.input + response.usage.completion_tokens * pricing.output;
      yield { type: "token_usage", input: response.usage.prompt_tokens, output: response.usage.completion_tokens, cost };
    }

    const choice = response.choices?.[0];
    if (!choice) break;

    const msg = choice.message;

    // Emit text content
    if (msg.content) {
      yield { type: "message_delta", content: msg.content };
    }

    // Add assistant message to conversation
    conversation.push(msg);

    // Check for tool calls
    if (!msg.tool_calls || msg.tool_calls.length === 0) break;

    // Execute each tool call
    for (const tc of msg.tool_calls) {
      const toolName = tc.function.name;
      let toolInput: Record<string, any> = {};
      try {
        toolInput = JSON.parse(tc.function.arguments);
      } catch {}

      yield { type: "tool_start", tool: toolName, input: toolInput };

      if (toolName === "idle") {
        yield { type: "tool_result", tool: toolName, output: `Task complete: ${toolInput.reason}` };
        conversation.push({ role: "tool", tool_call_id: tc.id, content: `Task complete: ${toolInput.reason}` });
        const totalCost = totalInputTokens * pricing.input + totalOutputTokens * pricing.output;
        yield { type: "done", totalCost };
        return;
      }

      const startTime = Date.now();
      const result = await handleToolCall(toolName, toolInput);
      const durationMs = Date.now() - startTime;
      yield { type: "tool_result", tool: toolName, output: result.output, isError: result.isError, durationMs };

      // OpenAI tool result format
      conversation.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.output.slice(0, 10000),
      });
    }
  }

  const totalCost = totalInputTokens * pricing.input + totalOutputTokens * pricing.output;
  yield { type: "done", totalCost };
}
