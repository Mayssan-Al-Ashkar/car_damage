/**
 * HTTP client and API response types for the frontend.
 * - Auto-appends /api when targeting Laravel on :8000.
 * - Types reflect both legacy rule totals and the newer ML pricing block.
 */
import axios from 'axios';

// Determine base URL:
// - If VITE_API_BASE points to Laravel at :8000 and doesn't include /api, append /api
// - Otherwise use as-is
// - Default to ML service at :8001
const env = (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env;
const rawBase = (env?.VITE_API_BASE as string | undefined);
let baseURL = rawBase ?? 'http://localhost:8001';
if (/^https?:\/\/[^]+:8000(\/.*)?$/i.test(baseURL) && !/\/api(\/|$)/i.test(baseURL)) {
  baseURL = baseURL.replace(/\/$/, '') + '/api';
}

export const http = axios.create({
  baseURL,
});

export type Totals = { min: number; max: number | null; open_ended: boolean; currency: string };
export type PerClassCost = { count: number; range_text: string; min_each: number; max_each: number | null; open_ended: boolean };
export type PriceBlock = { provider?: string; ml_usd?: number | null; rule_usd?: number; final_usd?: number };

export type PredictResponse = {
  classes: string[];
  detections?: { class: string; confidence: number | null; each_cost_usd: number | null }[];
  counts: Record<string, number>;
  per_class_costs: Record<string, PerClassCost>;
  totals?: Totals;          // legacy
  totals_rule?: Totals;     // new API field
  price?: PriceBlock;       // present when ML is enabled
  annotated_image_b64?: string;
};

export async function predict(image: File, vehicleType?: string) {
  const form = new FormData();
  form.append('image', image);
  if (vehicleType) form.append('vehicle_type', vehicleType);
  const { data } = await http.post<PredictResponse>('/predict', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}

export type CompareResponse = {
  before_counts: Record<string, number>;
  after_counts: Record<string, number>;
  new_damage_counts: Record<string, number>;
  new_damage_costs?: { totals: Totals };       // legacy
  new_damage_costs_rule?: { totals: Totals };  // new API field
  price?: { provider?: string; ml_delta_usd?: number | null; rule_delta_usd?: number; final_delta_usd?: number };
  before_annotated_b64?: string;
  after_annotated_b64?: string;
};

export async function compare(before: File, after: File, vehicleType?: string) {
  const form = new FormData();
  form.append('before', before);
  form.append('after', after);
  if (vehicleType) form.append('vehicle_type', vehicleType);
  const { data } = await http.post<CompareResponse>('/compare', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  return data;
}


