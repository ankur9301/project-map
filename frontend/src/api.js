import { supabase } from "./supabaseClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const ngrokHeaders = API_BASE.includes("ngrok") ? { "ngrok-skip-browser-warning": "1" } : {};

async function authHeaders() {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const authorization = await authHeaders();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...ngrokHeaders, ...authorization, ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    let detail = `Request failed with ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail || detail;
    } catch {
      detail = response.statusText || detail;
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

export function getApartments(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);
  if (params.favorite !== undefined) query.set("favorite", params.favorite);
  if (params.sort) query.set("sort", params.sort);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return request(`/apartments${suffix}`);
}

export function addApartment(payload) {
  return request("/apartments", { method: "POST", body: JSON.stringify(payload) });
}

export function updateApartment(id, payload) {
  return request(`/apartments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function recalculateApartment(id) {
  return request(`/apartments/${id}/recalculate`, { method: "POST" });
}

export function getApartmentScores(id) {
  return request(`/apartments/${id}/scores`);
}

export function deleteApartment(id) {
  return request(`/apartments/${id}`, { method: "DELETE" });
}

export function getTarget() {
  return request("/target");
}

export function saveTarget(payload, recalculate = true) {
  return request(`/target?recalculate=${recalculate}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function exportUrl() {
  return `${API_BASE}/export`;
}

export async function downloadExport() {
  const authorization = await authHeaders();
  const response = await fetch(`${API_BASE}/export`, { headers: { ...ngrokHeaders, ...authorization } });
  if (!response.ok) throw new Error(`Export failed with ${response.status}`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "apartment_commutes.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
