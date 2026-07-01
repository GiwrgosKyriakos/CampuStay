const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;

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

export async function apiRegister(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function apiLogin(email: string, password: string): Promise<AuthResult> {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function apiGoogle(sessionId: string): Promise<AuthResult> {
  const res = await fetch(`${BASE}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function apiMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("unauthorized");
  const data = await res.json();
  return data.user;
}

export async function apiLogout(token: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best effort
  }
}
