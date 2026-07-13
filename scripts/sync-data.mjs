import { mkdir, writeFile } from 'node:fs/promises';

const API = 'https://api.euskadi.eus';
const FACILITY = { lat: 43.2852, lon: -2.9778 };
const RADIUS_KM = 12;
const UNITS = { PM25:'µg/m³', PM10:'µg/m³', NO2:'µg/m³', NO:'µg/m³', SO2:'µg/m³', O3:'µg/m³', CO:'mg/m³', BENZENE:'µg/m³', TEMP:'°C', HUMIDITY:'%', WIND:'m/s' };
const KNOWN = [
  { id:'212', name:'Polideportivo Zorrotza', municipality:'Bilbao', lat:43.2749, lon:-2.9848, type:'industrial', typeLabel:'городская · промышленное влияние' },
  { id:'elorrieta', name:'Elorrieta', municipality:'Bilbao', lat:43.2862, lon:-2.9585, type:'industrial', typeLabel:'городская · промышленное влияние' },
  { id:'barakaldo', name:'Barakaldo', municipality:'Barakaldo', lat:43.2960, lon:-2.9879, type:'traffic', typeLabel:'городская · транспорт' },
  { id:'erandio', name:'Erandio', municipality:'Erandio', lat:43.3046, lon:-2.9517, type:'traffic', typeLabel:'городская · транспорт' },
  { id:'maria-diaz', name:'María Díaz de Haro', municipality:'Bilbao', lat:43.2647, lon:-2.9475, type:'traffic', typeLabel:'городская · транспорт' },
  { id:'mazarredo', name:'Alameda Mazarredo', municipality:'Bilbao', lat:43.2666, lon:-2.9286, type:'traffic', typeLabel:'городская · транспорт' },
  { id:'arraiz', name:'Arraiz', municipality:'Bilbao', lat:43.2450, lon:-2.9660, type:'background', typeLabel:'пригородная · фон' },
  { id:'parque-europa', name:'Parque Europa', municipality:'Bilbao', lat:43.2590, lon:-2.8934, type:'background', typeLabel:'городская · фон' },
  { id:'sangroniz', name:'Sangroniz', municipality:'Sondika', lat:43.3001, lon:-2.9352, type:'traffic', typeLabel:'пригородная · транспорт' }
];

const OPENAPI_URL = 'https://opendata.euskadi.eus/contenidos/recurso_tecnico/data_apirest/es_def/adjuntos/air-quality.json';

const number = value => value === null || value === undefined || value === '' ? NaN : Number(value);
const measured = value => Number.isFinite(number(value));
const text = value => String(value ?? '');
const simplified = value => text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function parameterCode(value) {
  const raw = text(value?.code ?? value?.id ?? value?.name ?? value).toUpperCase().replace(/[₂.\s_-]/g, match => match === '₂' ? '2' : '');
  if (/PM.?2.?5|PM25/.test(raw)) return 'PM25';
  if (/PM.?10/.test(raw)) return 'PM10';
  if (/NO.?2|DIOX.*NITRO/.test(raw)) return 'NO2';
  if (/^NO$|MONOX.*NITRO/.test(raw)) return 'NO';
  if (/SO.?2|DIOX.*AZUF|SULFUR/.test(raw)) return 'SO2';
  if (/^O.?3$|OZON/.test(raw)) return 'O3';
  if (/^CO$|MONOX.*CARB/.test(raw)) return 'CO';
  if (/BENZ|C6H6/.test(raw)) return 'BENZENE';
  if (/TEMP/.test(raw)) return 'TEMP';
  if (/HUM|RH/.test(raw)) return 'HUMIDITY';
  if (/WIND|VIENTO|VELV/.test(raw)) return 'WIND';
  return raw.replace(/[^A-Z0-9]/g, '').slice(0, 14) || 'UNKNOWN';
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(q));
}

async function fetchJson(url, timeout = 25000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { headers: { accept:'application/json', 'user-agent':'Aire-Zorrotza/1.1 (+https://github.com/Aerotsunami/Aire-Zorrotza)' }, signal:controller.signal });
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 300);
      throw new Error(`${response.status} ${response.statusText}: ${detail || url}`);
    }
    return await response.json();
  } finally { clearTimeout(timer); }
}

function arraysDeep(value, depth = 0, result = []) {
  if (depth > 8 || value === null || value === undefined) return result;
  if (Array.isArray(value)) {
    if (value.some(item => item && typeof item === 'object')) result.push(value);
    for (const item of value) arraysDeep(item, depth + 1, result);
  } else if (typeof value === 'object') {
    for (const item of Object.values(value)) arraysDeep(item, depth + 1, result);
  }
  return result;
}

function stationArray(payload) {
  const score = array => array.slice(0, 15).reduce((sum, item) => {
    const p = item?.properties || item;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return sum;
    return sum + (p.name || p.nombre || p.stationName ? 4 : 0) + (p.id || p.code || p.stationId || item.id ? 2 : 0) + (item.geometry || p.geometry || p.latitude || p.lat ? 2 : 0);
  }, 0);
  return arraysDeep(payload).sort((a,b) => score(b) - score(a) || b.length - a.length)[0] || [];
}

function knownStation(name) {
  const norm = simplified(name);
  return KNOWN.find(item => {
    const candidate = simplified(item.name);
    const a = norm.split(' ')[0];
    const b = candidate.split(' ')[0];
    return norm.includes(b) || candidate.includes(a);
  });
}

function normalizeStation(raw, index) {
  const p = raw?.properties || raw || {};
  const name = p.name ?? p.stationName ?? p.nombre ?? p.title ?? `Станция ${p.id ?? raw?.id ?? index}`;
  const known = knownStation(name);
  const coords = raw?.geometry?.coordinates ?? p.geometry?.coordinates ?? p.location?.coordinates;
  let lon = number(Array.isArray(coords) ? coords[0] : p.longitude ?? p.lon ?? p.lng ?? p.x);
  let lat = number(Array.isArray(coords) ? coords[1] : p.latitude ?? p.lat ?? p.y);
  if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && known) { lat = known.lat; lon = known.lon; }
  const id = text(p.id ?? p.stationId ?? p.code ?? p.codigo ?? raw?.id ?? known?.id ?? index);
  const typeText = text(p.stationType ?? p.type ?? p.tipo ?? known?.typeLabel).toLowerCase();
  const type = /industr/.test(typeText) ? 'industrial' : /traf|traffic/.test(typeText) ? 'traffic' : known?.type || 'background';
  return {
    id, name:text(name), municipality:text(p.municipality?.name ?? p.municipality ?? p.municipio ?? known?.municipality ?? 'Bizkaia'),
    lat, lon, type, typeLabel:known?.typeLabel ?? (type === 'industrial' ? 'промышленное влияние' : type === 'traffic' ? 'транспорт' : 'фон'),
    parameters:[], history:{}, source:'live',
    officialUrl:`https://www.euskadi.eus/aa17aMovilidadWar/estaciones/detalle/${encodeURIComponent(id)}?R01HNoPortal=true`
  };
}

function iso(value) {
  if (value === null || value === undefined || value === '') return null;
  const raw = typeof value === 'number' && value < 1e12 ? value * 1000 : value;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function extractMeasurements(payload) {
  const records = [];
  const walk = (value, inherited = {}, depth = 0) => {
    if (depth > 10 || value === null || value === undefined) return;
    if (Array.isArray(value)) { for (const item of value) walk(item, inherited, depth + 1); return; }
    if (typeof value !== 'object') return;
    const time = value.dateTime ?? value.datetime ?? value.date ?? value.timestamp ?? value.measurementDate ?? value.hour ?? value.from ?? inherited.time;
    const unit = value.unit?.symbol ?? value.unit?.name ?? value.unit ?? value.unidad ?? inherited.unit;
    const parameter = value.parameter ?? value.pollutant ?? value.magnitude ?? value.magnitud ?? value.parameterId ?? value.contaminant ?? inherited.parameter;
    const direct = value.value ?? value.measurementValue ?? value.average ?? value.concentration ?? value.valor ?? value.media;
    const timestamp = iso(time);
    if (timestamp && parameter !== undefined && measured(direct)) records.push({ code:parameterCode(parameter), time:timestamp, value:number(direct), unit:text(unit) || undefined });
    if (timestamp) for (const [key, child] of Object.entries(value)) {
      const code = parameterCode(key);
      if (UNITS[code] && measured(child)) records.push({ code, time:timestamp, value:number(child), unit:UNITS[code] });
    }
    const next = { time:time || inherited.time, unit:unit || inherited.unit, parameter:parameter || inherited.parameter };
    for (const child of Object.values(value)) if (child && typeof child === 'object') walk(child, next, depth + 1);
  };
  walk(payload);
  const unique = new Map();
  for (const record of records) if (record.code !== 'UNKNOWN') unique.set(`${record.code}|${record.time}`, record);
  return [...unique.values()].sort((a,b) => new Date(a.time) - new Date(b.time));
}

function history(records) {
  const result = {};
  for (const record of records) {
    if (!result[record.code]) result[record.code] = [];
    result[record.code].push({ ...record, unit:record.unit || UNITS[record.code] || 'µg/m³' });
  }
  return result;
}

async function stationHistory(id) {
  const to = new Date();
  const from = new Date(to.getTime() - 72 * 3600000);
  const compact = date => date.toISOString().slice(0, 19);
  const path = `/air-quality/measurements/hourly/stations/${encodeURIComponent(id)}/from/${encodeURIComponent(compact(from))}/to/${encodeURIComponent(compact(to))}`;
  const records = extractMeasurements(await fetchJson(`${API}${path}`));
  if (!records.length) throw new Error(`Нет распознанных измерений для станции ${id}`);
  return history(records);
}

const rawStations = stationArray(await fetchJson(`${API}/air-quality/stations`));
const openApi = await fetchJson(OPENAPI_URL);
const hourlyPath = openApi?.paths?.['/air-quality/measurements/hourly/stations/{station-id}/from/{date-time.gt}/to/{date-time.lt}']?.get;
console.log(`Hourly date parameters: ${JSON.stringify(hourlyPath?.parameters || [])}`);
let stations = rawStations.map(normalizeStation).filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon));
for (const station of stations) station.distance = distanceKm(FACILITY, station);
stations = stations.filter(item => item.distance <= RADIUS_KM).sort((a,b) => a.distance - b.distance).slice(0, 9);
if (!stations.length) throw new Error('API не вернул станции с координатами в радиусе 12 км');

await Promise.all(stations.map(async station => {
  try {
    station.history = await stationHistory(station.id);
    station.parameters = Object.keys(station.history);
  } catch (error) {
    station.syncError = error.message;
    console.error(`Station ${station.id} (${station.name}): ${station.syncError}`);
  }
}));

const useful = stations.filter(station => Object.keys(station.history).length);
if (useful.length < 2) throw new Error(`Получены измерения только для ${useful.length} станций из ${stations.length}`);

const payload = {
  generatedAt:new Date().toISOString(),
  source:'Open Data Euskadi Air Quality API',
  sourceUrl:'https://opendata.euskadi.eus/api-air-quality/?api=air-quality',
  radiusKm:RADIUS_KM,
  stations:useful
};

await mkdir('data', { recursive:true });
await writeFile('data/live.json', `${JSON.stringify(payload)}\n`, 'utf8');
console.log(`Published ${useful.length} stations and ${useful.reduce((sum, station) => sum + Object.values(station.history).reduce((n, points) => n + points.length, 0), 0)} hourly measurements.`);
