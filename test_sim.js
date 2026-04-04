import axios from 'axios';

async function test() {
  const partnerId = "TEST_WORKER_SIM_" + Date.now();
  
  console.log("Registering use...");
  await axios.post("http://localhost:8005/api/auth/register-user", {
    partnerId,
    platform: "TestPlatform",
    method: "password"
  });

  console.log("Calling simulate...");
  const sim = await axios.post("http://localhost:8005/api/admin/simulate", { type: "Platform Outage" });
  console.log("Simulate response:", sim.data);

  console.log("Syncing as worker...");
  const sync = await axios.get(`http://localhost:8005/api/user/sync?partnerId=${partnerId}`);
  console.log("Sync claims:", sync.data.claims);
  console.log("Sync txns:", sync.data.transactions);
}

test().catch(e => console.error(e.response ? e.response.data : e.message));
