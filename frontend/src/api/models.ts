const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:5159";

export interface ChutesModel {
  id: string;
}

export async function fetchModels(): Promise<ChutesModel[]> {
  const r = await fetch(`${API_BASE_URL}/api/models`, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Short display label: strip owner prefix and trailing -TEE
export function modelLabel(id: string): string {
  const slash = id.lastIndexOf("/");
  let label = slash >= 0 ? id.slice(slash + 1) : id;
  if (label.endsWith("-TEE")) label = label.slice(0, -4);
  return label;
}
