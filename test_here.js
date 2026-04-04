import axios from 'axios';
const apiKey = 'kKy_iWucQLPXZv0tcQlU6iF9rUcK1GLHiayXH7QEQhQ';
const latNum = 37.7749;
const lonNum = -122.4194;
const bbox = `${lonNum - 0.05},${latNum - 0.05},${lonNum + 0.05},${latNum + 0.05}`;
axios.get(`https://data.traffic.hereapi.com/v7/flow?locationReferencing=shape&in=bbox:${bbox}&apiKey=${apiKey}`)
  .then(res => console.log(res.data.results[0].currentFlow))
  .catch(err => console.error(err.message));
