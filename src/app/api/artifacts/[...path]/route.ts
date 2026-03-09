import { NextRequest } from "next/server";
import * as fs from "fs/promises";
import * as path from "path";

const ARTIFACTS_DIR = "/tmp/suri-artifacts";

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: segments } = await params;
  const filePath = path.join(ARTIFACTS_DIR, ...segments);

  // Security: prevent directory traversal
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(ARTIFACTS_DIR)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return new Response("Not found", { status: 404 });
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const data = await fs.readFile(resolved);

    // For downloadable files (non-viewable), set Content-Disposition
    const viewable = [".html", ".css", ".js", ".json", ".svg", ".txt", ".md", ".csv", ".png", ".jpg", ".jpeg", ".gif", ".pdf"];
    const isViewable = viewable.includes(ext);
    const filename = path.basename(resolved);

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Content-Length": String(data.length),
      "Cache-Control": "no-cache",
    };

    if (!isViewable) {
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }

    // Force download if ?download query param
    const url = new URL(req.url);
    if (url.searchParams.has("download")) {
      headers["Content-Disposition"] = `attachment; filename="${filename}"`;
    }

    return new Response(data, { headers });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
