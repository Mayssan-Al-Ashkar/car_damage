<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Claim extends Model
{
    protected $fillable = [
        'type',
        'counts',
        'new_damage_counts',
        'total_usd',
        'currency',
        'image_path',
        'annotated_path',
        'before_path',
        'after_path',
        'before_annotated_path',
        'after_annotated_path',
    ];

    protected $casts = [
        'counts' => 'array',
        'new_damage_counts' => 'array',
    ];
}


