"use client";
// Browser helpers: API calls and per-browser default settings.
import { DEFAULT_SETTINGS, GenerationSettings } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError("Can't reach the server. Check that the app is running and try again.", 0);
  }
  const type = res.headers.get("content-type") ?? "";
  const body = type.includes("application/json") ? await res.json().catch(() => ({})) : {};
  if (!res.ok) throw new ApiError((body as { error?: string }).error ?? `Request failed (HTTP ${res.status}).`, res.status);
  return body as T;
}

export const jsonInit = (method: string, data: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});

const KEY = "l2p.defaults.v1";

export function loadDefaults(): GenerationSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw), title: "", artist: "" };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveDefaults(s: GenerationSettings) {
  try {
    const { title: _t, artist: _a, ...rest } = s;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    /* storage unavailable */
  }
}

export function assetSrc(projectId: string, file?: string) {
  return file ? `/api/assets/${projectId}/${file}` : undefined;
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

export async function downloadExport(projectId: string): Promise<{ name: string; bytes: number }> {
  const res = await fetch(`/api/projects/${projectId}/export`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError((body as { error?: string }).error ?? "Export failed.", res.status);
  }
  const blob = await res.blob();
  const disp = res.headers.get("content-disposition") ?? "";
  const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(disp)?.[1] ?? "lyrics.pptx");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { name, bytes: blob.size };
}
