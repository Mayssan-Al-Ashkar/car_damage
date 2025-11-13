<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class DamageController extends Controller
{
    public function predict(Request $request)
    {
        $request->validate([
            'image' => 'required|file|image|max:8192',
        ]);

        $mlBase = env('ML_BASE', 'http://localhost:8001');
        $image = $request->file('image')->getRealPath();
        $response = Http::attach(
            'image',
            fopen($image, 'r'),
            $request->file('image')->getClientOriginalName()
        )->post($mlBase . '/predict');

        return response()->json($response->json(), $response->status());
    }

    public function compare(Request $request)
    {
        $request->validate([
            'before' => 'required|file|image|max:8192',
            'after' => 'required|file|image|max:8192',
        ]);

        $mlBase = env('ML_BASE', 'http://localhost:8001');
        $before = $request->file('before')->getRealPath();
        $after = $request->file('after')->getRealPath();

        $response = Http::attach(
            'before',
            fopen($before, 'r'),
            $request->file('before')->getClientOriginalName()
        )->attach(
            'after',
            fopen($after, 'r'),
            $request->file('after')->getClientOriginalName()
        )->post($mlBase . '/compare');

        return response()->json($response->json(), $response->status());
    }
}
