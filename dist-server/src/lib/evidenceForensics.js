/**
 * Evidence Forensics Module — Nexus Sovereign
 *
 * Provides lightweight, demo-ready forensic analysis for claim evidence uploads:
 *  1. Content hash (SHA-256) + perceptual hash for duplicate detection
 *  2. Timestamp integrity checking against event windows
 *  3. Reverse-geocode zone contradiction analysis
 *
 * Zero heavy dependencies. Provider-abstracted reverse geocoding.
 * All outputs are explainable in worker-safe language.
 */
import crypto from 'crypto';
import axios from 'axios';
// ═══════════════════════════════════════════════════════
//  LIGHTWEIGHT EXIF PARSER (Zero Dependencies)
// ═══════════════════════════════════════════════════════
export function extractExifData(base64Data) {
    const result = {
        exif_timestamp: null,
        exif_lat: null,
        exif_lng: null,
        exif_make: null,
        exif_model: null,
    };
    try {
        const buffer = Buffer.from(base64Data, 'base64');
        // Check if it's a JPEG (starts with 0xFFD8)
        if (buffer[0] !== 0xFF || buffer[1] !== 0xD8)
            return result;
        let offset = 2;
        while (offset < buffer.length) {
            if (buffer[offset] !== 0xFF)
                break;
            // Find APP1 marker (0xFFE1) which contains EXIF
            if (buffer[offset + 1] === 0xE1) {
                const length = buffer.readUInt16BE(offset + 2);
                const exifStart = offset + 4;
                // Check for EXIF header "Exif\0\0"
                if (buffer.toString('utf8', exifStart, exifStart + 4) === 'Exif') {
                    parseTiff(buffer, exifStart + 6, result);
                }
                break;
            }
            offset += 2 + buffer.readUInt16BE(offset + 2);
        }
    }
    catch (err) {
        console.warn('[ExifParser] Error parsing EXIF:', err);
    }
    return result;
}
function parseTiff(buffer, tiffStart, result) {
    // Byte order
    const isLittleEndian = buffer.toString('utf8', tiffStart, tiffStart + 2) === 'II';
    const readUInt16 = isLittleEndian ? (off) => buffer.readUInt16LE(off) : (off) => buffer.readUInt16BE(off);
    const readUInt32 = isLittleEndian ? (off) => buffer.readUInt32LE(off) : (off) => buffer.readUInt32BE(off);
    // Magic number 42
    if (readUInt16(tiffStart + 2) !== 42)
        return;
    const firstIfdOffset = readUInt32(tiffStart + 4);
    processIfd(buffer, tiffStart, tiffStart + firstIfdOffset, readUInt16, readUInt32, result, 'ifd0');
}
function processIfd(buffer, tiffStart, ifdOffset, read16, read32, result, type) {
    const numEntries = read16(ifdOffset);
    let exifSubIfdOffset = 0;
    let gpsIfdOffset = 0;
    for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifdOffset + 2 + i * 12;
        const tag = read16(entryOffset);
        const typeId = read16(entryOffset + 2);
        const count = read32(entryOffset + 4);
        const valueOffset = read32(entryOffset + 8);
        // Tags we care about
        if (tag === 0x010f)
            result.exif_make = readString(buffer, tiffStart, entryOffset, count, valueOffset);
        if (tag === 0x0110)
            result.exif_model = readString(buffer, tiffStart, entryOffset, count, valueOffset);
        if (tag === 0x8769)
            exifSubIfdOffset = valueOffset; // Exif SubIFD
        if (tag === 0x8825)
            gpsIfdOffset = valueOffset; // GPS IFD
        if (tag === 0x9003)
            result.exif_timestamp = readString(buffer, tiffStart, entryOffset, count, valueOffset)?.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
        // GPS tags
        if (type === 'gps') {
            if (tag === 1)
                result.gpsLatRef = buffer.toString('utf8', entryOffset + 8, entryOffset + 9);
            if (tag === 2)
                result.exif_lat = readRationalArray(buffer, tiffStart, valueOffset, count, read32);
            if (tag === 3)
                result.gpsLngRef = buffer.toString('utf8', entryOffset + 8, entryOffset + 9);
            if (tag === 4)
                result.exif_lng = readRationalArray(buffer, tiffStart, valueOffset, count, read32);
        }
    }
    if (exifSubIfdOffset)
        processIfd(buffer, tiffStart, tiffStart + exifSubIfdOffset, read16, read32, result, 'sub');
    if (gpsIfdOffset)
        processIfd(buffer, tiffStart, tiffStart + gpsIfdOffset, read16, read32, result, 'gps');
    // Format GPS
    if (result.exif_lat && result.gpsLatRef) {
        if (Array.isArray(result.exif_lat)) {
            const [d, m, s] = result.exif_lat;
            result.exif_lat = d + m / 60 + s / 3600;
            if (result.gpsLatRef === 'S')
                result.exif_lat *= -1;
        }
    }
    if (result.exif_lng && result.gpsLngRef) {
        if (Array.isArray(result.exif_lng)) {
            const [d, m, s] = result.exif_lng;
            result.exif_lng = d + m / 60 + s / 3600;
            if (result.gpsLngRef === 'W')
                result.exif_lng *= -1;
        }
    }
}
function readString(buffer, tiffStart, entryOffset, count, valueOffset) {
    if (count <= 4)
        return buffer.toString('utf8', entryOffset + 8, entryOffset + 8 + count).replace(/\0$/, '');
    return buffer.toString('utf8', tiffStart + valueOffset, tiffStart + valueOffset + count).replace(/\0$/, '');
}
function readRationalArray(buffer, tiffStart, valueOffset, count, read32) {
    const vals = [];
    for (let i = 0; i < count; i++) {
        const num = read32(tiffStart + valueOffset + i * 8);
        const den = read32(tiffStart + valueOffset + i * 8 + 4);
        vals.push(den === 0 ? 0 : num / den);
    }
    return vals;
}
// ═══════════════════════════════════════════════════════
//  CONTENT HASH (SHA-256)
// ═══════════════════════════════════════════════════════
export function computeContentHash(base64Data) {
    const buffer = Buffer.from(base64Data, 'base64');
    return crypto.createHash('sha256').update(buffer).digest('hex');
}
// ═══════════════════════════════════════════════════════
//  PERCEPTUAL HASH (Average-Hash, zero dependencies)
//
//  Simplified approach: sample evenly-spaced bytes from
//  the raw image data to build a lightweight fingerprint.
//  Not pixel-perfect, but sufficient for exact + near-
//  duplicate detection at demo scale.
// ═══════════════════════════════════════════════════════
export function computePerceptualHash(base64Data) {
    const buffer = Buffer.from(base64Data, 'base64');
    const sampleSize = 64; // 8×8 grid
    const step = Math.max(1, Math.floor(buffer.length / sampleSize));
    const samples = [];
    for (let i = 0; i < sampleSize && i * step < buffer.length; i++) {
        samples.push(buffer[i * step]);
    }
    // Pad if image is very small
    while (samples.length < sampleSize)
        samples.push(0);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    // Each sample → 1 if above mean, 0 if below → 64 char binary string
    return samples.map(s => (s >= mean ? '1' : '0')).join('');
}
/**
 * Hamming distance between two perceptual hashes.
 * Lower = more similar. Threshold < 10 = likely duplicate.
 */
export function hammingDistance(hash1, hash2) {
    let distance = 0;
    const len = Math.min(hash1.length, hash2.length);
    for (let i = 0; i < len; i++) {
        if (hash1[i] !== hash2[i])
            distance++;
    }
    return distance + Math.abs(hash1.length - hash2.length);
}
// ═══════════════════════════════════════════════════════
//  DUPLICATE DETECTION
// ═══════════════════════════════════════════════════════
export async function checkDuplicates(contentHash, perceptualHash, currentWorkerId, supabase) {
    try {
        // Query existing claims for matching content hash
        // Check both jep_data and jep_telemetry for legacy and current consistency
        const { data: matches, error } = await supabase
            .from('claims')
            .select('id, worker_id, jep_data, jep_telemetry')
            .limit(300);
        if (error || !matches || matches.length === 0)
            return null;
        const exactMatches = [];
        const nearMatches = [];
        const matchedWorkers = [];
        for (const claim of matches) {
            // Robust field extraction for JEP data
            const jep = claim.jep_data || claim.jep_telemetry;
            const forensics = jep?.evidence_forensics;
            if (!forensics?.metadata)
                continue;
            const storedHash = forensics.metadata.evidence_hash;
            const storedPHash = forensics.metadata.perceptual_hash;
            // Exact match
            if (storedHash && storedHash === contentHash) {
                exactMatches.push(claim.id);
                if (claim.worker_id && claim.worker_id !== currentWorkerId) {
                    matchedWorkers.push(claim.worker_id);
                }
                continue;
            }
            // Near-duplicate via perceptual hash
            if (perceptualHash && storedPHash) {
                const dist = hammingDistance(perceptualHash, storedPHash);
                if (dist < 10) {
                    nearMatches.push(claim.id);
                    if (claim.worker_id && claim.worker_id !== currentWorkerId) {
                        matchedWorkers.push(claim.worker_id);
                    }
                }
            }
        }
        if (exactMatches.length === 0 && nearMatches.length === 0) {
            return {
                is_exact_match: false,
                is_near_duplicate: false,
                matched_claim_ids: [],
                matched_worker_ids: [],
                is_cross_worker: false,
                classification: 'positive',
            };
        }
        const classification = exactMatches.length > 0 ? 'hard_contradiction' : 'anomaly';
        return {
            is_exact_match: exactMatches.length > 0,
            is_near_duplicate: nearMatches.length > 0,
            matched_claim_ids: [...exactMatches, ...nearMatches].slice(0, 5),
            matched_worker_ids: [...new Set(matchedWorkers)],
            is_cross_worker: matchedWorkers.length > 0,
            classification,
        };
    }
    catch (err) {
        console.warn('[EvidenceForensics] Duplicate check failed:', err);
        return null;
    }
}
// ═══════════════════════════════════════════════════════
//  TIMESTAMP INTEGRITY
// ═══════════════════════════════════════════════════════
export function checkTimestampIntegrity(uploadTimestamp, exifTimestamp, eventStartTime, eventEndTime) {
    const uploadMs = new Date(uploadTimestamp).getTime();
    let upload_vs_event = 'unknown';
    let time_delta_minutes = null;
    let suspicious = false;
    if (eventStartTime && eventEndTime) {
        const startMs = new Date(eventStartTime).getTime();
        const endMs = new Date(eventEndTime).getTime();
        if (uploadMs < startMs) {
            // Evidence uploaded BEFORE the event started
            time_delta_minutes = Math.round((startMs - uploadMs) / 60_000);
            upload_vs_event = 'before_event';
            // Suspicious if uploaded more than 30 min before event
            if (time_delta_minutes > 30)
                suspicious = true;
        }
        else if (uploadMs > endMs) {
            // Evidence uploaded AFTER the event ended
            time_delta_minutes = Math.round((uploadMs - endMs) / 60_000);
            upload_vs_event = 'after_event';
            // After event is normal (worker files claim post-event), but >24h is suspicious
            if (time_delta_minutes > 1440)
                suspicious = true;
        }
        else {
            upload_vs_event = 'within_window';
            time_delta_minutes = 0;
        }
    }
    // EXIF vs upload gap check
    let exif_upload_gap_minutes = null;
    if (exifTimestamp) {
        const exifMs = new Date(exifTimestamp).getTime();
        exif_upload_gap_minutes = Math.round(Math.abs(uploadMs - exifMs) / 60_000);
        // If EXIF is >48 hours different from upload, this is suspicious
        // (image was likely taken much earlier / for a different purpose)
        if (exif_upload_gap_minutes > 2880)
            suspicious = true;
    }
    // Classification logic
    let classification = 'positive';
    if (upload_vs_event === 'unknown' && !exifTimestamp) {
        classification = 'undetermined';
    }
    else if (suspicious) {
        // If >24h outside window (1440 mins) OR EXIF gap > 48h (2880 mins), it's a hard contradiction
        const isHard = (time_delta_minutes && time_delta_minutes > 1440) || (exif_upload_gap_minutes && exif_upload_gap_minutes > 2880);
        classification = isHard ? 'hard_contradiction' : 'anomaly';
    }
    return {
        upload_vs_event,
        time_delta_minutes,
        exif_upload_gap_minutes,
        suspicious,
        classification,
    };
}
const NominatimProvider = {
    name: 'nominatim',
    async geocode(lat, lng) {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
        const res = await axios.get(url, {
            timeout: 3000,
            headers: { 'User-Agent': 'NexusSovereign/1.0' },
        });
        const data = res.data;
        const addr = data.address || {};
        return {
            formatted_place: data.display_name || 'Unknown',
            locality: addr.suburb || addr.neighbourhood || addr.village || addr.town || null,
            admin_area: addr.state || addr.state_district || null,
            country: addr.country || null,
            provider: 'nominatim',
        };
    },
};
function getGeoProvider() {
    // Provider abstraction — extend here for Google/HERE/etc.
    return NominatimProvider;
}
// In-memory geocode cache (keyed by rounded lat/lng to 3 decimal places ≈ ~100m)
const geocodeCache = new Map();
export async function reverseGeocode(lat, lng) {
    const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
    if (geocodeCache.has(cacheKey)) {
        console.log('[EvidenceForensics] Geocode cache hit for', cacheKey);
        return geocodeCache.get(cacheKey);
    }
    try {
        const provider = getGeoProvider();
        const GEOCODE_DEADLINE = 3500; // 3.5s hard deadline
        const result = await Promise.race([
            provider.geocode(lat, lng),
            new Promise((resolve) => setTimeout(() => {
                console.warn(`[EvidenceForensics] Geocode timed out after ${GEOCODE_DEADLINE}ms`);
                resolve(null);
            }, GEOCODE_DEADLINE)),
        ]);
        if (result) {
            geocodeCache.set(cacheKey, result);
            // Evict oldest entries if cache grows too large
            if (geocodeCache.size > 200) {
                const firstKey = geocodeCache.keys().next().value;
                if (firstKey)
                    geocodeCache.delete(firstKey);
            }
        }
        return result;
    }
    catch (err) {
        console.warn('[EvidenceForensics] Reverse geocode failed:', err);
        return null;
    }
}
// ═══════════════════════════════════════════════════════
//  GEO CONTRADICTION CHECK
// ═══════════════════════════════════════════════════════
/**
 * Haversine distance (km) — reused from fraudEngine pattern.
 */
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function checkGeoContradiction(geocodeResult, eventZone, eventCenterLat, eventCenterLng, uploadLat, uploadLng) {
    const detail = {
        upload_place: geocodeResult?.formatted_place || null,
        event_zone: eventZone || null,
        distance_km: null,
        is_contradictory: false,
        classification: 'positive',
    };
    // Distance check: if we have both upload coords and event center
    if (uploadLat && uploadLng && eventCenterLat && eventCenterLng) {
        detail.distance_km = Math.round(haversineKm(uploadLat, uploadLng, eventCenterLat, eventCenterLng) * 10) / 10;
        // If upload is >25km from event center → strong contradiction
        if (detail.distance_km > 25) {
            detail.is_contradictory = true;
        }
    }
    // Name-based check: if geocode locality doesn't match event zone name
    if (geocodeResult && eventZone) {
        const geocodeStr = [
            geocodeResult.locality,
            geocodeResult.admin_area,
            geocodeResult.country,
        ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        const zoneStr = eventZone.toLowerCase();
        // Simple heuristic: if event zone mentions a city/area and geocode doesn't contain it
        const zoneKeywords = zoneStr.split(/[\s,]+/).filter(w => w.length > 3);
        const hasOverlap = zoneKeywords.some(kw => geocodeStr.includes(kw));
        if (zoneKeywords.length > 0 && !hasOverlap && !detail.is_contradictory) {
            // Weak contradiction from name mismatch (only flag if distance also uncertain)
            if (detail.distance_km === null || detail.distance_km > 10) {
                detail.is_contradictory = true;
            }
        }
    }
    // Classification Logic
    let classification = 'positive';
    if (detail.is_contradictory) {
        // Distance > 25km is a hard contradiction
        const isHard = detail.distance_km && detail.distance_km > 25;
        classification = isHard ? 'hard_contradiction' : 'anomaly';
    }
    else if (!geocodeResult || !eventZone) {
        classification = 'undetermined';
    }
    detail.classification = classification;
    return detail;
}
export async function analyze(params) {
    const reason_codes = [];
    const explanations = [];
    const uploadTs = params.uploadTimestamp || new Date().toISOString();
    // 1. Compute hashes
    const evidence_hash = computeContentHash(params.evidenceBase64);
    const perceptual_hash = computePerceptualHash(params.evidenceBase64);
    // --- Parallelize Core Forensics ---
    const [exifData, geocodeResult, duplicate_detail] = await Promise.all([
        // 1. Extract EXIF
        (async () => extractExifData(params.evidenceBase64))(),
        // 2. Reverse geocode upload location
        (async () => {
            if (params.uploadLat && params.uploadLng) {
                return reverseGeocode(params.uploadLat, params.uploadLng);
            }
            return null;
        })(),
        // 3. Check duplicates
        (async () => {
            if (params.supabase) {
                return checkDuplicates(evidence_hash, perceptual_hash, params.workerId, params.supabase);
            }
            return null;
        })()
    ]);
    const reverse_geocode_result = geocodeResult;
    let duplicate_image_flag = false;
    if (duplicate_detail) {
        duplicate_image_flag = true;
        if (duplicate_detail.is_exact_match) {
            reason_codes.push('DUPLICATE_IMAGE_DETECTED');
            explanations.push('This exact evidence image was already submitted in this or another claim');
        }
        if (duplicate_detail.is_cross_worker && !duplicate_detail.is_exact_match) {
            reason_codes.push('MULTI_CLAIM_IMAGE_REUSE');
            explanations.push('This image similarity matches evidence from a different worker\'s account');
        }
        if (duplicate_detail.is_near_duplicate && !duplicate_detail.is_exact_match && !duplicate_detail.is_cross_worker) {
            reason_codes.push('HISTORICAL_EVIDENCE_REUSE');
            explanations.push('This evidence matches an image from a prior historical claim record');
        }
    }
    // 5. Timestamp integrity
    const timestamp_detail = checkTimestampIntegrity(uploadTs, exifData.exif_timestamp || params.exifTimestamp || null, params.eventStartTime || null, params.eventEndTime || null);
    let evidence_timestamp_mismatch_flag = false;
    if (timestamp_detail.suspicious) {
        evidence_timestamp_mismatch_flag = true;
        if (timestamp_detail.upload_vs_event === 'before_event') {
            reason_codes.push('PRE_EVENT_EVIDENCE_SUBMISSION');
            explanations.push('Uploaded evidence appears to predate the disruption event');
        }
        else if (timestamp_detail.upload_vs_event === 'after_event') {
            reason_codes.push('IMAGE_TIMESTAMP_OUTSIDE_EVENT');
            explanations.push('Evidence was captured well outside the event\'s active time window');
        }
        if (timestamp_detail.exif_upload_gap_minutes &&
            timestamp_detail.exif_upload_gap_minutes > 2880) {
            reason_codes.push('EXIF_UPLOAD_TIME_MISMATCH');
            explanations.push('Large time gap between when the image was taken and when it was uploaded');
        }
    }
    // 6. Geo contradiction check (Primary: distance/h3, Supporting: tokens)
    const geo_detail = checkGeoContradiction(reverse_geocode_result, params.eventZone || null, params.eventCenterLat || null, params.eventCenterLng || null, params.uploadLat, params.uploadLng);
    let evidence_geo_mismatch_flag = false;
    if (geo_detail.is_contradictory) {
        evidence_geo_mismatch_flag = true;
        if (geo_detail.distance_km && geo_detail.distance_km > 25) {
            reason_codes.push('EVIDENCE_OUTSIDE_EVENT_FOOTPRINT');
            explanations.push(`Evidence uploaded ${geo_detail.distance_km} km from the event zone — outside the disruption boundary`);
        }
        else {
            reason_codes.push('REVERSE_GEOCODE_ZONE_MISMATCH');
            explanations.push('Uploaded evidence locality tokens did not match the affected zone (Supporting Signal)');
        }
    }
    // 6. EXIF Geo Mismatch (Contradiction between EXIF and Upload location)
    if (exifData.exif_lat && exifData.exif_lng && params.uploadLat && params.uploadLng) {
        const exifDist = haversineKm(exifData.exif_lat, exifData.exif_lng, params.uploadLat, params.uploadLng);
        if (exifDist > 0.5) { // 500m threshold
            evidence_geo_mismatch_flag = true;
            reason_codes.push('IMAGE_GEO_MISMATCH');
            explanations.push('Contradiction detected between image metadata GPS and capture location GPS');
            // Upgrade Geo classification to hard contradiction if it wasn't already
            if (geo_detail.classification !== 'hard_contradiction') {
                geo_detail.classification = 'hard_contradiction';
            }
        }
    }
    // 7. Calculate overall status based on signal classifications
    const classifications = [
        duplicate_detail?.classification || 'undetermined',
        timestamp_detail.classification,
        geo_detail.classification,
    ];
    let status = 'passed';
    if (classifications.includes('hard_contradiction')) {
        status = 'rejected';
    }
    else if (classifications.includes('anomaly')) {
        status = 'review';
    }
    else if (classifications.every(c => c === 'undetermined')) {
        status = 'review'; // Total lack of data warrants review
    }
    // Build metadata
    const metadata = {
        upload_timestamp: uploadTs,
        upload_lat: params.uploadLat,
        upload_lng: params.uploadLng,
        exif_timestamp: exifData.exif_timestamp || params.exifTimestamp || null,
        exif_lat: exifData.exif_lat || null,
        exif_lng: exifData.exif_lng || null,
        exif_make: exifData.exif_make || null,
        exif_model: exifData.exif_model || null,
        evidence_hash,
        perceptual_hash,
        reverse_geocode_result,
        event_twin_id: params.eventTwinId || null,
    };
    return {
        metadata,
        status,
        duplicate_image_flag,
        evidence_geo_mismatch_flag,
        evidence_timestamp_mismatch_flag,
        duplicate_detail,
        timestamp_detail,
        geo_detail,
        reason_codes,
        explanations,
    };
}
//# sourceMappingURL=evidenceForensics.js.map