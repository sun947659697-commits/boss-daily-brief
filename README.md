# Boss Daily Brief PWA

Boss V0.1 is a local-first PWA for recording daily sales and turning them into a simple owner brief.

## Features

- Daily sales, price, cost, weather, traffic, staff, inventory, returning customer, promo, and note records
- Revenue and profit calculation
- Previous record and same-day-last-week comparison
- 30-day owner K-line trend chart
- One recommended action for the day
- Risk and evidence lists
- CSV import and export
- Offline support and installable PWA shell

## Run locally

```bash
npm test
npm run serve
```

Open `http://localhost:8080` in a browser.

## Deploy on Cloudflare Pages

Use these settings:

- Framework preset: `None`
- Build command: leave empty
- Build output directory: `/`

If this folder is inside a larger repository, set the Cloudflare root directory to `boss-pwa`.
