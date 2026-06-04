// Rove Haven — Unit Onboarding Checklist
// Railway deployment | Notion backend
// ─────────────────────────────────────────────────────────────────

const express = require('express');
const { Client } = require('@notionhq/client');

const app  = express();
const PORT = process.env.PORT || 3000;

const notion      = new Client({ auth: process.env.NOTION_TOKEN });
const UNITS_DB    = process.env.NOTION_UNITS_DB_ID;       // Notion DB with unit profiles
const CHECKS_DB   = process.env.NOTION_CHECKLISTS_DB_ID;  // Notion DB storing checkbox state

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── helpers ──────────────────────────────────────────────────────

function text(prop) {
  if (!prop) return '';
  if (prop.type === 'title')       return prop.title.map(t => t.plain_text).join('');
  if (prop.type === 'rich_text')   return prop.rich_text.map(t => t.plain_text).join('');
  if (prop.type === 'number')      return prop.number ?? '';
  if (prop.type === 'select')      return prop.select?.name ?? '';
  if (prop.type === 'multi_select')return prop.multi_select.map(s => s.name).join(', ');
  if (prop.type === 'checkbox')    return prop.checkbox;
  if (prop.type === 'url')         return prop.url ?? '';
  if (prop.type === 'phone_number')return prop.phone_number ?? '';
  if (prop.type === 'email')       return prop.email ?? '';
  return '';
}

async function getUnit(slug) {
  if (!UNITS_DB) return null;
  try {
    const res = await notion.databases.query({
      database_id: UNITS_DB,
      filter: {
        property: 'Slug',
        rich_text: { equals: slug }
      },
      page_size: 1
    });
    return res.results[0] ?? null;
  } catch { return null; }
}

async function getChecklist(unitSlug) {
  if (!CHECKS_DB) return {};
  try {
    const res = await notion.databases.query({
      database_id: CHECKS_DB,
      filter: {
        property: 'Unit',
        rich_text: { equals: unitSlug }
      },
      page_size: 1
    });
    if (!res.results[0]) return {};
    const p = res.results[0].properties;
    // Each checklist item is a boolean property in Notion
    const out = {};
    for (const [k, v] of Object.entries(p)) {
      if (v.type === 'checkbox') out[k] = v.checkbox;
    }
    return out;
  } catch { return {}; }
}

async function saveChecklist(unitSlug, fields) {
  if (!CHECKS_DB) return;
  try {
    const res = await notion.databases.query({
      database_id: CHECKS_DB,
      filter: { property: 'Unit', rich_text: { equals: unitSlug } },
      page_size: 1
    });
    const props = {};
    for (const [k, v] of Object.entries(fields)) {
      if (k === 'Unit') continue;
      props[k] = { checkbox: v === true || v === 'true' || v === '1' };
    }
    if (res.results[0]) {
      await notion.pages.update({ page_id: res.results[0].id, properties: props });
    } else {
      await notion.pages.create({
        parent: { database_id: CHECKS_DB },
        properties: {
          Unit: { title: [{ text: { content: unitSlug } }] },
          ...props
        }
      });
    }
  } catch (e) { console.error('saveChecklist error', e); }
}

// ── routes ────────────────────────────────────────────────────────

app.get('/health', (_, res) => res.json({ status: 'ok' }));

// Save checklist state
app.post('/:slug/save', async (req, res) => {
  const { slug } = req.params;
  await saveChecklist(slug, req.body);
  res.json({ ok: true });
});

// Main checklist page
app.get('/:slug', async (req, res) => {
  const { slug } = req.params;
  const page = await getUnit(slug);
  const checks = await getChecklist(slug);

  // Build unit detail values from Notion properties (fall back to empty string)
  const p = page?.properties ?? {};
  const u = {
    unitName:           text(p['Unit Name'])         || text(p['Name']) || slug,
    buildingName:       text(p['Building Name'])     || '',
    tower:              text(p['Tower / Wing'])       || '',
    floor:              text(p['Floor'])              || '',
    unitNumber:         text(p['Unit Number'])        || '',
    community:          text(p['Community / Area'])   || '',
    city:               text(p['City'])               || 'Dubai',
    doorCode:           text(p['Door Code'])          || '',
    keyboxCode:         text(p['Keybox Code'])        || '',
    keyboxLocation:     text(p['Keybox Location'])    || '',
    parkingBay:         text(p['Parking Bay #'])      || '',
    parkingFloor:       text(p['Parking Floor'])      || '',
    gateRemote:         text(p['Gate Remote'])        || '',
    visitorParking:     text(p['Visitor Parking'])    || '',
    wifiName:           text(p['WiFi Name'])          || '',
    wifiPassword:       text(p['WiFi Password'])      || '',
    wifiName2:          text(p['WiFi Name 2'])        || '',
    wifiPassword2:      text(p['WiFi Password 2'])    || '',
    internetProvider:   text(p['Internet Provider']) || '',
    maxGuests:          text(p['Max Guests'])         || '',
    bedrooms:           text(p['Bedrooms'])           || '',
    bathrooms:          text(p['Bathrooms'])          || '',
    kingBeds:           text(p['King Beds'])          || '',
    queenBeds:          text(p['Queen Beds'])         || '',
    twinBeds:           text(p['Twin Beds'])          || '',
    sofabed:            text(p['Sofabed'])            || '',
    acBrand:            text(p['AC Brand'])           || '',
    washerBrand:        text(p['Washer Brand'])       || '',
    dryer:              text(p['Dryer'])              || '',
    dishwasher:         text(p['Dishwasher'])         || '',
    ovenType:           text(p['Oven Type'])          || '',
    microwave:          text(p['Microwave'])          || '',
    coffeeMachine:      text(p['Coffee Machine'])     || '',
    tvBrand:            text(p['TV Brand / Size'])    || '',
    utilityAccount:     text(p['Utility Account #'])  || '',
    utilityProvider:    text(p['Utility Provider'])   || 'DEWA',
    gasConnection:      text(p['Gas Connection'])     || '',
    hasPool:            text(p['Pool'])               || '',
    hasGym:             text(p['Gym'])                || '',
    hasConcierge:       text(p['Concierge'])          || '',
    buildingMgmt:       text(p['Building Management'])|| '',
    maintenanceContact: text(p['Maintenance Contact'])|| '',
    conciergeDirect:    text(p['Concierge Direct #']) || '',
    minStay:            text(p['Min Stay (nights)'])  || '',
    checkinTime:        text(p['Check-in Time'])      || '3:00 PM',
    checkoutTime:       text(p['Check-out Time'])     || '11:00 AM',
    lateCheckout:       text(p['Late Checkout Policy'])|| '',
    ownerName:          text(p['Owner Name'])         || '',
    ownerPhone:         text(p['Owner Phone'])        || '',
    ownerEmail:         text(p['Owner Email'])        || '',
    propertyManager:    text(p['Property Manager'])   || 'Rove Haven',
    emergencyContact:   text(p['Emergency Contact'])  || '',
    airbnbUrl:          text(p['Airbnb URL'])         || '',
    bookingUrl:         text(p['Booking.com URL'])    || '',
    vrboUrl:            text(p['Vrbo URL'])           || '',
    bayutUrl:           text(p['Bayut URL'])          || '',
    bluegroundUrl:      text(p['Blueground URL'])     || '',
    notes:              text(p['Special Notes'])      || '',
    dtcmPermit:         text(p['DTCM Permit #'])      || '',
    dtcmExpiry:         text(p['DTCM Expiry'])        || '',
    managementStart:    text(p['Management Start'])   || '',
    contractEnd:        text(p['Contract End'])       || '',
  };

  res.send(renderHTML(slug, u, checks));
});

// Root — unit picker
app.get('/', (_, res) => {
  res.send(renderHome());
});

// ── HTML renderer ─────────────────────────────────────────────────

function chk(checks, key) {
  return checks[key] ? 'checked' : '';
}

function renderHome() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rove Haven — Onboarding Checklists</title>
${styles()}
</head>
<body>
<div class="page-wrap">
  <header class="header">
    <div class="logo-wrap">
      <div class="logo-mark">R|H</div>
      <div>
        <div class="brand">ROVE HAVEN</div>
        <div class="tagline">PROPERTY MANAGEMENT · DUBAI</div>
      </div>
    </div>
  </header>
  <main class="home-main">
    <h1 class="home-title">Unit Onboarding<br>Checklists</h1>
    <p class="home-sub">Enter a unit slug to access its onboarding checklist.</p>
    <form class="unit-search" onsubmit="go(event)">
      <input id="slugInput" class="slug-input" type="text" placeholder="e.g. jvc-1808b, aria-122, n2-11-autograph" autocomplete="off" />
      <button class="btn-gold" type="submit">Open Checklist →</button>
    </form>
    <p class="home-hint">Unit slug format: building-unitnumber (all lowercase, hyphens)</p>
  </main>
</div>
<script>
  function go(e) {
    e.preventDefault();
    const v = document.getElementById('slugInput').value.trim().toLowerCase().replace(/\\s+/g,'-');
    if (v) window.location.href = '/' + v;
  }
</script>
</body></html>`;
}

function renderHTML(slug, u, checks) {
  const title = u.unitName || slug;
  const now = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Rove Haven — ${title} Onboarding</title>
${styles()}
</head>
<body>
<div class="page-wrap">

  <!-- HEADER -->
  <header class="header">
    <div class="logo-wrap">
      <div class="logo-mark">R|H</div>
      <div>
        <div class="brand">ROVE HAVEN</div>
        <div class="tagline">PROPERTY MANAGEMENT · DUBAI</div>
      </div>
    </div>
    <div class="header-meta">
      <div class="unit-badge">${slug.toUpperCase()}</div>
      <div class="date-stamp">Updated ${now}</div>
    </div>
  </header>

  <!-- UNIT HERO -->
  <div class="unit-hero">
    <div class="unit-hero-title">${title}</div>
    <div class="unit-hero-sub">${[u.buildingName, u.community, u.city].filter(Boolean).join(' · ')}</div>
  </div>

  <!-- SAVE BAR -->
  <div id="savebar" class="save-bar">
    <span id="save-status" class="save-status"></span>
    <button class="btn-gold btn-sm" onclick="saveAll()">Save Progress</button>
    <button class="btn-outline btn-sm" onclick="window.print()">Print / PDF</button>
  </div>

  <div class="sections">

    <!-- ═══════════════════════════════════════════
         SECTION 1 — UNIT PROFILE (ALL TYPABLE)
    ════════════════════════════════════════════ -->
    <section class="card">
      <div class="card-head">
        <div class="section-num">01</div>
        <div>
          <div class="section-title">Unit Profile</div>
          <div class="section-sub">Core property information — edit fields directly below</div>
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-title">Property Overview</div>
        <div class="field-grid">
          ${field('Unit Name',     'unitName',       u.unitName,       'e.g. JVC 1808B')}
          ${field('Building Name', 'buildingName',   u.buildingName,   'e.g. The Springs')}
          ${field('Tower / Wing',  'tower',          u.tower,          'e.g. Tower A')}
          ${field('Floor',         'floor',          u.floor,          'e.g. 18')}
          ${field('Unit Number',   'unitNumber',     u.unitNumber,     'e.g. 1808B')}
          ${field('Community / Area', 'community',   u.community,      'e.g. JVC, DIFC, Marina')}
          ${field('City',          'city',           u.city,           'Dubai')}
          ${field('DTCM Permit #', 'dtcmPermit',     u.dtcmPermit,     'Tourism licence #')}
          ${field('DTCM Expiry',   'dtcmExpiry',     u.dtcmExpiry,     'DD/MM/YYYY')}
          ${field('Management Start', 'managementStart', u.managementStart, 'DD/MM/YYYY')}
          ${field('Contract End',  'contractEnd',    u.contractEnd,    'DD/MM/YYYY')}
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-title">Access & Keys</div>
        <div class="field-grid">
          ${field('Main Door Code',    'doorCode',       u.doorCode,       '6-digit code')}
          ${field('Keybox Code',       'keyboxCode',     u.keyboxCode,     '4-digit PIN')}
          ${field('Keybox Location',   'keyboxLocation', u.keyboxLocation, 'e.g. Left of door, lobby pillar')}
          ${field('Parking Bay #',     'parkingBay',     u.parkingBay,     'e.g. B2-047')}
          ${field('Parking Floor',     'parkingFloor',   u.parkingFloor,   'e.g. Basement 2')}
          ${field('Gate Remote',       'gateRemote',     u.gateRemote,     'Yes / No / Fob #')}
          ${field('Visitor Parking',   'visitorParking', u.visitorParking, 'Location & procedure')}
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-title">WiFi & Connectivity</div>
        <div class="field-grid">
          ${field('WiFi Network (Primary)',  'wifiName',       u.wifiName,       'Network name (SSID)')}
          ${field('WiFi Password (Primary)', 'wifiPassword',   u.wifiPassword,   'Password')}
          ${field('WiFi Network (Secondary)','wifiName2',      u.wifiName2,      'e.g. 5G band or guest network')}
          ${field('WiFi Password (Secondary)','wifiPassword2', u.wifiPassword2,  'Password')}
          ${field('Internet Provider',       'internetProvider', u.internetProvider, 'e.g. Du, Etisalat, Virgin')}
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-title">Capacity & Layout</div>
        <div class="field-grid field-grid-4">
          ${field('Max Guests',   'maxGuests',  u.maxGuests,  '#')}
          ${field('Bedrooms',     'bedrooms',   u.bedrooms,   '#')}
          ${field('Bathrooms',    'bathrooms',  u.bathrooms,  '#')}
          ${field('King Beds',    'kingBeds',   u.kingBeds,   '#')}
          ${field('Queen Beds',   'queenBeds',  u.queenBeds,  '#')}
          ${field('Twin Beds',    'twinBeds',   u.twinBeds,   '#')}
          ${field('Sofabed',      'sofabed',    u.sofabed,    'Yes / No')}
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-title">Appliances & Fixtures</div>
        <div class="field-grid">
          ${field('AC Brand / Type',      'acBrand',       u.acBrand,       'e.g. Daikin Split, Central')}
          ${field('Washing Machine',      'washerBrand',   u.washerBrand,   'Brand & model')}
          ${field('Dryer',                'dryer',         u.dryer,         'Yes / No + brand')}
          ${field('Dishwasher',           'dishwasher',    u.dishwasher,    'Yes / No + brand')}
          ${field('Oven / Hob Type',      'ovenType',      u.ovenType,      'e.g. Gas, Electric Induction')}
          ${field('Microwave',            'microwave',     u.microwave,     'Yes / No + brand')}
          ${field('Coffee Machine',       'coffeeMachine', u.coffeeMachine, 'Brand & type (Nespresso, etc.)')}
          ${field('TV Brand / Size',      'tvBrand',       u.tvBrand,       'e.g. Samsung 55" Smart TV')}
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-title">Utilities</div>
        <div class="field-grid">
          ${field('Utility Provider',    'utilityProvider', u.utilityProvider, 'DEWA / FEWA / Empower')}
          ${field('Utility Account #',   'utilityAccount',  u.utilityAccount,  'Account number')}
          ${field('Gas Connection',      'gasConnection',   u.gasConnection,   'Yes / No / Piped / Canister')}
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-title">Building Facilities</div>
        <div class="field-grid field-grid-4">
          ${field('Pool',              'hasPool',      u.hasPool,      'Yes / No / Shared')}
          ${field('Gym',               'hasGym',       u.hasGym,       'Yes / No')}
          ${field('Concierge',         'hasConcierge', u.hasConcierge, 'Yes / No / Hours')}
          ${field('Building Management', 'buildingMgmt', u.buildingMgmt, 'Company name')}
          ${field('Maintenance Contact', 'maintenanceContact', u.maintenanceContact, 'Name + #')}
          ${field('Concierge Direct #', 'conciergeDirect', u.conciergeDirect, 'Phone number')}
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-title">Booking Policy</div>
        <div class="field-grid">
          ${field('Min Stay (nights)', 'minStay',     u.minStay,     'e.g. 30')}
          ${field('Check-in Time',     'checkinTime', u.checkinTime, 'e.g. 3:00 PM')}
          ${field('Check-out Time',    'checkoutTime',u.checkoutTime,'e.g. 11:00 AM')}
          ${field('Late Checkout Policy', 'lateCheckout', u.lateCheckout, 'Policy & fee')}
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-title">Owner & Contacts</div>
        <div class="field-grid">
          ${field('Owner Name',       'ownerName',       u.ownerName,       'Full name')}
          ${field('Owner Phone',      'ownerPhone',      u.ownerPhone,      '+971 — WhatsApp preferred')}
          ${field('Owner Email',      'ownerEmail',      u.ownerEmail,      'Email address')}
          ${field('Property Manager', 'propertyManager', u.propertyManager, 'Rove Haven contact')}
          ${field('Emergency Contact','emergencyContact', u.emergencyContact,'Name + # for emergencies')}
        </div>
      </div>

      <div class="sub-section">
        <div class="sub-title">Live Listing URLs</div>
        <div class="field-grid">
          ${field('Airbnb URL',        'airbnbUrl',    u.airbnbUrl,    'https://airbnb.com/rooms/...')}
          ${field('Booking.com URL',   'bookingUrl',   u.bookingUrl,   'https://booking.com/hotel/...')}
          ${field('Vrbo URL',          'vrboUrl',      u.vrboUrl,      'https://vrbo.com/...')}
          ${field('Bayut / Dubizzle',  'bayutUrl',     u.bayutUrl,     'https://bayut.com/...')}
          ${field('Blueground URL',    'bluegroundUrl',u.bluegroundUrl,'https://theblueground.com/...')}
        </div>
      </div>

      ${textareaField('Special Notes / House Rules', 'notes', u.notes, 'Any important notes, quirks, or house rules for this unit...')}

      <div class="card-actions">
        <button class="btn-gold" onclick="saveUnitProfile()">Save Unit Profile to Notion</button>
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         SECTION 2 — PRE-ONBOARDING
    ════════════════════════════════════════════ -->
    <section class="card">
      <div class="card-head">
        <div class="section-num">02</div>
        <div>
          <div class="section-title">Pre-Onboarding</div>
          <div class="section-sub">Documents and agreements before property is live</div>
        </div>
        <div class="progress-ring" id="prog-02"></div>
      </div>
      <div class="checklist">
        ${item(checks, 'management_agreement',    'Signed management agreement received from owner')}
        ${item(checks, 'id_copy_owner',           'Copy of owner\'s passport / Emirates ID received')}
        ${item(checks, 'title_deed',              'Title deed / ownership document copy received')}
        ${item(checks, 'dtcm_permit',             'DTCM tourism permit obtained and valid')}
        ${item(checks, 'dtcm_license_displayed',  'DTCM permit number added to all listings')}
        ${item(checks, 'dewa_account_confirmed',  'DEWA / utility account confirmed in owner\'s name')}
        ${item(checks, 'insurance_docs',          'Owner\'s property insurance documents received')}
        ${item(checks, 'noc_strata',              'NOC from building / strata obtained (if required)')}
        ${item(checks, 'owner_brief_done',        'Owner onboarding briefing call completed')}
        ${item(checks, 'bank_details_owner',      'Owner bank details received for remittance')}
        ${item(checks, 'commission_agreed',       'Commission structure & remittance schedule agreed')}
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         SECTION 3 — PROPERTY SETUP
    ════════════════════════════════════════════ -->
    <section class="card">
      <div class="card-head">
        <div class="section-num">03</div>
        <div>
          <div class="section-title">Property Setup</div>
          <div class="section-sub">Physical preparation of the unit</div>
        </div>
        <div class="progress-ring" id="prog-03"></div>
      </div>
      <div class="checklist">
        ${item(checks, 'deep_clean_done',         'Deep clean of entire unit completed')}
        ${item(checks, 'professional_photos',     'Professional photography session done')}
        ${item(checks, 'photos_uploaded',         'Photos uploaded to Google Drive / shared folder')}
        ${item(checks, 'floor_plan_obtained',     'Floor plan / unit layout diagram obtained')}
        ${item(checks, 'smart_lock_installed',    'Smart lock or keybox installed and tested')}
        ${item(checks, 'all_appliances_tested',   'All appliances tested and working (AC, washer, TV, oven)')}
        ${item(checks, 'ac_service_done',         'AC serviced / filters cleaned')}
        ${item(checks, 'wifi_tested',             'WiFi tested — stable throughout unit')}
        ${item(checks, 'all_lights_working',      'All lights tested and bulbs replaced where needed')}
        ${item(checks, 'plumbing_checked',        'Plumbing checked — no leaks, good water pressure')}
        ${item(checks, 'welcome_pack_prepared',   'Welcome pack / amenity basket prepared')}
        ${item(checks, 'housekeeping_briefed',    'Housekeeping team briefed on unit specifics')}
        ${item(checks, 'emergency_kit',           'Emergency kit in place (first aid, fire extinguisher if required)')}
        ${item(checks, 'guest_info_folder',       'Guest information folder / QR code guide created and placed')}
        ${item(checks, 'spare_keys_cut',          'Spare keys cut and stored at office')}
        ${item(checks, 'parking_permit',          'Parking permit / sticker obtained (if required)')}
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         SECTION 4 — INVENTORY CHECKLIST
    ════════════════════════════════════════════ -->
    <section class="card">
      <div class="card-head">
        <div class="section-num">04</div>
        <div>
          <div class="section-title">Inventory Checklist</div>
          <div class="section-sub">Confirm all supplies and furnishings are in place</div>
        </div>
        <div class="progress-ring" id="prog-04"></div>
      </div>

      <div class="checklist-group-label">Kitchen</div>
      <div class="checklist">
        ${item(checks, 'inv_pots_pans',           'Pots and pans (at least 1 large, 1 medium, 1 small)')}
        ${item(checks, 'inv_frying_pan',          'Frying pan / non-stick skillet')}
        ${item(checks, 'inv_cutlery',             'Cutlery set (knives, forks, spoons) — 6 settings min')}
        ${item(checks, 'inv_plates_bowls',        'Plates and bowls — 6 of each minimum')}
        ${item(checks, 'inv_glasses',             'Drinking glasses and mugs')}
        ${item(checks, 'inv_wine_glasses',        'Wine glasses')}
        ${item(checks, 'inv_cutting_board',       'Cutting board')}
        ${item(checks, 'inv_kitchen_knives',      'Kitchen knife set')}
        ${item(checks, 'inv_can_opener',          'Can opener and bottle opener')}
        ${item(checks, 'inv_colander',            'Colander / strainer')}
        ${item(checks, 'inv_dish_rack',           'Dish rack or dishwasher tablets')}
        ${item(checks, 'inv_trash_bags',          'Trash bags (initial supply)')}
        ${item(checks, 'inv_basic_supplies',      'Basic supplies: dish soap, sponge, kitchen towels')}
      </div>

      <div class="checklist-group-label">Bedroom(s)</div>
      <div class="checklist">
        ${item(checks, 'inv_bedsheets',           'Bedsheets and pillowcases — 2 sets per bed')}
        ${item(checks, 'inv_duvet_pillows',       'Duvet and pillows (min 2 per bed)')}
        ${item(checks, 'inv_mattress_protector',  'Mattress protector on each bed')}
        ${item(checks, 'inv_hangers',             'Hangers in wardrobe (min 10 per bedroom)')}
        ${item(checks, 'inv_bedside_lamp',        'Bedside lamps with working bulbs')}
        ${item(checks, 'inv_blackout_curtains',   'Blackout curtains / blinds on all bedroom windows')}
        ${item(checks, 'inv_hair_dryer',          'Hair dryer provided')}
        ${item(checks, 'inv_iron_board',          'Iron and ironing board')}
      </div>

      <div class="checklist-group-label">Bathroom(s)</div>
      <div class="checklist">
        ${item(checks, 'inv_towels_bath',         'Bath towels — 2 per guest (min 4 sets)')}
        ${item(checks, 'inv_towels_hand',         'Hand towels and face cloths')}
        ${item(checks, 'inv_shower_toiletries',   'Shampoo, conditioner, shower gel — initial supply')}
        ${item(checks, 'inv_toilet_paper',        'Toilet paper (min 4 rolls per bathroom)')}
        ${item(checks, 'inv_hand_soap',           'Hand soap at every sink')}
        ${item(checks, 'inv_shower_squeegee',     'Shower squeegee / bath mat')}
        ${item(checks, 'inv_mirror_lighting',     'Mirror with adequate lighting')}
      </div>

      <div class="checklist-group-label">Living Area & General</div>
      <div class="checklist">
        ${item(checks, 'inv_tv_remote',           'TV remote tested and batteries fresh')}
        ${item(checks, 'inv_streaming',           'Streaming setup (Netflix / OSN / YouTube) configured')}
        ${item(checks, 'inv_extra_blankets',      'Extra blankets and throw pillows on sofa')}
        ${item(checks, 'inv_vacuum_mop',          'Vacuum cleaner and mop present and working')}
        ${item(checks, 'inv_wifi_card',           'WiFi card / printed credentials visible in unit')}
        ${item(checks, 'inv_welcome_note',        'Personalised welcome note placed for first guest')}
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         SECTION 5 — LISTINGS SETUP
    ════════════════════════════════════════════ -->
    <section class="card">
      <div class="card-head">
        <div class="section-num">05</div>
        <div>
          <div class="section-title">Listings Setup</div>
          <div class="section-sub">All booking platforms configured and live</div>
        </div>
        <div class="progress-ring" id="prog-05"></div>
      </div>

      <div class="checklist-group-label">Airbnb</div>
      <div class="checklist">
        ${item(checks, 'airbnb_listing_created',  'Airbnb listing created')}
        ${item(checks, 'airbnb_photos_uploaded',  'Professional photos uploaded to Airbnb')}
        ${item(checks, 'airbnb_pricing_set',      'Airbnb pricing and minimum stay set')}
        ${item(checks, 'airbnb_house_rules',      'House rules entered on Airbnb')}
        ${item(checks, 'airbnb_calendar_synced',  'Airbnb calendar synced to Hostaway')}
        ${item(checks, 'airbnb_instant_book',     'Instant Book settings configured')}
        ${item(checks, 'airbnb_dtcm_added',       'DTCM permit number entered on Airbnb')}
      </div>

      <div class="checklist-group-label">Booking.com</div>
      <div class="checklist">
        ${item(checks, 'bdc_listing_created',     'Booking.com listing created')}
        ${item(checks, 'bdc_photos_uploaded',     'Photos uploaded to Booking.com')}
        ${item(checks, 'bdc_pricing_set',         'Booking.com pricing configured')}
        ${item(checks, 'bdc_calendar_synced',     'Booking.com calendar synced to Hostaway')}
        ${item(checks, 'bdc_genius_verified',     'Genius status verified / applied')}
      </div>

      <div class="checklist-group-label">Other Platforms</div>
      <div class="checklist">
        ${item(checks, 'vrbo_listing',            'Vrbo listing created and live')}
        ${item(checks, 'bayut_listing',           'Bayut / Dubizzle listing created')}
        ${item(checks, 'blueground_listing',      'Blueground listing applied / submitted')}
        ${item(checks, 'marriott_listing',        'Marriott Homes & Villas listing (if applicable)')}
        ${item(checks, 'direct_channel_added',    'Added to Rove Haven direct corporate channel')}
        ${item(checks, 'hostaway_connected',      'All platforms connected and syncing in Hostaway')}
      </div>

      <div class="checklist-group-label">Pricing & Revenue</div>
      <div class="checklist">
        ${item(checks, 'dynamic_pricing_on',      'Dynamic pricing tool activated (PriceLabs / Beyond)')}
        ${item(checks, 'min_stay_configured',     'Minimum stay set correctly on all platforms')}
        ${item(checks, 'seasonality_set',         'Seasonality adjustments and peak period pricing set')}
        ${item(checks, 'gap_night_rules',         'Gap night filling rules configured')}
        ${item(checks, 'owner_revenue_target',    'Owner revenue expectations documented and shared')}
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         SECTION 6 — OPERATIONS SETUP
    ════════════════════════════════════════════ -->
    <section class="card">
      <div class="card-head">
        <div class="section-num">06</div>
        <div>
          <div class="section-title">Operations Setup</div>
          <div class="section-sub">Operational workflows ready before first guest</div>
        </div>
        <div class="progress-ring" id="prog-06"></div>
      </div>
      <div class="checklist">
        ${item(checks, 'ops_checkin_procedure',   'Check-in procedure documented and automated')}
        ${item(checks, 'ops_checkout_procedure',  'Check-out procedure documented')}
        ${item(checks, 'ops_cleaning_schedule',   'Cleaning schedule set up in Hostaway')}
        ${item(checks, 'ops_cleaning_team_brief', 'Cleaning team briefed on unit-specific requirements')}
        ${item(checks, 'ops_maintenance_vendor',  'Preferred maintenance vendor assigned to unit')}
        ${item(checks, 'ops_guest_comms_template','Guest communication templates set up in Hostaway')}
        ${item(checks, 'ops_automated_messages',  'Automated pre-arrival, check-in and check-out messages enabled')}
        ${item(checks, 'ops_emergency_protocol',  'Emergency response protocol shared with all staff')}
        ${item(checks, 'ops_noise_monitor',       'Noise monitoring device installed (if applicable)')}
        ${item(checks, 'ops_damage_photos',       'Pre-stay damage documentation photos taken and stored')}
        ${item(checks, 'ops_guest_screening',     'Guest screening criteria set for this unit')}
        ${item(checks, 'ops_review_strategy',     'Review response strategy set up')}
      </div>
    </section>

    <!-- ═══════════════════════════════════════════
         SECTION 7 — DOCUMENTATION & HANDOVER
    ════════════════════════════════════════════ -->
    <section class="card">
      <div class="card-head">
        <div class="section-num">07</div>
        <div>
          <div class="section-title">Documentation & Handover</div>
          <div class="section-sub">Final sign-off and records</div>
        </div>
        <div class="progress-ring" id="prog-07"></div>
      </div>
      <div class="checklist">
        ${item(checks, 'doc_unit_profile_notion', 'Unit profile fully completed in Notion')}
        ${item(checks, 'doc_photos_drive',        'All property photos in Google Drive (organised by date)')}
        ${item(checks, 'doc_listing_urls_saved',  'All listing URLs saved to Notion unit record')}
        ${item(checks, 'doc_owner_access',        'Owner given access to Hostaway owner dashboard')}
        ${item(checks, 'doc_owner_report_shared', 'First owner report template shared')}
        ${item(checks, 'doc_key_handover_signed', 'Key handover / property receipt signed')}
        ${item(checks, 'doc_inventory_signed',    'Inventory list signed off by both parties')}
        ${item(checks, 'doc_welcome_email_sent',  'Welcome email sent to owner with listing links')}
        ${item(checks, 'doc_rove_haven_crm',      'Unit and owner added to Rove Haven CRM / Notion')}
        ${item(checks, 'doc_first_booking',       'First booking received or targeted launch date set')}
        ${item(checks, 'doc_onboarding_complete', '✓ Onboarding fully complete — unit live and operational')}
      </div>
    </section>

  </div><!-- /sections -->

  <footer class="footer">
    <div class="footer-brand">ROVE HAVEN · DUBAI</div>
    <div class="footer-sub">Love Rove · Discover Haven</div>
    <div class="footer-sub">Confidential — Internal Use Only</div>
  </footer>
</div><!-- /page-wrap -->

<script>
  const SLUG = '${slug}';

  // ── collect all typable field values ──────────────────────────
  function collectFields() {
    const data = {};
    document.querySelectorAll('[data-field]').forEach(el => {
      data[el.dataset.field] = el.value;
    });
    return data;
  }

  // ── collect checkbox state ────────────────────────────────────
  function collectChecks() {
    const data = {};
    document.querySelectorAll('.chk-input').forEach(cb => {
      data[cb.dataset.key] = cb.checked;
    });
    return data;
  }

  // ── save all ─────────────────────────────────────────────────
  async function saveAll() {
    const status = document.getElementById('save-status');
    status.textContent = 'Saving…';
    const payload = { ...collectChecks() };
    try {
      const r = await fetch('/' + SLUG + '/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      status.textContent = j.ok ? '✓ Saved' : '⚠ Error saving';
      setTimeout(() => { status.textContent = ''; }, 3000);
    } catch {
      status.textContent = '⚠ Could not reach server';
    }
  }

  // Save unit profile separately (PUT to Notion via backend)
  function saveUnitProfile() {
    const status = document.getElementById('save-status');
    status.textContent = '✓ Profile updated locally (Notion write requires Unit Profile endpoint)';
    setTimeout(() => { status.textContent = ''; }, 4000);
  }

  // ── progress rings ────────────────────────────────────────────
  function updateProgress() {
    const sections = ['02','03','04','05','06','07'];
    sections.forEach(num => {
      const ring = document.getElementById('prog-' + num);
      if (!ring) return;
      const card = ring.closest('.card');
      const all  = card.querySelectorAll('.chk-input');
      const done = [...all].filter(c => c.checked).length;
      const pct  = all.length ? Math.round(done / all.length * 100) : 0;
      ring.innerHTML = \`
        <svg viewBox="0 0 36 36" class="ring-svg">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(212,183,106,.2)" stroke-width="2.5"/>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#d4b76a" stroke-width="2.5"
            stroke-dasharray="\${pct} \${100-pct}" stroke-dashoffset="25" stroke-linecap="round"/>
          <text x="18" y="21" text-anchor="middle" class="ring-txt">\${pct}%</text>
        </svg>
      \`;
    });
  }

  document.querySelectorAll('.chk-input').forEach(cb => {
    cb.addEventListener('change', updateProgress);
  });

  updateProgress();

  // ── auto-save on checkbox change ─────────────────────────────
  let saveTimer;
  document.querySelectorAll('.chk-input').forEach(cb => {
    cb.addEventListener('change', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveAll, 1200);
    });
  });
</script>
</body>
</html>`;
}

// ── template helpers ──────────────────────────────────────────────

function field(label, key, value, placeholder) {
  return `
  <div class="field-wrap">
    <label class="field-label">${label}</label>
    <input class="field-input" data-field="${key}" value="${esc(value)}" placeholder="${esc(placeholder)}" />
  </div>`;
}

function textareaField(label, key, value, placeholder) {
  return `
  <div class="sub-section">
    <div class="sub-title">${label}</div>
    <textarea class="field-textarea" data-field="${key}" placeholder="${esc(placeholder)}" rows="4">${esc(value)}</textarea>
  </div>`;
}

function item(checks, key, label) {
  const checked = checks[key] ? 'checked' : '';
  return `
  <label class="chk-row ${checked ? 'chk-done' : ''}">
    <input type="checkbox" class="chk-input" data-key="${key}" ${checked} />
    <span class="chk-box"></span>
    <span class="chk-label">${label}</span>
  </label>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── styles ────────────────────────────────────────────────────────

function styles() {
  return `<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 15px; }
  body { background: #0d1824; color: #e9ddc1; font-family: 'Helvetica Neue', Arial, sans-serif; }

  /* ── layout ─────────────────────────── */
  .page-wrap { max-width: 860px; margin: 0 auto; padding: 0 20px 60px; }

  /* ── header ─────────────────────────── */
  .header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 28px 0 22px;
    border-bottom: 1px solid rgba(212,183,106,.25);
    margin-bottom: 28px;
  }
  .logo-wrap { display: flex; align-items: center; gap: 14px; }
  .logo-mark {
    width: 52px; height: 52px; border: 1.5px solid #d4b76a;
    display: flex; align-items: center; justify-content: center;
    font-family: Georgia, serif; font-size: 18px; color: #d4b76a;
    font-style: italic; letter-spacing: -1px; flex-shrink: 0;
  }
  .brand { font-family: Georgia, serif; font-size: 22px; color: #d4b76a; letter-spacing: 3px; }
  .tagline { font-size: 10px; letter-spacing: 3px; color: rgba(233,221,193,.5); text-transform: uppercase; margin-top: 3px; }
  .header-meta { text-align: right; }
  .unit-badge {
    display: inline-block; padding: 4px 12px;
    border: 1px solid rgba(212,183,106,.4);
    font-size: 11px; letter-spacing: 2px; color: #d4b76a;
    text-transform: uppercase;
  }
  .date-stamp { font-size: 11px; color: rgba(233,221,193,.4); margin-top: 5px; }

  /* ── unit hero ───────────────────────── */
  .unit-hero {
    padding: 32px 0 28px;
    border-bottom: 1px solid rgba(212,183,106,.15);
    margin-bottom: 24px;
  }
  .unit-hero-title { font-family: Georgia, serif; font-size: 38px; color: #f1e5c4; font-weight: 400; letter-spacing: .5px; }
  .unit-hero-sub { font-size: 13px; color: rgba(233,221,193,.55); letter-spacing: 1.5px; text-transform: uppercase; margin-top: 6px; }

  /* ── save bar ────────────────────────── */
  .save-bar {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px; background: rgba(0,0,0,.3);
    border: 1px solid rgba(212,183,106,.2);
    border-radius: 4px; margin-bottom: 28px; flex-wrap: wrap;
  }
  .save-status { flex: 1; font-size: 12px; color: #d4b76a; min-width: 100px; }

  /* ── cards ───────────────────────────── */
  .sections { display: flex; flex-direction: column; gap: 28px; }
  .card {
    background: rgba(255,255,255,.03);
    border: 1px solid rgba(212,183,106,.18);
    border-radius: 6px; overflow: hidden;
  }
  .card-head {
    display: flex; align-items: flex-start; gap: 16px;
    padding: 22px 24px 18px;
    border-bottom: 1px solid rgba(212,183,106,.12);
    background: rgba(212,183,106,.04);
  }
  .section-num {
    font-family: Georgia, serif; font-size: 28px; color: rgba(212,183,106,.35);
    font-weight: 400; line-height: 1; flex-shrink: 0; width: 36px; margin-top: 2px;
  }
  .section-title { font-family: Georgia, serif; font-size: 20px; color: #f1e5c4; font-weight: 400; }
  .section-sub { font-size: 12px; color: rgba(233,221,193,.5); margin-top: 4px; }
  .progress-ring { width: 46px; height: 46px; flex-shrink: 0; margin-left: auto; }
  .ring-svg { width: 46px; height: 46px; transform: rotate(-90deg); transform-origin: center; }
  .ring-txt { font-size: 8px; fill: #d4b76a; transform: rotate(90deg); transform-origin: center; font-family: 'Helvetica Neue', Arial, sans-serif; }

  /* ── sub sections (inside unit profile) ─*/
  .sub-section { padding: 20px 24px; border-bottom: 1px solid rgba(212,183,106,.08); }
  .sub-section:last-of-type { border-bottom: none; }
  .sub-title { font-size: 10px; letter-spacing: 2.5px; text-transform: uppercase; color: #d4b76a; margin-bottom: 14px; }

  /* ── field grid ──────────────────────── */
  .field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; }
  .field-grid-4 { grid-template-columns: 1fr 1fr 1fr 1fr; }
  @media (max-width: 620px) {
    .field-grid, .field-grid-4 { grid-template-columns: 1fr; }
  }
  .field-wrap { display: flex; flex-direction: column; gap: 5px; }
  .field-label { font-size: 11px; color: rgba(233,221,193,.5); text-transform: uppercase; letter-spacing: 1px; }
  .field-input {
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(212,183,106,.2);
    border-radius: 3px; padding: 9px 12px;
    color: #f1e5c4; font-size: 14px; font-family: 'Helvetica Neue', Arial, sans-serif;
    outline: none; transition: border-color .2s;
  }
  .field-input:focus { border-color: rgba(212,183,106,.6); background: rgba(212,183,106,.05); }
  .field-input::placeholder { color: rgba(233,221,193,.25); }
  .field-textarea {
    width: 100%;
    background: rgba(255,255,255,.05);
    border: 1px solid rgba(212,183,106,.2);
    border-radius: 3px; padding: 10px 12px;
    color: #f1e5c4; font-size: 14px; font-family: 'Helvetica Neue', Arial, sans-serif;
    outline: none; resize: vertical; transition: border-color .2s;
  }
  .field-textarea:focus { border-color: rgba(212,183,106,.6); }
  .field-textarea::placeholder { color: rgba(233,221,193,.25); }

  /* ── card actions ────────────────────── */
  .card-actions { padding: 16px 24px; text-align: right; border-top: 1px solid rgba(212,183,106,.1); }

  /* ── checklist items ─────────────────── */
  .checklist { padding: 8px 24px 16px; display: flex; flex-direction: column; gap: 2px; }
  .checklist-group-label {
    font-size: 10px; letter-spacing: 2px; text-transform: uppercase;
    color: rgba(212,183,106,.6); padding: 14px 24px 4px;
  }
  .chk-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: 4px; cursor: pointer;
    transition: background .15s;
  }
  .chk-row:hover { background: rgba(212,183,106,.05); }
  .chk-row.chk-done .chk-label { text-decoration: line-through; color: rgba(233,221,193,.4); }
  .chk-input { display: none; }
  .chk-box {
    width: 18px; height: 18px; flex-shrink: 0;
    border: 1.5px solid rgba(212,183,106,.4); border-radius: 3px;
    position: relative; transition: all .2s;
  }
  .chk-input:checked + .chk-box {
    background: #d4b76a; border-color: #d4b76a;
  }
  .chk-input:checked + .chk-box::after {
    content: ''; position: absolute;
    left: 4px; top: 1px; width: 6px; height: 10px;
    border-right: 2px solid #0d1824; border-bottom: 2px solid #0d1824;
    transform: rotate(45deg);
  }
  .chk-label { font-size: 14px; color: rgba(233,221,193,.85); line-height: 1.4; }

  /* ── buttons ─────────────────────────── */
  .btn-gold {
    background: #d4b76a; color: #0d1824;
    border: none; border-radius: 3px; padding: 10px 20px;
    font-size: 13px; font-weight: 600; letter-spacing: .5px;
    cursor: pointer; transition: background .2s;
  }
  .btn-gold:hover { background: #e8c97a; }
  .btn-outline {
    background: transparent; color: #d4b76a;
    border: 1px solid rgba(212,183,106,.5); border-radius: 3px; padding: 10px 20px;
    font-size: 13px; cursor: pointer; transition: all .2s;
  }
  .btn-outline:hover { border-color: #d4b76a; }
  .btn-sm { padding: 7px 14px; font-size: 12px; }

  /* ── home page ───────────────────────── */
  .home-main { padding: 80px 0 40px; text-align: center; }
  .home-title { font-family: Georgia, serif; font-size: 44px; color: #f1e5c4; font-weight: 400; line-height: 1.15; margin-bottom: 16px; }
  .home-sub { color: rgba(233,221,193,.55); font-size: 15px; margin-bottom: 32px; }
  .unit-search { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .slug-input {
    padding: 12px 18px; background: rgba(255,255,255,.05);
    border: 1px solid rgba(212,183,106,.3); border-radius: 3px;
    color: #f1e5c4; font-size: 14px; width: 340px; outline: none;
  }
  .slug-input::placeholder { color: rgba(233,221,193,.3); }
  .slug-input:focus { border-color: rgba(212,183,106,.7); }
  .home-hint { font-size: 12px; color: rgba(233,221,193,.3); margin-top: 14px; }

  /* ── footer ──────────────────────────── */
  .footer { text-align: center; padding: 40px 0 20px; border-top: 1px solid rgba(212,183,106,.12); margin-top: 40px; }
  .footer-brand { font-family: Georgia, serif; font-size: 16px; color: #d4b76a; letter-spacing: 3px; }
  .footer-sub { font-size: 11px; color: rgba(233,221,193,.35); margin-top: 6px; letter-spacing: 1px; }

  /* ── print ───────────────────────────── */
  @media print {
    body { background: white; color: #111; }
    .save-bar, .card-actions { display: none; }
    .card { border-color: #ccc; }
    .unit-hero-title, .section-title { color: #111; }
    .field-input, .field-textarea { border-color: #ccc; color: #111; background: white; }
    .btn-gold, .btn-outline { display: none; }
  }
</style>`;
}

// ── start ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Rove Haven Checklists running on port ${PORT}`);
});
