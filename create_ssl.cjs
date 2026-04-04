const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');

const CERTS_DIR = path.join(process.cwd(), "certs");
if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR);
}

console.log("Generating SSL certificates for localhost...");

const attrs = [{ name: 'commonName', value: 'localhost' }];
const pems = selfsigned.generate(attrs, { days: 365 });

fs.writeFileSync(path.join(CERTS_DIR, "server.key"), pems.private);
fs.writeFileSync(path.join(CERTS_DIR, "server.cert"), pems.cert);

console.log("Success! Certificates created in ./certs/");
