# Nexus Sovereign: Advanced Evidence Forensics Finalized Implementation Plan (Corrected)

## Executive Summary
This implementation plan defines the forensic layer of the Nexus Sovereign "Signal Fabric." It transitions the platform from a basic evidence-collection system into an insurer-ready verification engine. The goal is to detect and mitigate fraudulent behavior in Tier 2 and Tier 3 claim paths using high-fidelity metadata analysis, spatial-temporal contradiction checking, and cross-party duplicate detection. 

All forensic analysis is performed **synchronously** during the claim creation or challenge submission lifecycle to ensure immediate decision integrity. This plan adheres strictly to the existing "Event Twin" architecture and "Weakest Link" escalation paradigm.

---

## 1. SCOPE

### 1.1 Core Objectives
The primary objective of this phase is to establish a robust trust layer for evidence uploads. In the gig-economy insurance landscape, "evidence" is often the most vulnerable signal. By enhancing the forensics engine, we ensure that every byte of uploaded data is scrutinized for consistency against the "Ground Truth" of the verified Event Twin.

### 1.2 What Will Be Added
- **Synchronous Server-Side Analysis**: A lightweight, blocking validation loop that processes evidence headers and metadata before a claim is finalized.
- **Spatial Contradiction Logic**: A comparison engine that validates where a photo was taken vs. where it was uploaded vs. where the event occurred.
- **Temporal Consistency Logic**: A validation loop that checks if the evidence timestamp aligns with the active disruption window.
- **Evidence-Ledger Indexing**: A system to store content hashes (SHA-256) and similarity signatures (Perceptual Hashes) for every upload to prevent reuse.
- **Insurers-Grade Reasoning**: A mapping system that translates technical anomalies into explainable reason codes for both admins and workers.

### 1.3 What Will NOT Be Changed
- **Actuarial Models**: Weekly pricing and reserve calculation logic remains untouched.
- **Disbursement Flow**: The Razorpay integration and wallet mechanisms are preserved.
- **Core Signal Fabric**: Weather and traffic data sources remain the primary triggers for Event Twin creation.
- **UI Architecture**: No broad redesigns of the screens or navigation; all forensics-led insights are surfaced via existing JEP and dashboard components.

### 1.4 Affected Claim Paths
- **Tier 2 (File Upload)**: Claims where a worker provides an image of a disruption (e.g., flooding on a specific road) without a live stream.
- **Tier 3 (Sovereign Challenge)**: High-stakes manual overrides where a worker challenges a "No Event" decision by providing multiple pieces of hard evidence.

### 1.5 Forensic Philosophies
- **Neutral Missing Metadata**: Many camera apps or social-media shares (WhatsApp) strip EXIF data. Therefore, the absence of EXIF data is **Neutral** and does not penalize the worker.
- **Contradiction as Signal**: The presence of EXIF data that disagrees with the live upload location or the known event time is **Suspicious** and triggers an automatic score deduction.

---

## 2. FRAUD-FORENSICS CAPABILITIES

### 2.1 Synchronous Evidence Metadata Capture
At the moment of submission, the Nexus client (web or mobile) captures the "Primary Evidence" metadata. The server processes this **instantly** to provide a real-time verdict:
- **System Timestamp**: The precise UTC time of the upload according to the server.
- **Client Timestamp**: The time reported by the worker's device (used to detect local clock manipulation).

### 2.2 Live Device Geotag Capture
When the worker hits "Submit," the app requests the actual device GPS coordinates (`navigator.geolocation`).
- **Precision Tracking**: We capture Lat/Lng and Accuracy (in meters).
- **Primary Spatial Truth**: This live sensor data, combined with the H3 footprint of the event, remains the primary source of geographic truth.

### 2.3 EXIF Extraction (Supporting Evidence)
The backend will process the uploaded Base64 image using a lightweight parser to extract:
- **DateTimeOriginal**: When the photo was actually taken.
- **GPS Tags**: Embedded coordinates within the JPEG APP1 segment.
- **Device Metadata**: "Make" and "Model" information is stored as informational metadata for the audit trail (not used for automated emulator detection logic).

### 2.4 Reverse-Geocode Contradiction Checks
The geocoding layer translates raw coordinates into human-readable localities.
- **Administrative Mapping**: Extracting "Locality," "District," and "State."
- **Supporting Evidence**: Reverse-geocode token matching serves as **Supporting Evidence**. If a claim is for "Indiranagar" but geocodes to "Yelahanka," it adds "Forensic Pressure" but is secondary to the H3/Distance boundary check.

### 2.5 Evidence Timestamp Integrity Checks
- **Window Validation**: Does the image capture time occur within the [Start_Time - 1h] to [End_Time + 12h] window of the Event Twin?
- **Sync Validation**: Does the upload time happen within reasonable proximity to the capture time?

### 2.6 Duplicate & Reused Image Detection
Every upload is indexed in a global "Evidence Ledger."
- **Bitwise match**: Exact file duplicates (SHA-256).
- **Visual Fingerprinting**: Near-duplicates (Hamming distance comparison of Perceptual Hashes).
- **Cross-Worker Match**: If Worker A and Worker B both upload the same photo, the system triggers a flag.

---

## 3. EXACT REASON CODES & TRIGGER LOGIC

| Reason Code | Trigger Scenario | Worker Explanation (Frontend) |
| :--- | :--- | :--- |
| **REVERSE_GEOCODE_ZONE_MISMATCH** | Geocoded locality tokens do not intersect with Event zone keywords. | "Location mismatch: Your evidence appears to be from a different area." |
| **EVIDENCE_OUTSIDE_EVENT_FOOTPRINT** | Upload coordinates are >25km from event center or outside H3 cell. | "Distance anomaly: Evidence was uploaded outside the disruption zone." |
| **IMAGE_GEO_MISMATCH** | EXIF GPS data differs from Upload GPS data by > 500m. | "Geotag contradiction: Image metadata doesn't match capture location." |
| **IMAGE_TIMESTAMP_OUTSIDE_EVENT** | Image was taken outside the verified event time window. | "Timing mismatch: This image was not captured during the disruption." |
| **EXIF_UPLOAD_TIME_MISMATCH** | Image was taken > 48 hours before the claim upload. | "Evidence age: This image appears to be an older record." |
| **PRE_EVENT_EVIDENCE_SUBMISSION** | Image capture timestamp predates the event trigger. | "Timeline error: Your evidence predates the start of this event." |
| **DUPLICATE_IMAGE_DETECTED** | This exact image hash exists in the global ledger. | "Integrity alert: This image has already been submitted." |
| **MULTI_CLAIM_IMAGE_REUSE** | Image similarity detected across different worker accounts. | "Verification hold: Evidence reuse detected between accounts." |
| **HISTORICAL_EVIDENCE_REUSE** | Image matches evidence from a **prior historical claim** in the ledger. | "Historical reuse: This evidence matches a previous claim." |

---

## 4. DATA MODEL / STORAGE PLAN

### 4.1 Metadata Fields
- `upload_timestamp`: UTC ISO string.
- `upload_lat`, `upload_lng`: Raw GPS coordinates.
- `exif_timestamp`: Extracted from JPEG header.
- `exif_lat`, `exif_lng`: Extracted GPS tags.
- `reverse_geocode_result`: { locality, admin_area, country }.
- `evidence_hash`: SHA-256 hex string.
- `perceptual_hash`: 64-bit fingerprint string.
- `event_twin_id`: Reference to the active disruption event.

### 4.2 Storage Strategy
- **Persistence**: All fields are stored in the existing `jep_data` JSONB field in the `claims` table.
- **Migration Policy**: **No DDL migrations are required.** JSONB GIN indexing provides sufficient performance for querying hashes.

---

## 5. FILE-BY-FILE IMPLEMENTATION PLAN

### 5.1 `src/lib/evidenceForensics.ts` [MODIFY]
- Central orchestrator for the **synchronous** forensic loop.
- Implements `extractExifData`, `checkGeoContradiction`, `checkTimestampIntegrity`, and `checkDuplicates`.

### 5.2 `src/lib/fraudEngine.ts` [MODIFY]
- Updates `evaluate()` to apply forensic penalties to `behavior_risk_score` and `event_match_score`.
- **Constraint**: If any forensic deduction drops a relevant score (e.g., Location Trust) below **30**, trigger "ESCALATE" via the weakest-link logic.

### 5.3 `server_dev.ts` [MODIFY]
- Updates `/api/claims/create` and `/api/claims/tier3-challenge` to await the forensic analysis.
- Surfaces forensic summaries in the `/jep` and `/explain` responses.

### 5.4 `src/screens/FileClaim.tsx` & `Tier3Challenge.tsx` [MODIFY]
- Capture live device lat/lng at the point of click.
- Pass these to the backend as `upload_lat` and `upload_lng`.

---

## 6. REVERSE-GEOCODING STRATEGY
- **Provider**: Standardized `NominatimProvider`.
- **Logic**: Token-based intersection (Locality/Admin Area vs. Zone Name) as **Supporting Evidence**.
- **Priority**: Primary truth remains the **H3 Footprint** and **Distance-to-Center** checks.
- **Failure**: Failure of the geocoder results in a **Neutral** flag for that specific check.

---

## 7. DUPLICATE DETECTION STRATEGY
- **Scope**: Same Worker, Same Event, Cross-Worker, and Historical (past events).
- **Rule**: 
  - If exact hash matches -> `DUPLICATE_IMAGE_DETECTED`.
  - If near-duplicate (pHash distance < 10) matches a *prior* claim -> `HISTORICAL_EVIDENCE_REUSE`.
  - If near-duplicate match occurs within the same event across accounts -> `MULTI_CLAIM_IMAGE_REUSE`.
- **Penalty**: Primarily deducts from `behavior_risk_score` (-50) and `event_match_score` (-30), often triggering the <30 weakest-link threshold.

---

## 8. TIMESTAMP INTEGRITY STRATEGY
- **Logic**: Comparative analysis of Upload Time vs. Event Window vs. EXIF Time.
- **Constraint**: Missing EXIF is never suspicious. 
- **Penalty**: Contradictions reduce `behavior_risk_score` or `event_match_score`.

---

## 9. FRAUD ENGINE INTEGRATION

### 9.1 Scoring Logic
Forensic flags will reduce core scores.
- **Duplicate Detection**: Reduces `behavior_risk_score` by 70 points.
- **Timestamp Mismatch**: Reduces `event_match_score` by 50 points.
- **Geo Mismatch**: Reduces `location_trust_score` by 40 points.

### 9.2 Weakest-Link Escalation
**Existing Rule Alignment**: If any core score (Event, Location, Activity, Device, Behavior) drops below **30**, the claim decision is shunted to `escalate` (HIGH RISK 🚨). Forestic penalties are the primary drivers for reaching this threshold in suspicious Tier 2/3 uploads.

---

## 10. API / RESPONSE PLAN
- **JEP Endpoint**: Returns a `forensics` summary inside the `fraud` object.
- **Metadata Summary**: Includes geocode place name and timestamp delta.
- **Explain Endpoint**: Maps internal codes to the worker-facing strings in Section 3.

---

## 11. RISK / SAFETY
- **Test First**: Duplicate detection queries and SHA-256 computation performance.
- **Implementation Priority**: 1. Hashes/Duplicates, 2. Timestamp logic, 3. EXIF/Geocode logic.
- **Constraint**: Ensure the synchronous analysis does not hang the request (>1s).

---

## 12. IMPLEMENTATION ORDER
1. **Helper Logic**: EXIF/Hash/Geocode in `evidenceForensics.ts`.
2. **Scoring**: Penalty integration in `fraudEngine.ts`.
3. **Backend API**: Synchronous call in `server_dev.ts`.
4. **Screens**: Metadata capture in `FileClaim.tsx` and `Tier3Challenge.tsx`.
5. **Testing**: Run MOC scenarios.

---

## 13. VERIFICATION PLAN (Manual Scenarios)
- **Scenario A (Timestamp Anomaly)**: Upload a photo with a 2-year-old EXIF date -> Verify `IMAGE_TIMESTAMP_OUTSIDE_EVENT` and/or `EXIF_UPLOAD_TIME_MISMATCH`.
- **Scenario B (Geo Contradiction)**: Upload a photo from Mumbai for a Bangalore event center -> Verify `REVERSE_GEOCODE_ZONE_MISMATCH` and `EVIDENCE_OUTSIDE_EVENT_FOOTPRINT`.
- **Scenario C (Reuse)**: Upload the same image used in a claim from last week -> Verify `HISTORICAL_EVIDENCE_REUSE`.
- **Scenario D (Neutrality)**: Upload an image with all metadata stripped -> Verify no forensic flags are raised (Status: Clean).

---

PLAN ONLY COMPLETE — awaiting explicit approval before generation.
