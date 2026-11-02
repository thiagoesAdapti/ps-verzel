import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { env } from "../../config/env.ts";

export async function saveCover(coverId: number | null, lotId: string) {
  if (!coverId) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const coverBaseUrl = env.OPEN_LIBRARY_COVERS_URL.replace(/\/$/, "");
    const response = await fetch(`${coverBaseUrl}/b/id/${coverId}-L.jpg?default=false`, {
      signal: controller.signal
    });
    const type = response.headers.get("content-type") ?? "";
    const size = Number(response.headers.get("content-length") ?? 0);
    if (!response.ok || !["image/jpeg", "image/png"].includes(type) || size > 3_000_000) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 3_000_000) return null;
    const filename = `${lotId}.${type === "image/png" ? "png" : "jpg"}`;
    await mkdir(env.coverDir, { recursive: true });
    await writeFile(resolve(env.coverDir, filename), bytes, { flag: "wx" });
    return filename;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
