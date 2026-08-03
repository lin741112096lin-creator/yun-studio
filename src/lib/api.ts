const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");
export const AUTH_SESSION_STORAGE_KEY = "cloudstudio_auth_session_v1";

export function authHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_SESSION_STORAGE_KEY) || "null");
    if (session?.token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${session.token}`);
  } catch {
    // Ignore malformed local auth state.
  }
  return headers;
}

export function apiUrl(path: string): string {
  if (!path.startsWith("/") || !configuredApiBaseUrl) return path;
  return `${configuredApiBaseUrl}${path}`;
}

export function normalizeImageUrl(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim().replace(/^['"]|['"]$/g, "");
    if (!text) return null;
    if (text.startsWith("data:image/")) return text;
    if (/^(https?:|blob:|\/)/i.test(text)) return text;
    if (/^[A-Za-z0-9+/=\s]+$/.test(text) && text.length > 128) {
      return `data:image/png;base64,${text.replace(/\s+/g, "")}`;
    }
    try {
      return normalizeImageUrl(JSON.parse(text));
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = normalizeImageUrl(item);
      if (result) return result;
    }
    return null;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["imageUrl", "image_url", "url", "b64_json", "base64", "data", "result", "output", "images"]) {
      const result = normalizeImageUrl(record[key]);
      if (result) return result;
    }
  }

  return null;
}

export async function fetchJson<T = any>(url: string, options?: RequestInit, timeoutMs = 60000): Promise<T> {
  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = authHeaders(options?.headers);
    res = await fetch(apiUrl(url), { ...options, headers, signal: controller.signal });
  } catch (netErr: any) {
    if (controller.signal.aborted) {
      throw new Error(`请求超时，上游接口没有在 ${Math.round(timeoutMs / 1000)} 秒内响应，请检查接口地址、Key 和服务状态`);
    }
    throw new Error(`网络连接失败，请检查服务状态 (${netErr?.message || "Fetch Error"})`);
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = res.headers.get("content-type") || "";
  let data: any = {};

  if (contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = { error: "解析服务器 JSON 响应失败" };
    }
  } else {
    const text = await res.text();
    if (text.includes("<!DOCTYPE") || text.includes("<!doctype") || text.includes("<html")) {
      data = {
        error: `服务器返回了非 JSON 格式内容 (${res.status} ${res.statusText})。请确认 API Key 及接口地址配置是否正确。`,
      };
    } else {
      data = { error: text.slice(0, 200) || `服务器响应异常 (HTTP ${res.status})` };
    }
  }

  if (!res.ok) {
    throw new Error(data.error || data.message || `请求服务失败 (HTTP ${res.status})`);
  }

  return data as T;
}
