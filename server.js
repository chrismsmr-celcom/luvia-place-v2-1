/**
 * ============================================================
 * LUVIA PLACE SERVER — 100% CONFORME LITEAPI v3.0
 * ============================================================
 * Généré le 2026-07-28
 * Documentation : https://docs.liteapi.travel
 * Base URL      : https://api.liteapi.travel/v3.0
 * 
 * Endpoints supportés :
 *   Hotels  : rates, prebook, book, bookings
 *   Data    : hotels, hotel, reviews, places, cities, countries,
 *             currencies, languages, facilities, hotelTypes, chains,
 *             iataCodes, highlights, ask
 *   Flights : search, verify, prebook, book
 *   Loyalty : coins, program
 *   Custom  : traduction DeepSeek, paiements externes, vouchers
 * ============================================================
 */

const express = require("express");
const app = express();
const path = require("path");
const cors = require("cors");
const liteApi = require("liteapi-node-sdk");
require("dotenv").config();

// ============================================================
// CONFIGURATION
// ============================================================
const PROD_API_KEY = process.env.PROD_API_KEY;
const SANDBOX_API_KEY = process.env.SAND_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const LITEAPI_BASE_URL = "https://api.liteapi.travel/v3.0";

const ALLOWED_ORIGINS = [
  'https://luvia-place-v2-1.onrender.com',
  'https://luvia-place-v2-1-plh1.onrender.com',
  'http://localhost:3000',
  'http://localhost:10000'
];

// ============================================================
// CORS
// ============================================================
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-Nationality']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, X-Nationality');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ============================================================
// MIDDLEWARE NATIF (body-parser déprécié)
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// FICHIERS STATIQUES — DOSSIER public/
// ============================================================
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// LOG MIDDLEWARE
// ============================================================
app.use((req, res, next) => {
  console.log(`\n📥 ${req.method} ${req.url}`);
  if (req.method === 'POST' && req.body && Object.keys(req.body).length > 0) {
    const bodyLog = JSON.stringify(req.body, null, 2);
    console.log(`📦 Body:`, bodyLog.substring(0, 800));
  }
  if (req.method === 'GET' && req.query && Object.keys(req.query).length > 0) {
    console.log(`📦 Query:`, req.query);
  }
  next();
});

// ============================================================
// UTILITAIRE : fetch avec timeout (AbortController)
// ============================================================
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

// ============================================================
// UTILITAIRE : Géolocalisation IP
// ============================================================
async function getCountryFromIP(ip) {
  const apis = [
    { url: `http://ip-api.com/json/${ip}?fields=status,countryCode`, parser: (d) => d.countryCode },
    { url: `https://ipapi.co/${ip}/json/`, parser: (d) => d.country_code },
    { url: `https://freegeoip.app/json/${ip}`, parser: (d) => d.country_code },
    { url: `https://ipinfo.io/${ip}/json`, parser: (d) => d.country }
  ];

  for (const api of apis) {
    try {
      const response = await fetchWithTimeout(api.url, {}, 3000);
      if (!response.ok) continue;
      const data = await response.json();
      const code = api.parser(data);
      if (code && code.length === 2) return code.toUpperCase();
    } catch (e) {
      console.warn(`⚠️ IP API fail: ${api.url} — ${e.message}`);
    }
  }
  return null;
}

// ============================================================
// UTILITAIRE : Détection nationalité du client
// ============================================================
async function getGuestNationality(req) {
  // 1. Paramètre explicite
  if (req.query.nationality) return req.query.nationality.toUpperCase().trim();
  if (req.body?.nationality) return req.body.nationality.toUpperCase().trim();

  // 2. Header
  if (req.headers['x-nationality']) return req.headers['x-nationality'].toUpperCase().trim();

  // 3. Cookie
  if (req.headers.cookie) {
    const match = req.headers.cookie.match(/nationality=([A-Z]{2})/i);
    if (match) return match[1].toUpperCase();
  }

  // 4. Géolocalisation IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
          || req.connection?.remoteAddress
          || req.socket?.remoteAddress
          || '8.8.8.8';
  const country = await getCountryFromIP(ip);
  if (country) return country;

  // 5. Fallback par ville
  if (req.query.city) {
    const cityMap = {
      'kinshasa':'CD','lubumbashi':'CD','goma':'CD','bukavu':'CD',
      'kisangani':'CD','kananga':'CD','mbuji-mayi':'CD',
      'dar es salaam':'TZ','zanzibar':'TZ',
      'nairobi':'KE','mombasa':'KE',
      'kampala':'UG','entebbe':'UG',
      'kigali':'RW','bujumbura':'BI',
      'lagos':'NG','abuja':'NG',
      'accra':'GH','dakar':'SN',
      'abidjan':'CI','douala':'CM','yaoundé':'CM'
    };
    const city = req.query.city.toLowerCase();
    for (const [c, code] of Object.entries(cityMap)) {
      if (city.includes(c)) return code;
    }
  }

  // 6. Fallback final
  return 'US';
}

// ============================================================
// UTILITAIRE : Normaliser code pays
// ============================================================
function normalizeCountryCode(code) {
  if (!code) return 'US';
  code = code.toUpperCase().trim();
  const map = {
    'CONGO':'CD','DRC':'CD','RDC':'CD',
    'TANZANIA':'TZ','TANZANIE':'TZ',
    'KENYA':'KE','UGANDA':'UG','UGANDE':'UG',
    'RWANDA':'RW','BURUNDI':'BI',
    'SOUTH AFRICA':'ZA','AFRIQUE DU SUD':'ZA',
    'ETHIOPIA':'ET','ETHIOPIE':'ET',
    'NIGERIA':'NG','GHANA':'GH','SENEGAL':'SN',
    "COTE D'IVOIRE":'CI','CAMEROON':'CM','CAMEROUN':'CM'
  };
  if (map[code]) return map[code];
  if (/^[A-Z]{2}$/.test(code)) return code;
  return 'US';
}

// ============================================================
// CLIENT LITEAPI — Appel REST conforme v3.0
// ============================================================
async function callLiteAPI(endpoint, method = 'GET', body = null, apiKey) {
  const url = `${LITEAPI_BASE_URL}/${endpoint}`;
  const options = {
    method,
    headers: {
      'X-API-Key': apiKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);

  console.log(`📡 ${method} ${url}`);

  const response = await fetchWithTimeout(url, options, 35000);

  // Erreur HTTP
  if (!response.ok) {
    let errBody = {};
    try { errBody = await response.json(); } catch(e) {}
    const errMsg = errBody.message || errBody.error?.message || `LiteAPI HTTP ${response.status}`;
    const err = new Error(errMsg);
    err.status = response.status;
    err.code = errBody.error?.code;
    throw err;
  }

  const data = await response.json();

  // Erreur métier retournée en HTTP 200 (code 2001, etc.)
  if (data.error) {
    const errMsg = data.error.message || `LiteAPI Error ${data.error.code}`;
    const err = new Error(errMsg);
    err.code = data.error.code;
    err.liteapiError = data.error;
    throw err;
  }

  console.log(`📦 Réponse:`, JSON.stringify(data, null, 2).substring(0, 600));
  return data;
}

// ============================================================
// TRADUCTION DEEPSPEEK
// ============================================================
const translationCache = new Map();

async function translateWithDeepSeek(text, targetLang, sourceLang = 'fr', context = '') {
  if (!text || !targetLang || targetLang === sourceLang) return text;
  if (!DEEPSEEK_API_KEY) { console.warn('⚠️ DEEPSEEK_API_KEY manquante'); return text; }

  const names = { fr:'Français', en:'English', es:'Español', sw:'Kiswahili', pt:'Português',
                  it:'Italiano', de:'Deutsch', ar:'العربية', zh:'中文', ja:'日本語', ru:'Русский' };

  try {
    const response = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${DEEPSEEK_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: `Tu es un traducteur professionnel pour LuviaPlace.\nRÈGLES :\n1. Traduis de ${names[sourceLang]||sourceLang} vers ${names[targetLang]||targetLang}\n2. Garde le ton professionnel\n3. Préserve nombres, dates, prix\n4. Ne traduis JAMAIS "LuviaPlace"\n5. Réponds UNIQUEMENT la traduction\n${context ? `CONTEXTE: ${context}` : ''}` },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: Math.min(text.length * 2 + 500, 4000)
      })
    }, 15000);

    if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}`);
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (e) {
    console.error('❌ DeepSeek:', e.message);
    return text;
  }
}

async function translateWithCache(text, targetLang, sourceLang = 'fr', context = '') {
  if (!text || !targetLang || targetLang === sourceLang) return text;
  const key = `${text.substring(0, 50)}-${targetLang}`;
  if (translationCache.has(key)) return translationCache.get(key);
  const t = await translateWithDeepSeek(text, targetLang, sourceLang, context);
  translationCache.set(key, t);
  setTimeout(() => translationCache.delete(key), 24 * 60 * 60 * 1000);
  return t;
}

// ============================================================
// 1. RECHERCHE DE LIEUX (GET /data/places)
// ============================================================
app.get("/search-places", async (req, res) => {
  console.log("\n📍 ===== SEARCH PLACES ===== 📍");
  const { query, environment, language = 'fr' } = req.query;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  if (!query || query.length < 2) {
    return res.json({ success: true, data: [] });
  }

  try {
    const data = await callLiteAPI(
      `data/places?textQuery=${encodeURIComponent(query)}&language=${language}`,
      'GET', null, apiKey
    );

    const places = (data.data || []).map(p => ({
      placeId: p.placeId || p.id,
      name: p.displayName || p.name || p.label || 'Lieu sans nom',
      address: p.formattedAddress || p.address || '',
      country: p.country || '',
      types: p.types || []
    }));

    res.json({ success: true, data: places });
  } catch (error) {
    console.error("❌ search-places:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message, code: error.code });
  }
});

// ============================================================
// 2. RECHERCHE HÔTELS — LISTING (POST /hotels/rates)
// ============================================================
// Paramètres conformes LiteAPI v3.0 :
//   checkin, checkout, currency, guestNationality, occupancies
//   + un critère de localisation : placeId | hotelIds | cityName+countryCode | lat+lon | iataCode | aiSearch
//   maxRatesPerHotel, limit, timeout, includeHotelData, roomMapping, sessionId
// ============================================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS (LISTING) ===== 🔍");
  const {
    checkin, checkout, adults, children, childrenAges,
    placeId, city, countryCode, hotelIds,
    lat, lon, radius, iataCode, aiSearch,
    environment, limit = 200, language = 'fr', currency = 'USD',
    maxRatesPerHotel = 1, timeout = 12,
    refundableOnly, boardTypes, stars, facilities,
    minRating, minReviews, hotelTypes, chains,
    sortBy, sessionId
  } = req.query;

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;
  const guestNationality = normalizeCountryCode(await getGuestNationality(req));
  console.log(`🌍 Nationalité: ${guestNationality}`);

  try {
    // --- Déterminer le critère de localisation ---
    let locationParam = {};

    if (placeId) {
      locationParam = { placeId };
    } else if (hotelIds) {
      locationParam = { hotelIds: hotelIds.split(',').map(s => s.trim()) };
    } else if (lat && lon) {
      locationParam = { latitude: parseFloat(lat), longitude: parseFloat(lon), radius: parseInt(radius) || 5000 };
    } else if (iataCode) {
      locationParam = { iataCode: iataCode.toUpperCase() };
    } else if (aiSearch) {
      locationParam = { aiSearch };
    } else if (city) {
      // Géocodage via data/places pour obtenir le placeId
      console.log(`⏳ Géocodage de "${city}"...`);
      try {
        const placesData = await callLiteAPI(
          `data/places?textQuery=${encodeURIComponent(city)}&language=${language}`,
          'GET', null, apiKey
        );
        if (placesData.data && placesData.data.length > 0) {
          locationParam = { placeId: placesData.data[0].placeId };
          console.log(`✅ PlaceId: ${placesData.data[0].placeId}`);
        } else {
          // Fallback : recherche par cityName + countryCode
          locationParam = { cityName: city, countryCode: countryCode || guestNationality };
        }
      } catch (e) {
        locationParam = { cityName: city, countryCode: countryCode || guestNationality };
      }
    }

    if (Object.keys(locationParam).length === 0) {
      return res.status(400).json({ success: false, error: "Aucun critère de localisation fourni (placeId, city, hotelIds, lat/lon, iataCode, aiSearch)" });
    }

    // --- Occupancies ---
    const occupancies = [{
      adults: parseInt(adults, 10) || 2,
      ...(children && parseInt(children) > 0 ? {
        children: parseInt(children),
        ages: childrenAges ? childrenAges.split(',').map(a => parseInt(a.trim())) : Array(parseInt(children)).fill(5)
      } : {})
    }];

    // --- Body conforme LiteAPI v3.0 ---
    const body = {
      checkin,
      checkout,
      currency: currency.toUpperCase(),
      guestNationality,
      occupancies,
      ...locationParam,
      maxRatesPerHotel: parseInt(maxRatesPerHotel) || 1,
      limit: Math.min(parseInt(limit) || 200, 5000),
      timeout: parseInt(timeout) || 12,
      includeHotelData: true,
      roomMapping: true,
      language
    };

    // Filtres optionnels
    if (refundableOnly === 'true') body.refundableOnly = true;
    if (boardTypes) body.boardTypes = boardTypes;
    if (stars) body.stars = stars.split(',').map(s => parseFloat(s.trim()));
    if (facilities) body.facilities = facilities.split(',').map(s => s.trim());
    if (facilities) body.facilitiesFilterLogic = req.query.facilitiesLogic || 'OR';
    if (minRating) body.minRating = parseFloat(minRating);
    if (minReviews) body.minReviews = parseInt(minReviews);
    if (hotelTypes) body.hotelTypes = hotelTypes.split(',').map(s => s.trim());
    if (chains) body.chains = chains.split(',').map(s => s.trim());
    if (sortBy) body.sortBy = sortBy;
    if (sessionId) body.sessionId = sessionId;

    const ratesResponse = await callLiteAPI('hotels/rates', 'POST', body, apiKey);

    const rateEntries = Array.isArray(ratesResponse.data) ? ratesResponse.data : [];
    const hotelsInfo = Array.isArray(ratesResponse.hotels) ? ratesResponse.hotels : [];

    // Index des infos hôtel (si présentes dans la réponse)
    const infoMap = {};
    hotelsInfo.forEach(h => { infoMap[h.id || h.hotelId] = h; });

    console.log(`📊 data[]: ${rateEntries.length} | hotels[]: ${hotelsInfo.length}`);

    let hotels = rateEntries.map(entry => {
      const hotelId = entry.hotelId || entry.id;
      const info = infoMap[hotelId] || entry.hotel || {};
      const bestRate = entry.roomTypes?.[0]?.rates?.[0];
      const stars = info.stars ?? info.starRating ?? entry.stars ?? entry.starRating ?? 0;

      return {
        id: hotelId,
        name: info.name || entry.name || 'Hôtel sans nom',
        address: info.address || '',
        city: info.city || '',
        country: info.country || '',
        countryCode: info.country_code || info.countryCode || '',
        main_photo: info.main_photo || info.mainPhoto || info.thumbnail ||
          `https://picsum.photos/seed/${hotelId}/460/380`,
        rating: info.rating || 0,
        reviewCount: info.reviewCount || info.review_count || 0,
        starRating: stars,
        minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
        currency: bestRate?.retailRate?.total?.[0]?.currency || currency.toUpperCase(),
        offerId: entry.roomTypes?.[0]?.offerId || null,
        roomName: bestRate?.name || 'Chambre standard',
        refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN',
        boardType: bestRate?.boardType || 'RO',
        boardName: bestRate?.boardName || 'Room Only',
        latitude: info.latitude || info.lat || null,
        longitude: info.longitude || info.lon || null,
        supplier: bestRate?.supplier || '',
        language
      };
    });

    const beforeFilter = hotels.length;
    hotels = hotels.filter(h => h.minPrice > 0).sort((a, b) => a.minPrice - b.minPrice);
    console.log(`   → Après filtre minPrice>0: ${hotels.length}/${beforeFilter}`);

    const finalHotels = hotels.slice(0, Math.min(parseInt(limit) || 200, hotels.length));

    // Traduction DeepSeek pour langues non supportées nativement
    const nativeLangs = ['fr','en','es','pt','it','de','ar','zh','ja','ru','nl','pl','tr','sv','no','da','fi','cs','hu','ro','bg','hr','sr','sl','sk','lt','lv','et','uk','ko'];

    if (!nativeLangs.includes(language) && language !== 'fr' && finalHotels.length > 0) {
      console.log(`🔄 Traduction DeepSeek: ${language}`);
      const translated = await Promise.all(
        finalHotels.slice(0, 20).map(async h => {
          try {
            const name = await translateWithCache(h.name, language, 'fr', "Nom d'hôtel");
            return { ...h, name: name || h.name, translated: true, originalLanguage: 'fr', translatedLanguage: language };
          } catch (e) { return h; }
        })
      );
      return res.json({ success: true, hotels: translated, total: translated.length, language, translated: true });
    }

    res.json({ success: true, hotels: finalHotels, total: finalHotels.length, language });

  } catch (error) {
    console.error("❌ search-hotels:", error.message);
    res.status(error.status || 500).json({
      success: false,
      error: error.message,
      code: error.code,
      liteapiError: error.liteapiError || null
    });
  }
});

// ============================================================
// 3. RECHERCHE HÔTELS — STREAMING SSE (POST /hotels/rates)
// ============================================================
app.get("/search-hotels-stream", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS (STREAMING) ===== 🔍");
  const {
    checkin, checkout, adults, children, childrenAges,
    placeId, city, countryCode, hotelIds,
    lat, lon, radius, iataCode, aiSearch,
    environment, limit = 200, language = 'fr', currency = 'USD',
    maxRatesPerHotel = 1, timeout = 12,
    refundableOnly, boardTypes, stars, facilities,
    minRating, minReviews, hotelTypes, chains,
    sortBy, sessionId
  } = req.query;

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;
  const guestNationality = normalizeCountryCode(await getGuestNationality(req));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    let locationParam = {};

    if (placeId) {
      locationParam = { placeId };
    } else if (hotelIds) {
      locationParam = { hotelIds: hotelIds.split(',').map(s => s.trim()) };
    } else if (lat && lon) {
      locationParam = { latitude: parseFloat(lat), longitude: parseFloat(lon), radius: parseInt(radius) || 5000 };
    } else if (iataCode) {
      locationParam = { iataCode: iataCode.toUpperCase() };
    } else if (aiSearch) {
      locationParam = { aiSearch };
    } else if (city) {
      send('status', { step: 'geocoding', message: `📍 Recherche de "${city}"...` });
      try {
        const placesData = await callLiteAPI(
          `data/places?textQuery=${encodeURIComponent(city)}&language=${language}`,
          'GET', null, apiKey
        );
        if (placesData.data && placesData.data.length > 0) {
          locationParam = { placeId: placesData.data[0].placeId };
          send('status', { step: 'geocoding', message: `✅ ${placesData.data[0].placeId}` });
        } else {
          locationParam = { cityName: city, countryCode: countryCode || guestNationality };
        }
      } catch (e) {
        locationParam = { cityName: city, countryCode: countryCode || guestNationality };
      }
    }

    if (Object.keys(locationParam).length === 0) {
      send('error', { message: "Aucun critère de localisation" });
      return res.end();
    }

    const occupancies = [{
      adults: parseInt(adults, 10) || 2,
      ...(children && parseInt(children) > 0 ? {
        children: parseInt(children),
        ages: childrenAges ? childrenAges.split(',').map(a => parseInt(a.trim())) : Array(parseInt(children)).fill(5)
      } : {})
    }];

    const body = {
      checkin, checkout,
      currency: currency.toUpperCase(),
      guestNationality,
      occupancies,
      ...locationParam,
      maxRatesPerHotel: parseInt(maxRatesPerHotel) || 1,
      limit: Math.min(parseInt(limit) || 200, 5000),
      timeout: parseInt(timeout) || 12,
      includeHotelData: true,
      roomMapping: true,
      language
    };

    if (refundableOnly === 'true') body.refundableOnly = true;
    if (boardTypes) body.boardTypes = boardTypes;
    if (stars) body.stars = stars.split(',').map(s => parseFloat(s.trim()));
    if (facilities) body.facilities = facilities.split(',').map(s => s.trim());
    if (minRating) body.minRating = parseFloat(minRating);
    if (minReviews) body.minReviews = parseInt(minReviews);
    if (hotelTypes) body.hotelTypes = hotelTypes.split(',').map(s => s.trim());
    if (chains) body.chains = chains.split(',').map(s => s.trim());
    if (sortBy) body.sortBy = sortBy;
    if (sessionId) body.sessionId = sessionId;

    send('status', { step: 'rates', message: '🔍 Recherche des tarifs...' });

    const ratesResponse = await callLiteAPI('hotels/rates', 'POST', body, apiKey);
    const rateEntries = Array.isArray(ratesResponse.data) ? ratesResponse.data : [];
    const hotelsInfo = Array.isArray(ratesResponse.hotels) ? ratesResponse.hotels : [];

    const infoMap = {};
    hotelsInfo.forEach(h => { infoMap[h.id || h.hotelId] = h; });

    let allHotels = rateEntries.map(entry => {
      const hotelId = entry.hotelId || entry.id;
      const info = infoMap[hotelId] || entry.hotel || {};
      const bestRate = entry.roomTypes?.[0]?.rates?.[0];
      return {
        id: hotelId,
        name: info.name || entry.name || 'Hôtel sans nom',
        address: info.address || '',
        city: info.city || '',
        country: info.country || '',
        main_photo: info.main_photo || info.mainPhoto || info.thumbnail || `https://picsum.photos/seed/${hotelId}/460/380`,
        rating: info.rating || 0,
        reviewCount: info.reviewCount || 0,
        starRating: info.stars ?? info.starRating ?? 0,
        minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
        currency: bestRate?.retailRate?.total?.[0]?.currency || currency.toUpperCase(),
        offerId: entry.roomTypes?.[0]?.offerId || null,
        roomName: bestRate?.name || 'Chambre standard',
        refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN',
        latitude: info.latitude || null,
        longitude: info.longitude || null,
        language
      };
    });

    allHotels = allHotels.filter(h => h.minPrice > 0).sort((a, b) => a.minPrice - b.minPrice);
    send('status', { step: 'found', message: `✅ ${allHotels.length} hôtels trouvés` });

    const CHUNK = 20;
    const totalChunks = Math.ceil(allHotels.length / CHUNK) || 1;
    for (let i = 0; i < allHotels.length; i += CHUNK) {
      send('batch', {
        hotels: allHotels.slice(i, i + CHUNK),
        batch: Math.floor(i / CHUNK) + 1,
        totalBatches: totalChunks,
        loaded: Math.min(i + CHUNK, allHotels.length),
        total: allHotels.length
      });
    }

    send('complete', { hotels: allHotels, total: allHotels.length, language });
    res.end();

  } catch (error) {
    console.error("❌ search-hotels-stream:", error.message);
    send('error', { message: error.message, code: error.code });
    res.end();
  }
});

// ============================================================
// 4. TARIFS DÉTAILLÉS D'UN HÔTEL (POST /hotels/rates avec hotelIds)
// ============================================================
app.get("/search-rates", async (req, res) => {
  console.log("\n💰 ===== SEARCH RATES ===== 💰");
  const {
    checkin, checkout, adults, children, childrenAges,
    hotelId, environment, language = 'fr', currency = 'USD',
    maxRates = 30, timeout = 15
  } = req.query;

  if (!hotelId) {
    return res.status(400).json({ success: false, error: "hotelId est requis" });
  }

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;
  const guestNationality = normalizeCountryCode(await getGuestNationality(req));
  console.log(`🌍 Nationalité: ${guestNationality}`);

  try {
    const occupancies = [{
      adults: parseInt(adults, 10) || 2,
      ...(children && parseInt(children) > 0 ? {
        children: parseInt(children),
        ages: childrenAges ? childrenAges.split(',').map(a => parseInt(a.trim())) : Array(parseInt(children)).fill(5)
      } : {})
    }];

    const body = {
      hotelIds: [hotelId],
      checkin,
      checkout,
      currency: currency.toUpperCase(),
      guestNationality,
      occupancies,
      maxRatesPerHotel: Math.min(parseInt(maxRates) || 30, 100),
      timeout: parseInt(timeout) || 15,
      includeHotelData: true,
      roomMapping: true,
      language
    };

    const data = await callLiteAPI('hotels/rates', 'POST', body, apiKey);

    let rates = [];
    if (Array.isArray(data.data)) rates = data.data;
    else if (data.data?.data && Array.isArray(data.data.data)) rates = data.data.data;
    else if (data.data?.hotels && Array.isArray(data.data.hotels)) rates = data.data.hotels;

    if (rates.length === 0) {
      return res.json({ success: false, error: "No availability found", message: "Aucun tarif disponible pour ces dates" });
    }

    const hotel = rates[0];
    const hotelInfo = hotel.hotel || hotel;

    const hotelDetails = {
      id: hotel.hotelId || hotel.id || hotelId,
      name: hotelInfo.name || hotel.name || 'Hôtel sans nom',
      address: hotelInfo.address || hotel.address || '',
      city: hotelInfo.city || hotel.city || '',
      country: hotelInfo.country || hotel.country || '',
      countryCode: hotelInfo.country_code || hotelInfo.countryCode || '',
      starRating: hotelInfo.starRating || hotel.starRating || 0,
      rating: hotelInfo.rating || hotel.rating || 0,
      reviewCount: hotelInfo.reviewCount || hotel.reviewCount || 0,
      main_photo: hotelInfo.main_photo || hotelInfo.mainPhoto || hotel.main_photo || ''
    };

    const rateInfo = (hotel.roomTypes || []).flatMap(roomType =>
      (roomType.rates || []).map(rate => {
        const boardMap = {
          'RO': 'Room Only', 'BB': 'Bed and Breakfast', 'HB': 'Half Board',
          'FB': 'Full Board', 'AI': 'All Inclusive', 'BI': 'Breakfast Included'
        };
        return {
          rateName: rate.name || roomType.roomTypeId || 'Chambre',
          offerId: roomType.offerId || rate.offerId,
          rateId: rate.rateId || '',
          supplier: rate.supplier || '',
          board: rate.boardName || boardMap[rate.boardType] || rate.boardType || 'Room Only',
          boardType: rate.boardType || 'RO',
          refundableTag: rate.cancellationPolicies?.refundableTag || 'NRFN',
          retailRate: rate.retailRate?.total?.[0]?.amount || 0,
          retailCurrency: rate.retailRate?.total?.[0]?.currency || currency.toUpperCase(),
          msp: rate.retailRate?.msp?.[0]?.amount || null,
          taxesAndFees: rate.retailRate?.taxesAndFees || [],
          maxOccupancy: rate.maxOccupancy || 0,
          adultCount: rate.adultCount || 0,
          childCount: rate.childCount || 0,
          mappedRoomId: rate.mappedRoomId || null,
          cancellationPolicies: rate.cancellationPolicies || null,
          hotelRemarks: rate.hotelRemarks || [],
          commission: rate.commission || null
        };
      })
    );

    const minPrice = rateInfo.reduce((min, r) => (r.retailRate > 0 && r.retailRate < min) ? r.retailRate : min, Infinity);

    res.json({
      success: true,
      hotelInfo: hotelDetails,
      rateInfo,
      minPrice: minPrice === Infinity ? 0 : minPrice,
      total: rateInfo.length,
      language
    });

  } catch (error) {
    console.error("❌ search-rates:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message, code: error.code });
  }
});

// ============================================================
// 5. PRÉ-RÉSERVATION HÔTEL (POST /hotels/prebook)
// ============================================================
// Body conforme : { offerId, usePaymentSdk?, voucherCode? }
// PAS de currency ici — le montant est figé lors du rates
// ============================================================
app.post("/prebook", async (req, res) => {
  console.log("\n📋 ===== PREBOOK ===== 📋");
  const { offerId, environment, voucherCode, usePaymentSdk = true } = req.body;

  if (!offerId) {
    return res.status(400).json({ success: false, error: "offerId est requis" });
  }

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;
  const sdk = liteApi(apiKey);

  try {
    const bodyData = { offerId };
    if (usePaymentSdk !== undefined) bodyData.usePaymentSdk = usePaymentSdk;
    if (voucherCode) bodyData.voucherCode = voucherCode;

    const response = await sdk.preBook(bodyData);
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("❌ prebook:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 6. RÉSERVATION FINALE HÔTEL (POST /hotels/book)
// ============================================================
// Body conforme LiteAPI v3.0 :
//   prebookId, holder {firstName, lastName, email, phone?},
//   payment {method, transactionId},
//   guests [{occupancyNumber, firstName, lastName, email}],
//   clientReference?, metadata?, labels?
// ============================================================
app.post("/book", async (req, res) => {
  console.log("\n📝 ===== BOOK ===== 📝");
  const {
    prebookId, guestFirstName, guestLastName, guestEmail, guestPhone,
    transactionId, environment, clientReference, labels
  } = req.body;

  if (!prebookId || !guestFirstName || !guestLastName || !guestEmail || !transactionId) {
    return res.status(400).json({ success: false, error: "Champs requis manquants: prebookId, guestFirstName, guestLastName, guestEmail, transactionId" });
  }

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;
  const sdk = liteApi(apiKey);

  const bodyData = {
    prebookId,
    holder: {
      firstName: guestFirstName,
      lastName: guestLastName,
      email: guestEmail,
      phone: guestPhone || '+1234567890'
    },
    payment: {
      method: "TRANSACTION_ID",
      transactionId
    },
    guests: [{
      occupancyNumber: 1,
      firstName: guestFirstName,
      lastName: guestLastName,
      email: guestEmail
    }]
  };

  if (clientReference) bodyData.clientReference = clientReference;
  if (labels && typeof labels === 'object') bodyData.labels = labels;

  try {
    const response = await sdk.book(bodyData);
    const bookingData = response.data;
    console.log('✅ Booking confirmé:', bookingData.bookingId);

    // Récupération des détails pour email
    const hotelDetails = await getHotelDetailsLite(bookingData.hotelId, apiKey);
    const confirmationData = buildConfirmationData(bookingData, {}, hotelDetails, {
      firstName: guestFirstName, lastName: guestLastName, email: guestEmail, phone: guestPhone
    });
    await sendConfirmationEmail(confirmationData);

    res.json({ success: true, data: confirmationData });

  } catch (err) {
    console.error("❌ book:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// 7. RÉCUPÉRER UNE RÉSERVATION (GET /bookings/{id})
// ============================================================
app.get("/booking/:id", async (req, res) => {
  console.log("\n📋 ===== GET BOOKING ===== 📋");
  const { id } = req.params;
  const { environment = 'sandbox' } = req.query;

  if (!id) return res.status(400).json({ success: false, error: "Booking ID requis" });

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const bookingData = await callLiteAPI(`bookings/${id}`, 'GET', null, apiKey);
    if (!bookingData.data) return res.status(404).json({ success: false, error: "Réservation non trouvée" });

    const booking = bookingData.data;
    const hotelDetails = await getHotelDetailsLite(booking.hotelId, apiKey);

    const formatted = buildConfirmationData(booking, {}, hotelDetails, {
      firstName: booking.holder?.firstName || '',
      lastName: booking.holder?.lastName || '',
      email: booking.holder?.email || '',
      phone: booking.holder?.phone || ''
    });

    res.json({ success: true, data: formatted });

  } catch (error) {
    console.error("❌ get-booking:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 8. ANNULER UNE RÉSERVATION (PUT /bookings/{id})
// ============================================================
app.put("/booking/:id/cancel", async (req, res) => {
  console.log("\n🚫 ===== CANCEL BOOKING ===== 🚫");
  const { id } = req.params;
  const { environment = 'sandbox', reason } = req.body;

  if (!id) return res.status(400).json({ success: false, error: "Booking ID requis" });

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const body = reason ? { reason } : {};
    const data = await callLiteAPI(`bookings/${id}`, 'PUT', body, apiKey);
    res.json({ success: true, data: data.data || data });
  } catch (error) {
    console.error("❌ cancel:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message, code: error.code });
  }
});

// ============================================================
// 9. LISTE DES RÉSERVATIONS (GET /bookings)
// ============================================================
app.get("/bookings", async (req, res) => {
  console.log("\n📋 ===== LIST BOOKINGS ===== 📋");
  const { environment = 'sandbox', page = 1, limit = 50, status, fromDate, toDate, guestId } = req.query;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    let qs = `?page=${page}&limit=${limit}`;
    if (status) qs += `&status=${status}`;
    if (fromDate) qs += `&from=${fromDate}`;
    if (toDate) qs += `&to=${toDate}`;
    if (guestId) qs += `&guestId=${guestId}`;

    const data = await callLiteAPI(`bookings${qs}`, 'GET', null, apiKey);
    res.json({ success: true, data: data.data || [], pagination: data.pagination || {} });
  } catch (error) {
    console.error("❌ list-bookings:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 10. DÉTAILS HÔTEL (GET /data/hotel)
// ============================================================
app.get("/hotel-details", async (req, res) => {
  console.log("\n🏨 ===== HOTEL DETAILS ===== 🏨");
  const { hotelId, timeout = 8, environment, language = 'fr' } = req.query;

  if (!hotelId) return res.status(400).json({ success: false, error: "hotelId requis" });

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const data = await callLiteAPI(
      `data/hotel?hotelId=${encodeURIComponent(hotelId)}&timeout=${parseInt(timeout) || 8}&language=${language}`,
      'GET', null, apiKey
    );

    if (!data.data) return res.status(404).json({ success: false, error: "Hôtel non trouvé" });

    const h = data.data;
    const hotel = {
      id: h.hotelId || h.id || hotelId,
      name: h.name || 'Hôtel sans nom',
      description: h.hotelDescription || h.description || '',
      address: h.address || '',
      city: h.city || '',
      country: h.country || '',
      countryCode: h.country_code || h.countryCode || '',
      starRating: h.starRating || 0,
      rating: h.rating || 0,
      reviewCount: h.reviewCount || 0,
      phone: h.phone || '',
      email: h.email || '',
      website: h.website || '',
      latitude: h.latitude || h.lat || null,
      longitude: h.longitude || h.lon || null,
      main_photo: h.main_photo || h.mainPhoto || (h.hotelImages?.[0]?.url || ''),
      hotelImages: (h.hotelImages || h.images || []).map(img => ({
        url: img.hd_url || img.url || img.image || '',
        thumbnail: img.thumbnail || '',
        mainPhoto: img.mainPhoto || img.main || false
      })),
      hotelFacilities: (h.hotelFacilities || h.facilities || []).map(f =>
        typeof f === 'string' ? f : (f.name || f)
      ),
      rooms: (h.rooms || []).map(room => ({
        id: room.id || room.roomId,
        name: room.roomName || room.name || 'Chambre',
        description: room.description || '',
        maxOccupancy: room.maxOccupancy || 0,
        maxAdults: room.maxAdults || 0,
        maxChildren: room.maxChildren || 0,
        roomSizeSquare: room.roomSizeSquare || 0,
        bedTypes: room.bedTypes || [],
        amenities: (room.roomAmenities || []).map(a => typeof a === 'string' ? a : a.name),
        photos: (room.photos || room.images || []).map(p => ({
          url: p.hd_url || p.url || p.image || '',
          mainPhoto: p.mainPhoto || p.main || false
        }))
      })),
      language
    };

    // Traduction DeepSeek si langue non native
    const nativeLangs = ['fr','en','es','pt','it','de','ar','zh','ja','ru','nl','pl','tr','sv','no','da','fi','cs','hu','ro','bg','hr','sr','sl','sk','lt','lv','et','uk','ko'];
    if (!nativeLangs.includes(language) && language !== 'fr') {
      console.log(`🔄 Traduction détails hôtel: ${language}`);
      hotel.name = await translateWithCache(hotel.name, language, 'fr', "Nom d'hôtel");
      hotel.address = await translateWithCache(hotel.address, language, 'fr', "Adresse");
      hotel.description = await translateWithCache(hotel.description, language, 'fr', "Description d'hôtel");
      hotel.rooms = await Promise.all(hotel.rooms.map(async r => {
        r.name = await translateWithCache(r.name, language, 'fr', "Nom de chambre");
        r.description = await translateWithCache(r.description, language, 'fr', "Description de chambre");
        return r;
      }));
      hotel.hotelFacilities = await Promise.all(hotel.hotelFacilities.map(async f =>
        await translateWithCache(f, language, 'fr', "Équipement d'hôtel")
      ));
      hotel.translated = true;
      hotel.translatedLanguage = language;
    }

    console.log(`✅ Hôtel: ${hotel.name} (${language})`);
    res.json({ success: true, data: hotel });

  } catch (error) {
    console.error("❌ hotel-details:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 11. AVIS HÔTEL (GET /data/reviews)
// ============================================================
app.get("/hotel-reviews", async (req, res) => {
  console.log("\n⭐ ===== HOTEL REVIEWS ===== ⭐");
  const { hotelId, timeout = 8, environment, language = 'fr' } = req.query;

  if (!hotelId) return res.status(400).json({ success: false, error: "hotelId requis" });

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const data = await callLiteAPI(
      `data/reviews?hotelId=${encodeURIComponent(hotelId)}&timeout=${parseInt(timeout) || 8}&language=${language}`,
      'GET', null, apiKey
    );

    const reviews = (data.data || []).map(rv => ({
      reviewerName: rv.reviewerName || rv.name || rv.author || 'Voyageur',
      comment: rv.comment || rv.text || rv.reviewComments || rv.review || '',
      rating: rv.averageScore || rv.rating || rv.score || rv.overallRating || 0,
      date: rv.date || rv.reviewDate || '',
      pros: rv.pros || '',
      cons: rv.cons || '',
      type: rv.type || '',
      averageScore: rv.averageScore || 0
    }));

    const nativeLangs = ['fr','en','es','pt','it','de','ar','zh','ja','ru','nl','pl','tr','sv','no','da','fi','cs','hu','ro','bg','hr','sr','sl','sk','lt','lv','et','uk','ko'];
    if (!nativeLangs.includes(language) && language !== 'fr' && reviews.length > 0) {
      console.log(`🔄 Traduction avis: ${language}`);
      const translated = await Promise.all(reviews.map(async rv => {
        try {
          const comment = await translateWithCache(rv.comment, language, 'fr', 'Avis hôtel');
          const pros = rv.pros ? await translateWithCache(rv.pros, language, 'fr', 'Points positifs') : '';
          const cons = rv.cons ? await translateWithCache(rv.cons, language, 'fr', 'Points négatifs') : '';
          return { ...rv, comment: comment || rv.comment, pros, cons, translated: true };
        } catch (e) { return rv; }
      }));
      return res.json({ success: true, data: translated, total: translated.length, language });
    }

    res.json({ success: true, data: reviews, total: reviews.length, language });

  } catch (error) {
    console.error("❌ hotel-reviews:", error.message);
    res.json({ success: true, data: [], total: 0, message: "Avis non disponibles" });
  }
});

// ============================================================
// 12. RECHERCHE D'HÔTELS PAR NOM (GET /data/hotels)
// ============================================================
app.get("/data/hotels", async (req, res) => {
  console.log("\n🏨 ===== DATA HOTELS ===== 🏨");
  const {
    textQuery, countryCode, cityName, placeId, hotelIds,
    lat, lon, radius, iataCode,
    environment, language = 'fr', timeout = 8,
    minRating, minReviews, stars, facilities,
    hotelTypes, chains, limit = 50, offset = 0
  } = req.query;

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    let qs = `?language=${language}&timeout=${timeout}&limit=${limit}&offset=${offset}`;
    if (textQuery) qs += `&textQuery=${encodeURIComponent(textQuery)}`;
    if (countryCode) qs += `&countryCode=${countryCode.toUpperCase()}`;
    if (cityName) qs += `&cityName=${encodeURIComponent(cityName)}`;
    if (placeId) qs += `&placeId=${encodeURIComponent(placeId)}`;
    if (hotelIds) qs += `&hotelIds=${hotelIds}`;
    if (lat && lon) qs += `&latitude=${lat}&longitude=${lon}&radius=${radius || 5000}`;
    if (iataCode) qs += `&iataCode=${iataCode.toUpperCase()}`;
    if (minRating) qs += `&minRating=${minRating}`;
    if (minReviews) qs += `&minReviews=${minReviews}`;
    if (stars) qs += `&stars=${stars}`;
    if (facilities) qs += `&facilities=${facilities}`;
    if (hotelTypes) qs += `&hotelTypes=${hotelTypes}`;
    if (chains) qs += `&chains=${chains}`;

    const data = await callLiteAPI(`data/hotels${qs}`, 'GET', null, apiKey);
    res.json({ success: true, data: data.data || [], total: data.total || 0, language });

  } catch (error) {
    console.error("❌ data-hotels:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 13. LISTE DES VILLES (GET /data/cities)
// ============================================================
app.get("/data/cities", async (req, res) => {
  console.log("\n🏙️ ===== DATA CITIES ===== 🏙️");
  const { environment, countryCode, language = 'fr', timeout = 5 } = req.query;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    let qs = `?language=${language}&timeout=${timeout}`;
    if (countryCode) qs += `&countryCode=${countryCode.toUpperCase()}`;
    const data = await callLiteAPI(`data/cities${qs}`, 'GET', null, apiKey);
    res.json({ success: true, data: data.data || [], language });
  } catch (error) {
    console.error("❌ data-cities:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 14. LISTE DES PAYS (GET /data/countries)
// ============================================================
app.get("/data/countries", async (req, res) => {
  console.log("\n🌍 ===== DATA COUNTRIES ===== 🌍");
  const { environment, language = 'fr', timeout = 5 } = req.query;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const data = await callLiteAPI(`data/countries?language=${language}&timeout=${timeout}`, 'GET', null, apiKey);
    res.json({ success: true, data: data.data || [], language });
  } catch (error) {
    console.error("❌ data-countries:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 15. LISTE DES ÉQUIPEMENTS (GET /data/facilities)
// ============================================================
app.get("/data/facilities", async (req, res) => {
  console.log("\n🏋️ ===== DATA FACILITIES ===== 🏋️");
  const { environment, language = 'fr', timeout = 5 } = req.query;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const data = await callLiteAPI(`data/facilities?language=${language}&timeout=${timeout}`, 'GET', null, apiKey);
    res.json({ success: true, data: data.data || [], language });
  } catch (error) {
    console.error("❌ data-facilities:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 16. LISTE DES TYPES D'HÔTEL (GET /data/hotelTypes)
// ============================================================
app.get("/data/hotel-types", async (req, res) => {
  console.log("\n🏨 ===== DATA HOTEL TYPES ===== 🏨");
  const { environment, language = 'fr', timeout = 5 } = req.query;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const data = await callLiteAPI(`data/hotelTypes?language=${language}&timeout=${timeout}`, 'GET', null, apiKey);
    res.json({ success: true, data: data.data || [], language });
  } catch (error) {
    console.error("❌ data-hotel-types:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 17. LISTE DES CHAÎNES (GET /data/chains)
// ============================================================
app.get("/data/chains", async (req, res) => {
  console.log("\n🔗 ===== DATA CHAINS ===== 🔗");
  const { environment, language = 'fr', timeout = 5 } = req.query;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const data = await callLiteAPI(`data/chains?language=${language}&timeout=${timeout}`, 'GET', null, apiKey);
    res.json({ success: true, data: data.data || [], language });
  } catch (error) {
    console.error("❌ data-chains:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 18. LISTE DES CODES IATA (GET /data/iataCodes)
// ============================================================
app.get("/data/iata-codes", async (req, res) => {
  console.log("\n✈️ ===== DATA IATA CODES ===== ✈️");
  const { environment, language = 'fr', timeout = 5 } = req.query;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const data = await callLiteAPI(`data/iataCodes?language=${language}&timeout=${timeout}`, 'GET', null, apiKey);
    res.json({ success: true, data: data.data || [], language });
  } catch (error) {
    console.error("❌ data-iata-codes:", error.message);
    res.status(error.status || 500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 19. RECHERCHE VOLS (POST /flights/search)
// ============================================================
app.post("/search-flights", async (req, res) => {
  console.log("\n✈️ ===== SEARCH FLIGHTS ===== ✈️");
  const { legs, adults, children, infants, currency, country, cabinClass, environment } = req.body;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.searchFlights({
      legs,
      adults: adults || 1,
      children: children || 0,
      infants: infants || 0,
      currency: currency || "USD",
      country: country || "US",
      cabinClass: cabinClass || "ECONOMY"
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ search-flights:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 20. VÉRIFICATION VOL (POST /flights/verify)
// ============================================================
app.post("/verify-flight", async (req, res) => {
  console.log("\n🔎 ===== VERIFY FLIGHT ===== 🔎");
  const { offerId, environment } = req.body;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.verifyFlight({ offerId });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ verify-flight:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 21. PRÉ-RÉSERVATION VOL (POST /flights/prebook)
// ============================================================
app.post("/prebook-flight", async (req, res) => {
  console.log("\n📋 ===== PREBOOK FLIGHT ===== 📋");
  const { offerId, contact, passengers, usePaymentSdk, environment } = req.body;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.prebookFlight({
      offerId,
      usePaymentSdk: usePaymentSdk !== undefined ? usePaymentSdk : true,
      contact,
      passengers
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ prebook-flight:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 22. RÉSERVATION FINALE VOL (POST /flights/book)
// ============================================================
app.post("/book-flight", async (req, res) => {
  console.log("\n📝 ===== BOOK FLIGHT ===== 📝");
  const { prebookId, transactionId, method, environment } = req.body;
  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.bookFlight({
      prebookId,
      payment: { method: method || "TRANSACTION_ID", transactionId }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ book-flight:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 23. HIGHLIGHTS HÔTEL (POST /data/hotel/highlights)
// ============================================================
app.post("/api/hotel-highlights", async (req, res) => {
  console.log("\n✨ ===== HOTEL HIGHLIGHTS ===== ✨");
  const { hotelId, language = 'fr', count = 3, tone, style, highlights } = req.body;

  if (!hotelId) return res.status(400).json({ success: false, error: "hotelId requis" });

  const apiKey = PROD_API_KEY;

  try {
    const body = {
      hotelId,
      language,
      count: Math.min(Math.max(parseInt(count) || 3, 1), 10)
    };
    if (tone) body.tone = tone;
    if (style) body.style = style;
    if (highlights) body.highlights = highlights;

    const response = await fetchWithTimeout(`${LITEAPI_BASE_URL}/data/hotel/highlights`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    }, 15000);

    if (!response.ok) {
      if (response.status === 429) {
        return res.status(429).json({ success: false, error: "Rate limit exceeded", message: "Trop de requêtes. Réessayez dans une minute." });
      }
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    res.json({ success: true, data: data.data || data });

  } catch (error) {
    console.error('❌ highlights:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 24. ASK AI — QUESTION SUR UN HÔTEL (GET /data/hotel/ask)
// ============================================================
app.post("/api/ask-hotel", async (req, res) => {
  console.log("\n🤖 ===== ASK AI ===== 🤖");
  const { hotelId, question, allowWebSearch = false, language = 'fr' } = req.body;

  if (!hotelId) return res.status(400).json({ success: false, error: { code: 4001, message: "hotelId requis" } });
  if (!question || question.trim().length === 0) return res.status(400).json({ success: false, error: { code: 4002, message: "question requise" } });

  const apiKey = PROD_API_KEY;

  try {
    const url = new URL(`${LITEAPI_BASE_URL}/data/hotel/ask`);
    url.searchParams.append('hotelId', hotelId);
    url.searchParams.append('query', question);
    url.searchParams.append('allowWebSearch', String(allowWebSearch));

    const response = await fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json', 'Content-Type': 'application/json' }
    }, 15000);

    if (!response.ok) {
      let msg = `HTTP ${response.status}`;
      try { const d = await response.json(); msg = d.error?.message || d.message || msg; } catch(e){}
      throw new Error(msg);
    }

    const data = await response.json();
    console.log(`✅ Réponse IA (${data.data?.latency_ms || 0}ms)`);
    res.json({ success: true, data: data.data || data });

  } catch (error) {
    console.error('❌ ask-hotel:', error.message);
    res.status(500).json({ success: false, error: { code: 5001, message: error.message } });
  }
});

// ============================================================
// 25. LANGUES SUPPORTÉES (GET /data/languages)
// ============================================================
app.get("/api/languages", async (req, res) => {
  console.log("\n🌍 ===== LANGUAGES ===== 🌍");
  const { environment = 'sandbox' } = req.query;
  const apiKey = environment === "production" || environment === "prod" ? PROD_API_KEY : SANDBOX_API_KEY;

  try {
    const data = await callLiteAPI('data/languages', 'GET', null, apiKey);
    const languages = (data.data || []).map(lang => ({
      code: lang.code || lang.languageCode || lang,
      name: lang.name || lang.languageName || lang,
      nativeName: lang.nativeName || lang.name || lang
    }));
    res.json({ success: true, data: languages });
  } catch (error) {
    console.error("❌ languages:", error.message);
    res.json({ success: true, data: [
      { code: 'fr', name: 'Français', nativeName: 'Français' },
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'es', name: 'Español', nativeName: 'Español' },
      { code: 'de', name: 'Deutsch', nativeName: 'Deutsch' },
      { code: 'it', name: 'Italiano', nativeName: 'Italiano' },
      { code: 'pt', name: 'Português', nativeName: 'Português' },
      { code: 'ar', name: 'العربية', nativeName: 'العربية' },
      { code: 'zh', name: '中文', nativeName: '中文' },
      { code: 'ja', name: '日本語', nativeName: '日本語' },
      { code: 'ru', name: 'Русский', nativeName: 'Русский' }
    ]});
  }
});

// ============================================================
// 26. DEVISES SUPPORTÉES (GET /data/currencies)
// ============================================================
app.get("/api/currencies", async (req, res) => {
  console.log("\n💰 ===== CURRENCIES ===== 💰");
  const { environment = 'sandbox' } = req.query;
  const apiKey = environment === "production" || environment === "prod" ? PROD_API_KEY : SANDBOX_API_KEY;

  try {
    const data = await callLiteAPI('data/currencies', 'GET', null, apiKey);
    const currencies = (data.data || []).map(c => ({
      code: c.code || c.currencyCode || c,
      name: c.name || c.currencyName || c,
      symbol: c.symbol || getCurrencySymbol(c.code || c.currencyCode || c)
    }));
    res.json({ success: true, data: currencies });
  } catch (error) {
    console.error("❌ currencies:", error.message);
    res.json({ success: true, data: [
      { code: 'USD', name: 'US Dollar', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'GBP', name: 'British Pound', symbol: '£' },
      { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
      { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
      { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' }
    ]});
  }
});

function getCurrencySymbol(code) {
  const symbols = {
    'USD': '$', 'EUR': '€', 'GBP': '£', 'CAD': 'C$', 'CHF': 'Fr',
    'AUD': 'A$', 'JPY': '¥', 'CNY': '¥', 'RUB': '₽', 'BRL': 'R$',
    'ZAR': 'R', 'KES': 'KSh', 'TZS': 'TSh', 'UGX': 'USh', 'CDF': 'FC',
    'GHS': 'GH₵', 'NGN': '₦', 'XAF': 'FCFA', 'XOF': 'FCFA'
  };
  return symbols[code] || code;
}

// ============================================================
// 27. TAUX DE CHANGE (API Frankfurter)
// ============================================================
app.get("/api/rates", async (req, res) => {
  console.log("\n💱 ===== EXCHANGE RATES ===== 💱");
  const baseCurrency = req.query.base || 'USD';

  try {
    const response = await fetchWithTimeout(`https://api.frankfurter.app/latest?from=${baseCurrency}`, {}, 5000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();

    const africanRates = { 'CDF': 2800, 'XAF': 600, 'XOF': 600, 'NGN': 1500, 'GHS': 12, 'TZS': 2500, 'UGX': 3700, 'MAD': 10 };
    const rates = { ...data.rates, ...africanRates };
    if (!rates.USD) rates.USD = 1;

    res.json({ success: true, base: data.base || baseCurrency, date: data.date, rates });
  } catch (error) {
    console.error('❌ rates:', error.message);
    res.json({ success: true, base: baseCurrency, date: new Date().toISOString().split('T')[0], rates: {
      'USD': 1, 'EUR': 0.92, 'GBP': 0.78, 'CDF': 2800, 'XAF': 600, 'XOF': 600,
      'NGN': 1500, 'GHS': 12, 'ZAR': 18, 'KES': 130, 'TZS': 2500, 'UGX': 3700
    }});
  }
});

// ============================================================
// 28. CONVERSION DE PRIX
// ============================================================
app.post("/api/convert", async (req, res) => {
  console.log("\n🔄 ===== CONVERT ===== 🔄");
  const { amount, from, to } = req.body;
  if (!amount || !from || !to) return res.status(400).json({ success: false, error: "amount, from, to requis" });

  try {
    const response = await fetchWithTimeout(`https://api.frankfurter.app/latest?from=${from}`, {}, 5000);
    const data = await response.json();
    let rate = 1;
    if (to !== from) {
      if (data.rates?.[to]) rate = data.rates[to];
      else {
        const fallback = { 'CDF': 2800, 'XAF': 600, 'XOF': 600, 'NGN': 1500, 'GHS': 12, 'ZAR': 18, 'KES': 130, 'TZS': 2500, 'UGX': 3700, 'MAD': 10 };
        rate = fallback[to] || 1;
      }
    }
    res.json({ success: true, from, to, amount, rate, converted: amount * rate });
  } catch (error) {
    const fallback = { 'USD': 1, 'EUR': 0.92, 'GBP': 0.78, 'CDF': 2800, 'XAF': 600, 'XOF': 600, 'NGN': 1500, 'GHS': 12, 'ZAR': 18, 'KES': 130, 'TZS': 2500, 'UGX': 3700 };
    const rate = fallback[to] || 1;
    res.json({ success: true, from, to, amount, rate, converted: amount * rate, fallback: true });
  }
});

// ============================================================
// 29. TRADUCTION DEEPSPEEK — API
// ============================================================
app.post('/api/translate', async (req, res) => {
  console.log("\n🌍 ===== TRANSLATE ===== 🌍");
  const { text, targetLang, sourceLang = 'fr', context = '' } = req.body;
  if (!text || !targetLang) return res.status(400).json({ success: false, error: "text et targetLang requis" });
  if (targetLang === sourceLang) return res.json({ success: true, translation: text });

  try {
    const translation = await translateWithCache(text, targetLang, sourceLang, context);
    res.json({ success: true, translation, sourceLang, targetLang });
  } catch (error) {
    console.error('❌ translate:', error.message);
    res.status(500).json({ success: false, error: error.message, fallback: text });
  }
});

app.post("/api/translate-reviews", async (req, res) => {
  console.log("\n⭐ ===== TRANSLATE REVIEWS ===== ⭐");
  const { reviews, targetLang } = req.body;
  if (!reviews || !Array.isArray(reviews)) return res.json({ success: true, reviews: [] });
  if (targetLang === 'fr') return res.json({ success: true, reviews });

  try {
    const translated = await Promise.all(reviews.map(async rv => {
      if (!rv.comment) return rv;
      try {
        const comment = await translateWithCache(rv.comment, targetLang, 'fr', 'Avis hôtel');
        return { ...rv, comment: comment || rv.comment, translated: true };
      } catch (e) { return rv; }
    }));
    res.json({ success: true, reviews: translated, targetLang, total: translated.length });
  } catch (error) {
    res.json({ success: true, reviews });
  }
});

app.post("/api/translate-hotel-description", async (req, res) => {
  console.log("\n📝 ===== TRANSLATE DESCRIPTION ===== 📝");
  const { description, targetLang } = req.body;
  if (!description) return res.status(400).json({ success: false, error: "description requise" });
  if (targetLang === 'fr') return res.json({ success: true, translation: description });

  try {
    const t = await translateWithCache(description, targetLang || 'fr', 'fr', "Description d'hôtel");
    res.json({ success: true, translation: t, original: description, targetLang });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message, fallback: description });
  }
});

// ============================================================
// 30. NATIONALITÉ DU CLIENT
// ============================================================
app.get("/api/nationality", async (req, res) => {
  console.log("\n🌍 ===== NATIONALITY ===== 🌍");
  const nationality = normalizeCountryCode(await getGuestNationality(req));
  res.json({ success: true, nationality, detected: true });
});

// ============================================================
// 31. DESTINATIONS AFRIQUE DE L'EST
// ============================================================
app.get("/api/east-africa-destinations", async (req, res) => {
  console.log("\n🌍 ===== EAST AFRICA DESTINATIONS ===== 🌍");
  const language = req.query.language || 'fr';

  const destinations = {
    fr: [
      { name: 'Zanzibar', country: 'Tanzanie', countryCode: 'TZ', description: 'Île paradisiaque avec des plages de sable blanc' },
      { name: 'Nairobi', country: 'Kenya', countryCode: 'KE', description: 'Capitale dynamique du Kenya' },
      { name: 'Kinshasa', country: 'RDC', countryCode: 'CD', description: 'Capitale de la RDC' },
      { name: 'Goma', country: 'RDC', countryCode: 'CD', description: 'Ville au bord du lac Kivu' },
      { name: 'Dar es Salaam', country: 'Tanzanie', countryCode: 'TZ', description: 'Plus grande ville de Tanzanie' },
      { name: 'Kampala', country: 'Ouganda', countryCode: 'UG', description: "Capitale de l'Ouganda" }
    ],
    en: [
      { name: 'Zanzibar', country: 'Tanzania', countryCode: 'TZ', description: 'Paradise island with white sand beaches' },
      { name: 'Nairobi', country: 'Kenya', countryCode: 'KE', description: 'Dynamic capital of Kenya' },
      { name: 'Kinshasa', country: 'DRC', countryCode: 'CD', description: 'Capital of the Democratic Republic of Congo' },
      { name: 'Goma', country: 'DRC', countryCode: 'CD', description: 'City on the shores of Lake Kivu' }
    ],
    sw: [
      { name: 'Zanzibar', country: 'Tanzania', countryCode: 'TZ', description: 'Kisiwa cha peponi na fukwe nyeupe' },
      { name: 'Nairobi', country: 'Kenya', countryCode: 'KE', description: 'Mji mkuu wa Kenya' },
      { name: 'Kinshasa', country: 'DRC', countryCode: 'CD', description: 'Mji mkuu wa Jamhuri ya Kidemokrasia ya Kongo' },
      { name: 'Goma', country: 'DRC', countryCode: 'CD', description: 'Mji wa ziwa Kivu' }
    ]
  };

  res.json({ success: true, data: destinations[language] || destinations.fr, language });
});

// ============================================================
// 32. PAIMENT MOBILE MONEY — INIT
// ✅ CORRECTION : pas de usePaymentSdk ni currency dans prebook
// ============================================================
app.post("/api/payment/mobile-money/init", async (req, res) => {
  console.log("\n📱 ===== MOBILE MONEY INIT ===== 📱");
  const { offerId, phoneNumber, provider = 'MPESA', amount, currency = 'USD', guestInfo, environment = 'sandbox' } = req.body;

  if (!offerId || !phoneNumber || !amount) {
    return res.status(400).json({ success: false, error: "offerId, phoneNumber et amount requis" });
  }

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const prebookResult = await callLiteAPI('hotels/prebook', 'POST', { offerId }, apiKey);

    if (!prebookResult.data) {
      return res.status(400).json({ success: false, error: "Offre non disponible" });
    }

    const prebookId = prebookResult.data.prebookId;
    const totalAmount = prebookResult.data.total?.amount || amount;
    const transactionId = `LUVIA-MM-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const tx = {
      id: transactionId, prebookId, offerId, guestInfo,
      amount: totalAmount, currency, provider, phoneNumber,
      status: 'PENDING', createdAt: new Date().toISOString(),
      secretKey: prebookResult.data.secretKey
    };

    if (!global.mobileMoneyTransactions) global.mobileMoneyTransactions = new Map();
    global.mobileMoneyTransactions.set(transactionId, tx);

    console.log(`📱 MM initié: ${transactionId} | ${phoneNumber} | $${totalAmount}`);

    res.json({
      success: true,
      data: {
        transactionId, prebookId, provider, status: 'PENDING',
        amount: totalAmount, currency,
        message: `Veuillez confirmer le paiement de $${totalAmount} sur ${phoneNumber}`
      }
    });

  } catch (error) {
    console.error('❌ mm-init:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 33. MOBILE MONEY — CONFIRM
// ============================================================
app.post("/api/payment/mobile-money/confirm", async (req, res) => {
  console.log("\n📞 ===== MOBILE MONEY CONFIRM ===== 📞");
  const { transactionId, mpesaReceiptNumber } = req.body;
  if (!transactionId) return res.status(400).json({ success: false, error: "transactionId requis" });

  const tx = global.mobileMoneyTransactions?.get(transactionId);
  if (!tx) return res.status(404).json({ success: false, error: "Transaction non trouvée" });

  tx.status = 'COMPLETED';
  tx.mpesaReceiptNumber = mpesaReceiptNumber || `MM-${Date.now()}`;
  tx.completedAt = new Date().toISOString();
  global.mobileMoneyTransactions.set(transactionId, tx);

  res.json({ success: true, data: { transactionId, status: 'COMPLETED', prebookId: tx.prebookId, amount: tx.amount } });
});

// ============================================================
// 34. MOBILE MONEY — WEBHOOK
// ============================================================
app.post("/api/payment/mobile-money/webhook", async (req, res) => {
  console.log("\n📨 ===== MM WEBHOOK ===== 📨");
  const { transactionId, status, receiptNumber } = req.body;

  const tx = global.mobileMoneyTransactions?.get(transactionId);
  if (!tx) return res.status(200).json({ success: true });

  if (status === 'SUCCESS' || status === 'COMPLETED') {
    tx.status = 'COMPLETED'; tx.mpesaReceiptNumber = receiptNumber; tx.completedAt = new Date().toISOString();
    console.log(`✅ MM webhook OK: ${transactionId}`);
  } else {
    tx.status = 'FAILED';
    console.log(`❌ MM webhook KO: ${transactionId}`);
  }
  global.mobileMoneyTransactions.set(transactionId, tx);
  res.status(200).json({ success: true });
});

// ============================================================
// 35. PAYPAL — INIT
// ✅ CORRECTION : pas de usePaymentSdk ni currency dans prebook
// ============================================================
app.post("/api/payment/paypal/init", async (req, res) => {
  console.log("\n🅿️ ===== PAYPAL INIT ===== 🅿️");
  const { offerId, amount, currency = 'USD', guestInfo, environment = 'sandbox', email, returnUrl } = req.body;

  if (!offerId || !amount) return res.status(400).json({ success: false, error: "offerId et amount requis" });

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const prebookResult = await callLiteAPI('hotels/prebook', 'POST', { offerId }, apiKey);
    if (!prebookResult.data) return res.status(400).json({ success: false, error: "Offre non disponible" });

    const prebookId = prebookResult.data.prebookId;
    const totalAmount = prebookResult.data.total?.amount || amount;
    const transactionId = `LUVIA-PP-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    const tx = {
      id: transactionId, prebookId, offerId, guestInfo,
      amount: totalAmount, currency, provider: 'PAYPAL', email,
      status: 'PENDING', createdAt: new Date().toISOString()
    };

    if (!global.paypalTransactions) global.paypalTransactions = new Map();
    global.paypalTransactions.set(transactionId, tx);

    const redirect = returnUrl || `${req.protocol}://${req.get('host')}/api/payment/paypal/success?prebookId=${prebookId}&tx=${transactionId}`;

    res.json({ success: true, data: { transactionId, prebookId, provider: 'PAYPAL', status: 'PENDING', amount: totalAmount, currency, redirectUrl: redirect } });

  } catch (error) {
    console.error('❌ paypal-init:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 36. PAYPAL — WEBHOOK
// ============================================================
app.post("/api/payment/paypal/webhook", async (req, res) => {
  console.log("\n📨 ===== PAYPAL WEBHOOK ===== 📨");
  const { transactionId, status, paypalOrderId, payerEmail } = req.body;

  const tx = global.paypalTransactions?.get(transactionId);
  if (!tx) return res.status(200).json({ success: true });

  if (status === 'COMPLETED' || status === 'APPROVED') {
    tx.status = 'COMPLETED'; tx.paypalOrderId = paypalOrderId; tx.payerEmail = payerEmail; tx.completedAt = new Date().toISOString();
    console.log(`✅ PayPal OK: ${transactionId}`);
  } else {
    tx.status = 'FAILED';
    console.log(`❌ PayPal KO: ${transactionId}`);
  }
  global.paypalTransactions.set(transactionId, tx);
  res.status(200).json({ success: true });
});

// ============================================================
// 37. RÉSERVATION APRÈS PAIEMENT EXTERNE
// ✅ CORRECTION : envoie l'email de confirmation
// ============================================================
app.post("/api/book-with-payment", async (req, res) => {
  console.log("\n📝 ===== BOOK WITH PAYMENT ===== 📝");
  const { prebookId, guestFirstName, guestLastName, guestEmail, guestPhone, transactionId, paymentMethod = 'MOBILE_MONEY', environment = 'sandbox' } = req.body;

  if (!prebookId || !guestFirstName || !guestLastName || !guestEmail || !transactionId) {
    return res.status(400).json({ success: false, error: "prebookId, guestFirstName, guestLastName, guestEmail, transactionId requis" });
  }

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    let verified = false;
    if (paymentMethod === 'MOBILE_MONEY') {
      const tx = global.mobileMoneyTransactions?.get(transactionId);
      verified = tx && tx.status === 'COMPLETED';
    } else if (paymentMethod === 'PAYPAL') {
      const tx = global.paypalTransactions?.get(transactionId);
      verified = tx && tx.status === 'COMPLETED';
    }

    if (!verified && environment !== 'sandbox') {
      return res.status(400).json({ success: false, error: "Paiement non confirmé" });
    }

    const bookingResult = await callLiteAPI('hotels/book', 'POST', {
      prebookId,
      holder: { firstName: guestFirstName, lastName: guestLastName, email: guestEmail, phone: guestPhone || '+1234567890' },
      payment: { method: "TRANSACTION_ID", transactionId },
      guests: [{ occupancyNumber: 1, firstName: guestFirstName, lastName: guestLastName, email: guestEmail }]
    }, apiKey);

    const bookingData = bookingResult.data;
    console.log(`✅ Booking confirmé: ${bookingData.bookingId}`);

    // ✅ Envoi email de confirmation
    const hotelDetails = await getHotelDetailsLite(bookingData.hotelId, apiKey);
    const confirmationData = buildConfirmationData(bookingData, {}, hotelDetails, {
      firstName: guestFirstName, lastName: guestLastName, email: guestEmail, phone: guestPhone
    });
    await sendConfirmationEmail(confirmationData);

    res.json({
      success: true,
      data: {
        bookingId: bookingData.bookingId,
        hotelConfirmationCode: bookingData.hotelConfirmationCode,
        status: 'CONFIRMED',
        paymentMethod,
        transactionId
      }
    });

  } catch (error) {
    console.error('❌ book-with-payment:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// UTILITAIRES : Récupération hôtel, confirmation, email, voucher
// ============================================================
async function getHotelDetailsLite(hotelId, apiKey) {
  try {
    const data = await callLiteAPI(`data/hotel?hotelId=${hotelId}&language=fr`, 'GET', null, apiKey);
    return data.data || {};
  } catch (error) {
    console.warn('⚠️ getHotelDetailsLite:', error.message);
    return {};
  }
}

async function getBookingDetailsLite(bookingId, apiKey) {
  try {
    const data = await callLiteAPI(`bookings/${bookingId}`, 'GET', null, apiKey);
    return data.data || {};
  } catch (error) {
    console.warn('⚠️ getBookingDetailsLite:', error.message);
    return {};
  }
}

function buildConfirmationData(booking, details, hotel, guest) {
  let roomName = 'Chambre standard';
  if (booking.items?.length > 0) roomName = booking.items[0].roomName || booking.items[0].name || roomName;
  else if (booking.roomTypes?.length > 0) roomName = booking.roomTypes[0].name || roomName;

  let adults = 1, children = 0;
  if (booking.guests?.length > 0) {
    adults = booking.guests.reduce((s, g) => s + (g.adults || 1), 0);
    children = booking.guests.reduce((s, g) => s + (g.children || 0), 0);
  } else if (booking.occupancies?.length > 0) {
    adults = booking.occupancies[0].adults || 1;
    children = booking.occupancies[0].children || 0;
  }

  let cancellationPolicy = 'Non remboursable', cancellationDeadline = null;
  if (booking.items?.length > 0) {
    const policies = booking.items[0].cancellationPolicies;
    if (policies) {
      if (policies.refundableTag === 'RFN') {
        cancellationPolicy = 'Annulation gratuite';
        if (policies.deadline) cancellationDeadline = new Date(policies.deadline);
      } else if (policies.penalties?.length > 0) {
        const p = policies.penalties[0];
        cancellationPolicy = p.percentage === 100 ? 'Non remboursable' : `Frais d'annulation: ${p.percentage}%`;
      }
    }
  }

  return {
    bookingId: booking.bookingId || '',
    hotelId: booking.hotelId || hotel.hotelId || '',
    hotelName: hotel.name || booking.hotelName || 'Hôtel',
    hotelAddress: hotel.address || booking.hotelAddress || '',
    hotelCity: hotel.city || booking.hotelCity || '',
    hotelCountry: hotel.country || booking.hotelCountry || '',
    hotelPhone: hotel.phone || booking.hotelPhone || '',
    hotelEmail: hotel.email || booking.hotelEmail || '',
    roomName, adults, children,
    checkin: booking.checkin || '',
    checkout: booking.checkout || '',
    totalAmount: booking.total?.amount || 0,
    currency: booking.total?.currency || 'USD',
    hotelConfirmationCode: booking.hotelConfirmationCode || booking.confirmationCode || '',
    cancellationPolicy, cancellationDeadline,
    guest
  };
}

async function sendConfirmationEmail(data) {
  console.log("\n📧 ===== EMAIL CONFIRMATION ===== 📧");
  if (process.env.NODE_ENV !== 'production') {
    console.log(`📧 SIMULÉ → ${data.guest.email} | Booking #${data.bookingId}`);
    return;
  }
  try {
    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    await sgMail.send({
      to: data.guest.email,
      from: 'reservations@luviaplace.com',
      subject: `Confirmation #${data.bookingId} - LuviaPlace`,
      html: generateVoucherHtml(data),
      text: `Confirmation réservation #${data.bookingId}`
    });
    console.log(`✅ Email envoyé à ${data.guest.email}`);
  } catch (error) {
    console.error('❌ Email:', error.message);
  }
}

// ============================================================
// VOUCHER HTML
// ============================================================
function generateVoucherHtml(data) {
  const booking = data.booking || data;
  const hotel = data.hotel || {};
  const guest = data.guest || {};

  const ci = new Date(booking.checkin || Date.now());
  const co = new Date(booking.checkout || Date.now());
  const nights = Math.max(1, Math.ceil((co - ci) / 86400000));

  const months = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

  const sym = booking.currency === 'USD' ? '$' : booking.currency === 'EUR' ? '€' : booking.currency === 'CDF' ? 'FC' : booking.currency;

  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bon de Confirmation - LuviaPlace</title>
<style>
:root{--p:#0d6efd;--pd:#0a58ca;--s:#059669;--td:#1f2937;--tm:#6b7280;--bl:#f8fafc;--bc:#e5e7eb;--cb:#fff;--wb:#fffbeb;--wt:#b45309;}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#f3f4f6;color:var(--td);line-height:1.5;padding:20px}
.vc{max-width:850px;margin:0 auto;background:var(--cb);border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,.1);overflow:hidden;padding:32px}
.vh{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--bc);padding-bottom:20px;margin-bottom:24px;flex-wrap:wrap;gap:12px}
.bl{font-size:28px;font-weight:800;color:var(--p);letter-spacing:-.5px;text-transform:lowercase}
.bl span{color:var(--td)}
.vtb{text-align:right}
.vt{font-size:20px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.bid{font-size:14px;color:var(--tm);margin-top:4px}
.sb{display:flex;gap:12px;margin-bottom:24px;background:var(--bl);padding:12px 16px;border-radius:8px;align-items:center;flex-wrap:wrap}
.sbg{padding:4px 12px;border-radius:20px;font-size:13px;font-weight:600;text-transform:uppercase}
.sbg.c{background:#d1fae5;color:#059669}
.sbg.p{background:#dbeafe;color:#2563eb}
.hig{display:grid;grid-template-columns:2fr 1fr;gap:20px;margin-bottom:24px;background:var(--bl);padding:20px;border-radius:10px;border:1px solid var(--bc)}
.hn{font-size:22px;font-weight:700;color:var(--td);margin-bottom:8px}
.ha,.hp{font-size:14px;color:var(--tm);margin-bottom:4px}
.dc{display:grid;grid-template-columns:1fr auto 1fr;gap:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:20px;align-items:center;text-align:center;margin-bottom:28px}
.db .l{font-size:12px;text-transform:uppercase;color:#3b82f6;font-weight:700;letter-spacing:.5px}
.db .dn{font-size:32px;font-weight:800;color:#1e3a8a;line-height:1.1}
.db .my{font-size:14px;font-weight:600;color:#1e40af;text-transform:uppercase}
.db .st{font-size:12px;color:#60a5fa;margin-top:4px}
.sd{background:#fff;padding:8px 16px;border-radius:20px;font-size:13px;font-weight:700;color:#1e40af;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.dg{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:28px}
.sx{border:1px solid var(--bc);border-radius:8px;padding:18px}
.stl{font-size:15px;font-weight:700;color:var(--td);border-bottom:2px solid var(--bc);padding-bottom:8px;margin-bottom:12px;text-transform:uppercase;letter-spacing:.5px}
.il{list-style:none}
.il li{font-size:13.5px;margin-bottom:8px;display:flex;justify-content:space-between}
.il li .lb{color:var(--tm)}
.il li .vl{font-weight:600;text-align:right}
.pt{width:100%;border-collapse:collapse;margin-top:8px}
.pt td{padding:8px 0;font-size:14px;border-bottom:1px dashed var(--bc)}
.pt tr:last-child td{border-bottom:none}
.pt .tr td{font-weight:700;font-size:16px;color:var(--p);border-top:2px solid var(--bc);padding-top:12px}
.pah{background:var(--wb);border:1px solid #fef3c7;border-radius:6px;padding:10px;margin-top:12px;font-size:13px;color:var(--wt)}
.pbx{background:#f9fafb;border:1px solid var(--bc);border-radius:8px;padding:16px;margin-bottom:24px}
.pbx h3{font-size:14px;font-weight:700;margin-bottom:6px}
.ptx{font-size:12.5px;color:var(--tm);line-height:1.6}
.vf{display:grid;grid-template-columns:1fr 1fr;gap:20px;border-top:2px solid var(--bc);padding-top:20px;font-size:12px;color:var(--tm)}
.vf h4{font-size:13px;color:var(--td);margin-bottom:6px}
.prv{text-align:center;margin-top:24px;font-size:12px;color:#9ca3af;font-weight:500}
@media print{body{background:#fff;padding:0}.vc{box-shadow:none;padding:0}}
@media(max-width:640px){.hig,.dg,.dc,.vf{grid-template-columns:1fr}.vh{flex-direction:column;align-items:flex-start}.vtb{text-align:left}}
</style>
</head>
<body>
<div class="vc">
<header class="vh"><div class="bl">Luvia<span>Place</span></div><div class="vtb"><div class="vt">Bon de Confirmation</div><div class="bid">ID: <strong>${booking.bookingId || '---'}</strong></div></div></header>
<div class="sb"><span>Statut:</span><span class="sbg c">Confirmée</span><span class="sbg p">Paiement OK</span></div>
<section class="hig"><div><h1 class="hn">${hotel.name || 'Hôtel'}</h1><p class="ha">📍 ${hotel.address || ''}</p><p class="hp">📞 ${hotel.phone || 'N/A'}</p></div></section>
<section class="dc">
<div class="db"><div class="l">Arrivée</div><div class="dn">${String(ci.getDate()).padStart(2,'0')}</div><div class="my">${months[ci.getMonth()]} ${ci.getFullYear()}</div><div class="st">${days[ci.getDay()]} ≥ 15h</div></div>
<div class="sd">⏱️ ${nights} nuit(s) | ${booking.adults || 1} adulte(s)${(booking.children||0)>0?`, ${booking.children} enfant(s)` : ''}</div>
<div class="db"><div class="l">Départ</div><div class="dn">${String(co.getDate()).padStart(2,'0')}</div><div class="my">${months[co.getMonth()]} ${co.getFullYear()}</div><div class="st">${days[co.getDay()]} ≤ 12h</div></div>
</section>
<div class="dg">
<div class="sx"><h2 class="stl">Détails</h2><ul class="il">
<li><span class="lb">Titulaire:</span><span class="vl">${guest.firstName||''} ${guest.lastName||''}</span></li>
<li><span class="lb">Clients:</span><span class="vl">${booking.adults||1} adulte(s)${(booking.children||0)>0?`, ${booking.children} enfant(s)` : ''}</span></li>
<li><span class="lb">Chambre:</span><span class="vl">${booking.roomName}</span></li>
<li><span class="lb">Unités:</span><span class="vl">1</span></li>
</ul></div>
<div class="sx"><h2 class="stl">Paiement</h2><table class="pt">
<tr><td>1 chambre × ${nights} nuits</td><td style="text-align:right">${sym} ${(booking.totalAmount/nights).toFixed(2)}</td></tr>
<tr><td>Taxes incluses</td><td style="text-align:right">${sym} 0.00</td></tr>
<tr class="tr"><td>Total</td><td style="text-align:right">${sym} ${(booking.totalAmount||0).toFixed(2)}</td></tr>
</table><div class="pah"><strong>Sur place:</strong> ${sym} 0.00<br><small>Taxes locales variables.</small></div></div>
</div>
<div class="pbx"><h3>Politique d'annulation</h3><p class="ptx">• Gratuite avant: <strong>${booking.cancellationDeadline ? booking.cancellationDeadline.toLocaleDateString('fr-FR') : 'Non remboursable'}</strong><br>• Frais après: <strong>${booking.cancellationPolicy}</strong><br><em>Heures locales. Gérez sur luviaplace.com</em></p></div>
<footer class="vf"><div><h4>Notes</h4><p>Taxes de séjour et caution possibles à l'arrivée. Prévenez en cas d'arrivée tardive (&gt;20h).</p></div><div><h4>Support</h4><p>📧 support@luviaplace.com<br>📞 +243 85 444 2103</p></div></footer>
<div class="prv">Powered by LiteAPI</div>
</div>
</body>
</html>`;
}

// ============================================================
// VOUCHER ENDPOINT
// ============================================================
app.get("/booking/:id/voucher", async (req, res) => {
  console.log("\n📋 ===== VOUCHER ===== 📋");
  const { id } = req.params;
  const { environment = 'sandbox' } = req.query;
  if (!id) return res.status(400).json({ success: false, error: "Booking ID requis" });

  const apiKey = environment === "sandbox" ? SANDBOX_API_KEY : PROD_API_KEY;

  try {
    const bookingData = await callLiteAPI(`bookings/${id}`, 'GET', null, apiKey);
    if (!bookingData.data) return res.status(404).json({ success: false, error: "Réservation non trouvée" });

    const booking = bookingData.data;
    const hotelData = await getHotelDetailsLite(booking.hotelId, apiKey);
    const html = generateVoucherHtml({
      booking, hotel: hotelData, guest: booking.holder || {}, payment: { status: 'Confirmé' }
    });
    res.send(html);
  } catch (error) {
    console.error('❌ voucher:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CHATBOT
// ============================================================
app.get("/api/chatbot-key", (req, res) => {
  const env = req.query.environment || process.env.NODE_ENV || 'sandbox';
  const key = env === 'production' || env === 'prod' ? PROD_API_KEY : SANDBOX_API_KEY;
  if (!key) return res.status(500).json({ success: false, error: 'Clé API manquante' });
  res.json({ success: true, key, environment: env });
});

app.get("/api/chatbot-config", (req, res) => {
  const env = req.query.environment || process.env.NODE_ENV || 'sandbox';
  const key = env === 'production' || env === 'prod' ? PROD_API_KEY : SANDBOX_API_KEY;
  if (!key) return res.json({ success: false, error: 'Clé API manquante', environment: env });
  res.json({ success: true, apiKey: key, environment: env });
});

app.get("/api/chatbot-script", async (req, res) => {
  const env = req.query.environment || process.env.NODE_ENV || 'sandbox';
  const key = env === 'production' || env === 'prod' ? PROD_API_KEY : SANDBOX_API_KEY;
  if (!key) return res.status(500).send('Clé API manquante');

  try {
    const response = await fetchWithTimeout('https://components.liteapi.travel/chatbot/v1.js', {}, 10000);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const script = await response.text();
    const wrapped = `window.LITEAPI_CONFIG={apiKey:'${key}',environment:'${env}'};\n${script}`;
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(wrapped);
  } catch (error) {
    res.status(500).send('Erreur chatbot');
  }
});

// ============================================
// ROUTES FRONTEND
// ============================================
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/resultats-hebergement.html", (req, res) => {
  res.sendFile(path.join(__dirname, "resultats-hebergement.html"));
});

app.get("/hotel-detail.html", (req, res) => {
  res.sendFile(path.join(

// ============================================================
// ERROR HANDLERS
// ============================================================
app.use((req, res) => res.status(404).json({ success: false, error: "Route non trouvée" }));
app.use((err, req, res, next) => {
  console.error("❌ Global error:", err.message);
  res.status(err.status || 500).json({ success: false, error: err.message });
});

// ============================================================
// SERVEUR
// ============================================================
const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`\n🚀 ===== LUVIA PLACE SERVER v3.0 ===== 🚀`);
  console.log(`📡 http://localhost:${port}`);
  console.log(`🔑 Prod: ${PROD_API_KEY ? '✅' : '❌'} | Sandbox: ${SANDBOX_API_KEY ? '✅' : '❌'} | DeepSeek: ${DEEPSEEK_API_KEY ? '✅' : '❌'}`);
  console.log(`\n📋 ENDPOINTS LITEAPI v3.0:`);
  console.log(`   POST /hotels/rates          → /search-hotels, /search-hotels-stream, /search-rates`);
  console.log(`   POST /hotels/prebook        → /prebook`);
  console.log(`   POST /hotels/book           → /book, /api/book-with-payment`);
  console.log(`   GET  /bookings/:id          → /booking/:id`);
  console.log(`   PUT  /bookings/:id          → /booking/:id/cancel`);
  console.log(`   GET  /data/hotel            → /hotel-details`);
  console.log(`   GET  /data/reviews          → /hotel-reviews`);
  console.log(`   GET  /data/hotels           → /data/hotels`);
  console.log(`   GET  /data/places           → /search-places`);
  console.log(`   GET  /data/cities           → /data/cities`);
  console.log(`   GET  /data/countries        → /data/countries`);
  console.log(`   GET  /data/facilities       → /data/facilities`);
  console.log(`   GET  /data/hotelTypes       → /data/hotel-types`);
  console.log(`   GET  /data/chains           → /data/chains`);
  console.log(`   GET  /data/iataCodes        → /data/iata-codes`);
  console.log(`   GET  /data/languages        → /api/languages`);
  console.log(`   GET  /data/currencies       → /api/currencies`);
  console.log(`   POST /data/hotel/highlights → /api/hotel-highlights`);
  console.log(`   GET  /data/hotel/ask        → /api/ask-hotel`);
  console.log(`   POST /flights/search        → /search-flights`);
  console.log(`   POST /flights/verify        → /verify-flight`);
  console.log(`   POST /flights/prebook       → /prebook-flight`);
  console.log(`   POST /flights/book          → /book-flight`);
  console.log(`\n✅ Prêt !\n`);
});
