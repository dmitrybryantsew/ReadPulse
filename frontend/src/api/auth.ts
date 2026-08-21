const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL ?? "http://localhost:5159";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: "user" | "admin";
  defaultLanguage: "en" | "ru";
  pageSize: number;
  hasApiKey: boolean;
  model?: string | null;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  return r.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `HTTP ${r.status}`);
  }
  return r.json();
}

async function get<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export const authApi = {
  register: (email: string, name: string, password: string) =>
    post<AuthUser>("/api/auth/register", { email, name, password }),
  login: (email: string, password: string) =>
    post<AuthUser>("/api/auth/login", { email, password }),
  googleLogin: (idToken: string) =>
    post<AuthUser>("/api/auth/google", { idToken }),
  logout: () =>
    post<void>("/api/auth/logout", {}),
  me: () => get<AuthUser>("/api/auth/me"),
};

export const userApi = {
  saveApiKey: (apiKey: string | null) =>
    put("/api/users/me/settings", { apiKey }),
  savePreferences: (defaultLanguage?: "en" | "ru", pageSize?: number) =>
    put("/api/users/me/settings", { defaultLanguage, pageSize }),
  saveAll: (data: { apiKey?: string | null; promptOverride?: string | null; defaultLanguage?: "en" | "ru"; pageSize?: number; model?: string | null }) =>
    put("/api/users/me/settings", data),
};

export const adminApi = {
  listUsers: () => get<AdminUser[]>("/api/admin/users"),
  updateUser: (id: number, updates: { role?: string; isActive?: boolean }) =>
    fetch(`${API_BASE_URL}/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(updates),
    }),
  getStats: () => get<AdminStats>("/api/admin/stats"),
};

export interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: string;
  createdAt: string;
  lastActiveAt: string;
  isActive: boolean;
  postCount: number;
  hasApiKey: boolean;
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  totalPosts: number;
  totalBooks: number;
  postsByLanguage: { language: string; count: number }[];
  postsByType: { type: string; count: number }[];
}
