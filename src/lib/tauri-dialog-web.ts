let lastUploadedFile: { name: string; content: string } | null = null;

export async function save(options?: { defaultPath?: string; filters?: any[]; title?: string }): Promise<string | null> {
  const chosenName = options?.defaultPath || "export.csv";
  return chosenName;
}

export async function open(_options?: { filters?: any[]; title?: string; multiple?: boolean }): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      lastUploadedFile = { name: file.name, content: text };
      resolve(file.name);
    };
    input.click();
  });
}

export async function message(msg: string) {
  alert(msg);
}

export async function confirm(msg: string) {
  return window.confirm(msg);
}

export function getLastUploadedFile() {
  return lastUploadedFile;
}
