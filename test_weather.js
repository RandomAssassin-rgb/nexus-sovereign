import axios from 'axios';
const apiKey = '89e52d025df735faf400f3d059b0ba78';
axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=37.7749&lon=-122.4194&appid=${apiKey}`)
  .then(res => console.log(res.data.weather[0]))
  .catch(err => console.error(err.response ? err.response.data : err.message));
