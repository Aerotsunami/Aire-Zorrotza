(() => {
  'use strict';

  const FACILITY = { name: 'Profersa', lat: 43.2852, lon: -2.9778 };
  const RADIUS_KM = 12;
  const API_BASES = ['https://api.euskadi.eus'];
  const OFFICIAL_DATASET = 'https://opendata.euskadi.eus/contenidos/ds_informes_estudios/calidad_aire_2026/es_def/adjuntos/';
  const AUTO_REFRESH_MS = 10 * 60 * 1000;
  const OFFICIAL_STATION_IDS = ['212', '211', '59', '56', '81', '60', '92', '62', '61'];
  const STATION_ID_ALIASES = {
    '212': '212',
    '211': 'elorrieta',
    '59': 'barakaldo',
    '56': 'erandio',
    '81': 'maria-diaz',
    '60': 'mazarredo',
    '92': 'arraiz',
    '62': 'parque-europa',
    '61': 'sangroniz'
  };
  const CACHE_KEY = 'zorrotza-aire-live-v2';
  const CACHE_KEYS = [CACHE_KEY, 'zorrotza-aire-live-v1'];
  const COLORS = ['#77e7c2', '#65d5e8', '#ffc867', '#b8a2ff', '#ff8b69', '#c8ef6b'];

  const PARAMETERS = {
    PM25: { code: 'PM25', label: 'PM2.5', full: 'Мелкие частицы PM2.5', unit: 'µg/m³', who: 15, note: 'среднесуточный ориентир ВОЗ', breaks: [10, 20, 25, 50, 75] },
    PM10: { code: 'PM10', label: 'PM10', full: 'Взвешенные частицы PM10', unit: 'µg/m³', who: 45, note: 'среднесуточный ориентир ВОЗ', breaks: [20, 40, 50, 100, 150] },
    NO2: { code: 'NO2', label: 'NO₂', full: 'Диоксид азота', unit: 'µg/m³', who: 25, note: 'среднесуточный ориентир ВОЗ', breaks: [40, 90, 120, 230, 340] },
    O3: { code: 'O3', label: 'O₃', full: 'Тропосферный озон', unit: 'µg/m³', who: 100, note: 'макс. 8-часовое среднее ВОЗ', breaks: [50, 100, 130, 240, 380] },
    SO2: { code: 'SO2', label: 'SO₂', full: 'Диоксид серы', unit: 'µg/m³', who: 40, note: 'среднесуточный ориентир ВОЗ', breaks: [100, 200, 350, 500, 750] },
    CO: { code: 'CO', label: 'CO', full: 'Монооксид углерода', unit: 'mg/m³', who: 4, note: 'суточный ориентир ВОЗ', breaks: null },
    NO: { code: 'NO', label: 'NO', full: 'Монооксид азота', unit: 'µg/m³', who: null, note: 'нет категории European AQI', breaks: null },
    BENZENE: { code: 'BENZENE', label: 'C₆H₆', full: 'Бензол', unit: 'µg/m³', who: null, note: 'оценивается по годовому нормативу', breaks: null },
    TEMP: { code: 'TEMP', label: '°C', full: 'Температура', unit: '°C', who: null, note: 'метеопараметр', breaks: null },
    HUMIDITY: { code: 'HUMIDITY', label: 'RH', full: 'Влажность', unit: '%', who: null, note: 'метеопараметр', breaks: null },
    WIND: { code: 'WIND', label: 'Ветер', full: 'Скорость ветра', unit: 'm/s', who: null, note: 'метеопараметр', breaks: null }
  };

  const LEVELS = [
    { key: 'good', label: 'Хорошо', short: 'хорошо', advice: 'По измеряемым загрязнителям ограничений для обычной активности нет.', icon: '✓' },
    { key: 'fair', label: 'Удовлетворительно', short: 'удовл.', advice: 'Чувствительным людям стоит учитывать самочувствие при долгой нагрузке на улице.', icon: '≈' },
    { key: 'moderate', label: 'Умеренно', short: 'умеренно', advice: 'При симптомах сократите интенсивную нагрузку рядом с дорогами и промышленными зонами.', icon: '!' },
    { key: 'poor', label: 'Плохо', short: 'плохо', advice: 'Уязвимым группам лучше уменьшить время и интенсивность активности на улице.', icon: '!' },
    { key: 'very-poor', label: 'Очень плохо', short: 'оч. плохо', advice: 'Избегайте интенсивной нагрузки на улице; следите за официальными рекомендациями.', icon: '!!' },
    { key: 'extreme', label: 'Крайне плохо', short: 'крайне плохо', advice: 'Оставайтесь в помещении, если это рекомендуют власти, и следите за оповещениями.', icon: '!!' }
  ];

  const FALLBACK_STATIONS = [
    { id: '212', name: 'Polideportivo Zorrotza', municipality: 'Bilbao', lat: 43.2749, lon: -2.9848, type: 'industrial', typeLabel: 'городская · промышленное влияние', parameters: ['PM25','PM10','NO2','SO2'] },
    { id: 'elorrieta', name: 'Elorrieta', municipality: 'Bilbao', lat: 43.2862, lon: -2.9585, type: 'industrial', typeLabel: 'городская · промышленное влияние', parameters: ['PM10','NO2','SO2','O3'] },
    { id: 'barakaldo', name: 'Barakaldo', municipality: 'Barakaldo', lat: 43.2960, lon: -2.9879, type: 'traffic', typeLabel: 'городская · транспорт', parameters: ['PM25','PM10','NO2','CO'] },
    { id: 'erandio', name: 'Erandio', municipality: 'Erandio', lat: 43.3046, lon: -2.9517, type: 'traffic', typeLabel: 'городская · транспорт', parameters: ['PM25','PM10','NO2','CO'] },
    { id: 'maria-diaz', name: 'María Díaz de Haro', municipality: 'Bilbao', lat: 43.2647, lon: -2.9475, type: 'traffic', typeLabel: 'городская · транспорт', parameters: ['PM25','PM10','NO2','SO2','CO','O3'] },
    { id: 'mazarredo', name: 'Alameda Mazarredo', municipality: 'Bilbao', lat: 43.2666, lon: -2.9286, type: 'traffic', typeLabel: 'городская · транспорт', parameters: ['PM25','PM10','NO2','SO2','CO','BENZENE'] },
    { id: 'arraiz', name: 'Arraiz', municipality: 'Bilbao', lat: 43.2450, lon: -2.9660, type: 'background', typeLabel: 'пригородная · фон', parameters: ['PM10','NO2','SO2','O3'] },
    { id: 'parque-europa', name: 'Parque Europa', municipality: 'Bilbao', lat: 43.2590, lon: -2.8934, type: 'background', typeLabel: 'городская · фон', parameters: ['PM25','PM10','NO2','SO2','O3'] },
    { id: 'sangroniz', name: 'Sangroniz', municipality: 'Sondika', lat: 43.3001, lon: -2.9352, type: 'traffic', typeLabel: 'пригородная · транспорт', parameters: ['PM25','PM10','NO2'] }
  ];

  const state = {
    stations: [],
    sourceMode: 'loading',
    sourceMessage: '',
    sourceDetail: '',
    lastSync: null,
    selectedId: null,
    stationFilter: 'all',
    search: '',
    compareParameter: 'PM25',
    comparedIds: [],
    detailHours: 24,
    installPrompt: null,
    activeView: 'overview'
  };

  let leafletMap = null;
  let stationLayer = null;
  let facilityLayer = null;

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));

  function distanceKm(a, b) {
    const R = 6371;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lon - a.lon) * Math.PI / 180;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function fmtNumber(value, digits = 1) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(Number(value));
  }

  function hasMeasuredValue(value) {
    return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
  }

  function fmtDate(value, withDate = true) {
    if (!value) return 'время не указано';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('ru-RU', withDate ? { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' } : { hour:'2-digit', minute:'2-digit' }).format(date);
  }

  function relativeTime(value) {
    if (!value) return 'нет времени';
    const delta = Date.now() - new Date(value).getTime();
    if (!Number.isFinite(delta)) return fmtDate(value);
    const minutes = Math.round(delta / 60000);
    if (minutes < 2) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    const hours = Math.round(minutes / 60);
    if (hours < 36) return `${hours} ч назад`;
    return fmtDate(value);
  }

  function normalizeParam(value) {
    const raw = String(value?.code ?? value?.id ?? value?.name ?? value ?? '').toUpperCase().replace(/[₂.\s_-]/g, match => match === '₂' ? '2' : '');
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

  function levelFor(code, value) {
    const config = PARAMETERS[code];
    if (!config?.breaks || value === null || value === undefined || !Number.isFinite(Number(value))) return null;
    const n = Number(value);
    let index = config.breaks.findIndex(limit => n <= limit);
    if (index === -1) index = 5;
    return { ...LEVELS[index], index, value: n };
  }

  function overallFor(station) {
    const readings = latestReadings(station);
    const levels = Object.entries(readings).map(([code, reading]) => levelFor(code, reading.value)).filter(Boolean);
    return levels.length ? levels.sort((a,b) => b.index - a.index)[0] : { ...LEVELS[0], index: 0, noIndex: true };
  }

  function latestReadings(station) {
    const latest = {};
    Object.entries(station?.history || {}).forEach(([code, points]) => {
      const valid = points.filter(point => hasMeasuredValue(point.value)).sort((a,b) => new Date(a.time) - new Date(b.time));
      if (valid.length) latest[code] = valid[valid.length - 1];
    });
    return latest;
  }

  function latestTime(station) {
    const times = Object.values(latestReadings(station)).map(item => new Date(item.time).getTime()).filter(Number.isFinite);
    return times.length ? new Date(Math.max(...times)).toISOString() : null;
  }

  function dataCompleteness(station, hours = 24) {
    const all = Object.values(station?.history || {});
    if (!all.length) return 0;
    const ratios = all.map(points => Math.min(1, points.filter(p => hasMeasuredValue(p.value)).slice(-hours).length / hours));
    return Math.round(ratios.reduce((sum, n) => sum + n, 0) / ratios.length * 100);
  }

  function generateDemoHistory(station, stationIndex) {
    const now = new Date();
    now.setMinutes(0,0,0);
    const baselines = { PM25: 9, PM10: 18, NO2: 24, O3: 42, SO2: 4, CO: .35, BENZENE: 1.1, TEMP: 20, HUMIDITY: 66, WIND: 2.4 };
    const history = {};
    station.parameters.forEach((code, paramIndex) => {
      history[code] = Array.from({ length: 72 }, (_, i) => {
        const hour = 71 - i;
        const time = new Date(now.getTime() - hour * 3600000);
        const wave = Math.sin((i + stationIndex * 2 + paramIndex) / 5) * (code === 'NO2' ? 8 : code.startsWith('PM') ? 5 : 3);
        const rush = ['NO2','PM25','PM10'].includes(code) ? Math.max(0, Math.sin((time.getHours() - 6) / 3) * 7) : 0;
        const local = stationIndex * 1.3 + Math.sin(i * 1.71 + stationIndex) * 1.8;
        let value = Math.max(0, (baselines[code] ?? 10) + wave + rush + local);
        if ((i + stationIndex * 7 + paramIndex * 3) % 41 === 0) value = null;
        return { time: time.toISOString(), value: value === null ? null : Math.round(value * 10) / 10, unit: PARAMETERS[code]?.unit || 'µg/m³', code };
      });
    });
    return history;
  }

  function demoStations() {
    return FALLBACK_STATIONS.map((station, index) => ({
      ...station,
      distance: distanceKm(FACILITY, station),
      history: generateDemoHistory(station, index),
      source: 'demo',
      officialUrl: station.id === '212' ? 'https://www.euskadi.eus/aa17aMovilidadWar/estaciones/detalle/212?R01HNoPortal=true' : 'https://www.euskadi.eus/informacion/evaluacion-de-la-calidad-del-aire-en-euskadi/web01-sede/es/'
    })).sort((a,b) => a.distance - b.distance);
  }

  function officialStationMetadata() {
    return FALLBACK_STATIONS.map(station => ({
      ...station,
      distance: distanceKm(FACILITY, station),
      history: {},
      source: 'official-metadata',
      officialUrl: station.id === '212' ? 'https://www.euskadi.eus/aa17aMovilidadWar/estaciones/detalle/212?R01HNoPortal=true' : 'https://www.euskadi.eus/informacion/evaluacion-de-la-calidad-del-aire-en-euskadi/web01-sede/es/'
    })).sort((a, b) => a.distance - b.distance);
  }

  async function fetchJson(url, timeout = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally { clearTimeout(timer); }
  }

  function arraysDeep(value, depth = 0, found = []) {
    if (depth > 7 || value === null || value === undefined) return found;
    if (Array.isArray(value)) {
      if (value.some(item => item && typeof item === 'object')) found.push(value);
      value.forEach(item => arraysDeep(item, depth + 1, found));
    } else if (typeof value === 'object') {
      Object.values(value).forEach(item => arraysDeep(item, depth + 1, found));
    }
    return found;
  }

  function chooseStationArray(payload) {
    const arrays = arraysDeep(payload);
    const score = array => array.slice(0, 12).reduce((total, item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return total;
      const props = item.properties || item;
      return total + (props.name || props.nombre || props.stationName || props.title ? 3 : 0)
        + (props.id || props.code || props.stationId || item.id ? 1 : 0)
        + (item.geometry || props.geometry || props.latitude || props.lat ? 2 : 0);
    }, 0);
    return arrays.sort((a,b) => score(b) - score(a) || b.length - a.length)[0] || [];
  }

  function stationName(raw) {
    return raw.name ?? raw.stationName ?? raw.nombre ?? raw.title ?? raw.properties?.name ?? raw.properties?.nombre ?? `Станция ${raw.id ?? ''}`;
  }

  function matchFallback(name, id) {
    const alias = STATION_ID_ALIASES[String(id ?? '')];
    if (alias) {
      const matchedById = FALLBACK_STATIONS.find(item => String(item.id) === alias);
      if (matchedById) return matchedById;
    }
    const norm = String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return FALLBACK_STATIONS.find(item => {
      const candidate = item.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
      return norm.includes(candidate.split(' ')[0]) || candidate.includes(norm.split(' ')[0]);
    });
  }

  function normalizeStation(raw, index) {
    const props = raw.properties || raw;
    const id = String(props.id ?? props.stationId ?? props.code ?? props.codigo ?? raw.id ?? index);
    const rawName = stationName(props);
    const fallback = matchFallback(rawName, id);
    const name = fallback?.name || rawName;
    let coords = raw.geometry?.coordinates ?? props.geometry?.coordinates ?? props.location?.coordinates;
    let lon = Number(Array.isArray(coords) ? coords[0] : props.longitude ?? props.lon ?? props.lng ?? props.x);
    let lat = Number(Array.isArray(coords) ? coords[1] : props.latitude ?? props.lat ?? props.y);
    if ((!Number.isFinite(lat) || !Number.isFinite(lon)) && fallback) { lat = fallback.lat; lon = fallback.lon; }
    const typeText = String(props.stationType ?? props.type ?? props.tipo ?? fallback?.typeLabel ?? '').toLowerCase();
    const type = /industr/.test(typeText) ? 'industrial' : /traf|traffic/.test(typeText) ? 'traffic' : 'background';
    const rawParameters = props.parameters ?? props.pollutants ?? props.measurementParameters ?? fallback?.parameters ?? [];
    const parameters = (Array.isArray(rawParameters) ? rawParameters : Object.keys(rawParameters)).map(normalizeParam).filter(code => code !== 'UNKNOWN');
    return {
      id, name, municipality: props.location?.municipality ?? props.municipality?.name ?? props.municipality ?? props.municipio ?? fallback?.municipality ?? 'Bizkaia',
      lat, lon, type, typeLabel: fallback?.typeLabel ?? (type === 'industrial' ? 'промышленное влияние' : type === 'traffic' ? 'транспорт' : 'фон'),
      parameters: [...new Set(parameters)], history: {}, source: 'live', raw,
      officialUrl: `https://www.euskadi.eus/aa17aMovilidadWar/estaciones/detalle/${encodeURIComponent(id)}?R01HNoPortal=true`
    };
  }

  function extractMeasurements(payload) {
    const records = [];
    const safeIso = value => {
      if (value === null || value === undefined || value === '') return null;
      const raw = typeof value === 'number' && value < 1e12 ? value * 1000 : value;
      const date = new Date(raw);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    };
    const walk = (value, inherited = {}, depth = 0) => {
      if (depth > 9 || value === null || value === undefined) return;
      if (Array.isArray(value)) { value.forEach(item => walk(item, inherited, depth + 1)); return; }
      if (typeof value !== 'object') return;
      const time = value.dateTime ?? value.datetime ?? value.date ?? value.timestamp ?? value.measurementDate ?? value.hour ?? value.from ?? inherited.time;
      const unit = value.unit?.symbol ?? value.unit?.name ?? value.unit ?? value.unidad ?? inherited.unit;
      const parameter = value.parameter ?? value.pollutant ?? value.magnitude ?? value.magnitud ?? value.parameterId ?? value.contaminant ?? value.name ?? inherited.parameter;
      const directValue = value.value ?? value.measurementValue ?? value.average ?? value.concentration ?? value.valor ?? value.media;
      const normalizedTime = safeIso(time);
      if (normalizedTime && parameter !== undefined && hasMeasuredValue(directValue)) {
        records.push({ code: normalizeParam(parameter), time: normalizedTime, value: Number(directValue), unit: String(unit || '').replace('/m3', '/m³') || undefined, quality: value.airquality || null });
      }
      if (normalizedTime) {
        Object.entries(value).forEach(([key, child]) => {
          const code = normalizeParam(key);
          if (PARAMETERS[code] && hasMeasuredValue(child)) records.push({ code, time: normalizedTime, value: Number(child), unit: PARAMETERS[code].unit });
        });
      }
      const next = { time: time || inherited.time, unit: unit || inherited.unit, parameter: parameter || inherited.parameter };
      Object.values(value).forEach(child => { if (child && typeof child === 'object') walk(child, next, depth + 1); });
    };
    walk(payload);
    const unique = new Map();
    records.filter(r => r.code !== 'UNKNOWN' && !Number.isNaN(new Date(r.time).getTime())).forEach(record => {
      const key = `${record.code}|${record.time}`;
      const current = unique.get(key);
      if (!current || (record.quality && !current.quality)) unique.set(key, record);
    });
    const selected = [...unique.values()];
    const byTime = selected.reduce((map, record) => {
      if (!map.has(record.time)) map.set(record.time, []);
      map.get(record.time).push(record);
      return map;
    }, new Map());
    const pendingTimes = new Set([...byTime.entries()]
      .filter(([, items]) => items.length > 1 && items.every(item => Number(item.value) === 0) && items.every(item => !item.quality))
      .map(([time]) => time));
    return selected.filter(record => !pendingTimes.has(record.time));
  }

  function historyFromRecords(records) {
    return records.reduce((acc, record) => {
      if (!acc[record.code]) acc[record.code] = [];
      acc[record.code].push({ ...record, unit: record.unit || PARAMETERS[record.code]?.unit || 'µg/m³' });
      return acc;
    }, {});
  }

  function isoPath(date) {
    return date.toISOString().slice(0, 16);
  }

  async function fetchStationHistory(base, stationId) {
    const to = new Date();
    const from = new Date(to.getTime() - 72 * 3600000);
    const path = `/air-quality/measurements/hourly/stations/${encodeURIComponent(stationId)}/from/${encodeURIComponent(isoPath(from))}/to/${encodeURIComponent(isoPath(to))}`;
    const payload = await fetchJson(`${base}${path}`);
    const records = extractMeasurements(payload);
    if (records.length) return historyFromRecords(records);
    throw new Error('Почасовые значения не распознаны');
  }

  async function loadLiveStations() {
    let base = null;
    let stationPayload = null;
    let stationError = null;
    for (const candidate of API_BASES) {
      try {
        stationPayload = await fetchJson(`${candidate}/air-quality/stations`);
        base = candidate;
        break;
      } catch (error) { stationError = error; }
    }
    if (!base) throw stationError || new Error('Список станций недоступен');
    const candidates = chooseStationArray(stationPayload);
    let stations = candidates.map(normalizeStation)
      .filter(item => OFFICIAL_STATION_IDS.includes(String(item.id)))
      .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon));
    stations.forEach(item => { item.distance = distanceKm(FACILITY, item); });
    stations = stations.filter(item => item.distance <= RADIUS_KM)
      .sort((a,b) => OFFICIAL_STATION_IDS.indexOf(String(a.id)) - OFFICIAL_STATION_IDS.indexOf(String(b.id)));
    if (!stations.length) throw new Error('В ответе не найдены станции с координатами вокруг Zorrotza');

    await Promise.all(stations.map(async station => {
      try {
        station.history = await fetchStationHistory(base, station.id);
        station.parameters = Object.keys(station.history);
      } catch { station.history = {}; }
    }));
    const useful = stations.filter(station => Object.keys(station.history).length);
    if (useful.length < 2) throw new Error('API ответил, но почасовые измерения не получены');
    return { stations: useful, base };
  }

  async function loadPublishedSnapshot() {
    const payload = await fetchJson(`./data/live.json?ts=${Date.now()}`, 6000);
    if (!Array.isArray(payload?.stations) || !payload.stations.length) throw new Error('Опубликованный снимок данных ещё не создан');
    const stations = payload.stations.filter(station => station && station.id && Number.isFinite(Number(station.lat)) && Number.isFinite(Number(station.lon)));
    if (stations.filter(station => Object.values(station.history || {}).some(points => Array.isArray(points) && points.length)).length < 2) {
      throw new Error('В опубликованном снимке недостаточно измерений');
    }
    return { stations, generatedAt: payload.generatedAt || new Date().toISOString(), source: payload.source || 'Open Data Euskadi' };
  }

  function saveCache(stations, savedAt = new Date().toISOString()) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt, stations })); } catch { /* storage is optional */ }
  }

  function readCache() {
    for (const key of CACHE_KEYS) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        if (parsed?.stations?.length) return parsed;
      } catch { /* try the previous cache format */ }
    }
    return null;
  }

  function finishDataRender() {
    state.stations.forEach(station => { station.distance = station.distance ?? distanceKm(FACILITY, station); });
    state.stations.sort((a,b) => a.distance - b.distance);
    state.selectedId = state.selectedId && state.stations.some(s => s.id === state.selectedId) ? state.selectedId : state.stations[0]?.id;
    state.comparedIds = state.comparedIds.filter(id => state.stations.some(s => s.id === id));
    if (!state.comparedIds.length) state.comparedIds = state.stations.slice(0, 3).map(s => s.id);
    chooseDefaultCompareParameter();
    renderAll();
  }

  function useCachedOfficialData(cached) {
    state.stations = cached.stations;
    state.sourceMode = 'cache';
    state.lastSync = cached.savedAt;
    state.sourceMessage = 'Сохранённые официальные данные';
    state.sourceDetail = `Последняя успешная синхронизация: ${fmtDate(cached.savedAt)} (${relativeTime(cached.savedAt)}).`;
    setSourceState('cache', 'Официальные данные', `Обновлено ${relativeTime(cached.savedAt)}`);
    finishDataRender();
  }

  async function loadData(force = false) {
    const button = $('#refreshButton');
    const cachedBeforeRefresh = readCache();
    if (cachedBeforeRefresh) {
      useCachedOfficialData(cachedBeforeRefresh);
    } else if (!state.stations.length) {
      state.stations = officialStationMetadata();
      state.sourceMode = 'loading';
      state.sourceMessage = 'Официальная сеть станций';
      state.sourceDetail = 'Станции уже показаны; свежие почасовые измерения загружаются отдельно.';
      finishDataRender();
    }
    button.classList.add('loading');
    setSourceState('loading', cachedBeforeRefresh ? 'Обновляем официальные данные…' : 'Подключаем официальные измерения…', cachedBeforeRefresh ? `Сейчас показаны данные ${relativeTime(cachedBeforeRefresh.savedAt)}` : 'Сеть станций уже доступна');
    try {
      try {
        const live = await loadLiveStations();
        state.stations = live.stations;
        state.sourceMode = 'live';
        const measurementTimes = state.stations.map(latestTime).filter(Boolean).map(value => new Date(value).getTime()).filter(Number.isFinite);
        state.lastSync = measurementTimes.length ? new Date(Math.max(...measurementTimes)).toISOString() : new Date().toISOString();
        state.sourceMessage = 'Живые официальные данные';
        state.sourceDetail = `Прямой ответ ${live.base}. Последний завершённый час: ${fmtDate(state.lastSync)}.`;
        saveCache(state.stations, state.lastSync);
        setSourceState('live', 'Официальные измерения получены', `Последний час ${relativeTime(state.lastSync)}`);
        if (force) showToast('Данные обновлены');
        return;
      } catch {
        const published = await loadPublishedSnapshot();
        state.stations = published.stations;
        state.sourceMode = 'cache';
        state.lastSync = published.generatedAt;
        state.sourceMessage = 'Резервный опубликованный снимок';
        state.sourceDetail = `Прямой API временно недоступен. Показан последний снимок от ${fmtDate(state.lastSync)}.`;
        saveCache(state.stations, state.lastSync);
        setSourceState('cache', 'Официальные данные из резерва', `Обновлено ${relativeTime(state.lastSync)}`);
        if (force) showToast('Показан последний доступный снимок');
      }
    } catch (error) {
      const cached = readCache();
      if (cached) {
        useCachedOfficialData(cached);
      } else {
        state.stations = officialStationMetadata();
        state.sourceMode = 'unavailable';
        state.lastSync = null;
        state.sourceMessage = 'Измерения временно недоступны';
        state.sourceDetail = `Официальный API не ответил (${error?.message || 'ошибка соединения'}). Показана официальная сеть станций без выдуманных значений.`;
        setSourceState('unavailable', 'Станции доступны, измерения не получены', 'Никаких демонстрационных значений');
        showToast('Свежие измерения не получены; станции остаются доступны');
      }
    } finally {
      finishDataRender();
      button.classList.remove('loading');
    }
  }

  function setSourceState(mode, title, subtitle) {
    const banner = $('#sourceBanner');
    banner.querySelector('.status-dot').className = `status-dot ${mode}`;
    banner.querySelector('strong').textContent = title;
    banner.querySelector('small').textContent = subtitle;
  }

  function selectedStation() { return state.stations.find(station => station.id === state.selectedId) || state.stations[0]; }

  function renderAll() {
    renderHero();
    renderMetrics();
    renderMap();
    renderStationList();
    renderStationDetail();
    renderCompareControls();
    renderCompare();
    renderThresholds();
    renderSourceDialog();
  }

  function renderHero() {
    const station = state.stations[0];
    if (!station) return;
    const overall = overallFor(station);
    const time = latestTime(station);
    $('#heroStation').textContent = station.name;
    $('#heroDistance').textContent = `${fmtNumber(station.distance)} км`;
    $('#nearestDistance').textContent = `${fmtNumber(station.distance)} км до ближайшего датчика`;
    $('#heroStationType').textContent = station.typeLabel || 'ближайшая станция';
    $('#heroUpdated').textContent = time ? `${relativeTime(time)} · почасовое среднее` : 'нет доступных измерений';
    const orb = $('#airOrb');
    orb.className = `air-orb level-${overall.key}`;
    orb.querySelector('strong').textContent = overall.noIndex ? '—' : String(overall.index + 1);
    orb.querySelector('span').textContent = overall.noIndex ? 'нет индекса' : 'из 6';
    $('#verdictIcon').textContent = overall.icon;
    $('#heroVerdict').textContent = overall.noIndex ? 'Недостаточно данных для индекса' : overall.label;
    $('#heroAdvice').textContent = state.sourceMode === 'demo' ? 'Это синтетический пример интерфейса, а не фактическая оценка воздуха.' : overall.advice;
  }

  function renderMetrics() {
    const station = state.stations[0];
    const latest = latestReadings(station);
    const order = ['PM25','PM10','NO2','SO2','O3','CO','BENZENE','WIND'];
    const visibleOrder = order.filter(code => latest[code]);
    const metrics = visibleOrder.length ? visibleOrder : order.slice(0, 4);
    $('#metricGrid').innerHTML = metrics.map(code => {
      const config = PARAMETERS[code];
      const reading = latest[code];
      const level = reading ? levelFor(code, reading.value) : null;
      const ratio = reading && config.who ? Math.min(100, reading.value / config.who * 100) : reading ? 48 : 0;
      return `<article class="metric-card ${reading ? (level ? `level-${level.key}` : '') : 'missing'}">
        <div class="metric-top"><span class="metric-name">${esc(config.label)}</span><span class="metric-badge">${esc(level?.short || (reading ? 'измерено' : 'нет данных'))}</span></div>
        <div class="metric-value"><strong>${fmtNumber(reading?.value)}</strong><span>${esc(reading?.unit || config.unit)}</span></div>
        <div class="metric-foot"><span>${reading ? 'последний час' : 'станция не передала'}</span><span>${config.who ? `ВОЗ ${config.who}` : config.note}</span></div>
        <div class="metric-bar"><span style="width:${ratio}%"></span></div>
      </article>`;
    }).join('');
  }

  function renderMap() {
    const points = state.stations.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
    const station = selectedStation();
    const readings = latestReadings(station);
    const preferred = readings.PM25 || readings.PM10 || readings.NO2 || Object.values(readings)[0];
    $('#mapSelection').innerHTML = station ? `<div><strong>${esc(station.name)}</strong><small>${fmtNumber(station.distance)} км до Profersa · ${esc(station.typeLabel)}</small></div><div class="selection-reading"><b>${fmtNumber(preferred?.value)}</b><span>${esc(preferred?.unit || '')}</span><small>${preferred ? PARAMETERS[preferred.code]?.label || preferred.code : 'нет измерений'}</small></div>` : '';

    const mapElement = $('#sensorMap');
    if (!window.L) {
      mapElement.classList.add('map-unavailable');
      mapElement.innerHTML = `<div><strong>Карта временно недоступна</strong><small>Библиотека карты не загрузилась. Данные станций и графики продолжают работать.</small><a href="https://www.openstreetmap.org/?mlat=${FACILITY.lat}&mlon=${FACILITY.lon}#map=12/${FACILITY.lat}/${FACILITY.lon}" target="_blank" rel="noreferrer">Открыть район в OpenStreetMap ↗</a></div>`;
      return;
    }

    mapElement.classList.remove('map-unavailable');
    if (!leafletMap) {
      leafletMap = L.map(mapElement, {
        zoomControl: false,
        attributionControl: true,
        minZoom: 10,
        maxZoom: 19
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 20,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
      }).addTo(leafletMap);
      L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
      stationLayer = L.layerGroup().addTo(leafletMap);
      facilityLayer = L.layerGroup().addTo(leafletMap);

      L.circle([FACILITY.lat, FACILITY.lon], {
        radius: RADIUS_KM * 1000,
        color: '#77e7c2',
        weight: 1,
        opacity: .28,
        fillColor: '#77e7c2',
        fillOpacity: .018,
        interactive: false
      }).addTo(facilityLayer);

      L.circleMarker([FACILITY.lat, FACILITY.lon], {
        radius: 10,
        color: '#ffc867',
        weight: 3,
        fillColor: '#452f1f',
        fillOpacity: 1,
        className: 'facility-marker'
      }).addTo(facilityLayer)
        .bindTooltip('Profersa · не датчик', { permanent: true, direction: 'top', offset: [0, -10] })
        .bindPopup('<div class="map-popup"><strong>Площадка Profersa</strong><small>Camino del Arsenal, 19 · Zorrotza</small><div class="map-popup-reading">Объект, не станция измерения</div></div>');

      const bounds = L.latLngBounds([[FACILITY.lat, FACILITY.lon], ...points.map(item => [item.lat, item.lon])]);
      leafletMap.fitBounds(bounds.pad(.18), { padding: [24, 24], maxZoom: 13 });
    }

    stationLayer.clearLayers();
    points.forEach(item => {
      const itemReadings = latestReadings(item);
      const itemPreferred = itemReadings.PM25 || itemReadings.PM10 || itemReadings.NO2 || Object.values(itemReadings)[0];
      const level = overallFor(item);
      const selected = item.id === state.selectedId;
      const marker = L.circleMarker([item.lat, item.lon], {
        radius: selected ? 10 : 8,
        color: selected ? '#f2f8f6' : '#14383d',
        weight: selected ? 3 : 4,
        fillColor: colorForLevel(level.index),
        fillOpacity: 1,
        className: `air-station-marker${selected ? ' selected' : ''}`
      }).addTo(stationLayer);
      marker.stationId = item.id;
      marker.bindTooltip(item.name, { direction: 'top', offset: [0, -8] });
      marker.bindPopup(`<div class="map-popup"><strong>${esc(item.name)}</strong><small>${esc(item.municipality)} · ${fmtNumber(item.distance)} км до Profersa</small><div class="map-popup-reading">${fmtNumber(itemPreferred?.value)} <span>${esc(itemPreferred?.unit || '')} · ${itemPreferred ? esc(PARAMETERS[itemPreferred.code]?.label || itemPreferred.code) : 'нет измерений'}</span></div></div>`);
      marker.on('click', () => {
        state.selectedId = item.id;
        const selectedReadings = latestReadings(item);
        const selectedPreferred = selectedReadings.PM25 || selectedReadings.PM10 || selectedReadings.NO2 || Object.values(selectedReadings)[0];
        $('#mapSelection').innerHTML = `<div><strong>${esc(item.name)}</strong><small>${fmtNumber(item.distance)} км до Profersa · ${esc(item.typeLabel)}</small></div><div class="selection-reading"><b>${fmtNumber(selectedPreferred?.value)}</b><span>${esc(selectedPreferred?.unit || '')}</span><small>${selectedPreferred ? PARAMETERS[selectedPreferred.code]?.label || selectedPreferred.code : 'нет измерений'}</small></div>`;
        stationLayer.eachLayer(layer => {
          if (!layer.stationId) return;
          const active = layer.stationId === item.id;
          layer.setRadius(active ? 10 : 8);
          layer.setStyle({ color: active ? '#f2f8f6' : '#14383d', weight: active ? 3 : 4 });
          layer.getElement()?.classList.toggle('selected', active);
        });
        renderStationList();
        renderStationDetail();
      });
    });

    requestAnimationFrame(() => leafletMap?.invalidateSize(false));
  }

  function colorForLevel(index = 0) { return ['#77e7c2','#c8ef6b','#ffc867','#ff8b69','#c092df','#8f3158'][index] || '#77e7c2'; }

  function filteredStations() {
    return state.stations.filter(station => {
      const typeMatch = state.stationFilter === 'all' || station.type === state.stationFilter;
      const text = `${station.name} ${station.municipality}`.toLowerCase();
      return typeMatch && text.includes(state.search.toLowerCase());
    });
  }

  function renderStationList() {
    $('#stationList').innerHTML = filteredStations().map(station => {
      const overall = overallFor(station);
      return `<button class="station-item ${station.id === state.selectedId ? 'active' : ''}" data-station="${esc(station.id)}">
        <span class="station-symbol">${station.type === 'industrial' ? 'IND' : station.type === 'traffic' ? 'TRF' : 'BG'}</span>
        <span><strong>${esc(station.name)}</strong><small>${fmtNumber(station.distance)} км · ${esc(station.municipality)}</small></span>
        <span class="station-aqi"><b style="color:${colorForLevel(overall.index)}">${overall.noIndex ? '—' : overall.index + 1}</b><span>${esc(overall.short)}</span></span>
      </button>`;
    }).join('') || '<p class="fine-print">Станции не найдены.</p>';
  }

  function chartTime(value, includeDate = false) {
    const options = includeDate
      ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }
      : { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' };
    return new Intl.DateTimeFormat('ru-RU', options).format(new Date(value));
  }

  function chartGeometry(points, hours, width = 760, height = 245) {
    const pad = { left: 54, right: 16, top: 22, bottom: 42 };
    const hasValue = point => point.value !== null && point.value !== undefined && point.value !== '' && Number.isFinite(Number(point.value));
    const ordered = points
      .map(point => ({ ...point, timestamp: new Date(point.time).getTime() }))
      .filter(point => Number.isFinite(point.timestamp))
      .sort((a, b) => a.timestamp - b.timestamp);
    const end = ordered.at(-1)?.timestamp || Date.now();
    const start = end - hours * 3600000;
    const visible = ordered.filter(point => point.timestamp >= start && point.timestamp <= end);
    const valid = visible.filter(hasValue);
    if (valid.length < 2) return { segments: [], dots: [], min: 0, max: 0, yTicks: [], xTicks: [], width, height };

    const values = valid.map(point => Number(point.value));
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const margin = Math.max((rawMax - rawMin) * .1, rawMax === 0 ? 1 : Math.abs(rawMax) * .04, .5);
    const min = Math.max(0, rawMin - margin);
    const max = rawMax + margin;
    const range = max - min || 1;
    const x = timestamp => pad.left + (timestamp - start) / (end - start) * (width - pad.left - pad.right);
    const y = value => pad.top + (max - Number(value)) / range * (height - pad.top - pad.bottom);

    const segments = [];
    let current = [];
    visible.forEach(point => {
      const gap = current.length ? point.timestamp - current.at(-1).timestamp : 0;
      if (!hasValue(point) || gap > 90 * 60000) {
        if (current.length > 1) segments.push(current);
        current = [];
      }
      if (hasValue(point)) current.push(point);
    });
    if (current.length > 1) segments.push(current);

    const mappedSegments = segments.map(segment => {
      const coords = segment.map(point => ({ ...point, x: x(point.timestamp), y: y(point.value) }));
      const line = coords.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
      const baseline = height - pad.bottom;
      const area = `${line} L${coords.at(-1).x.toFixed(1)},${baseline} L${coords[0].x.toFixed(1)},${baseline} Z`;
      return { line, area };
    });
    const dots = valid.map(point => ({ ...point, x: x(point.timestamp), y: y(point.value) }));
    const yTicks = Array.from({ length: 5 }, (_, index) => {
      const value = min + (max - min) * index / 4;
      return { value, y: y(value) };
    }).reverse();
    const tickCount = hours === 24 ? 5 : 7;
    const xTicks = Array.from({ length: tickCount }, (_, index) => {
      const timestamp = start + (end - start) * index / (tickCount - 1);
      return { timestamp, x: x(timestamp), label: chartTime(timestamp, hours > 24 || index === 0) };
    });
    return { segments: mappedSegments, dots, min: rawMin, max: rawMax, yTicks, xTicks, width, height, plotBottom: height - pad.bottom };
  }

  function renderDetailChart(geo, primary, unit) {
    if (!geo.segments.length) return '<p class="fine-print">Для этого параметра нет достаточного ряда.</p>';
    const yGrid = geo.yTicks.map(tick => `<g><line class="grid-line" x1="54" y1="${tick.y.toFixed(1)}" x2="744" y2="${tick.y.toFixed(1)}"/><text class="axis-label axis-y" x="45" y="${(tick.y + 3).toFixed(1)}">${fmtNumber(tick.value)}</text></g>`).join('');
    const xGrid = geo.xTicks.map(tick => `<g><line class="grid-line vertical" x1="${tick.x.toFixed(1)}" y1="22" x2="${tick.x.toFixed(1)}" y2="${geo.plotBottom}"/><text class="axis-label axis-x" x="${tick.x.toFixed(1)}" y="226">${esc(tick.label)}</text></g>`).join('');
    const areas = geo.segments.map(segment => `<path class="data-area" d="${segment.area}"/>`).join('');
    const lines = geo.segments.map(segment => `<path class="data-line" d="${segment.line}"/>`).join('');
    const dots = geo.dots.map(point => `<circle class="chart-point" cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="8" data-chart-time="${esc(chartTime(point.time, true))}" data-chart-value="${fmtNumber(point.value)}" data-chart-unit="${esc(unit)}"><title>${esc(chartTime(point.time, true))}: ${fmtNumber(point.value)} ${esc(unit)}</title></circle>`).join('');
    return `<div class="detail-chart-plot"><svg class="spark-svg" viewBox="0 0 ${geo.width} ${geo.height}" role="img" aria-label="Почасовой график ${esc(primary)} за ${state.detailHours} часов"><defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#77e7c2" stop-opacity=".42"/><stop offset="1" stop-color="#77e7c2" stop-opacity=".02"/></linearGradient></defs><text class="axis-title" x="10" y="13">${esc(unit)}</text>${yGrid}${xGrid}${areas}${lines}${dots}</svg><div class="chart-tooltip" id="detailChartTooltip" role="status"></div></div><div class="chart-caption"><span>Почасовые измерения · время Бильбао</span><span>Разрывы линии = нет данных</span></div>`;
  }

  function renderStationDetail() {
    const station = selectedStation();
    if (!station) return;
    const readings = latestReadings(station);
    const codes = Object.keys(station.history || {});
    const primary = codes.includes(state.compareParameter) ? state.compareParameter : codes[0];
    const points = station.history?.[primary] || [];
    const unit = points.find(point => point.unit)?.unit || PARAMETERS[primary]?.unit || '';
    const geo = chartGeometry(points, state.detailHours);
    const overall = overallFor(station);
    const time = latestTime(station);
    $('#stationDetail').innerHTML = `<div class="detail-head"><div><span class="kicker">${esc(station.typeLabel)}</span><h2>${esc(station.name)}</h2><p>${esc(station.municipality)} · ${fmtNumber(station.distance)} км до Profersa · ${time ? `обновлено ${relativeTime(time)}` : 'нет времени'}</p></div><div class="detail-aqi"><strong style="color:${colorForLevel(overall.index)}">${overall.noIndex ? '—' : overall.index + 1}/6</strong><span>${esc(overall.label)}</span></div></div>
      <div class="detail-meta"><span>Источник: Gobierno Vasco</span><span>Шаг: 1 час</span><span>Окно: ${state.detailHours} часа</span><span>Параметров: ${codes.length}</span><span>ID: ${esc(station.id)}</span></div>
      <div class="detail-chart-card"><div class="detail-chart-head"><div><strong>${esc(PARAMETERS[primary]?.full || primary)}</strong><span>${points.length ? `минимум ${fmtNumber(geo.min)} · максимум ${fmtNumber(geo.max)} ${esc(unit)}` : 'нет ряда'}</span></div><div class="detail-chart-controls"><div class="mini-tabs">${codes.slice(0,6).map(code => `<button class="${code === primary ? 'active' : ''}" data-detail-param="${code}">${esc(PARAMETERS[code]?.label || code)}</button>`).join('')}</div><div class="period-tabs" aria-label="Период графика"><button class="${state.detailHours === 24 ? 'active' : ''}" data-detail-hours="24">24 ч</button><button class="${state.detailHours === 72 ? 'active' : ''}" data-detail-hours="72">72 ч</button></div></div></div>
      ${renderDetailChart(geo, primary, unit)}</div>
      <div class="detail-metrics">${codes.map(code => { const r = readings[code]; const l = levelFor(code,r?.value); return `<div class="detail-metric"><small>${esc(PARAMETERS[code]?.full || code)}</small><strong>${fmtNumber(r?.value)} <em>${esc(r?.unit || PARAMETERS[code]?.unit || '')}</em></strong><em>${esc(l?.label || PARAMETERS[code]?.note || 'измерено')}</em></div>`; }).join('')}</div>
      <div class="quality-block"><h3>Полнота последних 24 часов</h3><div class="quality-row"><div class="quality-progress"><span style="width:${dataCompleteness(station)}%"></span></div><b>${dataCompleteness(station)}%</b><span>· пропуски не интерполируются</span></div></div>
      <p class="fine-print"><a href="${esc(station.officialUrl)}" target="_blank" rel="noreferrer">Открыть карточку официальной станции ↗</a></p>`;
  }

  function chooseDefaultCompareParameter() {
    const available = new Set(state.stations.flatMap(station => Object.keys(station.history || {})));
    state.compareParameter = ['PM25','PM10','NO2','SO2','O3','CO'].find(code => available.has(code)) || [...available][0] || 'PM25';
  }

  function renderCompareControls() {
    const codes = [...new Set(state.stations.flatMap(s => Object.keys(s.history || {})))];
    $('#compareParameter').innerHTML = codes.map(code => `<option value="${esc(code)}" ${code === state.compareParameter ? 'selected' : ''}>${esc(PARAMETERS[code]?.full || code)}</option>`).join('');
    $('#compareStations').innerHTML = state.stations.slice(0, 7).map((station, index) => `<button class="compare-toggle ${state.comparedIds.includes(station.id) ? 'active' : ''}" data-compare-station="${esc(station.id)}" style="--station-color:${COLORS[index % COLORS.length]}">${esc(station.name)}</button>`).join('');
  }

  function renderCompare() {
    const code = state.compareParameter;
    const config = PARAMETERS[code] || { label: code, full: code, unit: '' };
    const stations = state.stations.filter(station => state.comparedIds.includes(station.id) && station.history?.[code]?.length);
    $('#chartTitle').textContent = `${config.full} · последние 24 часа`;
    $('#chartUnit').textContent = config.unit;
    $('#chartLegend').innerHTML = stations.map(station => { const index = state.stations.indexOf(station); return `<span><i style="background:${COLORS[index % COLORS.length]}"></i>${esc(station.name)}</span>`; }).join('');
    $('#compareChart').innerHTML = compareSvg(stations, code);
    $('#chartNote').textContent = state.sourceMode === 'demo' ? 'Демонстрационный ряд: значения синтетические и показывают только работу сравнения.' : `Источник: Open Data Euskadi. ${config.who ? `Пунктир — справочный ориентир ВОЗ ${config.who} ${config.unit}; период усреднения может отличаться от почасового графика.` : 'Для этого параметра пунктир ВОЗ не показан.'}`;
    $('#compareTable').innerHTML = state.stations.map(station => {
      const reading = latestReadings(station)[code];
      const level = reading ? levelFor(code, reading.value) : null;
      return `<tr><td><strong>${esc(station.name)}</strong></td><td>${fmtNumber(station.distance)} км</td><td>${reading ? `${fmtNumber(reading.value)} ${esc(reading.unit || config.unit)}` : '—'}</td><td><span class="table-status" style="color:${colorForLevel(level?.index)}">${esc(level?.label || 'нет категории')}</span></td><td>${dataCompleteness(station)}%</td></tr>`;
    }).join('');
  }

  function compareSvg(stations, code) {
    if (!stations.length) return '<div class="fine-print">Выберите станции, на которых есть этот параметр.</div>';
    const width = 1000, height = 310, left = 44, right = 15, top = 12, bottom = 28;
    const series = stations.map(station => ({ station, points: station.history[code].filter(p => Number.isFinite(Number(p.value))).slice(-24) })).filter(s => s.points.length > 1);
    if (!series.length) return '<div class="fine-print">Недостаточно данных для графика.</div>';
    const values = series.flatMap(s => s.points.map(p => Number(p.value)));
    const threshold = PARAMETERS[code]?.who;
    let min = Math.min(0, ...values), max = Math.max(...values, threshold || 0);
    if (min === max) max = min + 1;
    const x = i => left + i / 23 * (width - left - right);
    const y = value => top + (max - value) / (max - min) * (height - top - bottom);
    const grid = Array.from({length:5},(_,i) => { const val = max - (max-min)*i/4; const yy = y(val); return `<path class="axis" d="M${left} ${yy}H${width-right}"/><text x="0" y="${yy+3}">${fmtNumber(val,0)}</text>`; }).join('');
    const paths = series.map(({station,points}) => {
      const color = COLORS[state.stations.indexOf(station) % COLORS.length];
      const path = points.map((p,i) => `${i ? 'L' : 'M'}${x(Math.max(0, 24-points.length+i)).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
      return `<path class="series" stroke="${color}" d="${path}"/>`;
    }).join('');
    const labels = [0,6,12,18,23].map(i => `<text x="${x(i)-9}" y="${height-4}">${i === 23 ? 'сейчас' : `−${23-i}ч`}</text>`).join('');
    const thresholdLine = threshold ? `<path class="threshold" d="M${left} ${y(threshold)}H${width-right}"/><text x="${width-right-55}" y="${y(threshold)-5}">ВОЗ ${threshold}</text>` : '';
    return `<svg class="compare-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Сравнение ${esc(code)} по станциям">${grid}${thresholdLine}${paths}${labels}</svg>`;
  }

  function renderThresholds() {
    const codes = ['PM25','PM10','NO2','O3','SO2'];
    $('#thresholdTable').innerHTML = codes.map(code => {
      const p = PARAMETERS[code];
      const ranges = [`0–${p.breaks[0]}`,`${p.breaks[0]}–${p.breaks[1]}`,`${p.breaks[1]}–${p.breaks[2]}`,`${p.breaks[2]}–${p.breaks[3]}`,`${p.breaks[3]}–${p.breaks[4]}`,`>${p.breaks[4]}`];
      return `<div class="threshold-row"><strong>${esc(p.label)} <small>${esc(p.unit)}</small></strong><div class="threshold-scale">${ranges.map((range,i) => `<span title="${LEVELS[i].label}">${range}</span>`).join('')}</div></div>`;
    }).join('');
  }

  function renderSourceDialog() {
    const sourceClass = state.sourceMode === 'cache' ? 'cache' : state.sourceMode === 'unavailable' ? 'unavailable' : state.sourceMode === 'loading' ? 'loading' : 'live';
    $('#sourceDialogBody').innerHTML = `<div class="dialog-body"><div class="dialog-status"><span class="status-dot ${sourceClass}"></span><div><strong>${esc(state.sourceMessage || 'Загрузка')}</strong><p>${esc(state.sourceDetail || 'Ожидаем ответ источника.')}</p></div></div>
      <p><strong>Основной источник:</strong> API качества воздуха Open Data Euskadi. Запрашиваются станции в радиусе ${RADIUS_KM} км и последние 72 почасовых значения.</p>
      <ul><li>«Нет данных» не заменяется нулём.</li><li>При недоступности API показывается официальный сохранённый ответ, а не демонстрационные значения.</li><li>Последний успешный официальный ответ сохраняется на устройстве для офлайн-просмотра.</li></ul>
      <p><a href="https://opendata.euskadi.eus/api-air-quality/?api=air-quality" target="_blank" rel="noreferrer">Открыть документацию API ↗</a></p></div>`;
  }

  function navigate(view, updateHash = true) {
    if (!['overview','stations','compare','about'].includes(view)) view = 'overview';
    state.activeView = view;
    $$('.view').forEach(section => section.classList.toggle('active', section.dataset.view === view));
    $$('.bottom-nav button').forEach(button => button.classList.toggle('active', button.dataset.go === view));
    if (updateHash) history.replaceState(null, '', view === 'overview' ? location.pathname + location.search : `#${view}`);
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    resetScroll();
    requestAnimationFrame(() => requestAnimationFrame(resetScroll));
    setTimeout(resetScroll, 80);
    if (view === 'overview') {
      requestAnimationFrame(() => leafletMap?.invalidateSize(false));
      setTimeout(() => leafletMap?.invalidateSize(false), 220);
    }
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 3000);
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const go = event.target.closest('[data-go]');
      if (go) navigate(go.dataset.go);
      const stationButton = event.target.closest('[data-station]');
      if (stationButton) {
        state.selectedId = stationButton.dataset.station;
        renderMap(); renderStationList(); renderStationDetail();
        if (stationButton.closest('#stationList')) setTimeout(() => $('#stationDetail').scrollIntoView({behavior:'smooth',block:'start'}), 30);
      }
      const param = event.target.closest('[data-detail-param]');
      if (param) { state.compareParameter = param.dataset.detailParam; renderStationDetail(); }
      const hours = event.target.closest('[data-detail-hours]');
      if (hours) { state.detailHours = Number(hours.dataset.detailHours) || 24; renderStationDetail(); }
      const toggle = event.target.closest('[data-compare-station]');
      if (toggle) {
        const id = toggle.dataset.compareStation;
        state.comparedIds = state.comparedIds.includes(id) ? state.comparedIds.filter(x => x !== id) : [...state.comparedIds, id].slice(-4);
        renderCompareControls(); renderCompare();
      }
    });
    $('#refreshButton').addEventListener('click', () => loadData(true));
    $('#stationSearch').addEventListener('input', event => { state.search = event.target.value; renderStationList(); });
    $('#stationFilters').addEventListener('click', event => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      state.stationFilter = button.dataset.filter;
      $$('#stationFilters .chip').forEach(chip => chip.classList.toggle('active', chip === button));
      renderStationList();
    });
    $('#compareParameter').addEventListener('change', event => { state.compareParameter = event.target.value; renderCompare(); });
    $('#stationDetail').addEventListener('pointerover', event => {
      const point = event.target.closest('.chart-point');
      const tooltip = $('#detailChartTooltip');
      if (!point || !tooltip) return;
      const chart = point.closest('.detail-chart-plot');
      const chartBox = chart.getBoundingClientRect();
      const pointBox = point.getBoundingClientRect();
      tooltip.innerHTML = `<strong>${esc(point.dataset.chartValue)} ${esc(point.dataset.chartUnit)}</strong><span>${esc(point.dataset.chartTime)}</span>`;
      tooltip.style.left = `${pointBox.left - chartBox.left + pointBox.width / 2}px`;
      tooltip.style.top = `${Math.max(8, pointBox.top - chartBox.top - 12)}px`;
      tooltip.classList.add('show');
    });
    $('#stationDetail').addEventListener('pointerout', event => {
      if (!event.target.closest('.chart-point')) return;
      $('#detailChartTooltip')?.classList.remove('show');
    });
    $('#sourceInfoButton').addEventListener('click', () => $('#sourceDialog').showModal());
    $('#closeDialog').addEventListener('click', () => $('#sourceDialog').close());
    $('#sourceDialog').addEventListener('click', event => { if (event.target === $('#sourceDialog')) $('#sourceDialog').close(); });
    $('#shareButton').addEventListener('click', async () => {
      try {
        if (navigator.share) await navigator.share({ title: document.title, text: 'Датчики качества воздуха вокруг Zorrotza и Profersa', url: location.href });
        else { await navigator.clipboard.writeText(location.href); showToast('Ссылка скопирована'); }
      } catch { /* user cancelled */ }
    });
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault(); state.installPrompt = event; $('#installButton').hidden = false;
    });
    $('#installButton').addEventListener('click', async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt(); await state.installPrompt.userChoice; state.installPrompt = null; $('#installButton').hidden = true;
    });
    window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'overview', false));
    window.addEventListener('resize', () => leafletMap?.invalidateSize(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadData(false);
    });
  }

  async function init() {
    bindEvents();
    navigate(location.hash.slice(1) || 'overview', false);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      try { await navigator.serviceWorker.register('./sw.js'); } catch { /* PWA still works online */ }
    }
    await loadData(false);
    window.setInterval(() => {
      if (document.visibilityState === 'visible') loadData(false);
    }, AUTO_REFRESH_MS);
  }

  init();
})();
