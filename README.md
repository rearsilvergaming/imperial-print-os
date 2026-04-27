@'

# Imperial Print OS

A Photoshop-first automation toolkit for consistent, repeatable screen print file prep.

## Goals

- Standardize artwork setup across all jobs.
- Enforce a 4-screen maximum press constraint.
- Support multiple garments and print zones (tees, hoodies, totes, denim, labels, sleeves, etc.).
- Minimize manual prepress mistakes.

## Phase 1 MVP

1. Validate job inputs (garment, zone, ink profile).
2. Set up document (size, DPI, color mode).
3. Place/scale artwork to zone rules.
4. Add registration marks.
5. Build channel plan (1–4 colors max).
6. Export print package + settings log.

## Folder overview

- `presets/press` → press constraints (screen cap, defaults)
- `presets/garments` → garment-specific settings
- `presets/zones` → print location dimensions/anchors
- `presets/inks` → 1c–4c ink/separation profiles
- `scripts/` → Photoshop scripts
- `jobs/` → per-job configs
- `exports/` → generated outputs

## Non-negotiables

- Never exceed 4 total screens/channels.
- Every output is reproducible from config files.
- All jobs produce a machine-readable log (`job-output.json`).
  '@ | Set-Content README.md
