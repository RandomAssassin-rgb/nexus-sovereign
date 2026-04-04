const axios = require('axios');
const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config();

async function testAPIs() {
  const log = [];
  
  log.push("Testing OpenRouter...");
  try {
    const res5 = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
      model: "google/gemini-2.5-flash-8b",
      messages: [{ "role": "user", "content": "1+1=" }]
    }, {
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    });
    log.push("✅ OpenRouter: Success " + res5.data.choices[0].message.content);
  } catch(e) { log.push("❌ OpenRouter: Failed " + e.response?.status + " " + e.response?.data?.error?.message); }

  fs.writeFileSync('api_results.txt', log.join('\n'), 'utf8');
}
testAPIs();
