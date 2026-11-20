export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch(settings, path, { method = 'GET', body, signal } = {}) {
  const base = settings.apiBase.replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      signal,
      headers: {
        ...(settings.appToken ? { Authorization: `Bearer ${settings.appToken}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError(0, `Backend non raggiungibile (${base}). Il free tier di Render può impiegare ~60 s a svegliarsi.`);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail ?? `HTTP ${res.status}`);
    throw new ApiError(res.status, detail);
  }
  return res.json();
}
