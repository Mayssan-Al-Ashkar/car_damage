import axios from 'axios';

// Determine base URL:
// - If VITE_API_BASE points to Laravel at :8000 and doesn't include /api, append /api
// - Otherwise use as-is
// - Default to ML service at :8001
const rawBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
let baseURL = rawBase ?? 'http://localhost:8001';
if (/^https?:\/\/[^]+:8000(\/.*)?$/i.test(baseURL) && !/\/api(\/|$)/i.test(baseURL)) {
  baseURL = baseURL.replace(/\/$/, '') + '/api';
}

export const http = axios.create({
  baseURL,
});

export type PredictResponse = {
  classes: string[];
  counts: Record<string, number>;
  per_class_costs: Record<string, { count: number; range_text: string; min_each: number; max_each: number | null; open_ended: boolean }>;
  totals: { min: number; max: number | null; open_ended: boolean; currency: string };
};

export async function predict(image: File) {
  const form = new FormData();
  form.append('image', image);
  const { data } = await http.post<PredictResponse>('/predict', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

export type CompareResponse = {
  before_counts: Record<string, number>;
  after_counts: Record<string, number>;
  new_damage_counts: Record<string, number>;
  new_damage_costs: PredictResponse;
};

export async function compare(before: File, after: File) {
  const form = new FormData();
  form.append('before', before);
  form.append('after', after);
  const { data } = await http.post<CompareResponse>('/compare', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}


