import { useEffect, useState } from 'react';
import { predict } from '../api/client';
import type { PredictResponse } from '../api/client';
import { fileToDataUrl, dataUrlToFile, saveLS, loadLS } from '../utils/storage';
import CameraCapture from './CameraCapture';

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
  const [showCamera, setShowCamera] = useState(false);

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
    // Clear previous result when a new file is selected
    setResult(null);
    try { localStorage.removeItem('single.result'); } catch { /* ignore */ }
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  function onDownloadReport() {
    if (!result) return;
    const img = result.annotated_image_b64 ? `data:image/png;base64,${result.annotated_image_b64}` : imageDataUrl;
    const rows = Object.entries(result.counts).map(([cls, count]) => {
      const cost = result.per_class_costs[cls]?.range_text ?? '';
      return `<tr><td>${cls}</td><td style="text-align:center">${count}</td><td style="text-align:right">${cost}</td></tr>`;
    }).join('');
    const total = formatTotal(result.totals);
    const html = `
      <html><head><title>Damage Report</title>
      <style>
        body{font-family:Arial;padding:20px}
        h1{margin:0 0 8px 0}
        table{width:100%;border-collapse:collapse;margin-top:12px}
        td,th{border:1px solid #ddd;padding:8px}
        th{background:#f4f4f4}
      </style></head><body>
      <h1>Vehicle Damage Report</h1>
      <p>Generated at ${new Date().toLocaleString()}</p>
      ${img ? `<img src="${img}" style="max-width:100%;border-radius:8px;margin:10px 0"/>` : ''}
      <table>
        <thead><tr><th>Class</th><th>Count</th><th>Each</th></tr></thead>
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

  return (
    <div>
      <form onSubmit={onSubmit} className="actions">
        <input type="file" accept="image/*" onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
        <button className="primary" type="submit" disabled={(!file && !imageDataUrl) || loading}>{loading ? 'Analyzing…' : 'Analyze'}</button>
        <button type="button" style={{ marginLeft: 8 }} onClick={() => setShowCamera(true)}>Use Camera</button>
      </form>

      {error && <p style={{ color: 'salmon' }}>{error}</p>}

      {/* Original and annotated side-by-side */}
      <div className="grid" style={{ marginTop: 12 }}>
        {imageDataUrl && <img src={imageDataUrl} className="preview" />}
        {result?.annotated_image_b64 && (
          <img src={`data:image/png;base64,${result.annotated_image_b64}`} className="preview" />
        )}
      </div>

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
          {/* Hide per-detection text list as requested */}
          <strong>Estimated Total: {formatTotal(result.totals)}</strong>
          <div className="actions" style={{ marginTop: 12 }}>
            <button className="primary" onClick={onDownloadReport}>Download PDF Report</button>
          </div>
        </div>
      )}

      {showCamera && (
        <CameraCapture
          onCapture={async (f) => {
            await onFileChange(f);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}
    </div>
  );
}


