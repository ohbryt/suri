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
      case "create_document":
        return await createDocument(input);
      case "deploy_preview":
        return await deployPreview(input);
      case "create_project":
        return await createProject(input);
      case "think":
        return { output: `Reasoning logged: ${String(input.reasoning).slice(0, 200)}...` };
      case "web_crawl":
        return await webCrawl(input);
      case "bulk_file_write":
        return await bulkFileWrite(input);
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

// ========== Project Scaffolding (Same.dev-style) ==========

async function createProject(input: Record<string, unknown>): Promise<{ output: string; isError?: boolean }> {
  const name = String(input.name).replace(/[^a-z0-9-]/g, "-");
  const framework = String(input.framework);
  const projectDir = path.join(WORKSPACE, name);

  await fs.mkdir(projectDir, { recursive: true });

  switch (framework) {
    case "html-tailwind": {
      const files: Record<string, string> = {
        "index.html": `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>tailwindcss.config={theme:{extend:{colors:{primary:'#6366f1'}}}}</script>
</head>
<body class="min-h-screen bg-gray-950 text-white">
  <main class="max-w-4xl mx-auto px-4 py-16">
    <h1 class="text-5xl font-bold mb-4">${name}</h1>
    <p class="text-gray-400 text-lg">Edit index.html to get started.</p>
  </main>
</body>
</html>`,
        "style.css": `/* Custom styles */\n`,
      };
      for (const [f, c] of Object.entries(files)) {
        await fs.writeFile(path.join(projectDir, f), c);
      }
      return { output: `🏗️ Project "${name}" created (HTML + Tailwind CDN)\n📁 ${projectDir}\nFiles: ${Object.keys(files).join(", ")}` };
    }

    case "react-vite": {
      try {
        await execAsync(`cd "${WORKSPACE}" && npm create vite@latest ${name} -- --template react-ts 2>&1`, { timeout: 60_000 });
        return { output: `🏗️ Project "${name}" created (React + Vite + TypeScript)\n📁 ${projectDir}\nRun: cd /workspace/${name} && npm install && npm run dev` };
      } catch (err: any) {
        // Fallback: create minimal react project manually
        const files: Record<string, string> = {
          "index.html": `<!DOCTYPE html>\n<html lang="ko">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${name}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.tsx"></script>\n</body>\n</html>`,
          "src/main.tsx": `import React from 'react';\nimport ReactDOM from 'react-dom/client';\nimport App from './App';\nimport './index.css';\n\nReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);`,
          "src/App.tsx": `export default function App() {\n  return <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">\n    <h1 className="text-4xl font-bold">${name}</h1>\n  </div>;\n}`,
          "src/index.css": `@tailwind base;\n@tailwind components;\n@tailwind utilities;`,
          "package.json": `{"name":"${name}","private":true,"type":"module","scripts":{"dev":"vite","build":"vite build"},"dependencies":{"react":"^19.0.0","react-dom":"^19.0.0"},"devDependencies":{"@types/react":"^19.0.0","@vitejs/plugin-react":"^4.0.0","tailwindcss":"^4.0.0","vite":"^6.0.0","typescript":"^5.0.0"}}`,
        };
        for (const [f, c] of Object.entries(files)) {
          const fp = path.join(projectDir, f);
          await fs.mkdir(path.dirname(fp), { recursive: true });
          await fs.writeFile(fp, c);
        }
        return { output: `🏗️ Project "${name}" created (React + Vite, manual scaffold)\n📁 ${projectDir}\nRun: cd /workspace/${name} && npm install && npm run dev` };
      }
    }

    case "nextjs": {
      try {
        await execAsync(`cd "${WORKSPACE}" && npx create-next-app@latest ${name} --ts --tailwind --app --no-eslint --no-src-dir --import-alias "@/*" --use-npm 2>&1`, { timeout: 120_000 });
        return { output: `🏗️ Project "${name}" created (Next.js + Tailwind + TypeScript)\n📁 ${projectDir}\nRun: cd /workspace/${name} && npm run dev` };
      } catch {
        const files: Record<string, string> = {
          "app/page.tsx": `export default function Home() {\n  return <main className="min-h-screen bg-gray-950 text-white flex items-center justify-center">\n    <h1 className="text-5xl font-bold">${name}</h1>\n  </main>;\n}`,
          "app/layout.tsx": `import './globals.css';\nexport const metadata = { title: '${name}' };\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html lang="ko"><body>{children}</body></html>;\n}`,
          "app/globals.css": `@tailwind base;\n@tailwind components;\n@tailwind utilities;`,
          "package.json": `{"name":"${name}","private":true,"scripts":{"dev":"next dev","build":"next build","start":"next start"},"dependencies":{"next":"^16.0.0","react":"^19.0.0","react-dom":"^19.0.0"},"devDependencies":{"@types/react":"^19.0.0","typescript":"^5.0.0","tailwindcss":"^4.0.0"}}`,
          "tsconfig.json": `{"compilerOptions":{"target":"ES2017","lib":["dom","dom.iterable","esnext"],"jsx":"preserve","module":"esnext","moduleResolution":"bundler","paths":{"@/*":["./*"]},"strict":true,"esModuleInterop":true,"skipLibCheck":true},"include":["**/*.ts","**/*.tsx"],"exclude":["node_modules"]}`,
        };
        for (const [f, c] of Object.entries(files)) {
          const fp = path.join(projectDir, f);
          await fs.mkdir(path.dirname(fp), { recursive: true });
          await fs.writeFile(fp, c);
        }
        return { output: `🏗️ Project "${name}" created (Next.js, manual scaffold)\n📁 ${projectDir}\nRun: cd /workspace/${name} && npm install && npm run dev` };
      }
    }

    default:
      return { output: `Unknown framework: ${framework}. Use: html-tailwind, react-vite, nextjs`, isError: true };
  }
}

// ========== Web Crawl (Emergent-style) ==========

async function webCrawl(input: Record<string, unknown>): Promise<{ output: string; isError?: boolean }> {
  const url = String(input.url);
  const extract = String(input.extract || "text");

  try {
    const content = await fetchPageContent(url, 10000);
    if (!content) {
      return { output: `Failed to fetch content from ${url}`, isError: true };
    }

    if (extract === "links") {
      // Re-fetch to get links from HTML
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SuriBot/1.0)" },
        });
        const html = await res.text();
        const linkRegex = /href="(https?:\/\/[^"]+)"/gi;
        const links = new Set<string>();
        let match;
        while ((match = linkRegex.exec(html)) !== null && links.size < 50) {
          links.add(match[1]);
        }
        return { output: `Links from ${url}:\n${[...links].join("\n")}` };
      } catch {
        return { output: `Failed to extract links from ${url}`, isError: true };
      } finally {
        clearTimeout(timer);
      }
    }

    if (extract === "html") {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0 (compatible; SuriBot/1.0)" },
        });
        const html = await res.text();
        return { output: html.slice(0, 10000) };
      } catch {
        return { output: `Failed to fetch HTML from ${url}`, isError: true };
      } finally {
        clearTimeout(timer);
      }
    }

    // Default: text
    return { output: `Content from ${url}:\n\n${content}` };
  } catch (err: any) {
    return { output: `Crawl error: ${err.message}`, isError: true };
  }
}

// ========== Bulk File Write (Emergent-style) ==========

async function bulkFileWrite(input: Record<string, unknown>): Promise<{ output: string; isError?: boolean }> {
  const files = input.files as Array<{ path: string; content: string }>;
  if (!Array.isArray(files) || files.length === 0) {
    return { output: "No files provided", isError: true };
  }

  const results: string[] = [];
  let successCount = 0;

  for (const file of files) {
    try {
      const filePath = resolvePath(String(file.path));
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, String(file.content), "utf-8");
      results.push(`✅ ${file.path}`);
      successCount++;
    } catch (err: any) {
      results.push(`❌ ${file.path}: ${err.message}`);
    }
  }

  return { output: `Wrote ${successCount}/${files.length} files:\n${results.join("\n")}` };
}

// ========== Document Generation ==========

const ARTIFACTS_DIR = "/tmp/suri-artifacts";

async function ensureArtifactsDir() {
  await fs.mkdir(ARTIFACTS_DIR, { recursive: true });
}

async function createDocument(input: Record<string, unknown>): Promise<{ output: string; isError?: boolean }> {
  await ensureArtifactsDir();
  const docType = String(input.type);
  const title = String(input.title);
  const content = String(input.content);
  const filename = String(input.filename);
  const outputPath = path.join(ARTIFACTS_DIR, filename);

  switch (docType) {
    case "pptx": {
      // Generate PPTX using python-pptx
      let slides: Array<{ title?: string; body?: string; bullets?: string[]; notes?: string }>;
      try {
        slides = JSON.parse(content);
      } catch {
        return { output: "Invalid slides JSON. Expected array of {title, body?, bullets?, notes?}", isError: true };
      }

      // Build Python script for pptx generation
      const pyScript = `
import json, sys
try:
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN
except ImportError:
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "python-pptx", "-q"])
    from pptx import Presentation
    from pptx.util import Inches, Pt
    from pptx.dml.color import RGBColor
    from pptx.enum.text import PP_ALIGN

prs = Presentation()
prs.slide_width = Inches(16)
prs.slide_height = Inches(9)

slides = json.loads('''${JSON.stringify(slides).replace(/'/g, "\\'")}''')

for i, s in enumerate(slides):
    if i == 0:
        layout = prs.slide_layouts[0]  # Title slide
    else:
        layout = prs.slide_layouts[1]  # Title + Content

    slide = prs.slides.add_slide(layout)

    if slide.shapes.title and s.get("title"):
        slide.shapes.title.text = s["title"]

    if len(slide.placeholders) > 1:
        body = slide.placeholders[1]
        tf = body.text_frame
        tf.clear()
        if s.get("bullets"):
            for j, bullet in enumerate(s["bullets"]):
                if j == 0:
                    tf.text = bullet
                else:
                    p = tf.add_paragraph()
                    p.text = bullet
        elif s.get("body"):
            tf.text = s["body"]

    if s.get("notes"):
        slide.notes_slide.notes_text_frame.text = s["notes"]

prs.save("${outputPath.replace(/\\/g, "/")}")
print("OK")
`;
      try {
        const pyPath = path.join(ARTIFACTS_DIR, "_gen_pptx.py");
        await fs.writeFile(pyPath, pyScript);
        const { stdout, stderr } = await execAsync(`python3 "${pyPath}"`, { timeout: 30_000 });
        await fs.unlink(pyPath).catch(() => {});
        if (stdout.includes("OK")) {
          return { output: `📊 Presentation created: ${filename}\n📥 Download: /api/artifacts/${filename}\n\nSlides: ${slides.length}장` };
        }
        return { output: `PPTX generation error: ${stderr || stdout}`, isError: true };
      } catch (err: any) {
        return { output: `PPTX generation failed: ${err.message}`, isError: true };
      }
    }

    case "html": {
      // Wrap content in a nice HTML template if it's not already a full HTML doc
      let htmlContent = content;
      if (!content.trim().startsWith("<!DOCTYPE") && !content.trim().startsWith("<html")) {
        htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1a1a1a; }
  </style>
</head>
<body>
${content}
</body>
</html>`;
      }
      await fs.writeFile(outputPath, htmlContent, "utf-8");
      return { output: `🌐 HTML document created: ${filename}\n📥 Download: /api/artifacts/${filename}\n🔗 Preview: /api/artifacts/${filename}` };
    }

    case "markdown": {
      await fs.writeFile(outputPath, `# ${title}\n\n${content}`, "utf-8");
      return { output: `📝 Markdown document created: ${filename}\n📥 Download: /api/artifacts/${filename}` };
    }

    default:
      return { output: `Unsupported document type: ${docType}`, isError: true };
  }
}

// ========== Deploy Preview ==========

async function deployPreview(input: Record<string, unknown>): Promise<{ output: string; isError?: boolean }> {
  await ensureArtifactsDir();
  const projectPath = resolvePath(String(input.path));
  const entryFile = String(input.entry_file || "index.html");

  // Check if directory exists
  try {
    const stat = await fs.stat(projectPath);
    if (!stat.isDirectory()) {
      return { output: `Not a directory: ${projectPath}`, isError: true };
    }
  } catch {
    return { output: `Directory not found: ${projectPath}`, isError: true };
  }

  // Check for entry file
  const entryPath = path.join(projectPath, entryFile);
  try {
    await fs.stat(entryPath);
  } catch {
    // List available files for hint
    const files = await fs.readdir(projectPath);
    return {
      output: `Entry file "${entryFile}" not found in ${projectPath}.\nAvailable files: ${files.join(", ")}`,
      isError: true,
    };
  }

  // Create zip of the project
  const zipName = `preview-${Date.now()}.zip`;
  const zipPath = path.join(ARTIFACTS_DIR, zipName);

  try {
    await execAsync(`cd "${projectPath}" && zip -r "${zipPath}" . -x "node_modules/*" ".git/*"`, {
      timeout: 30_000,
    });
  } catch (err: any) {
    // Fallback: just copy the entry file
    const destPath = path.join(ARTIFACTS_DIR, `preview-${Date.now()}-${entryFile}`);
    await fs.copyFile(entryPath, destPath);
    const name = path.basename(destPath);
    return { output: `🌐 Preview ready: /api/artifacts/${name}\n(zip failed, serving entry file only)` };
  }

  // Also copy entry file directly for iframe preview
  const previewName = `preview-${Date.now()}-${entryFile}`;
  await fs.copyFile(entryPath, path.join(ARTIFACTS_DIR, previewName));

  return {
    output: `🚀 Deploy preview ready!\n\n🔗 Preview: /api/artifacts/${previewName}\n📦 Download ZIP: /api/artifacts/${zipName}\n\nFiles packaged from: ${projectPath}`,
  };
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
