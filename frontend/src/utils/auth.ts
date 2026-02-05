const TOKEN_KEY = "datahub_token";

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function getRoleFromToken(): string | null {
  const token = getAuthToken();
  if (!token) return null;
  try {
    if (token.split(".").length === 3) {
      const payload = token.split(".")[1];
      const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
      const claims = JSON.parse(decoded) as {
        role?: string;
        app_metadata?: { role?: string };
        user_metadata?: { role?: string };
      };
      const role = claims.app_metadata?.role || claims.user_metadata?.role || claims.role;
      if (!role) return "viewer";
      const normalized = role.toLowerCase();
      if (["service_role", "supabase_admin", "admin"].includes(normalized)) return "admin";
      if (["editor", "writer"].includes(normalized)) return "editor";
      return "viewer";
    }
    const decoded = atob(token.replace(/-/g, "+").replace(/_/g, "/"));
    const parts = decoded.split("|");
    if (parts.length >= 2) {
      return parts[1];
    }
  } catch {
    return null;
  }
  return null;
}