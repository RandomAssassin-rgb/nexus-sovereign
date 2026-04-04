const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

async function testAPIs() {
  console.log("Testing OpenWeather...");
  try {
    const res1 = await axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=12.9716&lon=77.5946&appid=${process.env.VITE_OPENWEATHER_API_KEY}`);
    console.log("✅ OpenWeather: Success", res1.data.weather[0].main);
  } catch(e) { console.log("❌ OpenWeather: Failed", e.response?.status, e.response?.data?.message); }

  console.log("Testing AQI...");
  try {
    const res2 = await axios.get(`https://api.waqi.info/feed/geo:12.9716;77.5946/?token=${process.env.AQI_TOKEN}`);
    if(res2.data.status === 'ok') console.log("✅ AQI: Success", res2.data.data.aqi);
    else console.log("❌ AQI: Failed", res2.data.data);
  } catch(e) { console.log("❌ AQI: Failed"); }

  console.log("Testing HERE Traffic...");
  try {
    const res3 = await axios.get(`https://data.traffic.hereapi.com/v7/flow?locationReferencing=shape&in=bbox:77.5446,12.9216,77.6446,13.0216&apiKey=${process.env.HERE_TRAFFIC_API_KEY}`);
    console.log("✅ HERE Traffic: Success", res3.data.results?.length, "results");
  } catch(e) { console.log("❌ HERE Traffic: Failed", e.response?.status, e.response?.data?.error); }
  
  console.log("Testing MapBox Token...");
  try {
    const res4 = await axios.get(`https://api.mapbox.com/geocoding/v5/mapbox.places/77.5946,12.9716.json?access_token=${process.env.VITE_MAPBOX_TOKEN}`);
    console.log("✅ MapBox: Success", res4.data.features[0]?.place_name);
  } catch(e) { console.log("❌ MapBox: Failed", e.response?.status, e.response?.data?.message); }

}
testAPIs();
