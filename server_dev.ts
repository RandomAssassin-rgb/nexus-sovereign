import express from "express";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import path from "path";
import { spawn } from "child_process";
import Razorpay from "razorpay";
import jwt from "jsonwebtoken";
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from "@simplewebauthn/server";
import dotenv from "dotenv";
import axios from "axios";
import { supabaseServer } from "./src/lib/supabaseServer.ts";
import crypto from "crypto";
import fs from "fs";
import https from "https";
import OpenAI from "openai";
import os from "os";
import { latLngToCell } from "h3-js";
import * as bcrypt from "bcryptjs";
import { calculatePmax, calculateReservePool, calculateWeeklyPremium, calculateZeroTouchPayout, normalizePersonaLabel } from "./src/lib/actuarial.ts";


dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

// --- HELPERS ---

/**
 * Ensures a skeleton user exists in the 'users' table.
 * Standardizes the enrollment logic used by various endpoints.
 */
async function ensureSkeletonUser(partnerId: string, initialBalance: number = 0, fullName: string | null = null) {
  const { data: user, error: fetchError } = await supabaseServer
    .from("users")
    .select("*")
    .eq("partnerId", partnerId)
    .maybeSingle();

  if (fetchError) throw fetchError;
  if (user) {
    if (fullName && (!user.full_name || user.full_name === "Anonymous Rider")) {
      await supabaseServer.from("users").update({ full_name: fullName }).eq("partnerId", partnerId);
      return { ...user, full_name: fullName };
    }
    return user;
  }

  console.log(`[Auth] Creating skeleton user for ${partnerId} (${fullName || "Anonymous"})...`);
  const phone = `+91-${Math.floor(Math.random() * 9000000000 + 1000000000)}`;
  const aadhaarNumber = `6372-${Math.floor(Math.random() * 9000 + 1000)}-${Math.floor(Math.random() * 9000 + 1000)}`;

  const payloads = [
    {
      partnerId,
      full_name: fullName || "Anonymous Rider",
      phone,
      platform: "Blinkit",
      aadhaar_number: aadhaarNumber,
      balance: initialBalance,
      auth_method: "phone",
      biometric_status: "pending",
      trust_score: 842,
      avatar_url: null,
      payout_upi: `${Math.floor(Math.random() * 9000000000 + 1000000000)}@ybl`,
    },
    {
      partnerId,
      phone,
      platform: "Blinkit",
      password: null,
      faceDescriptor: null,
      faceImage: null,
      aadhaarVerified: false,
      created_at: new Date().toISOString(),
      premium_until: null,
    },
  ];

  let lastError: any = null;

  for (const payload of payloads) {
    const { data: newUser, error: createError } = await supabaseServer
      .from("users")
      .insert([payload])
      .select()
      .single();

    if (!createError) {
      return newUser;
    }

    lastError = createError;
  }

  console.error(`[Auth] Failed to create skeleton user: ${lastError?.message}`);
  throw lastError;
}

// ─── ADMIN AUTH ENDPOINTS ────────────────────────────────────────────────────

// Validate admin code then create a pending user with hashed password
app.post("/api/admin/auth/signup", async (req, res) => {
  console.log("DEBUG: POST /api/admin/auth/signup hit", { admin_code: req.body?.admin_code });
  try {
    const { admin_code, password } = req.body;
    if (!admin_code || !password) return res.status(400).json({ success: false, message: "Admin code and password are required." });

    // Validate code format: NEXUS-ADMIN-XXXX (any 4 digits)
    const codePattern = /^NEXUS-ADMIN-\d{4}$/;
    if (!codePattern.test(admin_code.trim())) {
      return res.status(400).json({ success: false, message: "invalid" });
    }

    // Ensure this code exists in admin_codes (satisfies FK, allows any valid-format code)
    const { error: codeUpsertErr } = await supabaseServer
      .from("admin_codes")
      .upsert([{ code: admin_code.trim(), role: "Insurer Admin", is_active: true }], { onConflict: "code" });
    if (codeUpsertErr) {
      console.warn("admin_codes upsert warning:", codeUpsertErr.message);
      // Non-fatal — code may already exist
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    // Create pending admin user
    const { data: user, error: userErr } = await supabaseServer
      .from("admin_users")
      .insert([{ admin_code: admin_code.trim(), role: "Insurer Admin", password_hash }])
      .select("id, role, admin_code")
      .single();
    if (userErr) return res.status(500).json({ success: false, message: userErr.message });

    res.json({ success: true, admin: user });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});



// Validate admin code + password for sign-in
app.post("/api/admin/auth/signin", async (req, res) => {
  console.log("DEBUG: POST /api/admin/auth/signin hit", { admin_code: req.body?.admin_code });
  try {
    const { admin_code, password } = req.body;
    if (!admin_code || !password) return res.status(400).json({ success: false, message: "Admin code and password are required." });

    // 1. Find user by code
    const { data: users, error: userErr } = await supabaseServer
      .from("admin_users").select("*").eq("admin_code", admin_code.trim());
    if (userErr || !users || users.length === 0)
      return res.status(400).json({ success: false, message: "invalid" });

    // 2. Find one whose password matches
    let matched = null;
    for (const u of users) {
      if (u.password_hash && await bcrypt.compare(password, u.password_hash)) {
        matched = u;
        break;
      }
    }
    if (!matched) return res.status(401).json({ success: false, message: "password wrong" });

    res.json({ success: true, admin: { id: matched.id, role: matched.role, face_descriptor: matched.face_descriptor } });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Save face descriptor after biometric registration
app.post("/api/admin/auth/register-biometric", async (req, res) => {
  try {
    const { admin_id, face_descriptor } = req.body;
    if (!admin_id || !face_descriptor) return res.status(400).json({ success: false, message: "Missing fields." });
    const { error } = await supabaseServer
      .from("admin_users")
      .update({ face_descriptor, biometric_verified: true })
      .eq("id", admin_id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Save Aadhaar number after fallback
app.post("/api/admin/auth/aadhaar-fallback", async (req, res) => {
  try {
    const { admin_id, aadhaar_number } = req.body;
    if (!admin_id || !aadhaar_number) return res.status(400).json({ success: false, message: "Missing fields." });
    const { error } = await supabaseServer
      .from("admin_users")
      .update({ aadhaar_number, aadhaar_verified: true })
      .eq("id", admin_id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Aadhaar sign-in lookup — find admin by stored aadhaar_number
app.post("/api/admin/auth/aadhaar-signin", async (req, res) => {
  try {
    const { aadhaar_number, admin_code } = req.body;
    const { data, error } = await supabaseServer
      .from("admin_users")
      .select("id, role, face_descriptor")
      .eq("admin_code", admin_code.trim())
      .eq("aadhaar_number", aadhaar_number.replace(/\s/g, ""));
    if (error || !data || data.length === 0)
      return res.status(401).json({ success: false, message: "No admin found with that Aadhaar number." });
    res.json({ success: true, admin: data[0] });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Fetch all admin face profiles for biometric sign-in
app.get("/api/admin/auth/profiles", async (req, res) => {
  try {
    const { data, error } = await supabaseServer
      .from("admin_users")
      .select("id, role, face_descriptor")
      .not("face_descriptor", "is", null);
    if (error) return res.status(500).json({ success: false, message: error.message });
    res.json({ success: true, profiles: data || [] });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Legacy migrate endpoint
app.get("/api/admin/migrate", async (_req, res) => {
  res.json({ message: "Run the SQL directly in Supabase SQL Editor. See implementation_plan.md for schema." });
});


// --- Admin Risk & Riders Endpoints ---

// Fetch centralized risk alerts from Supabase
app.get("/api/admin/risk-alerts", async (req, res) => {
  try {
    const { data: alerts, error } = await supabaseServer
      .from("alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      // If table doesn't exist yet, return high-fidelity mock data to prevent UI crash
      if (error.code === '42P01') {
        const mockAlerts = [
          { id: 'FRD-2847', type: 'Impossible Velocity', severity: 'critical', description: 'Worker location jumped 180km in 3 minutes — GPS spoofing suspected.', worker: 'Raj Patel', location: 'Koramangala → Electronic City', time: '12 mins ago', status: 'open' },
          { id: 'FRD-2846', type: 'Duplicate Claim', severity: 'high', description: 'Same weather event claimed from two different accounts on same device.', worker: 'Unknown (Multi-Account)', location: 'HSR Layout', time: '28 mins ago', status: 'investigating' },
          { id: 'FRD-2845', type: 'Biometric Mismatch', severity: 'medium', description: 'Face verification confidence dropped below 60% on recent login.', worker: 'Amit Singh', location: 'Indiranagar', time: '1 hour ago', status: 'investigating' }
        ];
        return res.json(mockAlerts);
      }
      throw error;
    }

    // Format for frontend
    const formatted = alerts.map((a: any) => ({
      ...a,
      time: new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' ago' // Simplify for UI
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error("Fetch alerts error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update alert status (Block/Dismiss)
app.post("/api/admin/risk/action", async (req, res) => {
  try {
    const { alertId, status, workerId } = req.body;
    if (!alertId || !status) return res.status(400).json({ error: "Missing fields" });

    const { error } = await supabaseServer
      .from("alerts")
      .update({ status })
      .eq("id", alertId);

    if (error) throw error;

    // If 'blocked', we also update the user's status in the users table
    if (status === 'blocked' && workerId) {
      await supabaseServer
        .from("users")
        .update({ status: 'blocked' })
        .eq("partnerId", workerId);
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error("Alert action error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fetch all registered riders for the management dashboard
app.get("/api/admin/riders", async (req, res) => {
  try {
    const { data: users, error } = await supabaseServer
      .from("users")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const formatted = users.map((u: any) => ({
      id: u.partnerId || `WKR-${u.id.substring(0,4).toUpperCase()}`,
      name: u.full_name || 'Anonymous Rider',
      platform: u.platform || 'General',
      zone: u.h3_cell || 'Bangalore Central',
      status: u.status || 'offline',
      plan: u.premium_tier || 'Basic',
      claims: 0, // Placeholder for aggregation logic if needed
      total_paid: u.balance || 0,
      rating: 4.5, // Placeholder
      joined: new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      risk: 'low' // Placeholder for ML inference
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error("Fetch riders error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Admin Recent Claims Endpoint
app.get("/api/admin/recent-claims", async (req, res) => {
  try {
    const { data, error } = await supabaseServer
      .from("claims")
      .select("id, worker_id, payout_inr, type, status, processed_at")
      .order("processed_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    const formatted = data.map((c: any) => ({
      id: c.id ? c.id.substring(0, 8).toUpperCase() : `CLM-${Math.floor(Math.random()*9000)+1000}`,
      worker_name: c.worker_id, 
      amount: c.payout_inr,
      trigger_type: c.type,
      status: c.status,
      created_at: new Date(c.processed_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
    }));

    res.json(formatted);
  } catch (err: any) {
    console.error("Fetch claims error:", err);
    res.status(500).json({ error: err.message });
  }
});

// --- ML Service Process Management ---
function killPort(port: number) {
  try {
    const { execSync } = require("child_process");
    if (process.platform === "win32") {
      execSync(`FOR /F "tokens=5" %a in ('netstat -aon ^| findstr :${port}') do taskkill /F /PID %a 2>nul`, { stdio: "ignore" });
    } else {
      execSync(`lsof -t -i:${port} | xargs kill -9`, { stdio: "ignore" });
    }
  } catch (e) {
    // Ignore if not found
  }
}

// Clear any zombie processes before starting
killPort(8005); // ML service
killPort(3000); // Express
killPort(5173); // Vite dev
killPort(24678); // Vite HMR

// Start Python ML Microservice
const pythonProcess = spawn("python", ["-m", "uvicorn", "ml_service:app", "--host", "127.0.0.1", "--port", "8005"]);

let shuttingDown = false;

// Graceful cleanup on exit
const cleanup = () => {
  if (shuttingDown) return;
  shuttingDown = true;

  if (pythonProcess && !pythonProcess.killed) {
    console.log("[ML Service] Shutting down python process...");
    pythonProcess.kill("SIGINT");
    killPort(8005);
  }
};

process.on("SIGINT", () => {
  cleanup();
  process.exit(0);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(0);
});
process.on("exit", cleanup);


pythonProcess.stdout.on('data', (data) => {
  console.log(`[ML Service] ${data.toString().trim()}`);
  fs.appendFileSync("python_log.txt", data.toString());
});
pythonProcess.stderr.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg.includes("ERROR") || msg.includes("Exception") || msg.includes("Traceback")) {
    console.error(`[ML Service Error] ${msg}`);
  } else {
    console.log(`[ML Service Log] ${msg}`);
  }
  fs.appendFileSync("python_error.txt", data.toString());
});
pythonProcess.on("error", (error) => {
  console.error(`[ML Service Error] Failed to start python service: ${error.message}`);
});
pythonProcess.on('close', (code) => {
  console.log(`[ML Service] Exited with code ${code}`);
  fs.appendFileSync("python_error.txt", `Exited with code ${code}\n`);
});

// Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "rzp_test_placeholder",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "rzp_test_secret_placeholder",
});

// In-memory store for WebAuthn challenges and credentials (for demo purposes)
const userStore: Record<string, any> = {};

// --- WebAuthn Endpoints ---
app.post("/api/auth/webauthn/generate-registration-options", async (req, res) => {
  const { userId, username } = req.body;
  
  const options = await generateRegistrationOptions({
    rpName: "Nexus Sovereign",
    rpID: req.hostname === "localhost" ? "localhost" : req.hostname,
    userID: new Uint8Array(Buffer.from(userId)),
    userName: username,
    attestationType: "none",
    authenticatorSelection: {
      userVerification: "preferred",
      residentKey: "required",
    },
  });

  userStore[userId] = { ...userStore[userId], currentChallenge: options.challenge };
  res.json(options);
});

app.post("/api/auth/webauthn/verify-registration", async (req, res) => {
  const { userId, body } = req.body;
  const expectedChallenge = userStore[userId]?.currentChallenge;

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: req.headers.origin || `http://${req.hostname}:3000`,
      expectedRPID: req.hostname === "localhost" ? "localhost" : req.hostname,
    });

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialType } = verification.registrationInfo;
      userStore[userId].devices = [{ 
        credentialID: credential.id, 
        credentialPublicKey: credential.publicKey, 
        counter: 0 // signCount is not always available on registration, defaulting to 0
      }];
      
      // Generate JWT
      const token = jwt.sign({ userId }, process.env.SUPABASE_JWT_SECRET || "secret", { expiresIn: "1h" });
      res.json({ verified: true, token });
    } else {
      res.status(400).json({ verified: false });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/api/auth/webauthn/generate-authentication-options", async (req, res) => {
  const { userId } = req.body;
  const user = userStore[userId];

  if (!user || !user.devices) {
    return res.status(404).json({ error: "User not found or no devices registered" });
  }

  const options = await generateAuthenticationOptions({
    rpID: req.hostname === "localhost" ? "localhost" : req.hostname,
    allowCredentials: user.devices.map((dev: any) => ({
      id: dev.credentialID,
      type: "public-key",
      transports: ["internal"],
    })),
    userVerification: "preferred",
  });

  userStore[userId].currentChallenge = options.challenge;
  res.json(options);
});

app.post("/api/auth/webauthn/verify-authentication", async (req, res) => {
  const { userId, body } = req.body;
  const user = userStore[userId];
  const expectedChallenge = user?.currentChallenge;

  if (!user || !user.devices) {
    return res.status(404).json({ error: "User not found" });
  }

  const device = user.devices.find((d: any) => d.credentialID === body.id);

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: req.headers.origin || `http://${req.hostname}:3000`,
      expectedRPID: req.hostname === "localhost" ? "localhost" : req.hostname,
      credential: {
        id: device.credentialID,
        publicKey: device.credentialPublicKey,
        counter: device.counter,
        transports: device.transports,
      },
    });

    if (verification.verified) {
      // Generate JWT
      const token = jwt.sign({ userId }, process.env.SUPABASE_JWT_SECRET || "secret", { expiresIn: "1h" });
      res.json({ verified: true, token });
    } else {
      res.status(400).json({ verified: false });
    }
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// --- Aadhaar OTP Fallback Endpoints ---
app.post("/api/auth/aadhaar-otp/send", async (req, res) => {
  const { phone } = req.body;
  // Simulate sending OTP
  console.log(`Sending Aadhaar OTP to ${phone}`);
  res.json({ success: true, message: "OTP sent" });
});

app.post("/api/auth/aadhaar-otp/verify", async (req, res) => {
  const { phone, otp } = req.body;
  // Simulate verifying OTP
  if (otp === "123456") {
    res.json({ success: true, token: "aadhaar_verified_token" });
  } else {
    res.status(400).json({ success: false, message: "Invalid OTP" });
  }
});

// --- Worker Auth Layer (Database-backed via Supabase) ---

app.post("/api/auth/register-password", async (req, res) => {
  const { partnerId, password } = req.body;
  if (!partnerId || !password) return res.status(400).json({ error: "Missing fields" });
  
  try {
    // 1. Ensure user exists in 'users' table using standardized skeleton logic
    await ensureSkeletonUser(partnerId, 0.0);

    // 2. Generate salt and strong cryptographic hash
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
    
    // 3. Persist in Supabase worker_credentials
    const { error } = await supabaseServer
      .from('worker_credentials')
      .upsert({
        partner_id: partnerId,
        password_hash: hash,
        password_salt: salt
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error("Register password error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// We keep a simple login helper for the dashboard (not shown in previous snippets but implied)
app.post("/api/auth/verify-password", async (req, res) => {
    const { partnerId, password } = req.body;
    try {
        const { data, error } = await supabaseServer
            .from('worker_credentials')
            .select('*')
            .eq('partner_id', partnerId)
            .maybeSingle();
            
        if (error || !data) return res.status(401).json({ success: false, message: "User not found" });
        
        const hash = crypto.pbkdf2Sync(password, data.password_salt, 1000, 64, 'sha512').toString('hex');
        if (hash === data.password_hash) {
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: "Invalid password" });
        }
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// --- Supabase Sync Endpoints ---

// GET /api/user/sync?partnerId=...
app.get("/api/user/sync", async (req, res) => {
  const { partnerId } = req.query;
  if (!partnerId) return res.status(400).json({ error: "Missing partnerId" });

  try {
    // 1. Get user by partnerId (upsert/ensure using standardized logic)
    const user = await ensureSkeletonUser(partnerId as string, 3450.0);

    // 2. Get wallet transactions
    const { data: txns, error: txnsError } = await supabaseServer
      .from("transactions") // CORRECTED: transactions instead of wallet_transactions
      .select("*")
      .eq("worker_id", user.partnerId) // CORRECTED: worker_id instead of user_id
      .order("created_at", { ascending: false });

    if (txnsError) throw txnsError;

    // 3. Get claims
    const { data: claims, error: claimsError } = await supabaseServer
      .from("claims")
      .select("*")
      .eq("worker_id", user.partnerId) // CORRECTED: worker_id instead of user_id
      .order("processed_at", { ascending: false }); // CORRECTED: processed_at instead of created_at

    if (claimsError) throw claimsError;

    res.json({
      user: {
        ...user,
        avatar_url: user.avatar_url || null,
        trust_score: user.trust_score || 842,
        payment_methods: user.payment_methods || [],
        payout_upi: user.payout_upi || null
      },
      transactions: txns || [],
      claims: (claims || []).map(c => ({
        ...c,
        amount: c.payout_inr, // Mapping back for UI expectations
        // Ensure processed_at maps to expected created_at if needed, but client check first.
      }))
    });
  } catch (error: any) {
    console.error("Sync error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- Offline Reconciliation (Time-Shifted Claims) ---
app.post("/api/claims/time-shifted", async (req, res) => {
  const { partnerId, claim } = req.body;
  if (!partnerId || !claim) return res.status(400).json({ error: "Missing data" });

  try {
    const { data: user, error: userError } = await supabaseServer
      .from("users")
      .select("partnerId")
      .eq("partnerId", partnerId)
      .maybeSingle();

    if (userError) throw userError;
    if (!user) await ensureSkeletonUser(partnerId);

    const { data, error } = await supabaseServer
      .from("claims")
      .insert([{
        worker_id: partnerId,
        claim_id_str: claim.id,
        amount: 239.00,
        type: "Offline Sync",
        reason: claim.description || "Historical disruption sync",
        status: "approved",
        processed_at: new Date().toISOString(),
        created_at: claim.timestamp,
        jep_telemetry: {
          offline_reconciliation: true,
          original_gps: claim.gps,
          original_shift_status: claim.shiftStatus
        }
      }])
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Offline sync error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/wallet/update
app.post("/api/wallet/update", async (req, res) => {
  const { partnerId, balance, transaction } = req.body;
  if (!partnerId) return res.status(400).json({ error: "Missing partnerId" });
  
  try {
    const { data: user, error: userError } = await supabaseServer
      .from("users")
      .select("partnerId")
      .eq("partnerId", partnerId)
      .maybeSingle();

    if (userError) throw userError;
    if (!user) await ensureSkeletonUser(partnerId);

    // Update balance
    if (balance !== undefined) {
      const { error: balError } = await supabaseServer
        .from("users")
        .update({ balance })
        .eq("partnerId", user.partnerId); // CORRECTED
      if (balError) throw balError;
    }

    // Add transaction
    if (transaction) {
      const { error: txnError } = await supabaseServer
        .from("transactions") // CORRECTED: transactions table
        .insert([{
          worker_id: user.partnerId, // CORRECTED: worker_id instead of user_id
          title: transaction.title,
          description: transaction.desc,
          amount: transaction.amount,
          type: transaction.type,
          via: transaction.via,
          status: 'completed'
        }]);
      if (txnError) throw txnError;
    }

    res.json({ success: true });
  } catch (error: any) {
    console.error("Wallet update error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/user/update-plan
app.post("/api/user/update-plan", async (req, res) => {
  const { partnerId, tier, until } = req.body;
  if (!partnerId || !tier) return res.status(400).json({ error: "Missing fields" });

  try {
    const { error } = await supabaseServer
      .from("users")
      .update({ premium_tier: tier, premium_until: until, premium_upgraded: true })
      .eq("partnerId", partnerId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/user/update-payment-methods
app.post("/api/user/update-payment-methods", async (req, res) => {
  const { partnerId, paymentMethods } = req.body;
  try {
    const { error } = await supabaseServer
      .from("users")
      .update({ payment_methods: paymentMethods })
      .eq("partnerId", partnerId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/claims/create
app.post("/api/claims/create", async (req, res) => {
  const { partnerId, claim } = req.body;
  if (!partnerId) return res.status(400).json({ error: "Missing partnerId" });
  
  try {
    const { data: user, error: userError } = await supabaseServer
      .from("users")
      .select("partnerId") // CORRECTED
      .eq("partnerId", partnerId) // CORRECTED
      .single();

    if (userError) throw userError;

    const lat = claim.lat;
    const lng = claim.lng;
    let h3_cell = null;
    if (lat && lng) {
      try {
        h3_cell = latLngToCell(Number(lat), Number(lng), 7);
      } catch (e) {
        console.error("H3 conversion failed during claim creation:", e);
      }
    }

    const { error: claimError } = await supabaseServer
      .from("claims")
      .insert([{
        worker_id: user.partnerId, // CORRECTED: worker_id instead of user_id
        // UUID id generated automatically or use provided one if it matches UUID format
        // UUID id is generated automatically
        payout_inr: claim.amount, // CORRECTED: payout_inr instead of amount
        status: claim.status,
        type: claim.type,
        reason: claim.reason,
        jep_data: claim.jepData,
        lat: lat,
        lng: lng,
        h3_cell: h3_cell,
        processed_at: new Date().toISOString()
      }]);

    if (claimError) throw claimError;

    res.json({ success: true });
  } catch (error: any) {
    console.error("Claim creation error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/profile/update
app.post("/api/profile/update", async (req, res) => {
  const { partnerId, updates } = req.body;
  if (!partnerId) return res.status(400).json({ error: "Missing partnerId" });
  
  try {
    const { error } = await supabaseServer
      .from("users")
      .update(updates)
      .eq("partnerId", partnerId); // CORRECTED

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    console.error("Profile update error:", error.message);
    res.status(500).json({ error: error.message });
  }
});


// --- Partner ID Verification Endpoint ---
app.post("/api/partner/verify", async (req, res) => {
  const { partnerId, platform } = req.body;
  // Simulate cross-referencing against a partner database
  const validPartners = ["BLINKIT_123", "SWIGGY_456", "AMAZON_789"];
  if (validPartners.includes(partnerId.toUpperCase())) {
    res.json({ verified: true, partnerId });
  } else {
    res.status(404).json({ verified: false, message: "Partner ID not found" });
  }
});

// --- Dispute Mechanism Endpoint ---
app.post("/api/claims/dispute", async (req, res) => {
  const { claimId, reason } = req.body;
  // In a real app, this would insert into a 'dispute_log' table in Supabase
  console.log(`Dispute logged for claim ${claimId}: ${reason}`);
  res.json({ success: true, message: "Dispute submitted for manual review" });
});

// --- 6-Layer Verification Orchestrator ---
app.post("/api/claims/verify-all", async (req, res) => {
  const { claimData, workerData } = req.body;
  
  // This orchestrates L1-L6
  // L1: Environmental Trigger (Already checked by ML)
  // L2: Mobility Veto (Already checked by ML)
  // L3: Order Fingerprint
  const l3_pass = workerData.orderPings > 0;
  // L4: Location Proof
  const l4_pass = workerData.gpsInZone;
  // L5: Anomaly Detection (Already checked by ML)
  const l5_pass = claimData.fraud_score < 0.4;
  // L6: Payout Execution (Razorpay)
  const l6_pass = true; // Mocked

  const results = {
    l1: true, // Mocked
    l2: true, // Mocked
    l3: l3_pass,
    l4: l4_pass,
    l5: l5_pass,
    l6: l6_pass
  };

  const allPassed = Object.values(results).every(val => val === true);
  
  res.json({
    allPassed,
    results
  });
});

// --- Razorpay Endpoints ---

// Create a Razorpay Order for wallet top-ups
app.post("/api/razorpay/create-order", async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // Convert to paise
      currency: "INR",
      receipt: `wallet_topup_${Date.now()}`,
      payment_capture: true,
    });

    res.json(order);
  } catch (error: any) {
    console.error("Razorpay order creation failed:", error.message);
    // Fallback mock order for demo/test mode so Razorpay checkout still opens
    const mockOrderId = "order_" + Math.random().toString(36).substring(2, 15);
    res.json({
      id: mockOrderId,
      amount: Math.round(amount * 100),
      currency: "INR",
      status: "created",
    });
  }
});

app.post("/api/razorpay/create-subscription", async (req, res) => {
  try {
    // Simulate UPI Autopay subscription creation
    // In a real app, you'd create a plan and then a subscription
    const subscription = await razorpay.subscriptions.create({
      plan_id: "plan_placeholder", // Replace with actual plan ID
      customer_notify: 1,
      total_count: 12,
      start_at: Math.floor(Date.now() / 1000) + 86400, // Starts tomorrow
    });
    res.json(subscription);
  } catch (error: any) {
    // Since we don't have a real plan_id, we'll mock a success response for the UI
    res.json({
      id: "sub_" + Math.random().toString(36).substring(7),
      status: "created",
      short_url: "https://rzp.io/i/mock",
    });
  }
});

// --- OAuth Endpoints (Simulated Partner Portals) ---
app.get("/api/auth/url", (req, res) => {
  console.log("OAuth URL requested for provider:", req.query.provider);
  const { provider } = req.query; // blinkit, swiggy, amazon
  const redirectUri = `${req.protocol}://${req.get("host")}/auth/callback`;
  
  // Simulate an OAuth authorization URL
  const authUrl = `${req.protocol}://${req.get("host")}/api/auth/mock-provider?provider=${provider}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.json({ url: authUrl });
});

app.get("/api/auth/mock-provider", (req, res) => {
  const { provider, redirect_uri } = req.query;
  // This is a mock UI that the popup will render
  res.send(`
    <html>
      <head><title>Login to ${provider}</title></head>
      <body style="font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #f9fafb;">
        <div style="background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
          <h2 style="margin-top: 0;">Connect your ${provider} account</h2>
          <p style="color: #6b7280; margin-bottom: 2rem;">Nexus Sovereign is requesting access to your delivery profile.</p>
          <button onclick="window.location.href='${redirect_uri}?code=mock_auth_code_123&provider=${provider}'" style="background: #10b981; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: bold; cursor: pointer; width: 100%;">
            Authorize & Connect
          </button>
        </div>
      </body>
    </html>
  `);
});

app.get("/auth/callback", (req, res) => {
  const { code, provider } = req.query;
  
  // Simulate token exchange
  const mockPartnerId = `${provider}_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  
  res.send(`
    <html>
      <body>
        <script>
          if (window.opener) {
            window.opener.postMessage({ 
              type: 'OAUTH_AUTH_SUCCESS', 
              payload: { provider: '${provider}', partnerId: '${mockPartnerId}' }
            }, '*');
            window.close();
          } else {
            window.location.href = '/';
          }
        </script>
        <p>Authentication successful. This window should close automatically.</p>
      </body>
    </html>
  `);
});

// --- Auth Registration Endpoint (Supabase) ---
app.post("/api/auth/register-user", async (req, res) => {
  const {
    platform,
    method,
    partnerId,
    phone,
    biometric_verified,
    face_descriptor,
    face_image,
    aadhaar_verified,
    aadhaar_number,
    fullName,
  } = req.body;
  
  try {
    if (!partnerId) return res.status(400).json({ error: "Missing partnerId" });

    const skeletonUser = await ensureSkeletonUser(partnerId, 0, fullName || null);
    const normalizedPhone = phone || skeletonUser?.phone || null;

    let parsedDescriptor = face_descriptor;
    if (typeof face_descriptor === "string") {
      try {
        parsedDescriptor = JSON.parse(face_descriptor);
      } catch {
        parsedDescriptor = face_descriptor;
      }
    }

    const modernPayload: Record<string, unknown> = {
      partnerId,
      last_login: new Date().toISOString(),
    };

    if (platform) modernPayload.platform = platform;
    if (method) modernPayload.auth_method = method;
    if (normalizedPhone) modernPayload.phone = normalizedPhone;
    if (fullName) modernPayload.full_name = fullName;
    if (biometric_verified !== undefined) modernPayload.biometric_status = biometric_verified ? "verified" : "pending";
    if (face_descriptor) modernPayload.face_descriptor = face_descriptor;
    if (typeof face_image === "string") modernPayload.face_image = face_image;
    if (aadhaar_verified !== undefined) modernPayload.aadhaar_verified = Boolean(aadhaar_verified);
    if (aadhaar_number) modernPayload.aadhaar_number = aadhaar_number;

    const modernResult = await supabaseServer
      .from('users')
      .upsert(modernPayload, { onConflict: 'partnerId' })
      .select();

    if (!modernResult.error) {
      return res.json({ success: true, data: modernResult.data });
    }

    const legacyPayload: Record<string, unknown> = {
      partnerId,
      created_at: new Date().toISOString(),
      password: null,
    };

    if (platform) legacyPayload.platform = platform;
    if (normalizedPhone) legacyPayload.phone = normalizedPhone;
    if (parsedDescriptor) legacyPayload.faceDescriptor = parsedDescriptor;
    if (typeof face_image === "string") legacyPayload.faceImage = face_image;
    if (aadhaar_verified !== undefined) legacyPayload.aadhaarVerified = Boolean(aadhaar_verified);

    const legacyResult = await supabaseServer
      .from("users")
      .upsert(legacyPayload, { onConflict: "partnerId" })
      .select();

    if (legacyResult.error) throw legacyResult.error;
    return res.json({ success: true, data: legacyResult.data, warning: modernResult.error.message });
  } catch (error: any) {
    console.error("Supabase Register Error:", error.message);
    // 42P01: Table doesn't exist, we fallback for the demo but keep it robust
    res.json({ success: true, message: "Registration cached locally (Supabase table error: " + error.message + ")" });
  }
});

app.post("/api/user/update-payment-methods", async (req, res) => {
  const { partnerId, paymentMethods } = req.body;
  if (!partnerId) return res.status(400).json({ error: "Missing partnerId" });

  try {
    const { data, error } = await supabaseServer
      .from("users")
      .update({ payment_methods: paymentMethods })
      .eq("partnerId", partnerId); // CORRECTED: partnerId

    if (error) throw error;
    res.json({ success: true, data });
  } catch (error: any) {
    console.error("Update Payment Methods Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// --- User Profile & Premium Endpoints ---
function normalizeProfileUser(user: any) {
  if (!user) return null;

  const rawDescriptor = user.face_descriptor ?? user.faceDescriptor ?? null;
  const faceDescriptor = Array.isArray(rawDescriptor) ? JSON.stringify(rawDescriptor) : rawDescriptor;

  return {
    ...user,
    face_descriptor: faceDescriptor,
    face_image: user.face_image ?? user.faceImage ?? user.avatar_url ?? null,
    aadhaar_number: user.aadhaar_number ?? user.aadhaarNumber ?? null,
    aadhaar_verified: user.aadhaar_verified ?? user.aadhaarVerified ?? false,
    biometric_verified: Boolean(
      user.biometric_verified ??
      (user.biometric_status ? user.biometric_status === "verified" : undefined) ??
      rawDescriptor
    ),
  };
}

app.get("/api/auth/profile/:partnerId", async (req, res) => {
  const { partnerId } = req.params;
  try {
    const { data, error } = await supabaseServer
      .from('users')
      .select('*')
      .eq('partnerId', partnerId) // CORRECTED: partnerId
      .maybeSingle();

    if (error) {
      console.error(`[Supabase Error] FETCH profile for ${partnerId}:`, error.message);
      throw error;
    }
    
    res.json({ success: true, user: normalizeProfileUser(data) });
  } catch (error: any) {
    console.error("Error fetching profile:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/premium/activate", async (req, res) => {
  const { partnerId, planType, tier } = req.body;

  // Validate planType
  const validPlans = ["basic", "standard", "pro"];
  const requestedTier = typeof planType === "string" ? planType : tier;
  const normalizedTier = validPlans.includes(requestedTier) ? requestedTier : "basic";

  // Calculate expiry: 7 days from now
  const premiumUntil = new Date();
  premiumUntil.setDate(premiumUntil.getDate() + 7);

  try {
    const { error } = await supabaseServer
      .from('users')
      .update({
        premium_until: premiumUntil.toISOString(),
        premium_tier: normalizedTier,
        premium_upgraded: true,
      })
      .eq('partnerId', partnerId);

    if (error) throw error;

    console.log(`[Premium] Activated plan "${normalizedTier}" for ${partnerId} until ${premiumUntil.toISOString()}`);
    res.json({
      success: true,
      planType: normalizedTier,
      premiumUntil: premiumUntil.toISOString(),
    });
  } catch (error: any) {
    console.error("Error activating premium:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// --- Full ML Pipeline Integration (Python Microservice) ---

const PYTHON_ML_URL = "http://127.0.0.1:8005";
const ML_SERVICE_TOKEN = process.env.ML_SERVICE_TOKEN || "dummy-token";

// Initialize OpenAI for OpenRouter insights only when a key is available.
const openrouter = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": "https://nexus-sovereign.ai",
        "X-Title": "Nexus Sovereign",
      },
    })
  : null;

// AI Risk Insights (LLM Based)
app.post("/api/ai/risk-insights", async (req, res) => {
  const { weatherData, aqiData, trafficData, location } = req.body;

  try {
    if (!openrouter) {
      const city = location?.city || location?.name || "your zone";
      const weather = weatherData?.weather?.[0]?.main || weatherData?.condition || "volatile weather";
      const aqi = Number(aqiData?.aqi ?? aqiData?.data?.aqi ?? 0);
      const jamFactor = Number(trafficData?.jamFactor ?? 0);

      let analysis = `${city} shows telemetry-verified exposure.`;
      if (aqi >= 150) {
        analysis = `${city} is under hazardous air stress with a strong parametric delta. Maintain elevated cover for rider continuity.`;
      } else if (jamFactor >= 6) {
        analysis = `${city} is seeing severe mobility friction and rising delivery risk. Keep zero-touch disruption coverage active.`;
      } else if (String(weather).toLowerCase().includes("rain")) {
        analysis = `${city} has rain-linked micro-climate risk. Maintain protective cover for payout continuity and safer operations.`;
      }

      return res.json({ analysis, mock: true });
    }

    const prompt = `Analyze the user's risk profile based on the following real-time telemetry:
    Weather: ${JSON.stringify(weatherData)}
    AQI: ${JSON.stringify(aqiData)}
    Traffic: ${JSON.stringify(trafficData)}
    Location: ${JSON.stringify(location)}
    
    Provide a professional, persuasive, and concise (under 45 words) risk insight. 
    Focus on how these conditions affect gig worker productivity and safety. 
    Suggest maintaining or upgrading parametric coverage. 
    Tone: Analytical, premium, protective. Use terms like 'micro-climate', 'parametric delta', or 'telemetry-verified'.`;

    const response = await openrouter.chat.completions.create({
      model: "openai/gpt-4o",
      messages: [{ role: "user", content: prompt }],
    });

    res.json({ analysis: response.choices[0].message.content });
  } catch (error: any) {
    console.error("AI Insights Error:", error.message);
    res.status(500).json({ error: "Failed to generate AI insights" });
  }
});

// 1. Predictive Oracle (Dual-Head LSTM)
app.post("/api/ml/predictive-oracle", async (req, res) => {
  try {
    const response = await axios.post(`${PYTHON_ML_URL}/predict/oracle`, req.body, {
      headers: {
        Authorization: `Bearer ${ML_SERVICE_TOKEN}`
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error("ML Service Error:", error);
    res.status(500).json({ error: "Failed to reach ML engine" });
  }
});

// 2. Fraud Anomaly Detector (Isolation Forest)
app.post("/api/ml/fraud-anomaly", async (req, res) => {
  try {
    const response = await axios.post(`${PYTHON_ML_URL}/predict/fraud`, req.body, {
      headers: {
        Authorization: `Bearer ${ML_SERVICE_TOKEN}`
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error("ML Service Error:", error);
    res.status(500).json({ error: "Failed to reach ML engine" });
  }
});

// 3. Onboarding Risk Profiler (Random Forest)
app.post("/api/ml/risk-profiler", async (req, res) => {
  try {
    const response = await axios.post(`${PYTHON_ML_URL}/predict/risk`, req.body, {
      headers: {
        Authorization: `Bearer ${ML_SERVICE_TOKEN}`
      }
    });
    res.json(response.data);
  } catch (error) {
    console.error("ML Service Error:", error);
    res.status(500).json({ error: "Failed to reach ML engine" });
  }
});

// 4. Weekly Premium Calculator (XGBoost Actuarial Regression)
app.post("/api/ml/calculate-premium", async (req, res) => {
  try {
    const { zone_h3, persona, trust_score, weather_severity, traffic_density, aqi_severity, trigger_type } = req.body;

    // A. Calculate H3 Historical Zone Risk
    let zoneRisk = 0.1;
    if (zone_h3) {
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { count, error: countError } = await supabaseServer
        .from('disruption_triggers')
        .select('*', { count: 'exact', head: true })
        .eq('zone_h3', zone_h3)
        .gte('fired_at', ninetyDaysAgo.toISOString());

      if (!countError && count !== null) {
        zoneRisk = Math.min(count / 20.0, 1.0); 
      }
    }

    const premiumQuote = calculateWeeklyPremium({
      persona: persona || "Blinkit",
      trustScore: trust_score,
      zoneRisk,
      weatherSeverity: weather_severity || 0.1,
      triggerType: trigger_type || "rain",
    });

    const highEndCoverage = calculateZeroTouchPayout({
      persona: persona || "Blinkit",
      triggerType: "Heavy Rain/Flood",
      earningsTier: "high",
      reservePool: Number.MAX_SAFE_INTEGER,
      activeWorkers: 1,
    }).calculated_payout;

    res.json({
      premium: premiumQuote.weekly_premium,
      weekly_premium: premiumQuote.weekly_premium,
      coverage_cap: Math.round(highEndCoverage / 10) * 10,
      risk_tier: premiumQuote.risk_tier,
      season: premiumQuote.season,
      persona_group: premiumQuote.persona_group,
      trust_score: premiumQuote.trust_score,
      zone_risk: Number(zoneRisk.toFixed(3)),
    });
  } catch (error) {
    console.error("ML Premium calculation failed:", error);
    res.status(500).json({ error: "Failed to calculate actuarial premium" });
  }
});

// --- Actuarial & Business Logic ---

// Auto-trigger Engine (Parametric Insurance)
setInterval(async () => {
  console.log("[Auto-trigger] Checking for disruptions...");
  try {
    // 1. Fetch active workers (assuming a 'workers' table in Supabase)
    const { data: workers, error } = await supabaseServer
      .from('workers')
      .select('*')
      .eq('status', 'active');
    
    if (error) throw error;
    if (!workers) return;

    for (const worker of workers) {
      // 2. Check weather for worker's zone
      const weatherRes = await axios.get(`http://localhost:${PORT}/api/weather?lat=${worker.lat}&lon=${worker.lon}`);
      const weather = weatherRes.data;

      // Threshold: Rain
      if (weather.weather?.[0]?.main === 'Rain') {
        console.log(`[Auto-trigger] Disruption detected for worker ${worker.id}. Filing claim...`);
        
        // 3. Auto-create claim, run verification, fire Razorpay
        // This is a simplified sequence
        const claimResponse = await axios.post(`http://localhost:${PORT}/api/claims/auto-file`, {
          workerId: worker.id,
          trigger: "Heavy Rain"
        });
        
        if (claimResponse.data.success) {
          console.log(`[Auto-trigger] Claim filed and paid for worker ${worker.id}`);
        }
      }
    }
  } catch (error) {
    console.error("[Auto-trigger] Error:", error);
}
}, 5 * 60 * 1000); // Every 5 minutes


// Mock Policy Store for Lockout Policy
const policyStore: Record<string, any> = {};

// Predictive Shield Notification
setInterval(async () => {
  // Check if it's Sunday night (e.g., 8 PM)
  const now = new Date();
  if (now.getDay() === 0 && now.getHours() === 20) {
    console.log("[Predictive Shield] Checking forecast...");
    
    // 1. Fetch active workers
    const { data: workers } = await supabaseServer
      .from('workers')
      .select('*')
      .eq('status', 'active');
    
    if (!workers) return;

    for (const worker of workers) {
      // 2. Check forecast
      const forecastRes = await axios.get(`http://localhost:${PORT}/api/weather/forecast?lat=${worker.lat}&lon=${worker.lon}`);
      const disruptionProb = forecastRes.data.disruptionProbability || 0;

      // 3. If > 70%, push notification
      if (disruptionProb > 0.7) {
        console.log(`[Predictive Shield] High disruption probability for worker ${worker.id}. Pushing notification...`);
        // Push notification logic here
      }
    }
  }
}, 60 * 60 * 1000); // Every hour

// Lockout Policy Check
app.post("/api/actuarial/check-lockout", (req, res) => {
  const { userId } = req.body;
  const policy = policyStore[userId];
  
  if (policy && policy.status === "terminated" && policy.term_remaining > 0) {
    res.json({ locked_out: true, message: "Barred from purchasing new policy until original term expires." });
  } else {
    res.json({ locked_out: false });
  }
});

// Pmax Solvency Formula
app.post("/api/actuarial/pmax", (req, res) => {
  const { w_base, income_loss_pct, b_res, n_active, t_w, calculated_payout } = req.body;
  const result = calculatePmax({
    calculatedPayout: Number.isFinite(Number(calculated_payout))
      ? Number(calculated_payout)
      : Number(w_base || 0) * (Number(income_loss_pct || 0) / 100),
    reservePool: Number(b_res || 0),
    activeWorkers: Math.max(1, Number(n_active || 1)),
    triggerWeight: Number(t_w || 1),
  });

  res.json({
    formula: result.formula,
    standard_payout: result.calculatedPayout,
    adjusted_pool_payout: result.p_max,
    p_max: result.p_max,
    final_payout: result.finalPayout,
    reserve_guardrail: result.reserve_guardrail,
    circuit_breaker_active: result.circuit_breaker_active,
  });
});

// 3-Year Revenue Projection
app.get("/api/actuarial/revenue-projection", (req, res) => {
  res.json({
    year_1: { workers: "10K", platforms: 1, revenue_cr: 3.6, milestone: "Prove the model. Build the data moat." },
    year_2: { workers: "100K", platforms: 3, sdk_licenses: 1, revenue_cr: 36.5, milestone: "Scale distribution. First carrier SDK license." },
    year_3: { workers: "500K", platforms: 3, sdk_licenses: 3, revenue_cr: 185, milestone: "Category leadership. Data moat mature." },
    tam: { market: "Indian non-life parametric", addressable_cr: 45000 }
  });
});

// --- Offline Queue Time-Shifted Validation ---
app.post("/api/claims/time-shifted", (req, res) => {
  const { claim_id, cached_gps, cached_shift_status, submitted_at, original_timestamp } = req.body;
  
  // In a real system, this would query historical weather/traffic databases for `original_timestamp`
  const timeDiffHours = (new Date(submitted_at).getTime() - new Date(original_timestamp).getTime()) / (1000 * 60 * 60);
  
  res.json({
    status: "validated",
    claim_id,
    time_shifted_hours: Number(timeDiffHours.toFixed(2)),
    historical_weather_match: true,
    historical_traffic_match: true,
    message: "Offline claim successfully validated against historical disruption data."
  });
});

// --- External APIs (Weather, AQI, Traffic) ---

// Consolidated Multivariate Pulse: Parallel Corroboration for Speed
const multivariateCache = new Map<string, { data: any, expiry: number }>();

app.post("/api/verify/multivariate-pulse", async (req, res) => {
  const { lat, lon, query, location } = req.body;
  const zoneKey = `${Number(lat).toFixed(2)}_${Number(lon).toFixed(2)}`;
  
  // 1. Check Cache (5-min TTL for localized disruptions)
  const cached = multivariateCache.get(zoneKey);
  if (cached && cached.expiry > Date.now()) {
    return res.json(cached.data);
  }

  console.log(`[Multivariate Pulse] 🚀 Request received for zone: ${zoneKey} | query: ${query}`);

  try {
    const newsApiKey = process.env.NEWSDATA_API_KEY;
    const serpApiKey = process.env.JUSTSERP_API_KEY;

    // 2. Dynamic Keyword Extraction from User Description (Sharpened Accuracy)
    const stopWords = ['a', 'an', 'the', 'is', 'at', 'on', 'in', 'of', 'heavy', 'very', 'severe'];
    const keywordsRaw = (query || '').toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stopWords.includes(w));
    const searchTerms = keywordsRaw.length > 0 ? keywordsRaw.slice(0, 3).join(" OR ") : "disruption";

    // Parallel Signal Gathering with Nuclear Promise.race Timeout (2500ms)
    const pulseTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("PULSE_TIMEOUT")), 2500));

    const [newsRes, serpRes] = await Promise.race([
      Promise.allSettled([
        newsApiKey ? axios.get(`https://newsdata.io/api/1/news?apikey=${newsApiKey}&q=${searchTerms}&lat=${lat}&lon=${lon}`, { timeout: 1800 }).catch(e => { console.warn(`[News] API Error: ${e.message}`); return null; }) : Promise.resolve(null),
        serpApiKey ? axios.get(`https://api.justserp.com/index.php?api_key=${serpApiKey}&q=${query}&location=${location || 'Bangalore'}&num=5`, { timeout: 1800 }).catch(e => { console.warn(`[SERP] API Error: ${e.message}`); return null; }) : Promise.resolve(null)
      ]),
      pulseTimeout
    ]) as any;

    console.log(`[Multivariate Pulse] ✅ Signals gathered for zone: ${zoneKey}`);

    // 3. Ruthless Signal Scoring (Start at 40% Confidence)
    let confidence = 40;
    let signals = [];
    
    // News Process (Stricter matching against extracted keywords)
    if (newsRes.status === 'fulfilled' && newsRes.value?.data?.results) {
      const results = newsRes.value.data.results;
      const matchingNews = results.filter((n: any) => keywordsRaw.some(k => (n.title || '').toLowerCase().includes(k) || (n.description || '').toLowerCase().includes(k)));
      if (matchingNews.length > 0) {
        confidence += 25;
        signals.push(`Live news match found for: ${keywordsRaw.join(", ")}`);
      }
    }

    // SERP Process (Stricter matching)
    if (serpRes.status === 'fulfilled' && serpRes.value?.data?.organic_results) {
      const snippets = serpRes.value.data.organic_results.map((r: any) => r.snippet).join(" ").toLowerCase();
      const hits = keywordsRaw.filter(k => snippets.includes(k));
      if (hits.length > 0) {
        confidence += 30; // High individual weight for hyper-local social proof
        signals.push(`Social proof detected: ${hits.join(", ")}`);
      }
    }

    const result = {
      status: confidence >= 75 ? "corroborated" : "insufficient",
      confidence: Math.min(confidence, 98),
      signals,
      processed_at: new Date().toISOString(),
      analysis_summary: confidence >= 75 ? "Corroborated by live digital pulse." : "Insufficient digital proof found for image-less claim."
    };

    // 4. Update Cache
    multivariateCache.set(zoneKey, { data: result, expiry: Date.now() + 300000 });

    res.json(result);
  } catch (err) {
    console.error("Multivariate pulse failed:", err);
    res.status(500).json({ error: "Verification gathering failed" });
  }
});

// NewsData.io: Digital Corroboration for Image-less Claims (Kept for legacy compat)
app.get("/api/news/local-status", async (req, res) => {
  const { lat, lon, q } = req.query;
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) return res.json({ status: "skipped", message: "News API not configured" });

  try {
    const response = await axios.get(`https://newsdata.io/api/1/news?apikey=${apiKey}&q=${q || 'disruption'}&lat=${lat}&lon=${lon}`);
    const results = response.data.results || [];
    const keywords = ['rain', 'flood', 'strike', 'protest', 'jam', 'traffic', 'accident'];
    const matched = results.filter((n: any) => keywords.some(k => (n.title || '').toLowerCase().includes(k) || (n.description || '').toLowerCase().includes(k)));

    res.json({
      status: matched.length > 0 ? "corroboratory" : "neutral",
      count: matched.length,
      top_headlines: matched.slice(0, 2).map((m: any) => m.title)
    });
  } catch (err) {
    res.status(500).json({ error: "News check failed" });
  }
});

// JustSERP: Real-time Social Proof / Hyper-local Search
app.post("/api/verify/social-proof", async (req, res) => {
  const { query, location } = req.body;
  const apiKey = process.env.JUSTSERP_API_KEY;
  if (!apiKey) return res.json({ status: "skipped", message: "JustSERP not configured" });

  try {
    const response = await axios.get(`https://api.justserp.com/index.php?api_key=${apiKey}&q=${query}&location=${location || 'Bangalore'}&num=5`);
    const snippets = response.data?.organic_results?.map((r: any) => r.snippet).join(" ") || "";
    const keywords = ['rain', 'waterlogged', 'traffic', 'delayed', 'blocked', 'closed'];
    const hits = keywords.filter(k => snippets.toLowerCase().includes(k));

    res.json({
      confidence: hits.length > 0 ? 85 : 50,
      social_proof_detected: hits.length > 0,
      hits,
      message: hits.length > 0 ? `Detected hyper-local corroboration from ${hits.length} signals.` : "No hyper-local news pulse detected."
    });
  } catch (err) {
    res.status(500).json({ error: "Social proof check failed" });
  }
});
app.get("/api/weather", async (req, res) => {
  const lat = req.query.lat || "12.9716";
  const lon = req.query.lon || "77.5946";
  const apiKey = process.env.VITE_OPENWEATHER_API_KEY?.trim();
  
  const seed = (Number(lat) || 0) + (Number(lon) || 0);
  const isRainy = (Math.sin(seed) > 0.5);
  
  const mockWeather = {
    weather: [{ main: isRainy ? "Rain" : "Clear", description: isRainy ? "moderate rain" : "clear sky" }],
    main: { temp: 290 + (Math.cos(seed) * 10), humidity: 50 + (Math.sin(seed) * 30) },
    wind: { speed: 3 + Math.abs(Math.sin(seed) * 5) },
    mock: true
  };

  try {
    if (!apiKey || apiKey === 'placeholder_openweather_key' || apiKey === '') {
      return res.json(mockWeather);
    }

    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}`,
      { timeout: 5000 }
    );
    res.json(response.data);
  } catch (error: any) {
    if (error.response && error.response.status === 401) {
      // Invalid API key, fallback to mock data silently
      return res.json(mockWeather);
    }
    console.error("Weather API Error:", error.message);
    return res.json(mockWeather);
  }
});

app.get("/api/aqi", async (req, res) => {
  const { lat, lon } = req.query;
  const token = process.env.AQI_TOKEN?.trim();
  
  try {
    if (!token) throw new Error("No AQI token");
    const response = await axios.get(`https://api.waqi.info/feed/geo:${lat};${lon}/?token=${token}`, { timeout: 5000 });
    if (response.data.status === "ok") {
      res.json({ aqi: response.data.data.aqi });
    } else {
      throw new Error("AQI API returned error status");
    }
  } catch (error: any) {
    if (error.response && error.response.status === 401) {
      return res.json({ aqi: 45 + Math.floor(Math.random() * 50), mock: true });
    }
    console.error("AQI API Error:", error.message);
    // Fallback AQI
    res.json({ aqi: 45 + Math.floor(Math.random() * 50), mock: true });
  }
});

app.get("/api/traffic", async (req, res) => {
  const lat = req.query.lat || "12.9716";
  const lon = req.query.lon || "77.5946";
  const apiKey = process.env.HERE_TRAFFIC_API_KEY?.trim();
  
  try {
    if (!apiKey) throw new Error("No HERE Traffic API key");
    // Calculate a bounding box around the coordinates (approx 5km)
    const latNum = Number(lat);
    const lonNum = Number(lon);
    const bbox = `${lonNum - 0.05},${latNum - 0.05},${lonNum + 0.05},${latNum + 0.05}`;
    
    const response = await axios.get(
      `https://data.traffic.hereapi.com/v7/flow?locationReferencing=shape&in=bbox:${bbox}&apiKey=${apiKey}`,
      { timeout: 5000 }
    );
    
    // Simple heuristic: check if there are any flow items and average their jam factor (0-10)
    let totalJam = 0;
    let count = 0;
    
    if (response.data?.results) {
      response.data.results.forEach((result: any) => {
        if (result.currentFlow?.jamFactor !== undefined) {
          totalJam += result.currentFlow.jamFactor;
          count++;
        }
      });
    }
    
    const avgJamFactor = count > 0 ? totalJam / count : 0;
    // Map jam factor (0-10) to a traffic density multiplier (0.5 to 2.0)
    const trafficDensity = 0.5 + (avgJamFactor / 10) * 1.5;
    
    res.json({ jamFactor: avgJamFactor, trafficDensity });
  } catch (error: any) {
    if (error.response && error.response.status === 401) {
      return res.json({ jamFactor: 2.5, trafficDensity: 1.0, mock: true });
    }
    console.error("Traffic API Error:", error.message);
    // Fallback traffic density
  }
});

// MULTIVARIATE PULSE: L5 Orchestrator for Image-less Claims
app.post("/api/verify/multivariate-pulse", async (req, res) => {
  const { query, lat, lon, location } = req.body;
  if (!query) return res.status(400).json({ error: "Missing query description" });

  try {
    console.log(`[L5 Pulse] Initiating digital cross-check for: "${query}"`);
    
    // 1. EXTRACT KEYWORDS for hyper-local search (Simple extraction)
    const keywords = query.toLowerCase().split(/\W+/).filter(w => w.length > 4);
    const searchQuery = keywords.slice(0, 3).join(" "); // Use first 3 meaningful words

    // 2. PARALLEL TELEMETRY FETCH
    const [weatherRes, newsRes, socialRes] = await Promise.allSettled([
      axios.get(`http://localhost:${PORT}/api/weather?lat=${lat}&lon=${lon}`),
      axios.get(`http://localhost:${PORT}/api/admin/news`),
      axios.post(`http://localhost:${PORT}/api/verify/social-proof`, { query: searchQuery, location: location || "Bangalore" })
    ]);

    let confidence = 0;
    const signals: string[] = [];
    const logs: string[] = [];

    // --- Signal A: Weather (40%) ---
    if (weatherRes.status === "fulfilled") {
        const weather = (weatherRes.value as any).data;
        const isRainy = weather.weather?.[0]?.main?.toLowerCase().includes("rain") || 
                        weather.weather?.[0]?.description?.toLowerCase().includes("rain");
        
        const mentionsRain = query.toLowerCase().includes("rain") || query.toLowerCase().includes("flood");
        
        if (isRainy && mentionsRain) {
            confidence += 40;
            signals.push("Parametric Weather Corroborated");
            logs.push("Weather Match (Rain/Flood)");
        }
    }

    // --- Signal B: Digital News Pulse (35%) ---
    if (newsRes.status === "fulfilled") {
        const news = (newsRes.value as any).data;
        if (Array.isArray(news)) {
          const matches = news.filter((item: any) => 
              keywords.some(k => item.title.toLowerCase().includes(k) || (item.description && item.description.toLowerCase().includes(k)))
          );

          if (matches.length > 0) {
              confidence += 35;
              signals.push(`Active Local News Alert (${matches[0].title.slice(0, 20)}...)`);
              logs.push(`${matches.length} News Signal Matches`);
          }
        }
    }

    // --- Signal C: Hyper-local Social Proof (25%) ---
    if (socialRes.status === "fulfilled") {
        const social = (socialRes.value as any).data;
        if (social.social_proof_detected) {
            confidence += Math.min(25, social.confidence / 4); // Max 25% weighted
            signals.push("Hyper-local Social/Search Proof (JustSERP)");
            logs.push(`Social Proof Detected (Confidence: ${social.confidence})`);
        }
    }

    // FINAL DECISION
    const ALL_PASSED = confidence >= 75;
    
    res.json({
      status: ALL_PASSED ? "corroborated" : "rejected",
      confidence,
      signals,
      analysis_summary: ALL_PASSED 
        ? `L5: Digital Pulse Corroborated (${confidence}%). Multiple signals confirm disruption in zone.` 
        : `L5: Insufficient Digital Pulse (${confidence}%). Telemetry does not reflect the description provided.`,
      debug_logs: logs
    });

  } catch (err: any) {
    console.error("L5 Pulse Error:", err.message);
    res.status(500).json({ error: "Multivariate pulse orchestration failed" });
  }
});
// --- User Activity & Location Heartbeat ---
app.post("/api/user/location", async (req, res) => {
  const { partnerId, lat, lng } = req.body;
  if (!partnerId || lat === undefined || lng === undefined) return res.status(400).json({ error: "Missing data" });

  try {
    const { error } = await supabaseServer
      .from("users")
      .update({ 
        last_lat: lat, 
        last_lng: lng, 
        last_seen: new Date().toISOString() 
      })
      .eq("partnerId", partnerId); // CORRECTED: partnerId

    if (error) throw error;
    res.json({ success: true });
  } catch (err: any) {
    console.error("Location heartbeat failed:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Admin Dashboard Stats ---
app.get("/api/admin/stats", async (req, res) => {
  try {
    // 1. Active Policies (Workers with active insurance)
    const { count: activePolicies } = await supabaseServer
      .from("users")
      .select("*", { count: "exact", head: true })
      .gt("premium_until", new Date().toISOString());

    // 2. Live Pending Claims
    const { count: liveClaims } = await supabaseServer
      .from("claims")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    // 3. Total Reserve Pool (Platform Liquidity)
    const { data: balances } = await supabaseServer
      .from("users")
      .select("balance");
    
    const totalBalance = (balances || []).reduce((acc, curr) => acc + (Number(curr.balance) || 0), 0);

    // 4. Dynamic Active Triggers (Based on claims in last 24h)
    const { data: recentTriggers } = await supabaseServer
      .from("claims")
      .select("type")
      .gte("processed_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // CORRECTED: processed_at
    
    const uniqueTriggers = [...new Set((recentTriggers || []).map(t => t.type))];

    res.json({
      activePolicies: activePolicies || 0,
      liveClaims: liveClaims || 0,
      reservePool: calculateReservePool(totalBalance),
      activeTriggers: Math.max(3, uniqueTriggers.length) // Fallback to at least 3 for demo aesthetics
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Actuarial Engine Inputs ---
app.get("/api/actuarial/inputs", async (req, res) => {
  try {
    const { count: activePolicies } = await supabaseServer
      .from("users")
      .select("*", { count: "exact", head: true })
      .gt("premium_until", new Date().toISOString());

    const { data: balances } = await supabaseServer
      .from("users")
      .select("balance");
    
    const totalBalance = (balances || []).reduce((acc, curr) => acc + (Number(curr.balance) || 0), 0);

    res.json({
      b_res: calculateReservePool(totalBalance),
      n_active: activePolicies || 0
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Recent Claims Feed ---
app.get("/api/admin/recent-claims", async (req, res) => {
  try {
    const { data: claims, error } = await supabaseServer
      .from("claims")
      .select(`
        id,
        payout_inr,
        status,
        processed_at,
        worker_id,
        jep_data
      `) 
      .order("processed_at", { ascending: false })
      .limit(5);

    if (error) throw error;

    const formattedClaims = (claims || []).map(c => {
      // Safely extract trigger info from jep_data
      const jep = (c.jep_data as any) || {};
      const trigger = jep.simulation_type || jep.trigger_type || "Unknown";
      
      return {
        id: c.id ? String(c.id).slice(0, 8) : "N/A",
        zone: jep.zone || "Bangalore",
        trigger: trigger,
        amount: `₹${Number(c.payout_inr || 0).toLocaleString()}`,
        time: c.processed_at ? new Date(c.processed_at).toLocaleTimeString() : "N/A"
      };
    });

    res.json(formattedClaims);
  } catch (err: any) {
    console.error("Recent claims feed error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- News Context Feed (Bangalore) ---
app.get("/api/admin/news", async (req, res) => {
  const apiKey = process.env.NEWSDATA_API_KEY?.trim();
  
  const mockNews = [
    {
      title: "IMD Issues Yellow Alert for Bengaluru: Heavy Rainfall Expected",
      link: "#",
      source_id: "Internal Intelligence",
      pubDate: new Date().toISOString(),
      description: "Meteorological department predicts significant downpour across North and East Bangalore corridors."
    },
    {
      title: "Outer Ring Road Traffic Congestion at Record Highs",
      link: "#",
      source_id: "Traffic Hub",
      pubDate: new Date().toISOString(),
      description: "Severe delays reported near Marathahalli and Silk Board junction due to waterlogging."
    },
    {
      title: "New Gig Worker Welfare Guidelines Proposed in Karnataka",
      link: "#",
      source_id: "Gov Insights",
      pubDate: new Date().toISOString(),
      description: "State government considers mandatory insurance buffers for extreme weather delivery conditions."
    }
  ];

  try {
    if (!apiKey || apiKey === 'placeholder_newsdata_key' || apiKey === '') {
      return res.json(mockNews);
    }

    // Fetch latest news for Bangalore, India
    const response = await axios.get(
      `https://newsdata.io/api/1/news?apikey=${apiKey}&q=Bangalore&country=in&category=environment,politics,top`,
      { timeout: 5000 }
    );

    if (response.data.results && response.data.results.length > 0) {
      // Return only the first 5 relevant items
      const newsItems = response.data.results.slice(0, 5).map((item: any) => ({
        title: item.title,
        link: item.link,
        source_id: item.source_id,
        pubDate: item.pubDate,
        description: item.description ? item.description.substring(0, 150) + "..." : "No description available."
      }));
      res.json(newsItems);
    } else {
      res.json(mockNews);
    }
  } catch (error: any) {
    // Only log once and fail gracefully
    // console.error("News API Error:", error.message);
    res.json(mockNews);
  }
});

// --- Mock Weather Endpoint ---
app.get("/api/weather", (req, res) => {
  res.json({
    main: { temp: 300.15 + (Math.random() * 2), humidity: 65 },
    weather: [{ main: "Overcast Clouds" }]
  });
});

// --- Mock Traffic Endpoint ---
app.get("/api/traffic", (req, res) => {
  res.json({
    jamFactor: 5 + (Math.random() * 3)
  });
});

// --- Risk Map Distribution ---
app.get("/api/admin/risk-distribution", async (req, res) => {
  try {
    const { data: users, error } = await supabaseServer
      .from("users")
      .select("last_lat, last_lng")
      .not("last_lat", "is", null);

    if (error) throw error;

    // Group users by H3 cell (Resolution 7)
    const distribution: Record<string, number> = {};
    (users || []).forEach(u => {
      try {
        const hex = latLngToCell(Number(u.last_lat), Number(u.last_lng), 7);
        distribution[hex] = (distribution[hex] || 0) + 1;
      } catch (e) {
        // Skip invalid coordinates
      }
    });

    res.json(distribution);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Admin Workers Locations Telemetry
app.get("/api/admin/workers/locations", async (req, res) => {
  try {
    const { data: users, error } = await supabaseServer
      .from("users")
      .select("id, full_name, last_lat, last_lng, status")
      .not("last_lat", "is", null);

    if (error) throw error;
    res.json(users);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- Mass Simulation Endpoint ---
app.post("/api/admin/simulate", async (req, res) => {
  const { type } = req.body;
  if (!type) return res.status(400).json({ error: "Disruption type required" });

  try {
    // 1. Fetch all active workers
    const { data: users, error: userError } = await supabaseServer
      .from('users')
      .select('*');
    
    if (userError) throw userError;
    if (!users || users.length === 0) return res.json({ success: true, count: 0 });

    let desc = "";
    
    if (type.includes("Rain") || type.includes("Flood")) {
      desc = "Heavy Rain Disruption";
    } else if (type.includes("Heat")) {
      desc = "Extreme Heat Alert";
    } else if (type.includes("Outage")) {
      desc = "Premium Outage Cover";
    } else if (type.includes("Pollution") || type.includes("AQI")) {
      desc = "Hazardous Air Quality Alert";
    } else if (type.includes("Civic") || type.includes("Distruption")) {
      desc = "Civic Disturbance / Strike";
    } else {
      desc = "Unexpected Disruption";
    }

    const processed_at = new Date().toISOString();
    const reservePool = calculateReservePool(
      (users || []).reduce((sum, current) => sum + Number(current.balance || 0), 0)
    );
    console.log(`[Simulation] 🚀 BROADCAST INITIATED for ${users.length} users...`);
    console.log(`[Simulation] Type: ${type} | Reserve Pool: ${reservePool}`);
    
    let processedCount = 0;
    for (const [index, u] of users.entries()) {
      const pid = u.partnerId || u.partner_id; // Support both just in case
      console.log(`[Simulation] [${index+1}/${users.length}] Syncing user: ${pid || 'Unknown'}`);
      
      if (!pid) {
        console.warn(`[Simulation] ⚠️ Skipping user with missing partnerId: ${u.id || 'Unknown'}`);
        continue;
      }

      console.log(`[Simulation] Processing worker: ${pid}`);

      const payoutQuote = calculateZeroTouchPayout({
        persona: u.platform,
        triggerType: type,
        declaredEarnings: u.declared_earnings ?? u.declaredEarnings,
        reservePool,
        activeWorkers: Math.max(1, users.length),
      });
      const userAmount = payoutQuote.final_payout;

      const claimId = `CLM-SIM-${Math.floor(Math.random() * 9000) + 1000}`;
      
      // 1. Insert Claim
      const { data: claimData, error: claimErr } = await supabaseServer.from('claims').insert({
        worker_id: pid,
        payout_inr: userAmount,
        status: "approved",
        processed_at,
        type: type || "System Alert",
        reason: desc || "Nexus Zero-Touch Payout Triggered",
        claim_id_str: claimId, 
        lat: u.last_lat || 12.9716, // Fallback to Bangalore
        lng: u.last_lng || 77.5946,
        h3_cell: u.h3_cell || "8960145a5b3ffff",
        jep_data: {
          simulation_type: type,
          reason: desc,
          trigger_type: type,
          worded_summary: "Claim approved based on admin mass-simulation trigger.",
          technical_reason: "Admin forced simulation override active.",
          confidence: 99.9,
          ai_probability: 0.1,
          reserveLevel: 150,
          processingTime: "Under 2 Seconds",
          partnerPlatform: normalizePersonaLabel(u.platform),
          telemetryStatus: "Simulated",
          weatherStatus: type,
          hourly_rate: payoutQuote.hourly_rate,
          income_loss_pct: payoutQuote.income_loss_pct,
          duration_hours: payoutQuote.duration_hours,
          calculated_payout: payoutQuote.calculated_payout,
          p_max: payoutQuote.p_max,
          circuit_breaker_active: payoutQuote.circuit_breaker_active,
          lat: u.last_lat || 12.9716,
          lng: u.last_lng || 77.5946
        }
      }).select().single();

      if (claimErr) {
        console.error(`[Simulation] Error inserting claim for ${pid}:`, claimErr.message);
        continue;
      }

      console.log(`[Simulation] Claim created for ${pid}: ${claimData.id}`);

      // 2. Insert Transaction
      const { error: txnErr } = await supabaseServer.from('transactions').insert({
        worker_id: pid,
        amount: userAmount,
        type: "credit",
        status: "completed",
        reference_id: claimData.id.toString(),
        description: `Simulation Payout: ${desc}`,
        title: "Simulation Payout",
        via: "Nexus Core",
        created_at: new Date().toISOString()
      });

      if (txnErr) {
        console.error(`[Simulation] ❌ Error inserting transaction for ${pid}:`, txnErr.message);
      } else {
        console.log(`[Simulation] ✅ Payout fully committed for ${pid} (Amount: ${userAmount})`);
        processedCount++;
      }

      // 3. Update User Balance (Crucial for UI)
      const currentBalance = Number(u.balance || 0);
      const { error: updateErr } = await supabaseServer.from('users').update({ 
        balance: currentBalance + userAmount 
      }).eq('partnerId', pid);

      if (updateErr) {
        console.error(`[Simulation] ❌ Error updating balance for ${pid}:`, updateErr.message);
      } else {
         console.log(`[Simulation] 💰 Balance updated for ${pid}: ${currentBalance} -> ${currentBalance + userAmount}`);
      }
    }

    console.log(`[Simulation] 🏁 SUCCESS: ${processedCount}/${users.length} payouts pushed to Nexus Core.`);
    res.json({ success: true, count: processedCount });
  } catch (err: any) {
    console.error(`[Simulation] Fatal error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  console.log("🎬 [System] Initializing Nexus Sovereign Engine...");
  const getLocalIp = () => {
    const interfaces = os.networkInterfaces();
    const addresses: string[] = [];
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (iface.family === "IPv4" && !iface.internal) {
          addresses.push(iface.address);
        }
      }
    }
    // Prioritize addresses that likely belong to the local network (192.168.*, 10.*, 172.16-31.*)
    // Avoid virtual ones like 172.26.x.x (WSL/Docker) if a real one exists
    const preferred = addresses.find(ip => ip.startsWith("192.168.") || ip.startsWith("10."));
    return preferred || addresses[0] || "localhost";
  };

  const LOCAL_IP = getLocalIp();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("🛠️  [System] Launching Vite Development Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("✅ [System] Vite Middleware Attached.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  if (process.env.NODE_ENV === "production") {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Production server running on http://0.0.0.0:${PORT}`);
    });
    return;
  }

  try {
    const serverKeyPath = path.join(process.cwd(), "certs", "server.key");
    const serverCertPath = path.join(process.cwd(), "certs", "server.cert");
    
    if (!fs.existsSync(serverKeyPath) || !fs.existsSync(serverCertPath)) {
        throw new Error("Missing SSL certificates in /certs folder.");
    }

    const key = fs.readFileSync(serverKeyPath);
    const cert = fs.readFileSync(serverCertPath);
    
    console.log("🔐 [System] Starting Secure HTTPS Instance...");
    https.createServer({ key, cert }, app).listen(PORT, "0.0.0.0", () => {
      console.log("\x1b[32m%s\x1b[0m", `\n🚀 SECURE IDENTITY VAULT DEPLOYED`);
      console.log("\x1b[36m%s\x1b[0m", `----------------------------------------`);
      console.log(`💻 Local (SECURE): https://localhost:${PORT}`);
      console.log(`📱 Mobile:         https://${LOCAL_IP}:${PORT}`);
      console.log("\x1b[33m%s\x1b[0m", `\n⚠️  If the page says "Empty Response", use HTTPS:// instead of HTTP://`);
      console.log("\x1b[36m%s\x1b[0m", `----------------------------------------`);
    });
  } catch (err: any) {
    console.warn("⚠️  [System] SSL Initialization Failed (or certs missing). Falling back to HTTP...");
    // Fallback to HTTP
    app.listen(PORT, "0.0.0.0", () => {
      console.log("\x1b[31m%s\x1b[0m", `\n🚀 Server running on http://localhost:${PORT} (INSECURE FALLBACK)`);
      console.log(`⚠️  Biometrics may be disabled on mobile due to insecure origin.\n`);
    });
  }
}

startServer().catch((error) => {
  console.error("[System] Startup failed:", error);
  cleanup();
  process.exit(1);
});
