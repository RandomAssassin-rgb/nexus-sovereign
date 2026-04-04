<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your Nexus Sovereign app

This contains everything you need to run your app locally.

## Run Locally

**Prerequisites:** Node.js, Vercel CLI access for serverless API testing

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env.local` and fill in the required keys.
3. Start the Vercel API server in one terminal:
   `npm run dev:vercel`
4. Start the frontend in another terminal:
   `npm run dev`

The frontend proxies `/api` to `http://localhost:3000` by default, which matches `vercel dev`.

## Alternate Local API Mode

If you want to test against the custom Express server in `server_dev.ts`, run:

`npm run dev:server`

That server may use HTTPS depending on your local cert setup. When using it, set:

`VITE_API_PROXY_TARGET=https://localhost:3000`
