<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('claims', function (Blueprint $table) {
            $table->id();
            $table->string('type'); // single | compare
            $table->json('counts')->nullable();
            $table->json('new_damage_counts')->nullable(); // for compare
            $table->integer('total_usd')->default(0);
            $table->string('currency')->default('USD');
            // image paths
            $table->string('image_path')->nullable();
            $table->string('annotated_path')->nullable();
            $table->string('before_path')->nullable();
            $table->string('after_path')->nullable();
            $table->string('before_annotated_path')->nullable();
            $table->string('after_annotated_path')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('claims');
    }
};


