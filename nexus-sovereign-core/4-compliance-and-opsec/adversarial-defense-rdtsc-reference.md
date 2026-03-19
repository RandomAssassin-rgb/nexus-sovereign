# Adversarial Defense Technical Reference
## `$RDTSC$` Clock-Skew Verification for JEP High-Velocity Batch Submission

**Classification**: INSTITUTIONAL CONFIDENTIAL — AUDIT REFERENCE DOCUMENT  
**Document ID**: `NSC-SEC-0042`  
**Schema Version**: 3.2.0  
**Effective Date**: 2026-03-20  
**Owner**: Nexus Sovereign Security Engineering  
**Review Cycle**: Quarterly  

---

## 1. Purpose and Scope

This document provides the complete technical specification for the `$RDTSC$` (Read Time-Stamp Counter) clock-skew verification subsystem embedded within the Nexus Sovereign parametric indemnity JEP batch pipeline. It is the **authoritative reference** for:

- Security engineers implementing or auditing the Sentinel Edge Kernel clock attestation module
- Institutional auditors evaluating the temporal integrity controls of the platform
- Compliance personnel assessing conformance with NAIC Insurance Data Security Model Law and SOC 2 Type II CC6.6 (Logical and Physical Access Controls)

This document covers the **threat model**, **hardware mechanism**, **algorithmic specification**, **implementation pseudocode**, **worked numerical examples**, and **failure mode analysis** for the RDTSC-based clock-skew defense.

---

## 2. Threat Model — Temporal Attack Surface

### 2.1. Adversary Capabilities Assumed

The Nexus Sovereign threat model assumes a **well-resourced adversary** with the following capabilities, consistent with a STRIDE-L4 (Sophisticated Nation-State / Insider Threat) classification:

- Ability to corrupt OS-level `gettimeofday()` / `clock_gettime()` calls via a compromised kernel module or hypervisor hook.
- Ability to manipulate NTP client configuration on a compromised host to drift time by up to ±60 seconds before NTP alarm thresholds are triggered.
- Ability to replay previously accepted, cryptographically valid batch submissions.
- **NOT assumed**: Ability to modify the hardware TSC register directly (which would require physical CPU access and is outside the software adversary model). Intel SGX / AMD SEV-SNP further prevent the hypervisor from resetting or manipulating the TSC seen by the guest enclave.

### 2.2. Temporal Attack Taxonomy

| Attack ID | Name | Mechanism | Impact Without Defense |
|---|---|---|---|
| `TMP-001` | **OS Clock Drift** | Compromise kernel `ntp_adjtime()` syscall | JEP voucher timestamps shifted to open trigger windows |
| `TMP-002` | **Replay Attack** | Re-submit old batch with updated `submissionTimestamp` field | Duplicate indemnity payouts |
| `TMP-003` | **Retroactive Window Injection** | Forge event timestamps to fall within a recently closed parametric trigger window | Fraudulent parametric trigger activation |
| `TMP-004` | **Byzantine Node Collusion** | f < n/3 compromised nodes submit correlated false clock readings | Shift cluster consensus time to enable TMP-001 or TMP-003 |
| `TMP-005` | **Hypervisor TSC Virtualization** | Hypervisor spoofs TSC value seen by guest OS (not effective against SEV-SNP / TDX) | RDTSC-derived timestamp diverges from true hardware time |

### 2.3. Residual Risk After Mitigation

After all four layers of the clock-skew verification framework are applied, the residual attack window for TMP-001 through TMP-005 is:

| Attack | Residual Window | Residual Risk |
|---|---|---|
| `TMP-001` | < 500 µs | LOW — sub-threshold skew undetectable; parametric windows are ≥1 s, making this actuarially immaterial |
| `TMP-002` | None — Merkle root + epoch binding | NEGLIGIBLE |
| `TMP-003` | < 500 µs | LOW — same as TMP-001 |
| `TMP-004` | Requires ≥ f+1 = ⌊n/3⌋+1 compromised nodes | LOW — requires insider compromise exceeding BFT threshold |
| `TMP-005` | None against SEV-SNP / TDX; Low against SGX | MEDIUM for older SGX deployments without TDX upgrade |

---

## 3. Hardware TSC Deep Dive

### 3.1. CPUID Verification of TSC Properties

Before trusting the TSC for timekeeping, the Sentinel Edge Kernel boot sequence MUST verify the following CPUID flags. Any node failing these checks is excluded from batch submission.

```
; Required CPUID checks at Sentinel Edge Kernel initialization
; ─────────────────────────────────────────────────────────────

; 1. Verify Invariant TSC (constant rate, independent of P/C-states)
CPUID leaf 0x80000007, return in EDX:
  Bit 8 = 1  →  INVARIANT_TSC supported  ✓
  Bit 8 = 0  →  TSC not invariant        ✗ NODE DISQUALIFIED

; 2. Verify TSC/Crystal Clock Ratio (enables frequency calculation without BIOS)
CPUID leaf 0x15:
  EBX/EAX = Core Crystal Clock to TSC ratio numerator/denominator
  ECX     = Core Crystal Clock frequency in Hz (if provided by firmware)
  If ECX = 0, fall back to CPUID.0x16 (Processor Frequency leaf)

; 3. Verify TSC Deadline Timer (confirms TSC is stable enough for HPET replacement)
CPUID leaf 0x01, return in ECX:
  Bit 24 = 1  →  TSC Deadline supported  ✓ (further confidence indicator)
```

### 3.2. Computing `tscFrequencyHz` from CPUID

The TSC frequency must be derived from hardware, **NOT from OS APIs**, to be resistant to software tampering:

```python
# Pseudocode: TSC frequency derivation inside TEE enclave
# ─────────────────────────────────────────────────────────

def get_tsc_frequency_hz_from_cpuid() -> int:
    # Try CPUID leaf 0x15 (preferred, Intel Skylake+)
    eax, ebx, ecx = cpuid(leaf=0x15)
    if ecx > 0 and ebx > 0 and eax > 0:
        # tscFreq = crystalFreqHz * (tsc_numerator / tsc_denominator)
        tsc_freq_hz = (ecx * ebx) // eax
        if 1_000_000 <= tsc_freq_hz <= 10_000_000_000:
            return tsc_freq_hz

    # Fallback: CPUID leaf 0x16 (Processor Frequency Information)
    eax_0x16, _, _ = cpuid(leaf=0x16)
    base_mhz = eax_0x16 & 0xFFFF  # Bits 15:0 = Base Frequency in MHz
    if base_mhz > 0:
        return base_mhz * 1_000_000

    raise TEEFatalError("Cannot determine TSC frequency from hardware CPUID")
```

### 3.3. RDTSC vs RDTSCP

The Nexus Sovereign implementation uses **`RDTSCP`** (serializing form) rather than `RDTSC` wherever per-voucher sealing timestamps are required. `RDTSCP` issues an implicit `LFENCE` that prevents the CPU from reordering instructions across the TSC read, providing a more precise timestamp for the sealing moment.

```nasm
; Assembly sequence used for voucher-sealing timestamp capture (x86-64)
; ───────────────────────────────────────────────────────────────────────
lfence                 ; Ensure all preceding loads are complete (additional guard)
rdtscp                 ; Returns: EDX:EAX = TSC, ECX = IA32_TSC_AUX (CPU/socket ID)
lfence                 ; Prevent subsequent instructions from executing before RDTSCP
; Construct 64-bit TSC value:
shl     rdx, 32        ; Shift high 32 bits into position
or      rax, rdx       ; Combine: RAX = full 64-bit TSC value
; RAX now contains T_tsc for this voucher sealing event
```

---

## 4. Algorithmic Specification

### 4.1. Per-Voucher Clock-Skew Validation (Ingestion-Side)

This algorithm is executed by the ClaimCenter STP receiver for **every voucher** in an incoming batch, prior to any database write.

```python
# Pseudocode: Per-voucher RDTSC clock-skew validation at ingestion
# ──────────────────────────────────────────────────────────────────
# Constants (from system-wide policy configuration)
SKEW_BOUND_NS       = 500_000   # 500 microseconds
MAX_DRIFT_PPM_DAY   = 1.0       # 1 ppm per day
BATCH_MAX_AGE_NS    = 300_000_000_000  # 5 minutes (replay window)

def validate_voucher_clock_integrity(
    voucher:          IndemnityVoucher,
    batch_header:     BatchHeader,
    ingestion_time:   int  # nanoseconds since Unix epoch
) -> ValidationResult:

    tsc_value   = int(voucher.voucherAttestation.rdtscSealTs)
    tsc_freq_hz = batch_header.rdtscEpochNs.tscFrequencyHz
    sealed_at   = parse_iso8601_to_ns(voucher.voucherAttestation.sealedAt)

    # ── Step A: Derive wall-clock time from TSC ───────────────────────────
    # Use the batch-level TSC epoch as the reference point to avoid
    # cumulative drift errors from computing absolute time from TSC alone.
    batch_tsc       = int(batch_header.rdtscEpochNs.tscValue)
    batch_wall_ns   = parse_iso8601_to_ns(batch_header.submissionTimestamp)

    # Voucher TSC must be ≤ batch TSC (vouchers sealed before batch is closed)
    if tsc_value > batch_tsc:
        return ValidationResult.REJECT(
            reason="RDTSC_ORDER_VIOLATION",
            detail=f"voucherTsc={tsc_value} > batchTsc={batch_tsc}; "
                   f"voucher appears sealed AFTER batch was closed"
        )

    # Delta between batch sealing and voucher sealing (in TSC ticks)
    tsc_delta_ticks = batch_tsc - tsc_value

    # Convert delta to nanoseconds
    tsc_delta_ns = (tsc_delta_ticks * 1_000_000_000) // tsc_freq_hz

    # Derive the expected wall-clock time for this voucher's sealing
    expected_wall_ns = batch_wall_ns - tsc_delta_ns

    # ── Step B: Compute skew between RDTSC-derived time and declared sealedAt
    skew_ns = abs(expected_wall_ns - sealed_at)

    if skew_ns > SKEW_BOUND_NS:
        return ValidationResult.REJECT(
            reason="CLOCK_SKEW_VIOLATION",
            detail=f"Measured skew={skew_ns} ns exceeds bound={SKEW_BOUND_NS} ns. "
                   f"Expected sealedAt={expected_wall_ns} ns, "
                   f"Declared sealedAt={sealed_at} ns"
        )

    # ── Step C: Validate voucher is within the replay-prevention window ───
    age_ns = ingestion_time - sealed_at
    if age_ns > BATCH_MAX_AGE_NS or age_ns < 0:
        return ValidationResult.REJECT(
            reason="REPLAY_WINDOW_VIOLATION",
            detail=f"Voucher age={age_ns} ns outside replay window "
                   f"[0, {BATCH_MAX_AGE_NS}] ns"
        )

    # ── Step D: Check TSC drift from clockSkewProof ───────────────────────
    drift_ppm = batch_header.attestationManifest.clockSkewProof.rdtscDriftPpmPerDay
    if drift_ppm > MAX_DRIFT_PPM_DAY:
        return ValidationResult.FLAG_FOR_REVIEW(
            reason="TSC_DRIFT_ELEVATED",
            detail=f"Reported TSC drift={drift_ppm} ppm/day exceeds threshold "
                   f"{MAX_DRIFT_PPM_DAY} ppm/day. Voucher held for manual review."
        )

    return ValidationResult.ACCEPT(skew_ns=skew_ns)
```

### 4.2. Byzantine Cluster Clock Consensus Protocol

```python
# Pseudocode: BFT clock consensus for Sentinel Edge cluster
# ──────────────────────────────────────────────────────────
# Executed at the start of each batch cycle epoch (default: every 30 seconds)

def compute_bft_clock_consensus(
    node_readings: List[Tuple[str, int]]  # List of (node_id, rdtsc_wall_clock_ns)
) -> Tuple[int, Dict[str, int]]:
    """
    Returns: (consensus_mean_ns, {node_id: skew_ns})
    A node is quarantined if |skew_ns| > SKEW_BOUND_NS.
    BFT correctness: tolerates f = floor((n-1)/3) adversarial nodes.
    """
    n = len(node_readings)
    f = (n - 1) // 3  # Maximum tolerable faulty nodes

    # Sort by clock reading
    sorted_readings = sorted(node_readings, key=lambda x: x[1])

    # Trimmed mean: discard top-f and bottom-f readings (BFT optimal trimming)
    trimmed = sorted_readings[f : n - f]

    consensus_mean_ns = sum(r[1] for r in trimmed) // len(trimmed)

    skew_map = {}
    quarantine_list = []

    for node_id, reading_ns in node_readings:
        skew_ns = reading_ns - consensus_mean_ns
        skew_map[node_id] = skew_ns

        if abs(skew_ns) > SKEW_BOUND_NS:
            quarantine_list.append(node_id)
            emit_otel_event(
                span_name="clock_skew_quarantine",
                attributes={
                    "node.id": node_id,
                    "rdtsc.skew_ns": skew_ns,
                    "nexus.clock_skew_violation": "true",
                    "consensus.mean_ns": consensus_mean_ns,
                }
            )

    return consensus_mean_ns, skew_map, quarantine_list
```

---

## 5. Worked Numerical Example

### Scenario: Detecting a 2 ms OS Clock Manipulation Attack

**Setup**:
- Sentinel Edge node `sentinel-edge-07` has `tscFrequencyHz = 3,000,000,000 Hz` (3 GHz invariant TSC).
- An adversary has manipulated the OS system clock on `sentinel-edge-07` to run **2 milliseconds fast** relative to true UTC.
- The node generates a JEP voucher with `rdtscSealTs = 9,000,000,000,000` (TSC ticks).
- The batch header records `rdtscEpochNs.tscValue = 9,000,001,500,000` (TSC ticks at batch close, ~500 µs after voucher seal).

**Step A — Derive expected wall-clock time for voucher seal:**

```
tsc_delta_ticks     = 9,000,001,500,000 − 9,000,000,000,000 = 1,500,000 ticks
tsc_delta_ns        = (1,500,000 × 1,000,000,000) ÷ 3,000,000,000 = 500,000 ns (500 µs)

batch_wall_ns       = parse("2026-03-20T12:00:00.000000000Z") = T_batch

expected_wall_ns    = T_batch − 500,000 ns
                    = T_batch − 0.000500 s
```

**Step B — Compare with declared `sealedAt`:**

The adversary set `sealedAt = T_batch − 0.000500 s + 2,000,000 ns` (2 ms fast due to OS clock skew).

```
skew_ns = |expected_wall_ns − declared_sealedAt|
        = |(T_batch − 500,000) − (T_batch − 500,000 + 2,000,000)|
        = 2,000,000 ns (2 ms)
```

**Result**: `skew_ns = 2,000,000 ns > SKEW_BOUND_NS = 500,000 ns`

**Outcome**: `ValidationResult.REJECT(reason="CLOCK_SKEW_VIOLATION")` — the entire batch is rejected and an alert is written to `nexus-sovereign-security-alerts`. The attacker's timestamp manipulation is **definitively detected** by the hardware-anchored RDTSC cross-check.

---

## 6. OTel Integration Reference

The clock-skew verification framework emits the following OpenTelemetry signals during batch processing. These are ingested by the `otel-gcp-ingestion.yaml` collector and routed to GCP.

### 6.1. Span Attributes Emitted on Each Batch

```yaml
# Span: "jep.batch.ingest"
Attributes:
  jep.batch_id:              "<UUID>"
  rdtsc.tsc_value:           "<decimal string>"
  rdtsc.tsc_frequency_hz:    3000000000
  rdtsc.consensus_skew_ns:   12345          # positive = ahead of consensus
  rdtsc.drift_ppm_per_day:   0.42
  ntp.last_sync_offset_ns:   -4200
  ntp.sync_quality:          "good"
  attestation.tee_provider:  "intel_sgx"
  attestation.result:        "verified"
  nexus.clock_skew_violation: "false"        # "true" if any voucher exceeded bound
```

### 6.2. Prometheus Metrics Exposed at `:9100/metrics`

```
# HELP rdtsc_drift_ppm Measured TSC drift in parts per million per day
# TYPE rdtsc_drift_ppm gauge
rdtsc_drift_ppm{node_id="sentinel-edge-07",tee_provider="intel_sgx"} 0.42

# HELP ntp_offset_ns NTP stratum-1 sync offset in nanoseconds
# TYPE ntp_offset_ns gauge
ntp_offset_ns{node_id="sentinel-edge-07",ntp_server="time.google.com"} -4200

# HELP clock_skew_violations_total Total number of RDTSC clock-skew violations detected
# TYPE clock_skew_violations_total counter
clock_skew_violations_total{node_id="sentinel-edge-07",severity="rejection"} 0

# HELP jep_vouchers_quarantined_total Total JEP vouchers rejected due to clock-skew violations
# TYPE jep_vouchers_quarantined_total counter
jep_vouchers_quarantined_total{batch_id="<UUID>",reason="CLOCK_SKEW_VIOLATION"} 0
```

---

## 7. Failure Mode Analysis (FMEA)

| Failure Mode | Probability | Severity | Detection Method | Mitigation |
|---|---|---|---|---|
| NTP sync loss >60s | Low | High | `syncQuality=alarm` | Batch submission halted; manual review triggered |
| TSC reset on CPU hot-plug | Very Low | Critical | TSC monotonicity check at plug event | Node auto-quarantined; RDTSC re-baseline required |
| Hypervisor TSC virtualization (non-SEV-SNP) | Low | High | Layer 2 BFT consensus detects outlier | Upgrade path to SEV-SNP / TDX mandatory |
| ≥ f+1 colluding nodes corrupting consensus | Very Low | Critical | External audit comparison vs. independently operated stratum-1 feed | Decentralized oracle cross-check (planned Q3 2026) |
| CPUID 0x15 leaf unavailable (older CPUs) | Moderate | Medium | Boot-time CPUID check fails | Node disqualified from JEP batch submission |

---

## 8. Compliance Traceability Matrix

| Requirement | Source | Control ID | Implementation Reference |
|---|---|---|---|
| Audit trail for all claim timestamps | NAIC Insurance Data Security Model Law, §5 | IDSML-5.2 | Layer 4 OTel metrics + GCP audit log |
| Tamper-evident transaction records | SOC 2 Type II CC6.1 | SOC2-CC6.1 | Ed25519 signature on voucherAttestation |
| Integrity of automated processing | SOC 2 Type II CC7.2 | SOC2-CC7.2 | Merkle root + batch-level attestation |
| Prevention of unauthorized data modification | NIST SP 800-53 Rev5, SC-28 | SC-28(1) | TEE-sealed signing keys |
| Continuous monitoring of security controls | SOC 2 Type II CC7.1 | SOC2-CC7.1 | OTel → GCP Cloud Monitoring alerting |

---

## 9. References

1. Intel® 64 and IA-32 Architectures Software Developer's Manual, Vol. 3B, §17.17 — Time Stamp Counter
2. Intel® Software Guard Extensions Developer Reference — `RDTSC` behavior inside enclaves
3. AMD SEV-SNP: Strengthening VM Isolation with Integrity Protection and More (AMD Publication 56421)
4. Attiya, Welch — *Distributed Computing: Fundamentals, Simulations, and Advanced Topics*, §5 (Byzantine Agreement)
5. RFC 5905 — Network Time Protocol Version 4: Protocol and Algorithms Specification
6. NIST SP 800-193 — Platform Firmware Resiliency Guidelines (TSC rooting in firmware)
7. Nexus Sovereign JEP Batching Schema — `2-guidewire-integration-schemas/jep-batching-schema.json`
8. Nexus Sovereign OTel GCP Ingestion Config — `4-compliance-and-opsec/otel-gcp-ingestion.yaml`
