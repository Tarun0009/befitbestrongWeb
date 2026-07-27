const STORAGE_KEY = "bfs.device-session.v1";
export const DEVICE_SESSION_HEADER = "X-Device-Session";

function newToken() {
  const webCrypto = globalThis.crypto;
  if (!webCrypto) return null;
  if (typeof webCrypto.randomUUID === "function") {
    return `${webCrypto.randomUUID()}${webCrypto.randomUUID()}`;
  }
  const bytes = new Uint8Array(32);
  webCrypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export function getOrCreateDeviceSessionToken() {
  if (typeof window === "undefined") return null;
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length >= 32 && existing.length <= 200) return existing;
    const token = newToken();
    if (!token) return null;
    window.localStorage.setItem(STORAGE_KEY, token);
    return token;
  } catch {
    return null;
  }
}

export function attachDeviceSessionHeader(headers: Headers) {
  const token = getOrCreateDeviceSessionToken();
  if (token) headers.set(DEVICE_SESSION_HEADER, token);
  return headers;
}

export function clearDeviceSessionToken() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable in hardened/private browser contexts.
  }
}
