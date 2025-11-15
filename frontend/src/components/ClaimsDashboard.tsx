/**
 * Simple claims dashboard:
 * - Fetches recent claims from Laravel backend
 * - Displays type, vehicle, total, and created time
 * Extend with filters and claim detail views as needed.
 */
import { useEffect, useState } from 'react';

type Claim = {
  id: number;
  type: 'single' | 'compare' | string;
  total_usd: number;
  currency: string;
  vehicle_type?: string | null;
  image_path?: string | null;
  annotated_path?: string | null;
  before_path?: string | null;
  after_path?: string | null;
  before_annotated_path?: string | null;
  after_annotated_path?: string | null;
  created_at: string;
};

export default function ClaimsDashboard() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Avoid `any` on import.meta by using a safe structural cast
        const env = (import.meta as unknown as { env?: { VITE_API_BASE?: string } }).env;
        const base = (env?.VITE_API_BASE && String(env.VITE_API_BASE)) || 'http://localhost:8000';
        const url = base.replace(/\/$/, '') + '/api/claims';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setClaims(data.data || data); // support pagination or array
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to load claims';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div>
      <h3>Claims</h3>
      {error && <p style={{ color: 'salmon' }}>{error}</p>}
      {loading ? <p>Loading…</p> : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #2a2a2a' }}>ID</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #2a2a2a' }}>Type</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #2a2a2a' }}>Vehicle</th>
              <th style={{ textAlign: 'right', padding: 8, borderBottom: '1px solid #2a2a2a' }}>Total</th>
              <th style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid #2a2a2a' }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((c) => (
              <tr key={c.id}>
                <td style={{ padding: 8, borderBottom: '1px solid #2a2a2a' }}>{c.id}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #2a2a2a' }}>{c.type}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #2a2a2a' }}>{c.vehicle_type || '-'}</td>
                <td style={{ padding: 8, borderBottom: '1px solid #2a2a2a', textAlign: 'right' }}>
                  {c.total_usd.toLocaleString()} {c.currency}
                </td>
                <td style={{ padding: 8, borderBottom: '1px solid #2a2a2a' }}>
                  {new Date(c.created_at).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}


