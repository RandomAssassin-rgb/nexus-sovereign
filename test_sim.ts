import axios from 'axios';
import https from 'https';

async function test() {
  const partnerId = "TEST_WORKER_SIM_" + Date.now();
  
  const instance = axios.create({
    baseURL: "https://localhost:3000",
    httpsAgent: new https.Agent({  
      rejectUnauthorized: false
    })
  });

  console.log("Registering use...");
  await instance.post("/api/auth/register-user", {
    partnerId,
    phone: "+91 99" + Math.floor(Math.random() * 90000000 + 10000000),
    platform: "Blinkit",
    method: "phone"
  });

  console.log("Calling simulate...");
  const sim = await instance.post("/api/admin/simulate", { type: "Platform Outage" });
  console.log("Simulate response:", sim.data);

  console.log("Syncing as worker...");
  const sync = await instance.get(`/api/user/sync?partnerId=${partnerId}`);
  console.log("Sync claims:", sync.data.claims);
  console.log("Sync txns:", sync.data.transactions);
}

test().catch(e => console.error(e.response ? e.response.data : e.message));
