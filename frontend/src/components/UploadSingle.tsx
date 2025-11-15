/**
 * Single-image flow:
 * - Choose vehicle type + image (or capture from camera)
 * - Calls /predict and displays detections and pricing
 * - Allows exporting a simple PDF-style report
 */
import { useEffect, useState } from 'react';
import { predict } from '../api/client';
import type { PredictResponse, Totals } from '../api/client';
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

export default function UploadSingle() {
  const [file, setFile] = useState<File | null>(null);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [result, setResult] = useState<PredictResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [vehicleType, setVehicleType] = useState<string>(() => loadLS<string>('vehicle.type') || 'car');

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
      saveLS('vehicle.type', vehicleType);
      const data = await predict(effectiveFile, vehicleType);
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
        <select className="select" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)}>
          <option value="car">Car</option>
          <option value="truck">Truck</option>
          <option value="motorcycle">Motorcycle</option>
          <option value="scooter">Scooter</option>
          <option value="boat">Boat</option>
        </select>
        <input type="file" accept="image/*" onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
        <button type="button" className="btn-camera" onClick={() => setShowCamera(true)}>
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M9 7l1.2-2.4c.2-.4.6-.6 1-.6h2.6c.4 0 .8.2 1 .6L16 7h2c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V9c0-1.1.9-2 2-2h3zm3 2.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9zm0 2a2.5 2.5 0 110 5 2.5 2.5 0 010-5z"/>
          </svg>
          Use Camera
        </button>
        <button className="primary" type="submit" disabled={(!file && !imageDataUrl) || loading}>{loading ? 'Analyzing…' : 'Analyze'}</button>
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
          {/* Choose final price: ML/hybrid if available, else rule totals */}
          <strong>
            Estimated Total:{' '}
            {formatTotal(
              (result.price?.final_usd ??
                result.totals?.min ??
                result.totals_rule?.min ??
                undefined)
            )}
          </strong>
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


