import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);
const WORKSPACE = "/tmp/suri-workspace";

// Ensure workspace exists
async function ensureWorkspace(dir: string = WORKSPACE) {
  await fs.mkdir(dir, { recursive: true });
}

export async function handleToolCall(
  name: string,
  input: Record<string, unknown>
): Promise<{ output: string; isError?: boolean }> {
  const start = Date.now();
  try {
    switch (name) {
      case "shell_execute":
        return await shellExecute(input);
      case "file_read":
        return await fileRead(input);
      case "file_write":
        return await fileWrite(input);
      case "file_edit":
        return await fileEdit(input);
      case "file_list":
        return await fileList(input);
      case "web_search":
        return await webSearch(input);
      case "web_search_deep":
        return await webSearchDeep(input);
      case "message_user":
        return { output: String(input.content || "") };
      case "idle":
        return { output: `Agent idle: ${input.reason}` };
      default:
        return { output: `Unknown tool: ${name}`, isError: true };
    }
  } catch (err: any) {
    return { output: `Error: ${err.message}`, isError: true };
  }
}

async function shellExecute(input: Record<string, unknown>) {
  await ensureWorkspace();
  const command = String(input.command);
  const workdir = String(input.workdir || WORKSPACE);

  // Safety: block dangerous commands
  const blocked = ["rm -rf /", "mkfs", "dd if=", "> /dev/"];
  if (blocked.some((b) => command.includes(b))) {
    return { output: "Blocked: dangerous command detected", isError: true };
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workdir,
      timeout: 30_000,
      maxBuffer: 1024 * 1024, // 1MB
      env: { ...process.env, HOME: WORKSPACE, TERM: "xterm-256color" },
    });
    const output = [stdout, stderr].filter(Boolean).join("\n").trim();
    return { output: output || "(no output)" };
  } catch (err: any) {
    const output = [err.stdout, err.stderr].filter(Boolean).join("\n").trim();
    return {
      output: output || err.message,
      isError: err.code !== 0,
    };
  }
}

async function fileRead(input: Record<string, unknown>) {
  const filePath = resolvePath(String(input.path));
  const content = await fs.readFile(filePath, "utf-8");

  const offset = Number(input.offset || 1);
  const limit = Number(input.limit || 0);
  const lines = content.split("\n");

  if (limit > 0) {
    const slice = lines.slice(offset - 1, offset - 1 + limit);
    return {
      output: slice.map((l, i) => `${offset + i}: ${l}`).join("\n"),
    };
  }
  return {
    output: lines.map((l, i) => `${i + 1}: ${l}`).join("\n"),
  };
}

async function fileWrite(input: Record<string, unknown>) {
  const filePath = resolvePath(String(input.path));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, String(input.content), "utf-8");
  return { output: `File written: ${filePath}` };
}

async function fileEdit(input: Record<string, unknown>) {
  const filePath = resolvePath(String(input.path));
  let content = await fs.readFile(filePath, "utf-8");
  const oldStr = String(input.old_string);
  const newStr = String(input.new_string);

  if (!content.includes(oldStr)) {
    return { output: `String not found in ${filePath}`, isError: true };
  }
  content = content.replace(oldStr, newStr);
  await fs.writeFile(filePath, content, "utf-8");
  return { output: `File edited: ${filePath}` };
}

async function fileList(input: Record<string, unknown>) {
  const dirPath = resolvePath(String(input.path || WORKSPACE));
  const recursive = Boolean(input.recursive);

  async function listDir(dir: string, prefix = ""): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results: string[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const type = entry.isDirectory() ? "📁" : "📄";
      results.push(`${prefix}${type} ${entry.name}`);
      if (recursive && entry.isDirectory()) {
        const sub = await listDir(path.join(dir, entry.name), prefix + "  ");
        results.push(...sub);
      }
    }
    return results;
  }

  const items = await listDir(dirPath);
  return { output: items.join("\n") || "(empty directory)" };
}

async function webSearch(input: Record<string, unknown>) {
  const query = String(input.query);
  // Use DuckDuckGo instant answer API (no key needed)
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
    const res = await fetch(url);
    const data = await res.json();

    const results: string[] = [];
    if (data.Abstract) {
      results.push(`**${data.Heading}**\n${data.Abstract}\n${data.AbstractURL}\n`);
    }
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 5)) {
        if (topic.Text) {
          results.push(`- ${topic.Text}\n  ${topic.FirstURL || ""}`);
        }
      }
    }
    return {
      output: results.length > 0 ? results.join("\n") : `No results for "${query}". Try a different search.`,
    };
  } catch {
    return { output: `Search failed for "${query}"`, isError: true };
  }
}

// ========== Deep Web Search (Perplexity-style) ==========

interface SearchSource {
  index: number;
  title: string;
  url: string;
  snippet: string;
  content: string;
}

async function fetchPageContent(url: string, timeoutMs = 8000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SuriBot/1.0)",
        "Accept": "text/html,application/xhtml+xml,text/plain",
      },
    });
    if (!res.ok) return "";
    const html = await res.text();
    // Strip HTML tags, scripts, styles → plain text
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Limit to ~3000 chars (enough context without bloating)
    return text.slice(0, 3000);
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function duckDuckGoSearch(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    // Use DuckDuckGo HTML search for richer results
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SuriBot/1.0)",
      },
    });
    const html = await res.text();

    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Parse result blocks from DDG HTML
    const resultRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 10) {
      const rawUrl = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const snippet = match[3].replace(/<[^>]+>/g, "").trim();

      // DDG wraps URLs in redirect - extract actual URL
      let actualUrl = rawUrl;
      const uddgMatch = rawUrl.match(/uddg=([^&]+)/);
      if (uddgMatch) {
        actualUrl = decodeURIComponent(uddgMatch[1]);
      }

      if (title && actualUrl.startsWith("http")) {
        results.push({ title, url: actualUrl, snippet });
      }
    }

    // Fallback: try DuckDuckGo instant answer API
    if (results.length === 0) {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
      const apiRes = await fetch(apiUrl);
      const data = await apiRes.json();
      if (data.Abstract) {
        results.push({ title: data.Heading, url: data.AbstractURL, snippet: data.Abstract });
      }
      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, 5)) {
          if (topic.Text && topic.FirstURL) {
            results.push({ title: topic.Text.slice(0, 80), url: topic.FirstURL, snippet: topic.Text });
          }
        }
      }
    }

    return results;
  } catch {
    return [];
  }
}

async function webSearchDeep(input: Record<string, unknown>): Promise<{ output: string; isError?: boolean }> {
  const queries = (input.queries as string[]) || [String(input.queries)];
  const maxSources = Math.min(Number(input.max_sources) || 5, 8);

  // Step 1: Search all queries in parallel
  const searchPromises = queries.map((q) => duckDuckGoSearch(q));
  const allSearchResults = await Promise.all(searchPromises);

  // Step 2: Deduplicate by URL
  const seen = new Set<string>();
  const uniqueResults: Array<{ title: string; url: string; snippet: string }> = [];
  for (const results of allSearchResults) {
    for (const r of results) {
      const domain = new URL(r.url).hostname;
      if (!seen.has(domain)) {
        seen.add(domain);
        uniqueResults.push(r);
      }
    }
  }

  const topResults = uniqueResults.slice(0, maxSources);
  if (topResults.length === 0) {
    return { output: `No search results found for queries: ${queries.join(", ")}. Try different search terms.` };
  }

  // Step 3: Fetch page content in parallel
  const fetchPromises = topResults.map((r) => fetchPageContent(r.url));
  const contents = await Promise.all(fetchPromises);

  // Step 4: Build numbered source list
  const sources: SearchSource[] = topResults.map((r, i) => ({
    index: i + 1,
    title: r.title,
    url: r.url,
    snippet: r.snippet,
    content: contents[i] || r.snippet,
  }));

  // Step 5: Format output for LLM
  let output = `## 검색 결과 (${sources.length}개 소스)\n\n`;
  output += `**검색어:** ${queries.join(" | ")}\n\n`;
  output += `---\n\n`;

  for (const src of sources) {
    output += `### [${src.index}] ${src.title}\n`;
    output += `**URL:** ${src.url}\n`;
    output += `**내용:**\n${src.content}\n\n---\n\n`;
  }

  output += `\n## 소스 목록\n`;
  for (const src of sources) {
    output += `[${src.index}] ${src.title} - ${src.url}\n`;
  }

  output += `\n---\n위 소스를 바탕으로 인라인 인용 [1][2] 형식으로 종합 답변을 작성하세요.`;

  return { output };
}

function resolvePath(p: string): string {
  if (p.startsWith("/workspace")) {
    return p.replace("/workspace", WORKSPACE);
  }
  if (!path.isAbsolute(p)) {
    return path.join(WORKSPACE, p);
  }
  return p;
}
