import type { ToolDefinition } from "@/lib/types";

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "shell_execute",
    description:
      "Execute a shell command in the sandbox environment. Use this to run code, install packages, check file contents, etc. The command runs in a bash shell with access to Python, Node.js, and common CLI tools.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute",
        },
        workdir: {
          type: "string",
          description: "Working directory (default: /workspace)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "file_read",
    description:
      "Read the contents of a file. Returns the file content as text. Use this to examine existing files before modifying them.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file (e.g., /workspace/src/index.ts)",
        },
        offset: {
          type: "number",
          description: "Starting line number (1-indexed)",
        },
        limit: {
          type: "number",
          description: "Number of lines to read",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "file_write",
    description:
      "Create a new file or overwrite an existing file with the given content. Use this to create code files, configuration files, etc.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path for the file",
        },
        content: {
          type: "string",
          description: "The complete file content to write",
        },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "file_edit",
    description:
      "Edit a file by replacing a specific string with new content. The old_string must match exactly.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute path to the file",
        },
        old_string: {
          type: "string",
          description: "The exact string to find and replace",
        },
        new_string: {
          type: "string",
          description: "The replacement string",
        },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "file_list",
    description:
      "List files and directories at the given path. Returns file names, types, and sizes.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list (default: /workspace)",
        },
        recursive: {
          type: "boolean",
          description: "Whether to list recursively (default: false)",
        },
      },
      required: [],
    },
  },
  {
    name: "web_search",
    description:
      "Quick web search for simple facts. Returns brief search results with titles, URLs, and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "web_search_deep",
    description:
      "Deep web search with multi-source fetching and content extraction. Use this for research questions that need comprehensive, referenced answers. Fetches actual page content from multiple sources and returns numbered references. The agent should then synthesize the information with inline citations like [1][2].",
    parameters: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: { type: "string" },
          description: "Array of 1-3 search queries to cover different angles of the topic",
        },
        max_sources: {
          type: "number",
          description: "Maximum number of sources to fetch (default: 5, max: 8)",
        },
      },
      required: ["queries"],
    },
  },
  {
    name: "message_user",
    description:
      "Send a message to the user. Use this to provide progress updates, ask clarifying questions, or deliver final results.",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Message content (supports markdown)",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "idle",
    description:
      "Signal that the task is complete. Use this when you have finished all requested work.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Why the agent is going idle",
        },
      },
      required: ["reason"],
    },
  },
];
