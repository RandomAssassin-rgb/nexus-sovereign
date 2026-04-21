# Advanced Evidence Forensics Implementation Plan (Revised)

This document outlines the implementation of advanced forensics for Nexus Sovereign, specifically targeting Tier 2 and Tier 3 claim uploads. It prioritizes explainable heuristics, additive changes, and strict adherence to the project's Event Twin architecture.

## User Review Required

> [!IMPORTANT]
> - **EXIF Neutrality**: Missing EXIF data will be treated as **Neutral**. Flags will only be raised if EXIF data is present and contradicts primary evidence (upload metadata or event window).
> - **Lightweight Reverse Geocoding**: We will use a token-based comparison between geocoded locality/admin area and the Event Twin zone name.
> - **Unified Logic**: The forensic engine will be called from both the `FileClaim` (Tier 2/3) and any automated upload paths in `server_dev.ts`.

## Reason Codes to Add

| Code | Trigger Condition |
| :--- | :--- |
| `REVERSE_GEOCODE_ZONE_MISMATCH` | Geocoded locality tokens do not match the Event Twin zone name. |
| `EVIDENCE_OUTSIDE_EVENT_FOOTPRINT` | Upload coordinates are outside the Event Twin's spatial boundary (>25km or H3 mismatch). |
| `IMAGE_TIMESTAMP_OUTSIDE_EVENT` | EXIF or Upload timestamp falls outside the Event Twin's active time window. |
| `EXIF_UPLOAD_TIME_MISMATCH` | EXIF capture time differs significantly from upload time (>48h gap). |
| `PRE_EVENT_EVIDENCE_SUBMISSION` | Evidence claims to be from the event but was captured before it started. |
| `IMAGE_GEO_MISMATCH` | Contradiction between EXIF GPS data and actual upload coordinates (>500m). |

## Proposed Changes

### 1. Evidence Forensics Core

#### `src/lib/evidenceForensics.ts` [MODIFY]
- **Target**: Implement core forensics logic.
- **Changes**:
  - Add `extractExifData` function (pure JS lightweight JPEG parser) to extract `DateTimeOriginal` and `GPS` tags.
  - Implement `checkGeoContradiction` using:
    - Distance check (Upload vs Event Center).
    - Reverse Geocode token match (Locality/Admin Area vs Zone Name).
    - EXIF vs Upload coordinate mismatch (new flag: `IMAGE_GEO_MISMATCH`).
  - Implement `checkTimestampIntegrity` using:
    - Upload vs Event Window.
    - EXIF vs Upload gap.
    - EXIF vs Event Window.
  - Update `analyze` to orchestrate these checks.
  - **Correction**: Set EXIF results to neutral if parsing fails or tags are missing.

### 2. Fraud Engine Integration

#### `src/lib/fraudEngine.ts` [MODIFY]
- **Target**: Integrate forensic penalties into the scoring system.
- **Changes**:
  - Map new reason codes to scoring deductions.
  - Ensure `IMAGE_TIMESTAMP_OUTSIDE_EVENT` and `IMAGE_GEO_MISMATCH` trigger `hold` or `escalate` decisions.

### 3. Backend Integration (Cross-Path Consistency)

#### `server_dev.ts` [MODIFY]
- **Target**: Standardize forensics across all claim creation paths.
- **Changes**:
  - Ensure `/api/claims/create` (used by Tier 2/3) always runs forensics if `evidenceBase64` is present.
  - Ensure `/api/claims/tier3-challenge` uses the same standardized `analyze` function.
  - Update JEP fetch endpoints to includes full forensic breakdown in `jep_data`.

### 4. Schema Verification

- **Status**: No DDL changes required.
- **Storage**: Forensics results will be stored inside the existing `jep_data` JSONB field in the `claims` table. This preserves the lightweight, additive nature of the enhancement.

## Verification Plan

### Automated Tests
- `npx tsc --noEmit` to verify type safety of new reason codes.

### Manual Verification
1. **Timestamp Check**: Mock a claim with an upload timestamp 5 hours after the event ended -> verify `IMAGE_TIMESTAMP_OUTSIDE_EVENT`.
2. **Geo Check**: Mock a claim with upload coordinates in "Mumbai" for an "Indiranagar, Bangalore" event -> verify `REVERSE_GEOCODE_ZONE_MISMATCH`.
3. **EXIF Contradiction**: Upload a JPEG with EXIF coordinates in "London" but upload coordinates in "Bangalore" -> verify `IMAGE_GEO_MISMATCH`.
4. **Duplicate Detection**: Submit the same image twice -> verify `DUPLICATE_IMAGE_DETECTED`.
