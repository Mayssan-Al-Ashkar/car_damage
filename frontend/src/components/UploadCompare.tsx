import { useEffect, useState } from 'react';
import { compare } from '../api/client';
import type { CompareResponse } from '../api/client';
import { fileToDataUrl, dataUrlToFile, saveLS, loadLS } from '../utils/storage';
import CameraCapture from './CameraCapture';

function formatTotal(t: CompareResponse['new_damage_costs']['totals']) {
  if (t.open_ended || t.max == null) return `≥ ${t.min.toLocaleString()} ${t.currency}`;
  if (t.min === t.max) return `${t.min.toLocaleString()} ${t.currency}`;
  return `${t.min.toLocaleString()} – ${t.max.toLocaleString()} ${t.currency}`;
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
    const total = formatTotal(result.new_damage_costs.totals);
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
      const data = await compare(b, a);
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div>
            <label>Pick-up (Before): </label>
            <input type="file" accept="image/*" onChange={(e) => onBeforeChange(e.target.files?.[0] || null)} />
            <button type="button" style={{ marginLeft: 6 }} onClick={() => setShowCameraFor('before')}>Use Camera</button>
          </div>
          <div>
            <label>Return (After): </label>
            <input type="file" accept="image/*" onChange={(e) => onAfterChange(e.target.files?.[0] || null)} />
            <button type="button" style={{ marginLeft: 6 }} onClick={() => setShowCameraFor('after')}>Use Camera</button>
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
              <strong>Estimated New Damage Total: {formatTotal(result.new_damage_costs.totals)}</strong>
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


