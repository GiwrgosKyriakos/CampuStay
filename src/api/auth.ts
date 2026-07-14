const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

if (!BASE) {
  console.warn("[API] EXPO_PUBLIC_BACKEND_URL is not set! API calls will fail.");
}

export interface AuthUser {
  user_id: string;
  email: string | null;
  name: string | null;
  picture: string | null;
}

export interface AuthResult {
  token: string;
  user: AuthUser;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return typeof data.detail === "string" ? data.detail : "Something went wrong";
  } catch {
    return "Something went wrong";
  }
}

// Helper function to add a timeout to fetch calls
async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const timeoutMs = options.timeout ?? 10000; // 10 second default timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function apiRegister(email: string, password: string): Promise<AuthResult> {
  console.log("[API] POST /api/auth/register");
  try {
    const res = await fetchWithTimeout(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      timeout: 10000,
    });
    if (!res.ok) throw new Error(await parseError(res));
    const data = await res.json();
    console.log("[API] Register successful");
    return data;
  } catch (err) {
    console.error("[API] Register failed:", err);
    throw err;
  }
}

export async function apiLogin(email: string, password: string): Promise<AuthResult> {
  console.log("[API] POST /api/auth/login");
  try {
    const res = await fetchWithTimeout(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      timeout: 10000,
    });
    if (!res.ok) throw new Error(await parseError(res));
    const data = await res.json();
    console.log("[API] Login successful");
    return data;
  } catch (err) {
    console.error("[API] Login failed:", err);
    throw err;
  }
}

export async function apiGoogle(sessionId: string): Promise<AuthResult> {
  console.log("[API] POST /api/auth/google");
  try {
    const res = await fetchWithTimeout(`${BASE}/api/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
      timeout: 10000,
    });
    if (!res.ok) throw new Error(await parseError(res));
    const data = await res.json();
    console.log("[API] Google auth successful");
    return data;
  } catch (err) {
    console.error("[API] Google auth failed:", err);
    throw err;
  }
}

export async function apiMe(token: string): Promise<AuthUser> {
  console.log("[API] GET /api/auth/me");
  try {
    const res = await fetchWithTimeout(`${BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    if (!res.ok) {
      console.warn("[API] /auth/me returned non-ok status:", res.status);
      throw new Error("unauthorized");
    }
    const data = await res.json();
    console.log("[API] /auth/me successful");
    return data.user;
  } catch (err) {
    console.error("[API] /auth/me failed:", err);
    throw err;
  }
}

export async function apiLogout(token: string): Promise<void> {
  console.log("[API] POST /api/auth/logout");
  try {
    await fetchWithTimeout(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    });
    console.log("[API] Logout successful");
  } catch (err) {
    console.error("[API] Logout failed (non-critical):", err);
    // best effort
  }
}
