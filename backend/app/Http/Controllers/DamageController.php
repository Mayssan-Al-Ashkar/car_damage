<?php
/**
 * DamageController
 *
 * Accepts image uploads for single or compare flows, forwards them to the ML service,
 * persists resulting claims (including URLs to original/annotated images), and returns
 * the ML payload plus claim_id. Supports an optional visitor_id to scope claims per session.
 */
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use App\Models\Claim;

class DamageController extends Controller
{
    public function predict(Request $request)
    {
        $request->validate([
            'image' => 'required|file|image|max:20480',
        ]);

        $mlBase = env('ML_BASE', 'http://localhost:8001');
        $image = $request->file('image')->getRealPath();
        try {
            $mlResponse = Http::attach(
                'image',
                fopen($image, 'r'),
                $request->file('image')->getClientOriginalName()
            )->post($mlBase . '/predict', [
                'vehicle_type' => $request->input('vehicle_type')
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'ML service unavailable',
                'detail' => $e->getMessage(),
            ], 502);
        }

        if (!$mlResponse->ok()) {
            return response()->json($mlResponse->json(), $mlResponse->status());
        }

        $data = $mlResponse->json();

        // Save original upload
        $storedImage = $request->file('image')->store('public/claims');
        // Save annotated image (base64)
        $annotatedPath = null;
        if (!empty($data['annotated_image_b64'])) {
            $annotatedBytes = base64_decode($data['annotated_image_b64']);
            $annotatedPath = 'public/claims/' . uniqid('annotated_') . '.png';
            Storage::put($annotatedPath, $annotatedBytes);
        }

        $claim = Claim::create([
            'type' => 'single',
            'vehicle_type' => $request->input('vehicle_type'),
            'counts' => $data['counts'] ?? null,
            'total_usd' => (int)($data['totals']['min'] ?? 0),
            'currency' => $data['totals']['currency'] ?? 'USD',
            'image_path' => $storedImage ? Storage::url($storedImage) : null,
            'annotated_path' => $annotatedPath ? Storage::url($annotatedPath) : null,
        ]);

        $data['claim_id'] = $claim->id;
        return response()->json($data, 200);
    }

    public function compare(Request $request)
    {
        $request->validate([
            'before' => 'required|file|image|max:20480',
            'after' => 'required|file|image|max:20480',
        ]);

        $mlBase = env('ML_BASE', 'http://localhost:8001');
        $before = $request->file('before')->getRealPath();
        $after = $request->file('after')->getRealPath();

        try {
            $mlResponse = Http::attach(
                'before',
                fopen($before, 'r'),
                $request->file('before')->getClientOriginalName()
            )->attach(
                'after',
                fopen($after, 'r'),
                $request->file('after')->getClientOriginalName()
            )->post($mlBase . '/compare', [
                'vehicle_type' => $request->input('vehicle_type')
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'error' => 'ML service unavailable',
                'detail' => $e->getMessage(),
            ], 502);
        }

        if (!$mlResponse->ok()) {
            return response()->json($mlResponse->json(), $mlResponse->status());
        }
        $data = $mlResponse->json();

        // Save originals
        $beforeStored = $request->file('before')->store('public/claims');
        $afterStored = $request->file('after')->store('public/claims');

        // Save annotated images
        $beforeAnn = null;
        $afterAnn = null;
        if (!empty($data['before_annotated_b64'])) {
            $bytes = base64_decode($data['before_annotated_b64']);
            $beforeAnn = 'public/claims/' . uniqid('before_') . '.png';
            Storage::put($beforeAnn, $bytes);
        }
        if (!empty($data['after_annotated_b64'])) {
            $bytes = base64_decode($data['after_annotated_b64']);
            $afterAnn = 'public/claims/' . uniqid('after_') . '.png';
            Storage::put($afterAnn, $bytes);
        }

        $total = (int)($data['new_damage_costs']['totals']['min'] ?? 0);
        $currency = $data['new_damage_costs']['totals']['currency'] ?? 'USD';

        $claim = Claim::create([
            'type' => 'compare',
            'vehicle_type' => $request->input('vehicle_type'),
            'counts' => $data['after_counts'] ?? null,
            'new_damage_counts' => $data['new_damage_counts'] ?? null,
            'total_usd' => $total,
            'currency' => $currency,
            'before_path' => $beforeStored ? Storage::url($beforeStored) : null,
            'after_path' => $afterStored ? Storage::url($afterStored) : null,
            'before_annotated_path' => $beforeAnn ? Storage::url($beforeAnn) : null,
            'after_annotated_path' => $afterAnn ? Storage::url($afterAnn) : null,
        ]);

        $data['claim_id'] = $claim->id;
        return response()->json($data, 200);
    }
}
