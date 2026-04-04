const TEST_PARTNER_ID = "TEST_SYNC_" + Math.random().toString(36).substring(2, 7);

async function testSync() {
    console.log(`--- Testing Sync for ${TEST_PARTNER_ID} ---`);
    const baseUrl = "https://localhost:3000";
    
    // 1. Initial sync (should create user)
    console.log("1. Initial sync...");
    const syncRes = await fetch(`${baseUrl}/api/user/sync?partnerId=${TEST_PARTNER_ID}`, { cache: 'no-store' });
    const syncData = await syncRes.json();
    console.log("Sync response balance:", syncData.user.balance);

    // 2. Add a transaction and update balance
    console.log("2. Updating wallet...");
    const updateRes = await fetch(`${baseUrl}/api/wallet/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            partnerId: TEST_PARTNER_ID,
            balance: 5000,
            transaction: {
                title: "Test Sync Top-up",
                desc: "Cloud sync verification",
                amount: 1550,
                type: "credit",
                via: "Nexus Cloud Sync Test"
            }
        })
    });
    console.log("Update success:", (await updateRes.json()).success);

    // 3. Sync again to verify
    console.log("3. Verifying sync...");
    const verifyRes = await fetch(`${baseUrl}/api/user/sync?partnerId=${TEST_PARTNER_ID}`, { cache: 'no-store' });
    const verifyData = await verifyRes.json();
    console.log("Verified balance:", verifyData.user.balance);
    console.log("Latest transaction:", verifyData.transactions[0]?.title);
    
    if (verifyData.user.balance === 5000 && verifyData.transactions[0]?.title === "Test Sync Top-up") {
        console.log("✅ CLOUD SYNC TEST PASSED");
    } else {
        console.error("❌ CLOUD SYNC TEST FAILED");
    }
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
testSync();
