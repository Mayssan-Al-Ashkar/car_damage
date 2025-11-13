<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\DamageController;

Route::post('/predict', [DamageController::class, 'predict']);
Route::post('/compare', [DamageController::class, 'compare']);


