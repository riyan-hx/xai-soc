const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = Array.isArray(body.detail)
      ? body.detail.map((d) => d.msg).join("; ")
      : body.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  return res.json();
}

// Repeats a query key for each array entry (attack_type=A&attack_type=B),
// which is what FastAPI's `List[str] = Query(None)` params expect.
function buildQuery(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value == null || value === "") continue;
    if (Array.isArray(value)) {
      value.filter(Boolean).forEach((v) => params.append(key, v));
    } else {
      params.append(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

const post = (path, body) =>
  request(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  health: () => request("/api/health"),
  login: (email, password) => post("/api/auth/login", { email, password }),
  me: () => request("/api/auth/me"),

  listAlerts: (filters = {}) => request(`/api/alerts${buildQuery(filters)}`),
  listAlertsGrouped: (filters = {}) => request(`/api/alerts/grouped${buildQuery(filters)}`),
  getAlert: (id) => request(`/api/alerts/${id}`),
  updateAlert: (id, patch) =>
    request(`/api/alerts/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  getEvents: (id) => request(`/api/alerts/${id}/events`),
  addNote: (id, body) => post(`/api/alerts/${id}/events`, { body }),
  submitFeedback: (id, isTruePositive, notes) =>
    post(`/api/alerts/${id}/feedback`, { is_true_positive: isTruePositive, notes }),
  whatIf: (id, overrides) => post(`/api/alerts/${id}/whatif`, { overrides }),
  counterfactual: (id) => post(`/api/alerts/${id}/counterfactual`),

  getStats: () => request("/api/stats"),
  getOverview: () => request("/api/stats/overview"),
  getTimeseries: (range) => request(`/api/stats/timeseries${buildQuery({ range })}`),
  getHeatmap: (days) => request(`/api/stats/heatmap${buildQuery({ days })}`),
  getRecentFeedback: (limit) => request(`/api/feedback/recent${buildQuery({ limit })}`),

  getModelInfo: () => request("/api/model/info"),
  getModelInsights: () => request("/api/model/insights"),

  securityPosture: () => request("/api/system/security"),
  simulate: (payload) => post("/api/simulate", payload),
  backfill: (payload) => post("/api/simulate/backfill", payload),

  listUsers: () => request("/api/users"),
  userDirectory: () => request("/api/users/directory"),
  createUser: (user) => post("/api/users", user),
  deleteUser: (id) => request(`/api/users/${id}`, { method: "DELETE" }),

  listLogs: (filters = {}) => request(`/api/logs${buildQuery(filters)}`),
};
