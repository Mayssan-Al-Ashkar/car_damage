<?php
/**
 * ClaimController
 *
 * Read-only endpoints for listing and retrieving claims.
 * Supports optional filtering by 'type' and can be extended to filter by 'visitor'.
 */
namespace App\Http\Controllers;

use App\Models\Claim;
use Illuminate\Http\Request;

class ClaimController extends Controller
{
    public function index(Request $request)
    {
        $query = Claim::query()->orderByDesc('id');
        if ($type = $request->query('type')) {
            $query->where('type', $type);
        }
        return response()->json($query->paginate(20));
    }

    public function show(Claim $claim)
    {
        return response()->json($claim);
    }
}


