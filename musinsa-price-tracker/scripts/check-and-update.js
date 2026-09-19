// Musinsa wishlist price check — runs on GitHub Actions (real, unrestricted internet).
// Fetches the live wishlist via Musinsa's public share-folder API (no login/browser needed),
// reconciles add/remove against data/prices.json, updates price/lowest_price/discount_pct,
// and writes data/last_run_summary.json so the downstream Claude cloud routine can alert
// on record-low prices without ever needing to reach musinsa.com itself.

const fs = require('fs');
const path = require('path');

const FOLDER_ID = '405464';
const DATA_DIR = path.join(__dirname, '..', 'data');
const PRICES_PATH = path.join(DATA_DIR, 'prices.json');
const SUMMARY_PATH = path.join(DATA_DIR, 'last_run_summary.json');

async function fetchAllGoods() {
  let url = `https://like.musinsa.com/api2/like/like-page/v1/share/folders/${FOLDER_ID}/goods`;
  const items = [];
  while (url) {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`wishlist fetch failed: HTTP ${res.status}`);
    const json = await res.json();
    items.push(...json.data);
    url = json.link && json.link.next ? json.link.next : null;
  }
  return items;
}

async function main() {
  const live = await fetchAllGoods();
  const current = JSON.parse(fs.readFileSync(PRICES_PATH, 'utf-8'));
  const byId = new Map(current.items.map((it) => [it.id, it]));
  const liveIds = new Set();

  const nextItems = [];
  const recordLows = [];

  for (const g of live) {
    const id = String(g.goodsNo);
    liveIds.add(id);
    const finalPrice = g.finalPrice;
    const existing = byId.get(id);
    const prevLowest = existing ? existing.lowest_price : finalPrice;
    const lowest = Math.min(prevLowest, finalPrice);
    const isRecordLow = finalPrice <= prevLowest;

    const item = {
      id,
      name: g.goodsName,
      brand: g.brandName,
      url: g.goodsLinkUrl,
      price: finalPrice,
      lowest_price: lowest,
      discount_pct: g.finalDiscount || 0,
    };
    nextItems.push(item);
    if (isRecordLow) recordLows.push(item);
  }

  const removed = current.items.filter((it) => !liveIds.has(it.id));
  const added = nextItems.filter((it) => !byId.has(it.id));

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD
  const out = { updated_at: today, items: nextItems };
  fs.writeFileSync(PRICES_PATH, JSON.stringify(out, null, 2) + '\n');

  const summary = {
    updated_at: today,
    added: added.map((i) => ({ id: i.id, name: i.name })),
    removed: removed.map((i) => ({ id: i.id, name: i.name })),
    record_lows: recordLows.map((i) => ({
      id: i.id,
      name: i.name,
      brand: i.brand,
      price: i.price,
      url: i.url,
    })),
  };
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2) + '\n');

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
