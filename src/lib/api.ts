const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export function apiUrl(path: string): string {
  if (!path.startsWith("/") || !configuredApiBaseUrl) return path;
  return `${configuredApiBaseUrl}${path}`;
}

export async function fetchJson<T = any>(url: string, options?: RequestInit): Promise<T> {
  let res: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);
  try {
    res = await fetch(apiUrl(url), { ...options, signal: controller.signal });
  } catch (netErr: any) {
    if (controller.signal.aborted) {
      throw new Error("请求超时，上游接口没有在 60 秒内响应，请检查接口地址、Key 和服务状态");
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
