# Vehicle Damage Detection & Repair Cost Estimation

End‑to‑end prototype for uploading vehicle photos, detecting damages with a YOLO model, and returning an exact USD repair estimate. It supports single-image analysis and before/after comparison, exposes an API for integrations, and ships with a modern web UI.

## Tech Stack

- frontend/ — React + Vite (TypeScript)
- backend/  — Laravel API (proxies to ML, future: auth, storage, DB)
- ml/       — FastAPI service (loads YOLO once; cost rules in USD)

## Project Structure

```
.
├─ frontend/            # React app (upload UI, comparison, PDF reports)
├─ backend/             # Laravel API (predict/compare endpoints)
├─ ml/                  # Python ML microservice (YOLO + cost engine)
│  ├─ api.py            # FastAPI endpoints /predict, /compare
│  ├─ services/         # inference.py runtime detection and costing
│  ├─ assets/
│  │  ├─ cost_rules.json            # USD parts/labor/paint defaults
│  │  └─ car_damage_price.json      # legacy ranges (fallback)
│  ├─ model/
│  │  └─ best.pt       # YOLO weights (place your file here)
│  └─ requirements.txt
└─ .venv/               # optional Python virtualenv (local use)
```

## Prerequisites

- Node 18+ and npm
- PHP 8.2+ and Composer
- Python 3.9–3.11 (recommended) and pip

## Quickstart (3 terminals)

1) Start the ML service (port 8001)

```bash
cd ml
python -m venv ..\.venv  # if you don't have one yet
..\ .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt

# Optional: adjust cost parameters at runtime
set LABOR_RATE_USD=95
set PAINT_RATE_USD=120
set MATERIALS_USD=50

python -m uvicorn ml.api:app --reload --host 127.0.0.1 --port 8001
```

Notes:
- Make sure `ml/model/best.pt` exists (copy your YOLO weights here).
- You can customize `ml/assets/cost_rules.json` to tune exact USD estimates.
- We draw detection boxes with OpenCV (`opencv-python-headless` is in the requirements).
- Verify the API:
  ```bash
  curl -v http://127.0.0.1:8001/docs
  ```

2) Start the Laravel backend (port 8000)

```bash
cd backend
composer install
copy .env.example .env
notepad .env
```

In `.env`, add:

```
APP_URL=http://localhost:8000
FILESYSTEM_DISK=public
ML_BASE=http://127.0.0.1:8001
```

Then:

```bash
php artisan key:generate
php artisan migrate
php artisan storage:link
php artisan optimize:clear
php artisan serve --port=8000
```
You can verify routes with:
```bash
php artisan route:list
```

3) Start the React frontend

```bash
cd frontend
npm install
echo VITE_API_BASE=http://localhost:8000> .env
npm run dev
```

Open the URL shown (typically `http://localhost:5173`). Upload an image or use the **Before / After** tab. You’ll see the original and detected images side‑by‑side (boxes only), a per‑class summary, and an exact USD total. You can also download a simple PDF‑style report.

### Camera capture
- On Single and Compare tabs, click “Use Camera” to capture photos via `getUserMedia`. Works on `http://localhost` or any `https://` origin.

## API (ML service)

Run: `uvicorn ml.api:app --reload --port 8001`

- POST `/predict` — form field `image` (file)
  - Returns JSON with `classes`, `detections` (class, confidence, each_cost_usd), `counts`, `per_class_costs`, `totals`, and `annotated_image_b64` (PNG).
- POST `/compare` — form fields `before`, `after` (files)
  - Returns JSON with before/after counts, new-damage counts/costs, and annotated images as base64.

## Backend API (Laravel)

- `POST /api/predict` — accepts `image` (file). Proxies to ML `/predict`, persists a “single” claim with original/annotated paths and totals, returns ML payload plus `claim_id`.
- `POST /api/compare` — accepts `before`, `after` (files). Proxies to ML `/compare`, persists a “compare” claim with before/after + annotated paths and totals, returns ML payload plus `claim_id`.
- `GET /api/claims` — paginated list of saved claims (supports `?type=single|compare`).
- `GET /api/claims/{id}` — single claim record.

## Cost Estimation

- Exact USD totals are computed via `ml/assets/cost_rules.json`:

```json
{
  "Minor":    { "parts_usd": 200,  "labor_h": 1.5,  "paint_h": 0.5 },
  "Moderate": { "parts_usd": 650,  "labor_h": 4.0,  "paint_h": 2.0 },
  "Severe":   { "parts_usd": 1800, "labor_h": 10.0, "paint_h": 4.0 }
}
```

- Runtime overrides (env): `LABOR_RATE_USD`, `PAINT_RATE_USD`, `MATERIALS_USD`.
- If rules are missing, the service falls back to a midpoint USD conversion from legacy ranges.

## Common Issues

- ML not reachable: ensure Terminal A is running `uvicorn` with `--host 127.0.0.1 --port 8001`; try `curl -v http://127.0.0.1:8001/docs`.
- 500 on `/api/predict` or `/api/compare`:
  - Run `php artisan migrate` and `php artisan storage:link` in `backend/`.
  - Ensure `ML_BASE=http://127.0.0.1:8001` and restart `php artisan serve`.
  - Inspect `backend/storage/logs/laravel.log` for details.
- 404 on `/api/predict`: verify routes with `php artisan route:list`.
- CORS issues: `backend/config/cors.php` allows `http://localhost:5173` by default.
- Large camera images: backend allows up to ~20 MB per image—reduce resolution if needed.

## Roadmap

- Persist claims and results in Laravel (DB + S3)
- Admin dashboard and user roles
- Better PDF reports and email share
- Docker Compose for one-command local run

---

Questions or ideas? Open an issue or PR. Contributions are welcome!

