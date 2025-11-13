import { useEffect, useState } from 'react';
import { compare } from '../api/client';
import type { CompareResponse } from '../api/client';
import { fileToDataUrl, dataUrlToFile, saveLS, loadLS } from '../utils/storage';

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
  }

  async function onAfterChange(f?: File | null) {
    if (!f) return;
    setAfterFile(f);
    const url = await fileToDataUrl(f);
    setAfterUrl(url);
    saveLS('compare.after', url);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    let b = beforeFile ?? (beforeUrl ? dataUrlToFile(beforeUrl, 'before.jpg') : null);
    let a = afterFile ?? (afterUrl ? dataUrlToFile(afterUrl, 'after.jpg') : null);
    if (!b || !a) return;
    setLoading(true);
    setError(null);
    try {
      const data = await compare(b, a);
      setResult(data);
      saveLS('compare.result', data);
    } catch (err: any) {
      setError(err?.message || 'Request failed');
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
          </div>
          <div>
            <label>Return (After): </label>
            <input type="file" accept="image/*" onChange={(e) => onAfterChange(e.target.files?.[0] || null)} />
          </div>
          <button className="primary" type="submit" disabled={(!beforeFile && !beforeUrl) || (!afterFile && !afterUrl) || loading}>{loading ? 'Comparing…' : 'Compare'}</button>
        </div>
      </form>

      {error && <p style={{ color: 'salmon' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        {beforeUrl && <img src={beforeUrl} className="preview" style={{ maxWidth: '49%' }} />}
        {afterUrl && <img src={afterUrl} className="preview" style={{ maxWidth: '49%' }} />}
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
            </>
          )}
        </div>
      )}
    </div>
  );
}


