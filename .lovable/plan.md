## Why the advanced scan failed

The edge function logs show every attempt failing with:

> `AI structured analysis failed No object generated: response did not match schema.`

That's why users see the "Trust Shield could not complete the advanced AI scan, so it ran a basic safety check instead" fallback message — it's baked into `createBasicAnalysis()` and only appears when the AI call throws.

### Root cause

`analyze-threat/index.ts` uses `generateObject` with a very strict Zod schema (min/max lengths, required enums, `.default([])` on arrays, integer-bounded `risk_score`, etc.) against `google/gemini-2.5-flash` through the OpenAI-compatible provider. The provider is created **without** `supportsStructuredOutputs`, so the AI SDK asks for `json_object` mode (JSON valid, but schema not enforced server-side) and then validates the response client-side against the strict schema. Gemini regularly returns a shape that's *almost* right — missing an array field, a string slightly over the max, or `risk_score` as a float — and the client-side validation rejects the whole object, throwing `NoObjectGeneratedError`. Every call falls through to the basic checker.

## Fix

Relax the schema and generation call so realistic Gemini output passes validation, while still normalizing the result before use.

1. In `supabase/functions/analyze-threat/index.ts`:
   - Loosen `AnalysisSchema`: drop `.min()/.max()` on strings, drop `.int()` on `risk_score` (keep `min(0).max(100)`), make array fields `.optional()` instead of `.default([])`, and accept unknown enum values by widening `threat_type`/`severity`/`risk_level` to `z.string()` (normalized after parse).
   - After `generateObject`, run a small `normalize()` step that clamps `risk_score` to an integer 0–100, truncates over-long strings (`title` 90, `summary` 1200, `recommended_action` 700), defaults arrays to `[]`, and maps unexpected enum values to the closest allowed one (`other`, `medium`, `safe`).
   - Add one retry: if `generateObject` throws, retry once with `google/gemini-2.5-flash-lite` before falling back to `createBasicAnalysis`. Keep the 429/402 short-circuits.
2. No frontend changes — `src/pages/Index.tsx` already handles the returned `analysis` shape.

### Verification

- Deploy the function and scan the same input that triggered the fallback; confirm the response no longer contains the "could not complete the advanced AI scan" summary and that `is_threat`/`risk_score` come from the model.
- Check `analyze-threat` logs to confirm the "response did not match schema" error is gone.
