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
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }); // YYYY-MM-DD

  // The workflow may run several times a day (backup crons). Carry today's earlier
  // added/removed over so a later run doesn't wipe what an earlier one found.
  let prevSummary = null;
  try {
    prevSummary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf-8'));
  } catch (_) {}
  const sameDay = prevSummary && prevSummary.updated_at === today;

  const nextItems = [];

  for (const g of live) {
    const id = String(g.goodsNo);
    liveIds.add(id);
    const finalPrice = g.finalPrice;
    const existing = byId.get(id);

    let lowest = finalPrice;
    let recordLowDate = null;
    if (existing) {
      const prevLowest = existing.lowest_price ?? finalPrice;
      lowest = Math.min(prevLowest, finalPrice);
      recordLowDate = existing.record_low_date || null;
      // A record low means the price actually dropped BELOW the previous lowest —
      // an unchanged price (equal to the lowest) is not a new record.
      if (finalPrice < prevLowest) recordLowDate = today;
    }

    nextItems.push({
      id,
      name: g.goodsName,
      brand: g.brandName,
      url: g.goodsLinkUrl,
      price: finalPrice,
      lowest_price: lowest,
      discount_pct: g.finalDiscount || 0,
      record_low_date: recordLowDate,
    });
  }

  const brief = (i) => ({ id: i.id, name: i.name });
  const mergeById = (a, b) => {
    const m = new Map();
    [...a, ...b].forEach((i) => m.set(i.id, i));
    return [...m.values()];
  };

  let removed = current.items.filter((it) => !liveIds.has(it.id)).map(brief);
  let added = nextItems.filter((it) => !byId.has(it.id)).map(brief);
  if (sameDay) {
    added = mergeById(prevSummary.added || [], added).filter((i) => liveIds.has(i.id));
    removed = mergeById(prevSummary.removed || [], removed).filter((i) => !liveIds.has(i.id));
  }

  // Record lows set today (by this run or an earlier run today), only while the
  // price is still at that record.
  const recordLows = nextItems.filter(
    (i) => i.record_low_date === today && i.price === i.lowest_price
  );

  const out = { updated_at: today, checked_at: new Date().toISOString(), items: nextItems };
  fs.writeFileSync(PRICES_PATH, JSON.stringify(out, null, 2) + '\n');

  const summary = {
    updated_at: today,
    checked_at: out.checked_at,
    added,
    removed,
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
