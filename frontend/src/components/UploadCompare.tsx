/**
 * Before/After comparison flow:
 * - Upload/capture pick-up (before) and return (after) images
 * - Computes new damage (counts and costs) and shows annotated images
 * - Exports a printable report with summary and totals
 */
import { useEffect, useState } from 'react';
import { compare } from '../api/client';
import type { CompareResponse, Totals } from '../api/client';
import { fileToDataUrl, dataUrlToFile, saveLS, loadLS } from '../utils/storage';
import CameraCapture from './CameraCapture';

type MoneyLike = number | (Partial<Totals> & { min?: number; max?: number | null }) | null | undefined;

function formatTotal(t: MoneyLike): string {
  if (t === null || t === undefined) return '-';
  if (typeof t === 'number') return `$${t.toLocaleString()} USD`;
  const min = Math.round((t?.min ?? 0) as number);
  const max = (t?.max ?? null) as number | null;
  const currency = (t?.currency as string) || 'USD';
  const open = Boolean(t?.open_ended);
  if (open || max == null) return `≥ ${min.toLocaleString()} ${currency}`;
  if (min === max) return `${min.toLocaleString()} ${currency}`;
  return `${min.toLocaleString()} – ${max.toLocaleString()} ${currency}`;
}

export default function UploadCompare() {
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCameraFor, setShowCameraFor] = useState<'before' | 'after' | null>(null);
  const [vehicleType, setVehicleType] = useState<string>(() => loadLS<string>('vehicle.type') || 'car');

  useEffect(() => {
    const b = loadLS<string>('compare.before');
    const a = loadLS<string>('compare.after');
    const r = loadLS<CompareResponse>('compare.result');
    if (b) {
      setBeforeUrl(b);
      setBeforeFile(dataUrlToFile(b, 'before.jpg'));
    }
    if (a) {
      setAfterUrl(a);
      setAfterFile(dataUrlToFile(a, 'after.jpg'));
    }
    if (r) setResult(r);
  }, []);

  async function onBeforeChange(f?: File | null) {
    if (!f) return;
    setBeforeFile(f);
    const url = await fileToDataUrl(f);
    setBeforeUrl(url);
    saveLS('compare.before', url);
    setResult(null);
    try { localStorage.removeItem('compare.result'); } catch { /* ignore */ }
  }

  function onDownloadReport() {
    if (!result) return;
    const beforeImg = result.before_annotated_b64 ? `data:image/png;base64,${result.before_annotated_b64}` : (beforeUrl || '');
    const afterImg = result.after_annotated_b64 ? `data:image/png;base64,${result.after_annotated_b64}` : (afterUrl || '');
    const rows = Object.entries(result.new_damage_counts).map(([cls, n]) => {
      return `<tr><td>${cls}</td><td style="text-align:center">${n}</td></tr>`;
    }).join('');
    const totalsObj = result.new_damage_costs?.totals ?? result.new_damage_costs_rule?.totals;
    const finalNumber = result.price?.final_delta_usd ?? totalsObj?.min;
    const total = formatTotal(finalNumber ?? totalsObj);
    const html = `
      <html><head><title>Damage Comparison Report</title>
      <style>
        body{font-family:Arial;padding:20px}
        h1{margin:0 0 8px 0}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        td,th{border:1px solid #ddd;padding:8px}
        th{background:#f4f4f4}
        .col{width:49%;display:inline-block;vertical-align:top}
        img{max-width:100%;border-radius:8px}
      </style></head><body>
      <h1>Before / After Comparison Report</h1>
      <p>Generated at ${new Date().toLocaleString()}</p>
      <div class="col">${beforeImg ? `<h3>Pick-up</h3><img src="${beforeImg}"/>` : ''}</div>
      <div class="col" style="margin-left:2%">${afterImg ? `<h3>Return</h3><img src="${afterImg}"/>` : ''}</div>
      <h3 style="margin-top:16px">New Damages</h3>
      <table>
        <thead><tr><th>Class</th><th>Count</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h3>Total: ${total}</h3>
      </body></html>`;
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      w.print();
    }
  }

  async function onAfterChange(f?: File | null) {
    if (!f) return;
    setAfterFile(f);
    const url = await fileToDataUrl(f);
    setAfterUrl(url);
    saveLS('compare.after', url);
    setResult(null);
    try { localStorage.removeItem('compare.result'); } catch { /* ignore */ }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const b = beforeFile ?? (beforeUrl ? dataUrlToFile(beforeUrl, 'before.jpg') : null);
    const a = afterFile ?? (afterUrl ? dataUrlToFile(afterUrl, 'after.jpg') : null);
    if (!b || !a) return;
    setLoading(true);
    setError(null);
    try {
      saveLS('vehicle.type', vehicleType);
      const data = await compare(b, a, vehicleType);
      setResult(data);
      saveLS('compare.result', data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="select" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
            <option value="car">Car</option>
            <option value="truck">Truck</option>
            <option value="motorcycle">Motorcycle</option>
            <option value="scooter">Scooter</option>
            <option value="boat">Boat</option>
          </select>
          <div>
            <label>Pick-up (Before): </label>
            <input type="file" accept="image/*" onChange={(e) => onBeforeChange(e.target.files?.[0] || null)} />
            <button type="button" className="btn-camera" style={{ marginLeft: 6 }} onClick={() => setShowCameraFor('before')}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9 7l1.2-2.4c.2-.4.6-.6 1-.6h2.6c.4 0 .8.2 1 .6L16 7h2c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h3zm3 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm0 2a2.5 2.5 0 110 5 2.5 2.5 0 010-5z"/>
              </svg>
              Use Camera
            </button>
          </div>
          <div>
            <label>Return (After): </label>
            <input type="file" accept="image/*" onChange={(e) => onAfterChange(e.target.files?.[0] || null)} />
            <button type="button" className="btn-camera" style={{ marginLeft: 6 }} onClick={() => setShowCameraFor('after')}>
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M9 7l1.2-2.4c.2-.4.6-.6 1-.6h2.6c.4 0 .8.2 1 .6L16 7h2c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h3zm3 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm0 2a2.5 2.5 0 110 5 2.5 2.5 0 010-5z"/>
              </svg>
              Use Camera
            </button>
          </div>
          <button className="primary" type="submit" disabled={(!beforeFile && !beforeUrl) || (!afterFile && !afterUrl) || loading}>{loading ? 'Comparing…' : 'Compare'}</button>
        </div>
      </form>

      {error && <p style={{ color: 'salmon' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        {result?.before_annotated_b64 ? (
          <img src={`data:image/png;base64,${result.before_annotated_b64}`} className="preview" style={{ maxWidth: '49%' }} />
        ) : (
          beforeUrl && <img src={beforeUrl} className="preview" style={{ maxWidth: '49%' }} />
        )}
        {result?.after_annotated_b64 ? (
          <img src={`data:image/png;base64,${result.after_annotated_b64}`} className="preview" style={{ maxWidth: '49%' }} />
        ) : (
          afterUrl && <img src={afterUrl} className="preview" style={{ maxWidth: '49%' }} />
        )}
      </div>

      {result && (
        <div style={{ marginTop: 16 }}>
          <h3>New Damages</h3>
          {Object.keys(result.new_damage_counts).length === 0 ? (
            <p>No additional damages detected at return.</p>
          ) : (
            <>
              <ul>
                {Object.entries(result.new_damage_counts).map(([cls, n]) => (
                  <li key={cls}>{cls} × {n}</li>
                ))}
              </ul>
              <strong>
                Estimated New Damage Total:{' '}
                {formatTotal(
                  (result.price?.final_delta_usd ??
                    result.new_damage_costs?.totals?.min ??
                    result.new_damage_costs_rule?.totals?.min ??
                    undefined)
                )}
              </strong>
              <div className="actions" style={{ marginTop: 12 }}>
                <button className="primary" onClick={onDownloadReport}>Download PDF Report</button>
              </div>
            </>
          )}
        </div>
      )}

      {showCameraFor && (
        <CameraCapture
          onCapture={async (f) => {
            if (showCameraFor === 'before') {
              await onBeforeChange(f);
            } else {
              await onAfterChange(f);
            }
          }}
          onClose={() => setShowCameraFor(null)}
        />
      )}
    </div>
  );
}


