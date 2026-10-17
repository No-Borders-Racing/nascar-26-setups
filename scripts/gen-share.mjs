// Writes one tiny page per setup into share/, so link previews (Discord, Facebook, X...) can show the track and setup name.
// Real visitors are sent straight on to the app. Run by .github/workflows/share-pages.yml.
import fs from 'node:fs';
import path from 'node:path';

const URL_ = process.env.SB_URL || 'https://kvpcqovybreewxqrqmtx.supabase.co';
const KEY = process.env.SB_KEY || 'sb_publishable_QiGe5hropqL5qc77wHpiwQ_b8NzwS0l';
const MOCK = process.env.SB_MOCK; // test only: path to a JSON file {setups:[],profiles:[]}
const OUT = process.env.OUT_DIR || 'share';

async function get(table, select) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${URL_}/rest/v1/${table}?select=${select}&order=id`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Range: `${from}-${from + 999}` },
    });
    if (!r.ok) throw new Error(`${table}: HTTP ${r.status}`);
    const part = await r.json();
    rows.push(...part);
    if (part.length < 1000) return rows;
  }
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SERIES = [[/cup/i, 'NASCAR Cup Series'], [/o.?reilly|xfinity/i, "NASCAR O'Reilly Auto Parts Series"], [/truck|craftsman/i, 'NASCAR Craftsman Truck Series'], [/arca/i, 'ARCA Menards Series']];
const seriesName = s => (SERIES.find(([re]) => re.test(s || '')) || [0, s || 'NASCAR 26'])[1];

let setups, profiles;
if (MOCK) ({ setups, profiles } = JSON.parse(fs.readFileSync(MOCK, 'utf8')));
else [setups, profiles] = await Promise.all([get('setups', 'id,track,series,tuned_by,user_id,seeded'), get('profiles', 'id,name')]);

const names = Object.fromEntries(profiles.map(p => [p.id, p.name]));
fs.mkdirSync(OUT, { recursive: true });
const keep = new Set();
let changed = 0;

for (const s of setups) {
  if (!/^[0-9a-f-]{36}$/i.test(s.id)) continue;
  const by = s.seeded ? 'Admin' : names[s.user_id] || '';
  const title = `${s.track} - ${s.tuned_by || 'Setup'}`;
  const desc = `${seriesName(s.series)} setup for ${s.track}${by ? ', shared by ' + by : ''}. NASCAR 26 setups from No Borders Racing.`;
  const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} | No Borders Racing</title>
<meta name="robots" content="noindex">
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="No Borders Racing">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<script>location.replace('../?setup=${s.id}')</script>
<noscript><meta http-equiv="refresh" content="0;url=../?setup=${s.id}"></noscript>
</head><body><p><a href="../?setup=${s.id}">Open this setup: ${esc(title)}</a></p></body></html>
`;
  const file = path.join(OUT, `${s.id}.html`);
  keep.add(`${s.id}.html`);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== page) { fs.writeFileSync(file, page); changed++; }
}
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.html') && !keep.has(f)) { fs.unlinkSync(path.join(OUT, f)); changed++; }
console.log(`${keep.size} setup pages, ${changed} written or removed`);
