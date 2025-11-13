import { useEffect, useState } from 'react';
import { predict } from '../api/client';
import type { PredictResponse } from '../api/client';
import { fileToDataUrl, dataUrlToFile, saveLS, loadLS } from '../utils/storage';

function formatTotal(t: PredictResponse['totals']) {
  if (t.open_ended || t.max == null) return `≥ ${t.min.toLocaleString()} ${t.currency}`;
  if (t.min === t.max) return `${t.min.toLocaleString()} ${t.currency}`;
  return `${t.min.toLocaleString()} – ${t.max.toLocaleString()} ${t.currency}`;
}

export default function UploadSingle() {
  const [file, setFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load persisted state
  useEffect(() => {
    const savedUrl = loadLS<string>('single.image');
    const savedRes = loadLS<PredictResponse>('single.result');
    if (savedUrl) {
      setImageDataUrl(savedUrl);
      setFile(dataUrlToFile(savedUrl, 'single.jpg'));
    }
    if (savedRes) setResult(savedRes);
  }, []);

  async function onFileChange(f?: File | null) {
    if (!f) return;
    setFile(f);
    const url = await fileToDataUrl(f);
    setImageDataUrl(url);
    saveLS('single.image', url);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file && imageDataUrl) {
      setFile(dataUrlToFile(imageDataUrl, 'single.jpg'));
    }
    const effectiveFile = file ?? (imageDataUrl ? dataUrlToFile(imageDataUrl, 'single.jpg') : null);
    if (!effectiveFile) return;
    setLoading(true);
    setError(null);
    try {
      const data = await predict(effectiveFile);
      setResult(data);
      saveLS('single.result', data);
    } catch (err: any) {
      setError(err?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="actions">
        <input type="file" accept="image/*" onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
        <button className="primary" type="submit" disabled={(!file && !imageDataUrl) || loading}>{loading ? 'Analyzing…' : 'Analyze'}</button>
      </form>

      {error && <p style={{ color: 'salmon' }}>{error}</p>}

      {imageDataUrl && <img src={imageDataUrl} className="preview" style={{ marginTop: 12 }} />}

      {result && (
        <div style={{ marginTop: 16 }}>
          <h3>Detected Damages</h3>
          <ul>
            {Object.entries(result.counts).map(([cls, count]) => (
              <li key={cls}>
                {cls} × {count} {result.per_class_costs[cls] ? `→ ${result.per_class_costs[cls].range_text}` : '(no price configured)'}
              </li>
            ))}
          </ul>
          <strong>Estimated Total: {formatTotal(result.totals)}</strong>
        </div>
      )}
    </div>
  );
}


