import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = "http://localhost:3000";

async function verifyMasterSync() {
  console.log("========== MASTER SYNC VERIFICATION ==========\n");

  const testPartnerId = `NEXUS-FINAL-TEST-${Math.floor(Math.random() * 1000)}`;
  
  // 1. Test Registration (Password)
  console.log(`Step 1: Registering test user ${testPartnerId}...`);
  try {
    const regRes = await axios.post(`${API_BASE}/api/auth/register-password`, {
      partnerId: testPartnerId,
      password: "TestPassword123!"
    });
    console.log("✅ Registration endpoint responded successfully.");
  } catch (err: any) {
    console.error("❌ Registration failed:", err.response?.data?.error || err.message);
    if (err.response?.data?.error?.includes('column "aadhaar_number" does not exist')) {
        console.error("⚠️  BLOCKER CONFIRMED: 'aadhaar_number' column is missing in 'users' table.");
    }
  }

  // 2. Test Sync
  console.log(`\nStep 2: Syncing test user ${testPartnerId}...`);
  try {
    const syncRes = await axios.get(`${API_BASE}/api/user/sync?partnerId=${testPartnerId}`);
    console.log("✅ Sync successful.");
    console.log("   User Balance:", syncRes.data.user?.balance);
  } catch (err: any) {
    console.error("❌ Sync failed:", err.response?.data?.error || err.message);
  }

  // 3. Test Simulation
  console.log(`\nStep 3: Triggering simulation for ${testPartnerId}...`);
  try {
    const simRes = await axios.post(`${API_BASE}/api/admin/simulate`, {
      type: "Heavy Rain"
    });
    console.log("✅ Simulation triggered successfully.");
  } catch (err: any) {
    console.error("❌ Simulation failed:", err.response?.data?.error || err.message);
  }

  console.log("\n========== VERIFICATION COMPLETE ==========");
}

verifyMasterSync();
