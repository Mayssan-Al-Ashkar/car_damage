<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\DamageController;
use App\Http\Controllers\ClaimController;

Route::post('/predict', [DamageController::class, 'predict']);
Route::post('/compare', [DamageController::class, 'compare']);
Route::get('/claims', [ClaimController::class, 'index']);
Route::get('/claims/{claim}', [ClaimController::class, 'show']);


