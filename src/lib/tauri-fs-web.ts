import { getLastUploadedFile } from "./tauri-dialog-web";

export async function writeTextFile(filePath: string, content: string): Promise<void> {
  const filename = filePath.split("/").pop()?.split("\\").pop() || "export.txt";
  const isJson = filename.endsWith(".json");
  const isCsv = filename.endsWith(".csv");
  const mimeType = isJson ? "application/json" : isCsv ? "text/csv;charset=utf-8;" : "text/plain;charset=utf-8;";

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function readTextFile(_filePath: string): Promise<string> {
  const uploaded = getLastUploadedFile();
  if (uploaded) {
    return uploaded.content;
  }
  return "";
}

export async function exists(_path: string): Promise<boolean> {
  return true;
}

export async function mkdir(_path: string, _options?: any): Promise<void> {
  // No-op in web
}
