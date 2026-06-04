// Rove Haven — Unit Onboarding Checklist
// Railway · Notion backend · Per-unit URLs (/:slug)
// ─────────────────────────────────────────────────────────────────

const express = require('express');
const { Client } = require('@notionhq/client');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const notion    = new Client({ auth: process.env.NOTION_TOKEN });
const UNITS_DB  = process.env.NOTION_UNITS_DB_ID;
const CHECKS_DB = process.env.NOTION_CHECKLISTS_DB_ID;

// ── file upload (PDF / JPG only, 10 MB max) ───────────────────────
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    const ok = ['application/pdf', 'image/jpeg', 'image/jpg'].includes(file.mimetype) ||
               /\.(pdf|jpg|jpeg)$/i.test(file.originalname);
    cb(ok ? null : new Error('Only PDF or JPG allowed'), ok);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOAD_DIR));

// ── helpers ──────────────────────────────────────────────────────
function txt(prop) {
  if (!prop) return '';
  if (prop.type === 'title')       return prop.title.map(t => t.plain_text).join('');
  if (prop.type === 'rich_text')   return prop.rich_text.map(t => t.plain_text).join('');
  if (prop.type === 'number')      return prop.number ?? '';
  if (prop.type === 'select')      return prop.select?.name ?? '';
  if (prop.type === 'checkbox')    return prop.checkbox;
  if (prop.type === 'url')         return prop.url ?? '';
  if (prop.type === 'phone_number')return prop.phone_number ?? '';
  if (prop.type === 'email')       return prop.email ?? '';
  return '';
}
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function getUnit(slug) {
  if (!UNITS_DB) return null;
  try {
    const r = await notion.databases.query({
      database_id: UNITS_DB,
      filter: { property: 'Slug', rich_text: { equals: slug } },
      page_size: 1
    });
    return r.results[0] ?? null;
  } catch { return null; }
}

async function getChecks(slug) {
  if (!CHECKS_DB) return {};
  try {
    const r = await notion.databases.query({
      database_id: CHECKS_DB,
      filter: { property: 'Unit', rich_text: { equals: slug } },
      page_size: 1
    });
    if (!r.results[0]) return {};
    const out = {};
    for (const [k, v] of Object.entries(r.results[0].properties)) {
      if (v.type === 'checkbox') out[k] = v.checkbox;
      if (v.type === 'rich_text') out[k] = txt(v);
    }
    return out;
  } catch { return {}; }
}

async function saveChecks(slug, body) {
  if (!CHECKS_DB) return;
  try {
    const r = await notion.databases.query({
      database_id: CHECKS_DB,
      filter: { property: 'Unit', rich_text: { equals: slug } },
      page_size: 1
    });
    const props = {};
    for (const [k, v] of Object.entries(body)) {
      if (k === 'Unit') continue;
      props[k] = { checkbox: v === true || v === 'true' || v === '1' };
    }
    if (r.results[0]) {
      await notion.pages.update({ page_id: r.results[0].id, properties: props });
    } else {
      await notion.pages.create({
        parent: { database_id: CHECKS_DB },
        properties: { Unit: { title: [{ text: { content: slug } }] }, ...props }
      });
    }
  } catch(e) { console.error('saveChecks:', e.message); }
}

// ── routes ────────────────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ ok: true }));

// Save checklist checkboxes
app.post('/:slug/save', async (req, res) => {
  await saveChecks(req.params.slug, req.body);
  res.json({ ok: true });
});

// Upload a document
app.post('/:slug/upload/:docKey', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No valid file' });
  res.json({
    ok: true,
    filename: req.file.originalname,
    url: `/uploads/${req.file.filename}`
  });
});

// Main checklist page
app.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  const page   = await getUnit(slug);
  const checks = await getChecks(slug);
  const p      = page?.properties ?? {};

  const u = {
    unitName:           txt(p['Unit Name'])          || txt(p['Name']) || slug.toUpperCase(),
    buildingName:       txt(p['Building Name'])      || '',
    tower:              txt(p['Tower / Wing'])        || '',
    floor:              txt(p['Floor'])               || '',
    unitNumber:         txt(p['Unit Number'])         || '',
    community:          txt(p['Community / Area'])    || '',
    city:               txt(p['City'])                || 'Dubai',
    dtcmPermit:         txt(p['DTCM Permit #'])       || '',
    dtcmExpiry:         txt(p['DTCM Expiry'])         || '',
    managementStart:    txt(p['Management Start'])    || '',
    contractEnd:        txt(p['Contract End'])        || '',
    ownerName:          txt(p['Owner Name'])          || '',
    ownerNationality:   txt(p['Owner Nationality'])   || '',
    ownerPhone:         txt(p['Owner Phone'])         || '',
    ownerEmail:         txt(p['Owner Email'])         || '',
    ownerAddress:       txt(p['Owner Address'])       || '',
    ownerBankName:      txt(p['Bank Name'])           || '',
    ownerIBAN:          txt(p['IBAN'])                || '',
    ownerAccountName:   txt(p['Account Name'])        || '',
    doorCode:           txt(p['Door Code'])           || '',
    keyboxCode:         txt(p['Keybox Code'])         || '',
    keyboxLocation:     txt(p['Keybox Location'])     || '',
    parkingBay:         txt(p['Parking Bay #'])       || '',
    parkingFloor:       txt(p['Parking Floor'])       || '',
    gateRemote:         txt(p['Gate Remote'])         || '',
    visitorParking:     txt(p['Visitor Parking'])     || '',
    wifiName:           txt(p['WiFi Name'])           || '',
    wifiPassword:       txt(p['WiFi Password'])       || '',
    wifiName2:          txt(p['WiFi Name 2'])         || '',
    wifiPassword2:      txt(p['WiFi Password 2'])     || '',
    internetProvider:   txt(p['Internet Provider'])   || '',
    maxGuests:          txt(p['Max Guests'])          || '',
    bedrooms:           txt(p['Bedrooms'])            || '',
    bathrooms:          txt(p['Bathrooms'])           || '',
    kingBeds:           txt(p['King Beds'])           || '',
    queenBeds:          txt(p['Queen Beds'])          || '',
    twinBeds:           txt(p['Twin Beds'])           || '',
    sofabed:            txt(p['Sofabed'])             || '',
    acBrand:            txt(p['AC Brand'])            || '',
    washerBrand:        txt(p['Washer Brand'])        || '',
    dryer:              txt(p['Dryer'])               || '',
    dishwasher:         txt(p['Dishwasher'])          || '',
    ovenType:           txt(p['Oven Type'])           || '',
    microwave:          txt(p['Microwave'])           || '',
    coffeeMachine:      txt(p['Coffee Machine'])      || '',
    tvBrand:            txt(p['TV Brand / Size'])     || '',
    utilityProvider:    txt(p['Utility Provider'])    || 'DEWA',
    utilityAccount:     txt(p['Utility Account #'])   || '',
    gasConnection:      txt(p['Gas Connection'])      || '',
    hasPool:            txt(p['Pool'])                || '',
    hasGym:             txt(p['Gym'])                 || '',
    hasConcierge:       txt(p['Concierge'])           || '',
    buildingMgmt:       txt(p['Building Management']) || '',
    maintenanceContact: txt(p['Maintenance Contact']) || '',
    conciergeDirect:    txt(p['Concierge Direct #'])  || '',
    minStay:            txt(p['Min Stay (nights)'])   || '',
    checkinTime:        txt(p['Check-in Time'])       || '3:00 PM',
    checkoutTime:       txt(p['Check-out Time'])      || '11:00 AM',
    lateCheckout:       txt(p['Late Checkout Policy'])|| '',
    propertyManager:    txt(p['Property Manager'])    || 'Rove Haven',
    emergencyContact:   txt(p['Emergency Contact'])   || '',
    airbnbUrl:          txt(p['Airbnb URL'])          || '',
    bookingUrl:         txt(p['Booking.com URL'])     || '',
    vrboUrl:            txt(p['Vrbo URL'])            || '',
    bayutUrl:           txt(p['Bayut URL'])           || '',
    bluegroundUrl:      txt(p['Blueground URL'])      || '',
    notes:              txt(p['Special Notes'])       || '',
  };

  res.send(renderPage(slug, u, checks));
});

// ── template ──────────────────────────────────────────────────────
function chk(checks, key) { return checks[key] ? 'checked' : ''; }
function done(checks, key) { return checks[key] ? 'chk-done' : ''; }

function renderPage(slug, u, checks) {
  const now = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });

  // Landlord document list
  const DOCS = [
    { key: 'doc_management_agreement', label: 'Signed Management Agreement' },
    { key: 'doc_title_deed',           label: 'Title Deed / Ownership Certificate' },
    { key: 'doc_owner_passport',       label: "Owner's Passport Copy" },
    { key: 'doc_owner_eid',            label: "Owner's Emirates ID" },
    { key: 'doc_dtcm_permit',          label: 'DTCM Tourism Permit' },
    { key: 'doc_building_noc',         label: 'Building NOC / Strata Approval' },
    { key: 'doc_property_insurance',   label: 'Property Insurance Certificate' },
    { key: 'doc_dewa_account',         label: 'DEWA / Utility Account Screenshot' },
    { key: 'doc_bank_details',         label: "Owner's Bank Details (IBAN letter)" },
    { key: 'doc_floor_plan',           label: 'Floor Plan / Unit Layout' },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rove Haven — ${esc(u.unitName)} Onboarding</title>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
html { font-size:15px; }
body { background:#0d1824; color:#e9ddc1; font-family:'Helvetica Neue',Arial,sans-serif; }

.page { max-width:900px; margin:0 auto; padding:0 20px 80px; }

/* HEADER */
.header { display:flex; align-items:center; justify-content:space-between; padding:28px 0 22px; border-bottom:1px solid rgba(212,183,106,.25); margin-bottom:32px; }
.logo-wrap { display:flex; align-items:center; }
.brand { font-family:Georgia,serif; font-size:22px; color:#d4b76a; letter-spacing:3px; }
.tagline { font-size:10px; letter-spacing:3px; color:rgba(233,221,193,.5); text-transform:uppercase; margin-top:3px; }
.header-right { text-align:right; }
.unit-badge { display:inline-block; padding:5px 14px; border:1px solid rgba(212,183,106,.4); font-size:11px; letter-spacing:2px; color:#d4b76a; text-transform:uppercase; }
.date-stamp { font-size:11px; color:rgba(233,221,193,.35); margin-top:5px; }

/* HERO */
.hero { padding:36px 0 28px; border-bottom:1px solid rgba(212,183,106,.12); margin-bottom:28px; }
.hero-eyebrow { font-size:10px; letter-spacing:3px; text-transform:uppercase; color:#d4b76a; margin-bottom:10px; }
.hero-title { font-family:Georgia,serif; font-size:42px; color:#f1e5c4; font-weight:400; }
.hero-sub { font-size:13px; color:rgba(233,221,193,.5); letter-spacing:1px; text-transform:uppercase; margin-top:7px; }
.hero-status { margin-top:16px; display:flex; align-items:center; gap:10px; }
.status-dot { width:8px; height:8px; border-radius:50%; background:#4caf50; }
.status-label { font-size:12px; color:rgba(233,221,193,.6); }

/* SAVE BAR */
.save-bar { display:flex; align-items:center; gap:12px; padding:12px 16px; background:rgba(0,0,0,.3); border:1px solid rgba(212,183,106,.18); border-radius:4px; margin-bottom:28px; flex-wrap:wrap; }
.save-status { flex:1; font-size:12px; color:#d4b76a; min-width:100px; }

/* CARD */
.sections { display:flex; flex-direction:column; gap:24px; }
.card { background:rgba(255,255,255,.03); border:1px solid rgba(212,183,106,.16); border-radius:6px; overflow:hidden; }
.card-head { display:flex; align-items:flex-start; gap:16px; padding:22px 24px 18px; border-bottom:1px solid rgba(212,183,106,.1); background:rgba(212,183,106,.04); }
.sec-num { font-family:Georgia,serif; font-size:28px; color:rgba(212,183,106,.3); font-weight:400; line-height:1; flex-shrink:0; width:36px; margin-top:2px; }
.sec-title { font-family:Georgia,serif; font-size:20px; color:#f1e5c4; font-weight:400; }
.sec-sub { font-size:12px; color:rgba(233,221,193,.45); margin-top:3px; }
.prog-ring { width:46px; height:46px; flex-shrink:0; margin-left:auto; }
.ring-svg { width:46px; height:46px; }
.ring-txt { font-size:8px; fill:#d4b76a; font-family:'Helvetica Neue',Arial,sans-serif; }

/* SUB SECTIONS */
.sub { padding:18px 24px; border-bottom:1px solid rgba(212,183,106,.07); }
.sub:last-of-type { border-bottom:none; }
.sub-lbl { font-size:10px; letter-spacing:2.5px; text-transform:uppercase; color:#d4b76a; margin-bottom:14px; }

/* FIELDS */
.fgrid { display:grid; grid-template-columns:1fr 1fr; gap:12px 20px; }
.fgrid-3 { grid-template-columns:1fr 1fr 1fr; }
.fgrid-4 { grid-template-columns:1fr 1fr 1fr 1fr; }
@media(max-width:600px) { .fgrid,.fgrid-3,.fgrid-4 { grid-template-columns:1fr; } }
.fw { display:flex; flex-direction:column; gap:5px; }
.fl { font-size:11px; color:rgba(233,221,193,.48); text-transform:uppercase; letter-spacing:1px; }
.fi {
  background:rgba(255,255,255,.05); border:1px solid rgba(212,183,106,.2); border-radius:3px;
  padding:9px 12px; color:#f1e5c4; font-size:14px;
  font-family:'Helvetica Neue',Arial,sans-serif; outline:none; transition:border-color .2s;
}
.fi:focus { border-color:rgba(212,183,106,.6); background:rgba(212,183,106,.05); }
.fi::placeholder { color:rgba(233,221,193,.22); }
.fta { width:100%; min-height:80px; resize:vertical; }
.card-foot { padding:14px 24px; text-align:right; border-top:1px solid rgba(212,183,106,.08); }

/* CHECKLIST */
.chklist { padding:8px 24px 14px; display:flex; flex-direction:column; gap:2px; }
.grp-lbl { font-size:10px; letter-spacing:2px; text-transform:uppercase; color:rgba(212,183,106,.55); padding:12px 24px 4px; }
.chk-row { display:flex; align-items:center; gap:12px; padding:9px 12px; border-radius:4px; cursor:pointer; transition:background .15s; }
.chk-row:hover { background:rgba(212,183,106,.05); }
.chk-row.chk-done .chk-lbl { text-decoration:line-through; color:rgba(233,221,193,.38); }
.chk-in { display:none; }
.chk-box { width:18px; height:18px; flex-shrink:0; border:1.5px solid rgba(212,183,106,.38); border-radius:3px; position:relative; transition:all .2s; }
.chk-in:checked + .chk-box { background:#d4b76a; border-color:#d4b76a; }
.chk-in:checked + .chk-box::after { content:''; position:absolute; left:4px; top:1px; width:6px; height:10px; border-right:2px solid #0d1824; border-bottom:2px solid #0d1824; transform:rotate(45deg); }
.chk-lbl { font-size:14px; color:rgba(233,221,193,.82); line-height:1.4; }

/* DOCUMENT UPLOAD */
.doc-list { padding:8px 24px 20px; display:flex; flex-direction:column; gap:10px; }
.doc-row { display:flex; align-items:center; gap:14px; padding:12px 16px; background:rgba(255,255,255,.03); border:1px solid rgba(212,183,106,.12); border-radius:4px; }
.doc-icon { width:36px; height:36px; flex-shrink:0; border:1px solid rgba(212,183,106,.25); border-radius:3px; display:flex; align-items:center; justify-content:center; font-size:14px; color:#d4b76a; }
.doc-info { flex:1; min-width:0; }
.doc-name { font-size:13px; color:#f1e5c4; font-weight:500; }
.doc-filename { font-size:11px; color:rgba(233,221,193,.45); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.doc-status { flex-shrink:0; }
.badge-pending { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border:1px solid rgba(233,165,0,.4); border-radius:20px; font-size:11px; color:rgba(233,165,0,.9); letter-spacing:.5px; }
.badge-uploaded { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border:1px solid rgba(76,175,80,.5); border-radius:20px; font-size:11px; color:rgba(76,175,80,1); letter-spacing:.5px; }
.badge-dot { width:6px; height:6px; border-radius:50%; }
.badge-pending .badge-dot { background:rgba(233,165,0,.9); }
.badge-uploaded .badge-dot { background:#4caf50; }
.upload-btn { flex-shrink:0; position:relative; cursor:pointer; }
.upload-btn input[type=file] { position:absolute; inset:0; opacity:0; cursor:pointer; width:100%; }
.upload-trigger { padding:6px 14px; border:1px solid rgba(212,183,106,.35); border-radius:3px; font-size:12px; color:#d4b76a; cursor:pointer; background:transparent; transition:all .2s; white-space:nowrap; }
.upload-trigger:hover { border-color:#d4b76a; background:rgba(212,183,106,.08); }
.doc-view { font-size:11px; color:#d4b76a; text-decoration:none; margin-left:6px; }
.doc-view:hover { text-decoration:underline; }

/* BUTTONS */
.btn-gold { background:#d4b76a; color:#0d1824; border:none; border-radius:3px; padding:10px 20px; font-size:13px; font-weight:600; letter-spacing:.5px; cursor:pointer; transition:background .2s; }
.btn-gold:hover { background:#e8c97a; }
.btn-outline { background:transparent; color:#d4b76a; border:1px solid rgba(212,183,106,.45); border-radius:3px; padding:10px 20px; font-size:13px; cursor:pointer; transition:all .2s; }
.btn-outline:hover { border-color:#d4b76a; }
.btn-sm { padding:7px 14px; font-size:12px; }

/* FOOTER */
.footer { text-align:center; padding:40px 0 20px; border-top:1px solid rgba(212,183,106,.1); margin-top:40px; }
.footer-brand { font-family:Georgia,serif; font-size:16px; color:#d4b76a; letter-spacing:3px; }
.footer-sub { font-size:11px; color:rgba(233,221,193,.3); margin-top:6px; letter-spacing:1px; }

/* PRINT */
@media print {
  body { background:white; color:#111; }
  .save-bar,.card-foot { display:none; }
  .card { border-color:#ccc; }
  .fi { border-color:#ccc; color:#111; background:white; }
  .doc-row { border-color:#ccc; background:white; }
}
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <header class="header">
    <div class="logo-wrap">
      <div>
        <div class="brand">ROVE HAVEN</div>
        <div class="tagline">Property Management · Dubai</div>
      </div>
    </div>
    <div class="header-right">
      <div class="unit-badge">${esc(slug.toUpperCase())}</div>
      <div class="date-stamp">Updated ${now}</div>
    </div>
  </header>

  <!-- HERO -->
  <div class="hero">
    <div class="hero-eyebrow">Unit Onboarding Checklist</div>
    <div class="hero-title">${esc(u.unitName)}</div>
    <div class="hero-sub">${[u.buildingName, u.community, u.city].filter(Boolean).join(' · ')}</div>
    <div class="hero-status">
      <div class="status-dot"></div>
      <div class="status-label">Onboarding in progress</div>
    </div>
  </div>

  <!-- SAVE BAR -->
  <div class="save-bar">
    <span id="save-status" class="save-status"></span>
    <button class="btn-gold btn-sm" onclick="saveAll()">Save Progress</button>
    <button class="btn-outline btn-sm" onclick="window.print()">Print / PDF</button>
  </div>

  <div class="sections">

  <!-- ══════════════════════════════════════════════
       01  UNIT DETAILS
  ══════════════════════════════════════════════ -->
  <section class="card">
    <div class="card-head">
      <div class="sec-num">01</div>
      <div>
        <div class="sec-title">Unit Details</div>
        <div class="sec-sub">Property profile — all fields are editable</div>
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Property Information</div>
      <div class="fgrid">
        ${f('Unit Name',        'unitName',       u.unitName,       'e.g. Nada 402')}
        ${f('Building Name',    'buildingName',   u.buildingName,   'e.g. Nada Residences')}
        ${f('Tower / Wing',     'tower',          u.tower,          'e.g. Tower B')}
        ${f('Floor',            'floor',          u.floor,          'e.g. 4')}
        ${f('Unit Number',      'unitNumber',     u.unitNumber,     'e.g. 402')}
        ${f('Community / Area', 'community',      u.community,      'e.g. JVC, Arjan, DIFC')}
        ${f('City',             'city',           u.city,           'Dubai')}
        ${f('DTCM Permit #',    'dtcmPermit',     u.dtcmPermit,     'Tourism licence number')}
        ${f('DTCM Expiry',      'dtcmExpiry',     u.dtcmExpiry,     'DD/MM/YYYY')}
        ${f('Management Start', 'managementStart',u.managementStart,'DD/MM/YYYY')}
        ${f('Contract End',     'contractEnd',    u.contractEnd,    'DD/MM/YYYY')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Owner Information</div>
      <div class="fgrid">
        ${f('Owner Full Name',    'ownerName',        u.ownerName,        'Full legal name')}
        ${f('Nationality',        'ownerNationality', u.ownerNationality, 'e.g. British, Emirati')}
        ${f('Owner Phone (WhatsApp)', 'ownerPhone',   u.ownerPhone,       '+971 50 000 0000')}
        ${f('Owner Email',        'ownerEmail',       u.ownerEmail,       'email@example.com')}
        ${f('Owner Address',      'ownerAddress',     u.ownerAddress,     'Home / mailing address')}
        ${f('Property Manager',   'propertyManager',  u.propertyManager,  'Rove Haven contact')}
        ${f('Emergency Contact',  'emergencyContact', u.emergencyContact, 'Name + phone')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Owner Bank Details (for remittance)</div>
      <div class="fgrid fgrid-3">
        ${f('Bank Name',     'ownerBankName',    u.ownerBankName,   'e.g. Emirates NBD')}
        ${f('Account Name', 'ownerAccountName', u.ownerAccountName,'Name on account')}
        ${f('IBAN',         'ownerIBAN',        u.ownerIBAN,        'AE000000000000000000000')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Access & Keys</div>
      <div class="fgrid">
        ${f('Main Door Code',     'doorCode',       u.doorCode,       '6-digit code')}
        ${f('Keybox Code',        'keyboxCode',     u.keyboxCode,     '4-digit PIN')}
        ${f('Keybox Location',    'keyboxLocation', u.keyboxLocation, 'e.g. Left of door, lobby pillar')}
        ${f('Parking Bay #',      'parkingBay',     u.parkingBay,     'e.g. B2-047')}
        ${f('Parking Floor',      'parkingFloor',   u.parkingFloor,   'e.g. Basement 2')}
        ${f('Gate Remote',        'gateRemote',     u.gateRemote,     'Yes / No / Fob #')}
        ${f('Visitor Parking',    'visitorParking', u.visitorParking, 'Location & procedure')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">WiFi & Connectivity</div>
      <div class="fgrid">
        ${f('WiFi Network (Primary)',   'wifiName',      u.wifiName,      'Network SSID')}
        ${f('WiFi Password (Primary)',  'wifiPassword',  u.wifiPassword,  'Password')}
        ${f('WiFi Network (Secondary)', 'wifiName2',     u.wifiName2,     '5G band / guest network')}
        ${f('WiFi Password (Secondary)','wifiPassword2', u.wifiPassword2, 'Password')}
        ${f('Internet Provider',        'internetProvider', u.internetProvider, 'Du / Etisalat / Virgin')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Capacity & Bedrooms</div>
      <div class="fgrid fgrid-4">
        ${f('Max Guests', 'maxGuests',  u.maxGuests,  '#')}
        ${f('Bedrooms',   'bedrooms',   u.bedrooms,   '#')}
        ${f('Bathrooms',  'bathrooms',  u.bathrooms,  '#')}
        ${f('King Beds',  'kingBeds',   u.kingBeds,   '#')}
        ${f('Queen Beds', 'queenBeds',  u.queenBeds,  '#')}
        ${f('Twin Beds',  'twinBeds',   u.twinBeds,   '#')}
        ${f('Sofabed',    'sofabed',    u.sofabed,    'Yes / No')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Appliances</div>
      <div class="fgrid">
        ${f('AC Brand / Type',    'acBrand',       u.acBrand,       'e.g. Daikin Split, Central AC')}
        ${f('Washing Machine',    'washerBrand',   u.washerBrand,   'Brand & model')}
        ${f('Dryer',              'dryer',         u.dryer,         'Yes / No + brand')}
        ${f('Dishwasher',         'dishwasher',    u.dishwasher,    'Yes / No + brand')}
        ${f('Oven / Hob',         'ovenType',      u.ovenType,      'Gas / Electric Induction')}
        ${f('Microwave',          'microwave',     u.microwave,     'Yes / No')}
        ${f('Coffee Machine',     'coffeeMachine', u.coffeeMachine, 'e.g. Nespresso Vertuo')}
        ${f('TV Brand / Size',    'tvBrand',       u.tvBrand,       'e.g. Samsung 55" Smart TV')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Utilities</div>
      <div class="fgrid fgrid-3">
        ${f('Utility Provider',  'utilityProvider', u.utilityProvider, 'DEWA / FEWA / Empower')}
        ${f('Utility Account #', 'utilityAccount',  u.utilityAccount,  'Account number')}
        ${f('Gas Connection',    'gasConnection',   u.gasConnection,   'Yes / No / Piped / Canister')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Building Facilities</div>
      <div class="fgrid">
        ${f('Pool',                  'hasPool',            u.hasPool,            'Yes / No / Shared / Rooftop')}
        ${f('Gym',                   'hasGym',             u.hasGym,             'Yes / No')}
        ${f('Concierge',             'hasConcierge',       u.hasConcierge,       'Yes / 24hr / Business hours')}
        ${f('Building Management',   'buildingMgmt',       u.buildingMgmt,       'Company name')}
        ${f('Maintenance Contact',   'maintenanceContact', u.maintenanceContact, 'Name + phone')}
        ${f('Concierge Direct Line', 'conciergeDirect',    u.conciergeDirect,    'Phone number')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Booking Policy</div>
      <div class="fgrid">
        ${f('Min Stay (nights)',   'minStay',     u.minStay,     'e.g. 30')}
        ${f('Check-in Time',      'checkinTime', u.checkinTime, 'e.g. 3:00 PM')}
        ${f('Check-out Time',     'checkoutTime',u.checkoutTime,'e.g. 11:00 AM')}
        ${f('Late Checkout Policy','lateCheckout',u.lateCheckout,'Policy & fee')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Live Listing URLs</div>
      <div class="fgrid">
        ${f('Airbnb URL',       'airbnbUrl',    u.airbnbUrl,    'https://airbnb.com/rooms/...')}
        ${f('Booking.com URL',  'bookingUrl',   u.bookingUrl,   'https://booking.com/hotel/...')}
        ${f('Vrbo URL',         'vrboUrl',      u.vrboUrl,      'https://vrbo.com/...')}
        ${f('Bayut / Dubizzle', 'bayutUrl',     u.bayutUrl,     'https://bayut.com/...')}
        ${f('Blueground',       'bluegroundUrl',u.bluegroundUrl,'https://theblueground.com/...')}
      </div>
    </div>

    <div class="sub">
      <div class="sub-lbl">Notes & House Rules</div>
      <textarea class="fi fta" data-field="notes" placeholder="Special notes, quirks, or house rules for this unit...">${esc(u.notes)}</textarea>
    </div>

    <div class="card-foot">
      <button class="btn-gold" onclick="saveAll()">Save Unit Details</button>
    </div>
  </section>

  <!-- ══════════════════════════════════════════════
       02  LANDLORD DOCUMENTS
  ══════════════════════════════════════════════ -->
  <section class="card">
    <div class="card-head">
      <div class="sec-num">02</div>
      <div>
        <div class="sec-title">Landlord Documents</div>
        <div class="sec-sub">Upload PDF or JPG — max 10 MB per document</div>
      </div>
    </div>

    <div class="doc-list" id="docList">
      ${DOCS.map(d => docRow(d.key, d.label, slug)).join('')}
    </div>
  </section>

  <!-- ══════════════════════════════════════════════
       03  PRE-ONBOARDING
  ══════════════════════════════════════════════ -->
  <section class="card">
    <div class="card-head">
      <div class="sec-num">03</div>
      <div>
        <div class="sec-title">Pre-Onboarding</div>
        <div class="sec-sub">Agreements and documentation before property goes live</div>
      </div>
      <div class="prog-ring" id="prog-03"></div>
    </div>
    <div class="chklist">
      ${ci(checks,'pre_management_agreement',   'Signed management agreement received from owner')}
      ${ci(checks,'pre_id_owner',               "Owner's passport copy received")}
      ${ci(checks,'pre_eid_owner',              "Owner's Emirates ID copy received (if UAE resident)")}
      ${ci(checks,'pre_title_deed',             'Title deed / ownership certificate received')}
      ${ci(checks,'pre_dtcm_permit',            'DTCM tourism permit obtained and valid')}
      ${ci(checks,'pre_dtcm_on_listings',       'DTCM permit number added to all listings')}
      ${ci(checks,'pre_utility_confirmed',      "DEWA / utility account confirmed in owner's name")}
      ${ci(checks,'pre_insurance',              "Owner's property insurance documents received")}
      ${ci(checks,'pre_noc',                    'NOC from building / strata obtained (if required)')}
      ${ci(checks,'pre_owner_briefing',         'Owner onboarding briefing call completed')}
      ${ci(checks,'pre_bank_details',           "Owner's bank details received for rent remittance")}
      ${ci(checks,'pre_commission_agreed',      'Commission structure and remittance schedule agreed in writing')}
      ${ci(checks,'pre_keys_received',          'Keys / access codes received and tested')}
    </div>
  </section>

  <!-- ══════════════════════════════════════════════
       04  PROPERTY SETUP
  ══════════════════════════════════════════════ -->
  <section class="card">
    <div class="card-head">
      <div class="sec-num">04</div>
      <div>
        <div class="sec-title">Property Setup</div>
        <div class="sec-sub">Physical preparation before first guest check-in</div>
      </div>
      <div class="prog-ring" id="prog-04"></div>
    </div>
    <div class="chklist">
      ${ci(checks,'setup_deep_clean',           'Deep clean of entire unit completed')}
      ${ci(checks,'setup_photos',               'Professional photography session completed')}
      ${ci(checks,'setup_photos_uploaded',      'Photos uploaded and organised in Google Drive')}
      ${ci(checks,'setup_floor_plan',           'Floor plan / unit layout diagram obtained')}
      ${ci(checks,'setup_smart_lock',           'Smart lock or keybox installed and tested')}
      ${ci(checks,'setup_appliances_tested',    'All appliances tested — AC, washer, TV, oven, microwave')}
      ${ci(checks,'setup_ac_serviced',          'AC serviced and filters cleaned')}
      ${ci(checks,'setup_wifi_tested',          'WiFi tested — strong signal throughout unit')}
      ${ci(checks,'setup_lights',               'All lights working, bulbs replaced where needed')}
      ${ci(checks,'setup_plumbing',             'Plumbing checked — no leaks, good water pressure')}
      ${ci(checks,'setup_welcome_pack',         'Welcome pack / amenity basket prepared and placed')}
      ${ci(checks,'setup_guest_guide',          'Guest information booklet / QR code guide in unit')}
      ${ci(checks,'setup_spare_keys',           'Spare keys cut and stored at Rove Haven office')}
      ${ci(checks,'setup_parking_permit',       'Parking permit / sticker obtained (if required)')}
      ${ci(checks,'setup_damage_photos',        'Pre-stay damage documentation photos taken and stored')}
    </div>
  </section>

  <!-- ══════════════════════════════════════════════
       05  INVENTORY
  ══════════════════════════════════════════════ -->
  <section class="card">
    <div class="card-head">
      <div class="sec-num">05</div>
      <div>
        <div class="sec-title">Inventory Checklist</div>
        <div class="sec-sub">Verify all supplies and furnishings are in place</div>
      </div>
      <div class="prog-ring" id="prog-05"></div>
    </div>

    <div class="grp-lbl">Kitchen</div>
    <div class="chklist">
      ${ci(checks,'inv_pots_pans',        'Pots and pans (large, medium, small)')}
      ${ci(checks,'inv_frying_pan',       'Non-stick frying pan')}
      ${ci(checks,'inv_cutlery',          'Cutlery set — 6 settings minimum')}
      ${ci(checks,'inv_plates_bowls',     'Plates and bowls — 6 each minimum')}
      ${ci(checks,'inv_glasses',          'Drinking glasses and mugs')}
      ${ci(checks,'inv_wine_glasses',     'Wine glasses')}
      ${ci(checks,'inv_cutting_board',    'Cutting board')}
      ${ci(checks,'inv_knife_set',        'Kitchen knife set')}
      ${ci(checks,'inv_can_opener',       'Can opener and bottle opener')}
      ${ci(checks,'inv_colander',         'Colander / strainer')}
      ${ci(checks,'inv_kitchen_basics',   'Dish soap, sponge, kitchen towels, trash bags (initial supply)')}
    </div>

    <div class="grp-lbl">Bedroom(s)</div>
    <div class="chklist">
      ${ci(checks,'inv_bedsheets',        'Bedsheets and pillowcases — 2 sets per bed')}
      ${ci(checks,'inv_duvet_pillows',    'Duvet and pillows — minimum 2 per bed')}
      ${ci(checks,'inv_mattress_protect', 'Mattress protector on every bed')}
      ${ci(checks,'inv_hangers',          'Hangers in wardrobe — minimum 10 per bedroom')}
      ${ci(checks,'inv_blackout',         'Blackout curtains / blinds on all bedroom windows')}
      ${ci(checks,'inv_bedside_lamp',     'Bedside lamps with working bulbs')}
      ${ci(checks,'inv_hair_dryer',       'Hair dryer provided')}
      ${ci(checks,'inv_iron',             'Iron and ironing board')}
    </div>

    <div class="grp-lbl">Bathroom(s)</div>
    <div class="chklist">
      ${ci(checks,'inv_bath_towels',      'Bath towels — 2 per guest (minimum 4 sets)')}
      ${ci(checks,'inv_hand_towels',      'Hand towels and face cloths')}
      ${ci(checks,'inv_toiletries',       'Shampoo, conditioner, shower gel — initial supply')}
      ${ci(checks,'inv_toilet_paper',     'Toilet paper — minimum 4 rolls per bathroom')}
      ${ci(checks,'inv_hand_soap',        'Hand soap at every sink')}
      ${ci(checks,'inv_bath_mat',         'Bath mat and shower squeegee')}
    </div>

    <div class="grp-lbl">Living Area & General</div>
    <div class="chklist">
      ${ci(checks,'inv_tv_remote',        'TV remote tested, fresh batteries')}
      ${ci(checks,'inv_streaming',        'Streaming setup configured (Netflix / OSN / YouTube)')}
      ${ci(checks,'inv_extra_blankets',   'Extra blankets and throw pillows for sofa')}
      ${ci(checks,'inv_vacuum',           'Vacuum cleaner and mop present and working')}
      ${ci(checks,'inv_wifi_card',        'WiFi credentials card / printed and visible')}
      ${ci(checks,'inv_welcome_note',     'Personalised welcome note placed for first guest')}
    </div>
  </section>

  <!-- ══════════════════════════════════════════════
       06  LISTINGS SETUP
  ══════════════════════════════════════════════ -->
  <section class="card">
    <div class="card-head">
      <div class="sec-num">06</div>
      <div>
        <div class="sec-title">Listings Setup</div>
        <div class="sec-sub">All booking platforms configured and live</div>
      </div>
      <div class="prog-ring" id="prog-06"></div>
    </div>

    <div class="grp-lbl">Airbnb</div>
    <div class="chklist">
      ${ci(checks,'airbnb_created',    'Airbnb listing created')}
      ${ci(checks,'airbnb_photos',     'Professional photos uploaded')}
      ${ci(checks,'airbnb_pricing',    'Pricing and minimum stay configured')}
      ${ci(checks,'airbnb_rules',      'House rules entered')}
      ${ci(checks,'airbnb_dtcm',       'DTCM permit number added')}
      ${ci(checks,'airbnb_synced',     'Calendar synced to Hostaway')}
      ${ci(checks,'airbnb_instant',    'Instant Book settings configured')}
    </div>

    <div class="grp-lbl">Booking.com</div>
    <div class="chklist">
      ${ci(checks,'bdc_created',       'Booking.com listing created')}
      ${ci(checks,'bdc_photos',        'Photos uploaded')}
      ${ci(checks,'bdc_pricing',       'Pricing configured')}
      ${ci(checks,'bdc_synced',        'Calendar synced to Hostaway')}
    </div>

    <div class="grp-lbl">Other Platforms</div>
    <div class="chklist">
      ${ci(checks,'vrbo_live',         'Vrbo listing live')}
      ${ci(checks,'bayut_live',        'Bayut / Dubizzle listing live')}
      ${ci(checks,'blueground_live',   'Blueground listing submitted')}
      ${ci(checks,'direct_channel',    'Added to Rove Haven direct corporate channel')}
      ${ci(checks,'hostaway_synced',   'All platforms syncing in Hostaway')}
    </div>

    <div class="grp-lbl">Pricing & Revenue</div>
    <div class="chklist">
      ${ci(checks,'dynamic_pricing',   'Dynamic pricing tool activated (PriceLabs / Beyond)')}
      ${ci(checks,'min_stay_all',      'Minimum stay set correctly on all platforms')}
      ${ci(checks,'seasonality',       'Seasonality and peak period pricing configured')}
      ${ci(checks,'owner_revenue',     'Owner revenue expectations documented and shared')}
    </div>
  </section>

  <!-- ══════════════════════════════════════════════
       07  OPERATIONS
  ══════════════════════════════════════════════ -->
  <section class="card">
    <div class="card-head">
      <div class="sec-num">07</div>
      <div>
        <div class="sec-title">Operations Setup</div>
        <div class="sec-sub">Workflows ready before first guest check-in</div>
      </div>
      <div class="prog-ring" id="prog-07"></div>
    </div>
    <div class="chklist">
      ${ci(checks,'ops_checkin',        'Check-in procedure documented and automated in Hostaway')}
      ${ci(checks,'ops_checkout',       'Check-out procedure documented')}
      ${ci(checks,'ops_cleaning',       'Cleaning schedule set up in Hostaway')}
      ${ci(checks,'ops_cleaner_brief',  'Cleaning team briefed on unit-specific requirements')}
      ${ci(checks,'ops_maintenance',    'Preferred maintenance vendor assigned to unit')}
      ${ci(checks,'ops_comms',          'Guest communication templates set up in Hostaway')}
      ${ci(checks,'ops_auto_msgs',      'Automated pre-arrival, check-in and check-out messages enabled')}
      ${ci(checks,'ops_emergency',      'Emergency response protocol shared with all staff')}
      ${ci(checks,'ops_screening',      'Guest screening criteria configured for this unit')}
      ${ci(checks,'ops_review',         'Review response strategy in place')}
    </div>
  </section>

  <!-- ══════════════════════════════════════════════
       08  HANDOVER & SIGN-OFF
  ══════════════════════════════════════════════ -->
  <section class="card">
    <div class="card-head">
      <div class="sec-num">08</div>
      <div>
        <div class="sec-title">Handover & Sign-Off</div>
        <div class="sec-sub">Final records before unit goes live</div>
      </div>
      <div class="prog-ring" id="prog-08"></div>
    </div>
    <div class="chklist">
      ${ci(checks,'ho_notion_complete',  'Unit profile fully completed in Notion')}
      ${ci(checks,'ho_photos_drive',     'All property photos in Google Drive (organised by date)')}
      ${ci(checks,'ho_listing_urls',     'All listing URLs saved to Notion')}
      ${ci(checks,'ho_owner_dashboard',  'Owner given access to Hostaway owner dashboard')}
      ${ci(checks,'ho_owner_report',     'First owner report template shared')}
      ${ci(checks,'ho_key_receipt',      'Key handover / property receipt signed by both parties')}
      ${ci(checks,'ho_inventory_signed', 'Inventory list signed off by both parties')}
      ${ci(checks,'ho_welcome_email',    'Welcome email sent to owner with listing links')}
      ${ci(checks,'ho_crm',              'Unit and owner added to Rove Haven CRM / Notion')}
      ${ci(checks,'ho_complete',         '✓  Onboarding complete — unit live and operational')}
    </div>
  </section>

  </div><!-- /sections -->

  <footer class="footer">
    <div class="footer-brand">ROVE HAVEN · DUBAI</div>
    <div class="footer-sub">Love Rove · Discover Haven</div>
    <div class="footer-sub">Confidential — Internal Use Only</div>
  </footer>
</div><!-- /page -->

<script>
const SLUG = '${slug}';

// ── document upload state ──────────────────────────────────────
const docState = {};

async function uploadDoc(key, file) {
  const fd = new FormData();
  fd.append('file', file);
  const row = document.getElementById('doc-' + key);
  const badge = row.querySelector('.doc-badge');
  const fnEl  = row.querySelector('.doc-filename');
  badge.innerHTML = '<span class="badge-pending"><span class="badge-dot"></span>Uploading…</span>';
  try {
    const r = await fetch('/' + SLUG + '/upload/' + key, { method:'POST', body:fd });
    const j = await r.json();
    if (j.ok) {
      docState[key] = { filename: j.filename, url: j.url };
      badge.innerHTML = '<span class="badge-uploaded"><span class="badge-dot"></span>Uploaded</span>';
      fnEl.textContent = j.filename;
      const view = row.querySelector('.doc-view-link');
      if (view) { view.href = j.url; view.style.display = 'inline'; }
    } else {
      badge.innerHTML = '<span class="badge-pending"><span class="badge-dot"></span>Pending</span>';
      alert('Upload failed: ' + (j.error || 'unknown error'));
    }
  } catch(e) {
    badge.innerHTML = '<span class="badge-pending"><span class="badge-dot"></span>Pending</span>';
    alert('Upload error: ' + e.message);
  }
}

// Wire file inputs
document.querySelectorAll('.doc-file-input').forEach(inp => {
  inp.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    uploadDoc(inp.dataset.docKey, file);
  });
});

// ── checklist checkboxes ───────────────────────────────────────
function collectChecks() {
  const out = {};
  document.querySelectorAll('.chk-in').forEach(c => { out[c.dataset.key] = c.checked; });
  return out;
}

// ── auto-save on checkbox change ───────────────────────────────
let saveTimer;
document.querySelectorAll('.chk-in').forEach(cb => {
  cb.addEventListener('change', () => {
    // Toggle visual
    cb.closest('.chk-row').classList.toggle('chk-done', cb.checked);
    updateProgress();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveAll, 1400);
  });
});

// ── save ───────────────────────────────────────────────────────
async function saveAll() {
  const st = document.getElementById('save-status');
  st.textContent = 'Saving…';
  try {
    const r = await fetch('/' + SLUG + '/save', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(collectChecks())
    });
    const j = await r.json();
    st.textContent = j.ok ? '✓ Saved' : '⚠ Error saving';
    setTimeout(() => { st.textContent = ''; }, 3000);
  } catch {
    st.textContent = '⚠ Could not save';
  }
}

// ── progress rings ──────────────────────────────────────────────
function updateProgress() {
  ['03','04','05','06','07','08'].forEach(n => {
    const ring = document.getElementById('prog-' + n);
    if (!ring) return;
    const all  = ring.closest('.card').querySelectorAll('.chk-in');
    const done = [...all].filter(c => c.checked).length;
    const pct  = all.length ? Math.round(done / all.length * 100) : 0;
    ring.innerHTML = \`
      <svg viewBox="0 0 46 46" class="ring-svg">
        <circle cx="23" cy="23" r="18" fill="none" stroke="rgba(212,183,106,.18)" stroke-width="3"/>
        <circle cx="23" cy="23" r="18" fill="none" stroke="#d4b76a" stroke-width="3"
          stroke-dasharray="\${pct * 1.131} \${(100 - pct) * 1.131}"
          stroke-dashoffset="28.3" stroke-linecap="round"
          transform="rotate(-90 23 23)"/>
        <text x="23" y="27" text-anchor="middle" class="ring-txt">\${pct}%</text>
      </svg>\`;
  });
}
updateProgress();
</script>
</body>
</html>`;
}

// ── template helpers ──────────────────────────────────────────────
function f(label, key, value, placeholder) {
  return `<div class="fw">
    <label class="fl">${label}</label>
    <input class="fi" data-field="${key}" value="${esc(value)}" placeholder="${esc(placeholder)}">
  </div>`;
}

function ci(checks, key, label) {
  const checked = checks[key] ? 'checked' : '';
  const doneCls = checks[key] ? 'chk-done' : '';
  return `<label class="chk-row ${doneCls}">
    <input type="checkbox" class="chk-in" data-key="${key}" ${checked}>
    <span class="chk-box"></span>
    <span class="chk-lbl">${label}</span>
  </label>`;
}

function docRow(key, label, slug) {
  return `<div class="doc-row" id="doc-${key}">
    <div class="doc-icon">📄</div>
    <div class="doc-info">
      <div class="doc-name">${label}</div>
      <div class="doc-filename" style="display:none"></div>
    </div>
    <div class="doc-status">
      <span class="doc-badge"><span class="badge-pending"><span class="badge-dot"></span>Pending</span></span>
      <a class="doc-view-link doc-view" href="#" target="_blank" style="display:none">View ↗</a>
    </div>
    <div class="upload-btn">
      <input type="file" class="doc-file-input" data-doc-key="${key}" accept=".pdf,.jpg,.jpeg,application/pdf,image/jpeg">
      <span class="upload-trigger">Choose File</span>
    </div>
  </div>`;
}

// ── start ─────────────────────────────────────────────────────────
app.listen(PORT, () => console.log(`Rove Haven Checklists on port ${PORT}`));
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              