const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const liteApi = require("liteapi-node-sdk");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

// ============================================
// CORS - Configuration ouverte
// ============================================
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.options('*', cors());

const prod_apiKey = process.env.PROD_API_KEY;
const sandbox_apiKey = process.env.SAND_API_KEY;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// ============================================
// LOG MIDDLEWARE
// ============================================
app.use((req, res, next) => {
  console.log(`\n📥 ${req.method} ${req.url}`);
  if (req.method === 'POST' && req.body && Object.keys(req.body).length > 0) {
    console.log(`📦 Body:`, JSON.stringify(req.body, null, 2).substring(0, 500));
  }
  if (req.method === 'GET' && req.query && Object.keys(req.query).length > 0) {
    console.log(`📦 Query:`, req.query);
  }
  next();
});

// ============================================
// FONCTION : Récupérer la nationalité par géolocalisation IP
// ============================================
async function getCountryFromIP(ip) {
    // Liste des APIs à tester (ordre de priorité)
    const apis = [
        // 1. ip-api.com - Gratuit, fiable, supporte bien l'Afrique
        {
            url: `http://ip-api.com/json/${ip}?fields=status,countryCode`,
            parser: (data) => data.countryCode
        },
        // 2. ipapi.co - Alternative
        {
            url: `https://ipapi.co/${ip}/json/`,
            parser: (data) => data.country_code
        },
        // 3. FreeGeoIP - Alternative
        {
            url: `https://freegeoip.app/json/${ip}`,
            parser: (data) => data.country_code
        },
        // 4. IPInfo - Alternative (avec token optionnel)
        {
            url: `https://ipinfo.io/${ip}/json`,
            parser: (data) => data.country
        }
    ];

    for (const api of apis) {
        try {
            console.log(`📡 Tentative géolocalisation avec: ${api.url}`);
            const response = await fetch(api.url, { timeout: 3000 });
            
            if (!response.ok) continue;
            
            const data = await response.json();
            const countryCode = api.parser(data);
            
            if (countryCode && countryCode.length === 2) {
                console.log(`✅ Géolocalisation réussie: ${countryCode}`);
                return countryCode.toUpperCase();
            }
        } catch (error) {
            console.warn(`⚠️ Échec API: ${api.url} - ${error.message}`);
        }
    }
    
    console.warn('⚠️ Toutes les APIs de géolocalisation ont échoué');
    return null;
}


// ============================================
// MIDDLEWARE : Récupérer la nationalité
// ============================================
async function getGuestNationality(req) {
    // 1. Priorité au paramètre explicite
    if (req.query.nationality) {
        const nat = req.query.nationality.toUpperCase();
        console.log(`🌍 Nationalité via paramètre: ${nat}`);
        return nat;
    }
    if (req.body && req.body.nationality) {
        const nat = req.body.nationality.toUpperCase();
        console.log(`🌍 Nationalité via body: ${nat}`);
        return nat;
    }
    
    // 2. Récupérer depuis l'en-tête
    if (req.headers['x-nationality']) {
        const nat = req.headers['x-nationality'].toUpperCase();
        console.log(`🌍 Nationalité via en-tête: ${nat}`);
        return nat;
    }
    
    // 3. Récupérer depuis les cookies
    if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';').reduce((acc, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {});
        if (cookies.nationality) {
            const nat = cookies.nationality.toUpperCase();
            console.log(`🌍 Nationalité via cookie: ${nat}`);
            return nat;
        }
    }
    
    // 4. Géolocalisation par IP
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
               req.connection?.remoteAddress || 
               req.socket?.remoteAddress || 
               '8.8.8.8';
    
    console.log(`📍 IP détectée: ${ip}`);
    
    try {
        const country = await getCountryFromIP(ip);
        if (country) {
            console.log(`🌍 Nationalité détectée par IP: ${country}`);
            return country;
        }
    } catch (error) {
        console.warn('⚠️ Erreur géolocalisation:', error.message);
    }
    
    // 5. Fallback intelligent : Utiliser le pays de la destination si disponible
    if (req.query.city) {
        const city = req.query.city.toLowerCase();
        const cityCountryMap = {
            'kinshasa': 'CD',
            'lubumbashi': 'CD',
            'goma': 'CD',
            'bukavu': 'CD',
            'kisangani': 'CD',
            'kananga': 'CD',
            'mbuji-mayi': 'CD',
            'dar es salaam': 'TZ',
            'zanzibar': 'TZ',
            'nairobi': 'KE',
            'mombasa': 'KE',
            'kampala': 'UG',
            'entebbe': 'UG',
            'kigali': 'RW',
            'bujumbura': 'BI',
            'lagos': 'NG',
            'abuja': 'NG',
            'accra': 'GH',
            'dakar': 'SN',
            'abidjan': 'CI',
            'douala': 'CM',
            'yaoundé': 'CM'
        };
        
        for (const [cityName, countryCode] of Object.entries(cityCountryMap)) {
            if (city.includes(cityName)) {
                console.log(`🌍 Fallback par ville: ${city} -> ${countryCode}`);
                return countryCode;
            }
        }
    }
    
    // 6. Fallback final : US (comportement par défaut de LiteAPI)
    console.warn('⚠️ Fallback final: US');
    return 'US';
}

// ============================================
// FONCTION UTILITAIRE : Normaliser le code pays
// ============================================
function normalizeCountryCode(code) {
    if (!code) return 'US';
    code = code.toUpperCase().trim();
    
    // Mapping des codes courants
    const countryMap = {
        'CONGO': 'CD',
        'DRC': 'CD',
        'RDC': 'CD',
        'Congo': 'CD',
        'Kinshasa': 'CD',
        'Lubumbashi': 'CD',
        'Goma': 'CD',
        'Bukavu': 'CD',
        'Kisangani': 'CD',
        'Kananga': 'CD',
        'Mbuji-Mayi': 'CD',
        'TANZANIA': 'TZ',
        'TANZANIE': 'TZ',
        'Dar es Salaam': 'TZ',
        'Zanzibar': 'TZ',
        'KENYA': 'KE',
        'Nairobi': 'KE',
        'Mombasa': 'KE',
        'UGANDA': 'UG',
        'UGANDE': 'UG',
        'Kampala': 'UG',
        'Entebbe': 'UG',
        'RWANDA': 'RW',
        'Kigali': 'RW',
        'BURUNDI': 'BI',
        'Bujumbura': 'BI',
        'SOUTH AFRICA': 'ZA',
        'AFRIQUE DU SUD': 'ZA',
        'Johannesburg': 'ZA',
        'Cape Town': 'ZA',
        'ETHIOPIA': 'ET',
        'ETHIOPIE': 'ET',
        'Addis Ababa': 'ET',
        'NIGERIA': 'NG',
        'Lagos': 'NG',
        'Abuja': 'NG',
        'GHANA': 'GH',
        'Accra': 'GH',
        'SENEGAL': 'SN',
        'Dakar': 'SN',
        'COTE D\'IVOIRE': 'CI',
        'Abidjan': 'CI',
        'CAMEROON': 'CM',
        'CAMEROUN': 'CM',
        'Douala': 'CM',
        'Yaoundé': 'CM'
    };
    
    // Vérifier si c'est un nom de pays
    if (countryMap[code]) {
        return countryMap[code];
    }
    
    // Vérifier si c'est un code pays valide (2 lettres)
    if (/^[A-Z]{2}$/.test(code)) {
        return code;
    }
    
    return 'US';
}

// ============================================
// FONCTION UTILITAIRE : Appel REST LiteAPI
// ============================================
async function callLiteAPI(endpoint, method = 'GET', body = null, apiKey) {
  const url = `https://api.liteapi.travel/v3.0/${endpoint}`;
  const options = {
    method: method,
    headers: {
      'X-API-Key': apiKey,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  console.log(`📡 ${method} ${url}`);
  const response = await fetch(url, options);
  const data = await response.json();
  console.log(`📦 Réponse:`, JSON.stringify(data, null, 2).substring(0, 500));
  return data;
}

// ============================================
// FONCTION DEEPSEEK - TRADUCTION
// ============================================
async function translateWithDeepSeek(text, targetLang, sourceLang = 'fr', context = '') {
  if (!text || !targetLang || targetLang === 'fr') return text;
  if (!DEEPSEEK_API_KEY) {
    console.warn('⚠️ DEEPSEEK_API_KEY non configurée');
    return text;
  }

  // Mapping des langues
  const langNames = {
    'fr': 'Français',
    'en': 'English',
    'es': 'Español',
    'sw': 'Kiswahili',
    'pt': 'Português',
    'it': 'Italiano',
    'de': 'Deutsch',
    'ar': 'العربية',
    'zh': '中文',
    'ja': '日本語',
    'ru': 'Русский'
  };
  
  const targetLangName = langNames[targetLang] || targetLang;
  const sourceLangName = langNames[sourceLang] || sourceLang;

  try {
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: `Tu es un traducteur professionnel pour LuviaPlace, une plateforme de voyage en Afrique centrale.

RÈGLES IMPORTANTES :
1. Traduis le texte de ${sourceLangName} vers ${targetLangName}
2. Garde le ton professionnel et chaleureux
3. Préserve les nombres, dates et prix exacts
4. Conserve les noms propres et marques
5. Traduis les termes touristiques avec précision
6. Ne traduis JAMAIS "LuviaPlace" - c'est le nom de la marque
7. Ne réponds à AUCUNE question - tu es un TRADUCTEUR, PAS UN ASSISTANT
8. La réponse DOIT être UNIQUEMENT la traduction, sans commentaire supplémentaire
${context ? `\nCONTEXTE : ${context}` : ''}`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: Math.min(text.length * 2 + 500, 4000)
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
    
  } catch (error) {
    console.error('❌ Erreur DeepSeek:', error.message);
    return text; // Fallback : retourner le texte original
  }
}

// ============================================
// CACHE DE TRADUCTION
// ============================================
const translationCache = new Map();

function getCacheKey(text, targetLang) {
  return `${text.substring(0, 50)}-${targetLang}`;
}

async function translateWithCache(text, targetLang, sourceLang = 'fr', context = '') {
  if (!text || !targetLang || targetLang === 'fr') return text;
  
  const cacheKey = getCacheKey(text, targetLang);
  if (translationCache.has(cacheKey)) {
    console.log('📦 Cache hit:', cacheKey);
    return translationCache.get(cacheKey);
  }
  
  const translation = await translateWithDeepSeek(text, targetLang, sourceLang, context);
  translationCache.set(cacheKey, translation);
  
  // Nettoyer le cache après 24h
  setTimeout(() => translationCache.delete(cacheKey), 24 * 60 * 60 * 1000);
  
  return translation;
}

// ============================================
// 1. RECHERCHE DE LIEUX - MULTILINGUE
// ============================================
app.get("/search-places", async (req, res) => {
  console.log("\n📍 ===== SEARCH PLACES ===== 📍");
  const { query, environment, language = 'fr' } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;

  if (!query || query.length < 2) {
    return res.json({ success: true, data: [] });
  }

  try {
    const data = await callLiteAPI(
      `data/places?textQuery=${encodeURIComponent(query)}&language=${language}`, 
      'GET', 
      null, 
      apiKey
    );
    
    const places = (data.data || []).map(function(place) {
      return {
        placeId: place.placeId || place.id,
        name: place.name || place.displayName || place.label || 'Lieu sans nom',
        address: place.address || place.formattedAddress || '',
        country: place.country || ''
      };
    });
    res.json({ success: true, data: places });
  } catch (error) {
    console.error("❌ Error searching places:", error);
    res.status(500).json({ success: false, error: "Failed to search places", message: error.message });
  }
});

// ============================================
// 2. RECHERCHE HÔTELS - STANDARD MULTILINGUE AVEC DEEPSEEK
// ============================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS ===== 🔍");
  const { checkin, checkout, adults, placeId, city, environment, limit = 500, language = 'fr' } = req.query;
  const apiKey = environment == "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  // ✅ Récupérer la nationalité dynamiquement
  const guestNationality = await getGuestNationality(req);
  console.log(`🌍 Nationalité du client: ${guestNationality}`);

  try {
    let finalPlaceId = placeId;

    if (!finalPlaceId && city) {
      console.log(`⏳ Récupération du placeId pour "${city}"...`);
      try {
        const data = await callLiteAPI(
          `data/places?textQuery=${encodeURIComponent(city)}&language=${language}`, 
          'GET', 
          null, 
          apiKey
        );
        if (data.data && data.data.length > 0) {
          finalPlaceId = data.data[0].placeId;
          console.log(`✅ PlaceId trouvé: ${finalPlaceId}`);
        }
      } catch (error) {
        console.warn(`⚠️ Erreur géocodage: ${error.message}`);
      }
    }

    if (!finalPlaceId) {
      return res.json({ success: true, hotels: [], total: 0, message: "Ville non reconnue" });
    }

    const hotelsResponse = await sdk.getHotels({
      placeId: finalPlaceId,
      limit: Math.min(parseInt(limit) || 500, 2000),
      language: language
    });

    let hotelList = [];
    if (Array.isArray(hotelsResponse.data)) {
      hotelList = hotelsResponse.data;
    } else if (hotelsResponse.data && Array.isArray(hotelsResponse.data.hotels)) {
      hotelList = hotelsResponse.data.hotels;
    } else if (hotelsResponse.data && Array.isArray(hotelsResponse.data.data)) {
      hotelList = hotelsResponse.data.data;
    }

    if (hotelList.length === 0) {
      return res.json({ success: true, hotels: [], total: 0, message: "Aucun hôtel trouvé" });
    }

    const hotelIds = hotelList.map(h => h.hotelId || h.id).filter(id => id);
    const BATCH_SIZE = 50;
    const rateMap = {};

    for (let i = 0; i < Math.min(hotelIds.length, 500); i += BATCH_SIZE) {
      const batch = hotelIds.slice(i, i + BATCH_SIZE);
      try {
        const ratesResponse = await sdk.getFullRates({
          hotelIds: batch,
          occupancies: [{ adults: parseInt(adults, 10) || 2 }],
          currency: "USD",
          guestNationality: guestNationality, // ✅ Plus en dur !
          checkin: checkin,
          checkout: checkout,
          maxRatesPerHotel: 1,
          timeout: 30,
          includeHotelData: true,
          language: language
        });

        let batchData = [];
        if (Array.isArray(ratesResponse.data)) {
          batchData = ratesResponse.data;
        } else if (ratesResponse.data && Array.isArray(ratesResponse.data.data)) {
          batchData = ratesResponse.data.data;
        } else if (ratesResponse.data && Array.isArray(ratesResponse.data.hotels)) {
          batchData = ratesResponse.data.hotels;
        }

        batchData.forEach(function(item) {
          const hotelId = item.hotelId || item.id;
          if (hotelId) rateMap[hotelId] = item;
        });
      } catch (error) {
        console.warn(`⚠️ Erreur lot: ${error.message}`);
      }
    }

    const hotels = hotelList.map(function(hotel) {
      const hotelId = hotel.hotelId || hotel.id;
      const rateItem = rateMap[hotelId] || {};
      const bestRate = rateItem.roomTypes?.[0]?.rates?.[0];
      
      let name = hotel.name || hotel.hotelName || 'Hôtel sans nom';
      let photo = hotel.main_photo || hotel.photo || hotel.image || 
        `https://picsum.photos/seed/${hotelId || Math.random()}/460/380`;

      const stars = hotel.stars ?? hotel.starRating ?? hotel.hotel?.stars ?? hotel.hotel?.starRating ?? 0;

      return {
        id: hotelId || `hotel-${Math.random()}`,
        name: name,
        address: hotel.address || hotel.city || city,
        city: hotel.city || city,
        country: hotel.country || '',
        main_photo: photo,
        rating: hotel.rating || 0,
        reviewCount: hotel.reviewCount || hotel.review_count || 0,
        starRating: stars,
        minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
        currency: bestRate?.retailRate?.total?.[0]?.currency || 'USD',
        offerId: rateItem.roomTypes?.[0]?.offerId || null,
        roomName: bestRate?.name || 'Chambre standard',
        refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN',
        latitude: hotel.latitude || hotel.lat || null,
        longitude: hotel.longitude || hotel.lon || null,
        language: language
      };
    });

    const validHotels = hotels.filter(h => h.minPrice > 0).sort((a, b) => a.minPrice - b.minPrice);
    const finalHotels = validHotels.slice(0, 500);

    // Si la langue demandée n'est pas supportée par LiteAPI (ex: sw), utiliser DeepSeek
    const supportedLangs = ['fr', 'en', 'es', 'pt', 'it', 'de', 'ar', 'zh', 'ja', 'ru', 'nl', 'pl', 'tr'];
    
    if (!supportedLangs.includes(language) && language !== 'fr') {
      console.log(`🔄 Traduction DeepSeek pour la langue: ${language}`);
      
      const translatedHotels = await Promise.all(
        finalHotels.slice(0, 20).map(async (hotel) => {
          try {
            const translatedName = await translateWithCache(
              hotel.name,
              language,
              'fr',
              'Nom d\'hôtel à traduire'
            );
            
            return {
              ...hotel,
              name: translatedName || hotel.name,
              translated: true,
              originalLanguage: 'fr',
              translatedLanguage: language
            };
          } catch (error) {
            console.warn(`⚠️ Erreur traduction hôtel ${hotel.id}:`, error.message);
            return hotel;
          }
        })
      );
      
      return res.json({ 
        success: true, 
        hotels: translatedHotels, 
        total: translatedHotels.length, 
        language: language,
        translated: true
      });
    }

    res.json({ success: true, hotels: finalHotels, total: finalHotels.length, language: language });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ success: false, error: "Internal server error", message: error.message });
  }
});

// ============================================
// 3. RECHERCHE HÔTELS - STREAMING (SSE) MULTILINGUE
// ============================================
app.get("/search-hotels-stream", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS (STREAMING) ===== 🔍");
  const { checkin, checkout, adults, placeId, city, environment, limit = 500, language = 'fr' } = req.query;
  const apiKey = environment == "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  // ✅ Récupérer la nationalité dynamiquement
  const guestNationality = await getGuestNationality(req);
  console.log(`🌍 Nationalité du client: ${guestNationality}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  function sendEvent(event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  try {
    let finalPlaceId = placeId;

    if (!finalPlaceId && city) {
      sendEvent('status', { step: 'geocoding', message: `📍 Recherche de "${city}"...`, language: language });
      try {
        const data = await callLiteAPI(
          `data/places?textQuery=${encodeURIComponent(city)}&language=${language}`, 
          'GET', 
          null, 
          apiKey
        );
        if (data.data && data.data.length > 0) {
          finalPlaceId = data.data[0].placeId;
          sendEvent('status', { step: 'geocoding', message: `✅ PlaceId trouvé: ${finalPlaceId}` });
        }
      } catch (error) {
        sendEvent('error', { message: `Erreur de géocodage: ${error.message}` });
        return res.end();
      }
    }

    if (!finalPlaceId) {
      sendEvent('error', { message: 'Ville non reconnue' });
      return res.end();
    }

    const hotelsResponse = await sdk.getHotels({
      placeId: finalPlaceId,
      limit: Math.min(parseInt(limit) || 500, 2000),
      language: language
    });

    let hotelList = [];
    if (Array.isArray(hotelsResponse.data)) {
      hotelList = hotelsResponse.data;
    } else if (hotelsResponse.data && Array.isArray(hotelsResponse.data.hotels)) {
      hotelList = hotelsResponse.data.hotels;
    } else if (hotelsResponse.data && Array.isArray(hotelsResponse.data.data)) {
      hotelList = hotelsResponse.data.data;
    }

    sendEvent('status', { step: 'found', message: `✅ ${hotelList.length} hôtels trouvés` });

    if (hotelList.length === 0) {
      sendEvent('complete', { hotels: [], total: 0, message: "Aucun hôtel trouvé" });
      return res.end();
    }

    const hotelIds = hotelList.map(h => h.hotelId || h.id).filter(id => id);
    const BATCH_SIZE = 20;
    const allHotels = [];

    const baseHotels = hotelList.slice(0, 100).map(function(hotel) {
      const stars = hotel.stars ?? hotel.starRating ?? hotel.hotel?.stars ?? hotel.hotel?.starRating ?? 0;
      return {
        id: hotel.hotelId || hotel.id,
        name: hotel.name || hotel.hotelName || 'Hôtel sans nom',
        address: hotel.address || hotel.city || '',
        city: hotel.city || '',
        country: hotel.country || '',
        main_photo: hotel.main_photo || hotel.photo || hotel.image || `https://picsum.photos/seed/${hotel.hotelId || Math.random()}/460/380`,
        rating: hotel.rating || 0,
        reviewCount: hotel.reviewCount || 0,
        starRating: stars,
        minPrice: 0,
        loading: true
      };
    });

    sendEvent('hotels', { hotels: baseHotels, total: hotelList.length, loaded: 0, status: 'loading' });

    for (let i = 0; i < Math.min(hotelIds.length, 500); i += BATCH_SIZE) {
      const batch = hotelIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(Math.min(hotelIds.length, 500) / BATCH_SIZE);

      try {
        const ratesResponse = await sdk.getFullRates({
          hotelIds: batch,
          occupancies: [{ adults: parseInt(adults, 10) || 2 }],
          currency: "USD",
          guestNationality: guestNationality, // ✅ Plus en dur !
          checkin: checkin,
          checkout: checkout,
          maxRatesPerHotel: 1,
          timeout: 20,
          includeHotelData: true,
          language: language
        });

        let rateData = [];
        if (Array.isArray(ratesResponse.data)) {
          rateData = ratesResponse.data;
        } else if (ratesResponse.data && Array.isArray(ratesResponse.data.data)) {
          rateData = ratesResponse.data.data;
        } else if (ratesResponse.data && Array.isArray(ratesResponse.data.hotels)) {
          rateData = ratesResponse.data.hotels;
        }

        const rateMap = {};
        rateData.forEach(function(item) {
          const hotelId = item.hotelId || item.id;
          if (hotelId) rateMap[hotelId] = item;
        });

        const batchHotels = batch.map(function(hotelId) {
          const hotel = hotelList.find(h => (h.hotelId || h.id) === hotelId);
          const rateItem = rateMap[hotelId] || {};
          const bestRate = rateItem.roomTypes?.[0]?.rates?.[0];
          if (!hotel) return null;
          const stars = hotel.stars ?? hotel.starRating ?? hotel.hotel?.stars ?? hotel.hotel?.starRating ?? 0;

          return {
            id: hotelId,
            name: hotel.name || hotel.hotelName || 'Hôtel sans nom',
            address: hotel.address || hotel.city || '',
            city: hotel.city || '',
            country: hotel.country || '',
            main_photo: hotel.main_photo || hotel.photo || hotel.image || `https://picsum.photos/seed/${hotelId}/460/380`,
            rating: hotel.rating || 0,
            reviewCount: hotel.reviewCount || 0,
            starRating: stars,
            minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
            currency: bestRate?.retailRate?.total?.[0]?.currency || 'USD',
            offerId: rateItem.roomTypes?.[0]?.offerId || null,
            roomName: bestRate?.name || 'Chambre standard',
            refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN',
            loading: false,
            language: language
          };
        }).filter(h => h !== null && h.minPrice > 0);

        allHotels.push(...batchHotels);
        sendEvent('batch', {
          hotels: batchHotels,
          batch: batchNumber,
          totalBatches: totalBatches,
          loaded: allHotels.length,
          total: hotelList.length
        });
      } catch (error) {
        console.warn(`⚠️ Erreur lot ${batchNumber}: ${error.message}`);
      }
    }

    allHotels.sort((a, b) => a.minPrice - b.minPrice);
    
    // Traduction DeepSeek pour les langues non supportées
    const supportedLangs = ['fr', 'en', 'es', 'pt', 'it', 'de', 'ar', 'zh', 'ja', 'ru', 'nl', 'pl', 'tr'];
    let finalHotels = allHotels;
    
    if (!supportedLangs.includes(language) && language !== 'fr') {
      const translated = await Promise.all(
        allHotels.slice(0, 20).map(async (hotel) => {
          try {
            const translatedName = await translateWithCache(hotel.name, language, 'fr', 'Nom d\'hôtel');
            return { ...hotel, name: translatedName || hotel.name, translated: true };
          } catch (e) { return hotel; }
        })
      );
      finalHotels = translated;
    }
    
    sendEvent('complete', { hotels: finalHotels, total: finalHotels.length, language: language });
    res.end();
  } catch (error) {
    console.error("❌ Error:", error);
    sendEvent('error', { message: error.message });
    res.end();
  }
});

// ============================================
// 4. TARIFS DÉTAILLÉS HÔTEL - MULTILINGUE
// ============================================
app.get("/search-rates", async (req, res) => {
  console.log("\n💰 ===== SEARCH RATES ===== 💰");
  const { checkin, checkout, adults, hotelId, environment, maxRates = 20, language = 'fr' } = req.query;
  
  if (!hotelId) {
    return res.status(400).json({ success: false, error: "hotelId is required" });
  }

  // ✅ Récupérer la nationalité dynamiquement
  const guestNationality = await getGuestNationality(req);
  console.log(`🌍 Nationalité du client: ${guestNationality}`);

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;

  try {
    const body = {
      hotelIds: [hotelId],
      occupancies: [{ adults: parseInt(adults, 10) || 2 }],
      currency: "USD",
      guestNationality: guestNationality, // ✅ Plus en dur !
      checkin: checkin,
      checkout: checkout,
      maxRatesPerHotel: parseInt(maxRates) || 20,
      roomMapping: true,
      includeHotelData: true,
      timeout: 10,
      language: language
    };

    const data = await callLiteAPI('hotels/rates', 'POST', body, apiKey);

    let rates = [];
    let hotelInfo = {};
    
    if (data.data && Array.isArray(data.data)) {
      rates = data.data;
    } else if (data.data && data.data.data && Array.isArray(data.data.data)) {
      rates = data.data.data;
    } else if (data.data && data.data.hotels && Array.isArray(data.data.hotels)) {
      rates = data.data.hotels;
    }

    if (rates.length === 0) {
      return res.json({ success: false, error: "No availability found", message: "Aucun tarif disponible pour ces dates" });
    }

    const hotel = rates[0];
    hotelInfo = hotel.hotel || hotel;

    const hotelDetails = {
      id: hotel.hotelId || hotel.id || hotelId,
      name: hotelInfo.name || hotel.name || 'Hôtel sans nom',
      address: hotelInfo.address || hotel.address || '',
      city: hotelInfo.city || hotel.city || '',
      country: hotelInfo.country || hotel.country || '',
      starRating: hotelInfo.starRating || hotel.starRating || 0,
      rating: hotelInfo.rating || hotel.rating || 0,
      reviewCount: hotelInfo.reviewCount || hotel.reviewCount || 0,
      main_photo: hotelInfo.main_photo || hotel.main_photo || ''
    };

    const rateInfo = (hotel.roomTypes || []).flatMap(function(roomType) {
      return (roomType.rates || []).map(function(rate) {
        const boardMap = {
          'RO': 'Room Only',
          'BB': 'Bed and Breakfast',
          'HB': 'Half Board',
          'FB': 'Full Board',
          'AI': 'All Inclusive',
          'BI': 'Breakfast Included'
        };
        return {
          rateName: rate.name || roomType.roomTypeId || 'Chambre',
          offerId: roomType.offerId || rate.offerId,
          board: rate.boardName || boardMap[rate.boardType] || rate.boardType || 'Room Only',
          boardType: rate.boardType || 'RO',
          refundableTag: rate.cancellationPolicies?.refundableTag || 'NRFN',
          retailRate: rate.retailRate?.total?.[0]?.amount || 0,
          originalRate: rate.retailRate?.suggestedSellingPrice?.[0]?.amount || null,
          maxOccupancy: rate.maxOccupancy || 0,
          adultCount: rate.adultCount || 0,
          childCount: rate.childCount || 0,
          mappedRoomId: rate.mappedRoomId || null,
          cancellationPolicies: rate.cancellationPolicies || null
        };
      });
    });

    let minPrice = null;
    rateInfo.forEach(function(r) {
      if (r.retailRate > 0 && (minPrice === null || r.retailRate < minPrice)) {
        minPrice = r.retailRate;
      }
    });

    res.json({ 
      success: true,
      hotelInfo: hotelDetails,
      rateInfo: rateInfo,
      minPrice: minPrice || 0,
      total: rateInfo.length,
      language: language
    });
  } catch (error) {
    console.error("❌ Error fetching rates:", error);
    res.status(500).json({ success: false, error: "No availability found", message: error.message });
  }
});

// ============================================
// 5. PRÉ-RÉSERVATION HÔTEL
// ============================================
app.post("/prebook", async (req, res) => {
  console.log("\n📋 ===== PREBOOK ===== 📋");
  const { offerId, environment, voucherCode } = req.body;
  
  if (!offerId) {
    return res.status(400).json({ success: false, error: "offerId is required" });
  }

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  const bodyData = { offerId, usePaymentSdk: true };
  if (voucherCode) bodyData.voucherCode = voucherCode;

  try {
    const response = await sdk.preBook(bodyData);
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("❌ Prebook error:", err);
    res.status(500).json({ success: false, error: "Prebook failed", message: err.message });
  }
});

// ============================================
// 6. RÉSERVATION FINALE HÔTEL
// ============================================
app.post("/book", async (req, res) => {
  console.log("\n📝 ===== BOOK ===== 📝");
  const { prebookId, guestFirstName, guestLastName, guestEmail, guestPhone, transactionId, environment } = req.body;

  if (!prebookId || !guestFirstName || !guestLastName || !guestEmail || !transactionId) {
    return res.status(400).json({ success: false, error: "Missing required fields" });
  }

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  const bodyData = {
    prebookId,
    holder: {
      firstName: guestFirstName,
      lastName: guestLastName,
      email: guestEmail,
      phone: guestPhone || '+1234567890'
    },
    payment: { method: "TRANSACTION_ID", transactionId },
    guests: [{ occupancyNumber: 1, remarks: "", firstName: guestFirstName, lastName: guestLastName, email: guestEmail }]
  };

  try {
    const response = await sdk.book(bodyData);
    res.json({ success: true, data: response.data });
  } catch (err) {
    console.error("❌ Error during booking:", err);
    res.status(500).json({ success: false, error: "Booking failed", message: err.message });
  }
});

// ============================================
// 7. RECHERCHE VOLS
// ============================================
app.post("/search-flights", async (req, res) => {
  console.log("\n✈️ ===== SEARCH FLIGHTS ===== ✈️");
  const { legs, adults, children, infants, currency, country, cabinClass, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.searchFlights({
      legs, adults: adults || 1, children: children || 0, infants: infants || 0,
      currency: currency || "USD", country: country || "US", cabinClass: cabinClass || "ECONOMY"
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error searching flights:", error);
    res.status(500).json({ success: false, error: "Failed to search flights", message: error.message });
  }
});

// ============================================
// 8. VÉRIFICATION VOL
// ============================================
app.post("/verify-flight", async (req, res) => {
  console.log("\n🔎 ===== VERIFY FLIGHT ===== 🔎");
  const { offerId, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.verifyFlight({ offerId });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error verifying flight:", error);
    res.status(500).json({ success: false, error: "Failed to verify flight", message: error.message });
  }
});

// ============================================
// 9. PRÉ-RÉSERVATION VOL
// ============================================
app.post("/prebook-flight", async (req, res) => {
  console.log("\n📋 ===== PREBOOK FLIGHT ===== 📋");
  const { offerId, contact, passengers, usePaymentSdk, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.prebookFlight({
      offerId, usePaymentSdk: usePaymentSdk !== undefined ? usePaymentSdk : true,
      contact, passengers
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error prebooking flight:", error);
    res.status(500).json({ success: false, error: "Failed to prebook flight", message: error.message });
  }
});

// ============================================
// 10. RÉSERVATION FINALE VOL
// ============================================
app.post("/book-flight", async (req, res) => {
  console.log("\n📝 ===== BOOK FLIGHT ===== 📝");
  const { prebookId, transactionId, method, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.bookFlight({
      prebookId,
      payment: { method: method || "TRANSACTION_ID", transactionId }
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error booking flight:", error);
    res.status(500).json({ success: false, error: "Failed to book flight", message: error.message });
  }
});

// ============================================
// 11. DÉTAILS HÔTEL - MULTILINGUE AVEC DEEPSEEK
// ============================================
app.get("/hotel-details", async (req, res) => {
  console.log("\n🏨 ===== HOTEL DETAILS ===== 🏨");
  const { hotelId, timeout = 8, environment, language = 'fr' } = req.query;
  
  if (!hotelId) {
    return res.status(400).json({ success: false, error: "hotelId is required" });
  }

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;

  try {
    const data = await callLiteAPI(
      `data/hotel?hotelId=${encodeURIComponent(hotelId)}&timeout=${parseInt(timeout) || 8}&language=${language}`, 
      'GET', 
      null, 
      apiKey
    );

    if (!data.data) {
      return res.status(404).json({ success: false, error: "Hotel not found", message: "Aucun hôtel trouvé avec cet ID" });
    }

    const hotelData = data.data;
    let hotel = {
      id: hotelData.hotelId || hotelData.id || hotelId,
      name: hotelData.name || 'Hôtel sans nom',
      address: hotelData.address || '',
      city: hotelData.city || '',
      country: hotelData.country || '',
      starRating: hotelData.starRating || 0,
      rating: hotelData.rating || 0,
      reviewCount: hotelData.reviewCount || 0,
      main_photo: hotelData.main_photo || hotelData.mainPhoto || (hotelData.hotelImages && hotelData.hotelImages[0] ? hotelData.hotelImages[0].url : ''),
      hotelDescription: hotelData.hotelDescription || hotelData.description || '',
      hotelFacilities: hotelData.hotelFacilities || hotelData.facilities || [],
      hotelImages: hotelData.hotelImages || hotelData.images || [],
      rooms: (hotelData.rooms || []).map(function(room) {
        return {
          id: room.id || room.roomId,
          roomName: room.roomName || room.name || 'Chambre sans nom',
          description: room.description || '',
          maxOccupancy: room.maxOccupancy || 0,
          maxAdults: room.maxAdults || 0,
          maxChildren: room.maxChildren || 0,
          roomSizeSquare: room.roomSizeSquare || 0,
          bedTypes: room.bedTypes || [],
          roomAmenities: (room.roomAmenities || []).map(function(a) { 
            return typeof a === 'string' ? a : a.name; 
          }),
          photos: (room.photos || room.images || []).map(function(p) {
            return {
              url: p.hd_url || p.url || p.image || '',
              mainPhoto: p.mainPhoto || p.main || false
            };
          })
        };
      }),
      language: language
    };

    // Traduction DeepSeek pour les langues non supportées
    const supportedLangs = ['fr', 'en', 'es', 'pt', 'it', 'de', 'ar', 'zh', 'ja', 'ru', 'nl', 'pl', 'tr'];
    
    if (!supportedLangs.includes(language) && language !== 'fr') {
      console.log(`🔄 Traduction DeepSeek des détails hôtel en: ${language}`);
      
      hotel.name = await translateWithCache(hotel.name, language, 'fr', 'Nom d\'hôtel');
      hotel.address = await translateWithCache(hotel.address, language, 'fr', 'Adresse');
      hotel.hotelDescription = await translateWithCache(hotel.hotelDescription, language, 'fr', 'Description d\'hôtel');
      
      // Traduire les noms des chambres
      hotel.rooms = await Promise.all(hotel.rooms.map(async (room) => {
        room.roomName = await translateWithCache(room.roomName, language, 'fr', 'Nom de chambre');
        room.description = await translateWithCache(room.description, language, 'fr', 'Description de chambre');
        return room;
      }));
      
      // Traduire les équipements
      hotel.hotelFacilities = await Promise.all(hotel.hotelFacilities.map(async (facility) => {
        return await translateWithCache(facility, language, 'fr', 'Équipement d\'hôtel');
      }));
      
      hotel.translated = true;
      hotel.translatedLanguage = language;
    }

    console.log(`✅ Hôtel trouvé: ${hotel.name} (${language})`);
    res.json({ success: true, data: hotel });
  } catch (error) {
    console.error("❌ Error getting hotel details:", error);
    res.status(500).json({ success: false, error: "Failed to get hotel details", message: error.message });
  }
});

// ============================================
// 12. AVIS HÔTEL AVEC DEEPSEEK
// ============================================
app.get("/hotel-reviews", async (req, res) => {
  console.log("\n⭐ ===== HOTEL REVIEWS ===== ⭐");
  const { hotelId, timeout = 8, environment, language = 'fr' } = req.query;
  
  if (!hotelId) {
    return res.status(400).json({ success: false, error: "hotelId is required" });
  }

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;

  try {
    const data = await callLiteAPI(
      `data/reviews?hotelId=${encodeURIComponent(hotelId)}&timeout=${parseInt(timeout) || 8}&language=${language}`, 
      'GET', 
      null, 
      apiKey
    );

    let reviews = [];
    if (data.data && Array.isArray(data.data)) {
      reviews = data.data;
    }

    let formattedReviews = reviews.map(function(rv) {
      return {
        reviewerName: rv.reviewerName || rv.name || rv.author || 'Voyageur',
        comment: rv.comment || rv.text || rv.reviewComments || rv.review || '',
        rating: rv.rating || rv.score || rv.overallRating || 0,
        date: rv.date || rv.reviewDate || '',
        pros: rv.pros || '',
        cons: rv.cons || '',
        type: rv.type || '',
        averageScore: rv.averageScore || 0
      };
    });

    // Traduire les avis si la langue n'est pas supportée
    const supportedLangs = ['fr', 'en', 'es', 'pt', 'it', 'de', 'ar', 'zh', 'ja', 'ru', 'nl', 'pl', 'tr'];
    
    if (!supportedLangs.includes(language) && language !== 'fr' && formattedReviews.length > 0) {
      console.log(`🔄 Traduction DeepSeek des avis en: ${language}`);
      
      const translatedReviews = await Promise.all(
        formattedReviews.map(async (review) => {
          try {
            const translatedComment = await translateWithCache(
              review.comment, 
              language, 
              'fr', 
              'Avis d\'hôtel. Termes courants : "propre", "bien situé", "bon service", "confortable"'
            );
            
            const translatedPros = review.pros ? await translateWithCache(review.pros, language, 'fr', 'Points positifs') : '';
            const translatedCons = review.cons ? await translateWithCache(review.cons, language, 'fr', 'Points négatifs') : '';
            
            return {
              ...review,
              comment: translatedComment || review.comment,
              pros: translatedPros || review.pros,
              cons: translatedCons || review.cons,
              translated: true
            };
          } catch (error) {
            console.warn(`⚠️ Erreur traduction avis:`, error.message);
            return review;
          }
        })
      );
      
      formattedReviews = translatedReviews;
    }

    console.log(`✅ ${formattedReviews.length} avis récupérés (${language})`);
    res.json({ success: true, data: formattedReviews, total: formattedReviews.length, language: language });
  } catch (error) {
    console.error("❌ Error getting hotel reviews:", error);
    res.json({ success: true, data: [], total: 0, message: "Avis non disponibles pour le moment" });
  }
});

// ============================================
// 13. CHATBOT - Récupération de la clé
// ============================================
app.get("/api/chatbot-key", (req, res) => {
  console.log("\n🤖 ===== CHATBOT KEY ===== 🤖");
  
  const environment = req.query.environment || process.env.NODE_ENV || 'sandbox';
  
  let apiKey;
  if (environment === 'production' || environment === 'prod') {
    apiKey = process.env.PROD_API_KEY;
  } else {
    apiKey = process.env.SAND_API_KEY;
  }
  
  console.log(`🔑 Environnement: ${environment}`);
  console.log(`🔑 Clé trouvée: ${apiKey ? '✅ Oui' : '❌ Non'}`);
  
  if (!apiKey) {
    console.error('❌ Aucune clé API configurée');
    return res.status(500).json({ 
      success: false, 
      error: 'Configuration API manquante'
    });
  }
  
  res.json({ 
    success: true,
    key: apiKey,
    environment: environment
  });
});

// ============================================
// 14. CHATBOT - Proxy pour le script
// ============================================
app.get("/api/chatbot-script", async (req, res) => {
  console.log("\n📦 ===== CHATBOT SCRIPT PROXY ===== 📦");
  
  const environment = req.query.environment || process.env.NODE_ENV || 'sandbox';
  
  let apiKey;
  if (environment === 'production' || environment === 'prod') {
    apiKey = process.env.PROD_API_KEY;
  } else {
    apiKey = process.env.SAND_API_KEY;
  }
  
  if (!apiKey) {
    console.error('❌ Aucune clé API configurée');
    return res.status(500).send('Configuration API manquante');
  }
  
  try {
    // Récupérer le script depuis le CDN
    const scriptUrl = `https://components.liteapi.travel/chatbot/v1.js`;
    console.log(`📡 Chargement depuis: ${scriptUrl}`);
    
    const response = await fetch(scriptUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    let script = await response.text();
    
    // ✅ INJECTER LA CLÉ DANS LE SCRIPT
    // Remplacer la façon dont le script cherche la clé
    // La plupart des widgets LiteAPI utilisent une variable globale ou une configuration
    
    // Option 1: Ajouter la clé en variable globale avant le script
    const wrappedScript = `
      // Configuration du chatbot
      window.LITEAPI_CONFIG = {
        apiKey: '${apiKey}',
        environment: '${environment}'
      };
      
      // Script original
      ${script}
    `;
    
    // Option 2: Si le widget utilise une fonction d'initialisation
    // const wrappedScript = `
    //   ${script}
    //   if (typeof LiteAPI !== 'undefined' && LiteAPI.init) {
    //     LiteAPI.init({ apiKey: '${apiKey}' });
    //   }
    // `;
    
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(wrappedScript);
    
    console.log(`✅ Script chatbot envoyé avec clé (${environment})`);
  } catch (error) {
    console.error('❌ Erreur proxy chatbot:', error);
    res.status(500).send('Erreur de chargement du chatbot');
  }
});


// ============================================
// 15. LISTE DES LANGUES SUPPORTÉES
// ============================================
app.get("/api/languages", async (req, res) => {
  console.log("\n🌍 ===== LANGUES SUPPORTÉES ===== 🌍");
  
  const environment = req.query.environment || process.env.NODE_ENV || 'sandbox';
  const apiKey = environment === "production" || environment === "prod" 
    ? process.env.PROD_API_KEY 
    : process.env.SAND_API_KEY;

  try {
    const data = await callLiteAPI('data/languages', 'GET', null, apiKey);
    
    let languages = [];
    if (data.data && Array.isArray(data.data)) {
      languages = data.data.map(lang => ({
        code: lang.code || lang.languageCode || lang,
        name: lang.name || lang.languageName || lang,
        nativeName: lang.nativeName || lang.name || lang,
        flag: getLanguageFlag(lang.code || lang.languageCode || lang)
      }));
    }
    
    const defaultLanguages = [
      { code: 'fr', name: 'Français', nativeName: 'Français', flag: '🇫🇷' },
      { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
      { code: 'es', name: 'Español', nativeName: 'Español', flag: '🇪🇸' },
      { code: 'sw', name: 'Kiswahili', nativeName: 'Kiswahili', flag: '🇹🇿' },
      { code: 'pt', name: 'Português', nativeName: 'Português', flag: '🇵🇹' },
      { code: 'it', name: 'Italiano', nativeName: 'Italiano', flag: '🇮🇹' },
      { code: 'de', name: 'Deutsch', nativeName: 'Deutsch', flag: '🇩🇪' },
      { code: 'ar', name: 'العربية', nativeName: 'العربية', flag: '🇦🇪' },
      { code: 'zh', name: '中文', nativeName: '中文', flag: '🇨🇳' }
    ];
    
    const allLanguages = [...languages];
    defaultLanguages.forEach(function(lang) {
      if (!allLanguages.some(l => l.code === lang.code)) {
        allLanguages.push(lang);
      }
    });
    
    allLanguages.sort((a, b) => a.code.localeCompare(b.code));
    
    res.json({ success: true, data: allLanguages });
  } catch (error) {
    console.error("❌ Erreur récupération langues:", error);
    res.json({
      success: true,
      data: [
        { code: 'fr', name: 'Français', nativeName: 'Français', flag: '🇫🇷' },
        { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
        { code: 'es', name: 'Español', nativeName: 'Español', flag: '🇪🇸' },
        { code: 'sw', name: 'Kiswahili', nativeName: 'Kiswahili', flag: '🇹🇿' },
        { code: 'pt', name: 'Português', nativeName: 'Português', flag: '🇵🇹' },
        { code: 'it', name: 'Italiano', nativeName: 'Italiano', flag: '🇮🇹' },
        { code: 'de', name: 'Deutsch', nativeName: 'Deutsch', flag: '🇩🇪' }
      ]
    });
  }
});

function getLanguageFlag(code) {
  const flags = {
    'fr': '🇫🇷',
    'en': '🇬🇧',
    'es': '🇪🇸',
    'sw': '🇹🇿',
    'pt': '🇵🇹',
    'it': '🇮🇹',
    'de': '🇩🇪',
    'ar': '🇦🇪',
    'zh': '🇨🇳',
    'ja': '🇯🇵',
    'ru': '🇷🇺',
    'nl': '🇳🇱',
    'pl': '🇵🇱',
    'tr': '🇹🇷',
    'sw-ke': '🇰🇪',
    'sw-ug': '🇺🇬',
    'sw-cd': '🇨🇩'
  };
  return flags[code] || '🌐';
}

// ============================================
// 16. LISTE DES DEVISES SUPPORTÉES
// ============================================
app.get("/api/currencies", async (req, res) => {
  console.log("\n💰 ===== DEVISES SUPPORTÉES ===== 💰");
  
  const environment = req.query.environment || process.env.NODE_ENV || 'sandbox';
  const apiKey = environment === "production" || environment === "prod" 
    ? process.env.PROD_API_KEY 
    : process.env.SAND_API_KEY;

  try {
    const data = await callLiteAPI('data/currencies', 'GET', null, apiKey);
    
    const currencies = (data.data || []).map(curr => ({
      code: curr.code || curr.currencyCode || curr,
      name: curr.name || curr.currencyName || curr,
      symbol: curr.symbol || getCurrencySymbol(curr.code || curr.currencyCode || curr)
    }));
    
    const defaultCurrencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'GBP', name: 'British Pound', symbol: '£' },
      { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
      { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
      { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
      { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
      { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
      { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' },
      { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' }
    ];
    
    const allCurrencies = [...currencies];
    defaultCurrencies.forEach(function(curr) {
      if (!allCurrencies.some(c => c.code === curr.code)) {
        allCurrencies.push(curr);
      }
    });
    
    res.json({ success: true, data: allCurrencies });
  } catch (error) {
    console.error("❌ Erreur récupération devises:", error);
    res.json({
      success: true,
      data: [
        { code: 'USD', name: 'US Dollar', symbol: '$' },
        { code: 'EUR', name: 'Euro', symbol: '€' },
        { code: 'GBP', name: 'British Pound', symbol: '£' },
        { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
        { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' },
        { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' }
      ]
    });
  }
});

function getCurrencySymbol(code) {
  const symbols = {
    'USD': '$',
    'EUR': '€',
    'GBP': '£',
    'CAD': 'C$',
    'CHF': 'Fr',
    'AUD': 'A$',
    'JPY': '¥',
    'CNY': '¥',
    'RUB': '₽',
    'BRL': 'R$',
    'ZAR': 'R',
    'KES': 'KSh',
    'TZS': 'TSh',
    'UGX': 'USh',
    'CDF': 'FC',
    'GHS': 'GH₵',
    'NGN': '₦'
  };
  return symbols[code] || code;
}

// ============================================
// 17. DESTINATIONS AFRIQUE DE L'EST
// ============================================
app.get("/api/east-africa-destinations", async (req, res) => {
  console.log("\n🌍 ===== EAST AFRICA DESTINATIONS ===== 🌍");
  
  const language = req.query.language || 'fr';
  
  const destinations = {
    fr: [
      { name: 'Zanzibar', country: 'Tanzanie', countryCode: 'TZ', image: 'zanzibar.jpg', description: 'Île paradisiaque avec des plages de sable blanc' },
      { name: 'Nairobi', country: 'Kenya', countryCode: 'KE', image: 'nairobi.jpg', description: 'Capitale dynamique du Kenya' },
      { name: 'Kinshasa', country: 'RDC', countryCode: 'CD', image: 'kinshasa.jpg', description: 'Capitale de la République Démocratique du Congo' },
      { name: 'Goma', country: 'RDC', countryCode: 'CD', image: 'goma.jpg', description: 'Ville au bord du lac Kivu' },
      { name: 'Dar es Salaam', country: 'Tanzanie', countryCode: 'TZ', image: 'dar-es-salaam.jpg', description: 'Plus grande ville de Tanzanie' },
      { name: 'Kampala', country: 'Ouganda', countryCode: 'UG', image: 'kampala.jpg', description: 'Capitale de l\'Ouganda' }
    ],
    en: [
      { name: 'Zanzibar', country: 'Tanzania', countryCode: 'TZ', image: 'zanzibar.jpg', description: 'Paradise island with white sand beaches' },
      { name: 'Nairobi', country: 'Kenya', countryCode: 'KE', image: 'nairobi.jpg', description: 'Dynamic capital of Kenya' },
      { name: 'Kinshasa', country: 'DRC', countryCode: 'CD', image: 'kinshasa.jpg', description: 'Capital of the Democratic Republic of Congo' },
      { name: 'Goma', country: 'DRC', countryCode: 'CD', image: 'goma.jpg', description: 'City on the shores of Lake Kivu' }
    ],
    sw: [
      { name: 'Zanzibar', country: 'Tanzania', countryCode: 'TZ', image: 'zanzibar.jpg', description: 'Kisiwa cha peponi na fukwe nyeupe' },
      { name: 'Nairobi', country: 'Kenya', countryCode: 'KE', image: 'nairobi.jpg', description: 'Mji mkuu wa Kenya' },
      { name: 'Kinshasa', country: 'DRC', countryCode: 'CD', image: 'kinshasa.jpg', description: 'Mji mkuu wa Jamhuri ya Kidemokrasia ya Kongo' },
      { name: 'Goma', country: 'DRC', countryCode: 'CD', image: 'goma.jpg', description: 'Mji wa ziwa Kivu' },
      { name: 'Dar es Salaam', country: 'Tanzania', countryCode: 'TZ', image: 'dar-es-salaam.jpg', description: 'Mji mkubwa wa Tanzania' },
      { name: 'Kampala', country: 'Uganda', countryCode: 'UG', image: 'kampala.jpg', description: 'Mji mkuu wa Uganda' }
    ]
  };
  
  const data = destinations[language] || destinations.fr;
  res.json({ success: true, data: data, language: language });
});

// ============================================
// 18. TRADUCTION DEEPSEEK - API PRINCIPALE
// ============================================
app.post('/api/translate', async (req, res) => {
  console.log("\n🌍 ===== DEEPSEEK TRANSLATION ===== 🌍");
  
  const { text, targetLang, sourceLang = 'fr', context = '' } = req.body;
  
  if (!text || !targetLang) {
    return res.status(400).json({ 
      success: false, 
      error: "Text and targetLang are required" 
    });
  }

  if (targetLang === 'fr') {
    return res.json({ success: true, translation: text });
  }

  try {
    const translation = await translateWithCache(text, targetLang, sourceLang, context);
    res.json({ 
      success: true, 
      translation: translation,
      sourceLang: sourceLang,
      targetLang: targetLang
    });
  } catch (error) {
    console.error('❌ Erreur DeepSeek:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      fallback: text
    });
  }
});

// ============================================
// 19. TRADUCTION DES AVIS - API DÉDIÉE
// ============================================
app.post("/api/translate-reviews", async (req, res) => {
  console.log("\n⭐ ===== TRANSLATE REVIEWS ===== ⭐");
  
  const { reviews, targetLang } = req.body;
  
  if (!reviews || !Array.isArray(reviews) || reviews.length === 0) {
    return res.json({ success: true, reviews: [] });
  }
  
  if (targetLang === 'fr') {
    return res.json({ success: true, reviews: reviews });
  }
  
  try {
    const translatedReviews = await Promise.all(
      reviews.map(async (review) => {
        if (!review.comment || review.comment.length === 0) {
          return review;
        }
        
        try {
          const translatedComment = await translateWithCache(
            review.comment,
            targetLang,
            'fr',
            'Avis d\'hôtel. Termes courants : "propre", "bien situé", "bon service", "confortable"'
          );
          
          return {
            ...review,
            comment: translatedComment || review.comment,
            translated: true,
            originalComment: review.comment,
            translatedLanguage: targetLang
          };
        } catch (error) {
          console.warn('⚠️ Erreur traduction avis:', error.message);
          return review;
        }
      })
    );
    
    res.json({
      success: true,
      reviews: translatedReviews,
      targetLang: targetLang,
      total: translatedReviews.length
    });
  } catch (error) {
    console.error('❌ Erreur traduction avis:', error);
    res.json({ success: true, reviews: reviews });
  }
});

// ============================================
// 20. TRADUCTION DESCRIPTION HÔTEL - API DÉDIÉE
// ============================================
app.post("/api/translate-hotel-description", async (req, res) => {
  console.log("\n📝 ===== TRANSLATE HOTEL DESCRIPTION ===== 📝");
  
  const { hotelId, description, targetLang } = req.body;
  
  if (!description) {
    return res.status(400).json({ 
      success: false, 
      error: "Description is required" 
    });
  }
  
  if (targetLang === 'fr') {
    return res.json({ success: true, translation: description });
  }
  
  try {
    const translated = await translateWithCache(
      description,
      targetLang || 'fr',
      'fr',
      'Description d\'hôtel. Termes touristiques : "chambre", "suite", "petit-déjeuner", "piscine", "spa"'
    );
    
    res.json({
      success: true,
      translation: translated,
      original: description,
      targetLang: targetLang
    });
  } catch (error) {
    console.error('❌ Erreur traduction description:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message,
      fallback: description
    });
  }
});

// ============================================
// 21. TRANSLATIONS - Récupérer les traductions
// ============================================
app.get("/api/translations", (req, res) => {
  console.log("\n📝 ===== TRANSLATIONS ===== 📝");
  
  const language = req.query.language || 'fr';
  
  const translations = {
    fr: {
      welcome: 'Bienvenue sur LuviaPlace',
      search: 'Rechercher',
      hotels: 'Hôtels',
      flights: 'Vols',
      cars: 'Voitures',
      experiences: 'Expériences',
      insurance: 'Assurance',
      packages: 'Packages'
    },
    en: {
      welcome: 'Welcome to LuviaPlace',
      search: 'Search',
      hotels: 'Hotels',
      flights: 'Flights',
      cars: 'Cars',
      experiences: 'Experiences',
      insurance: 'Insurance',
      packages: 'Packages'
    },
    es: {
      welcome: 'Bienvenido a LuviaPlace',
      search: 'Buscar',
      hotels: 'Hoteles',
      flights: 'Vuelos',
      cars: 'Coches',
      experiences: 'Experiencias',
      insurance: 'Seguro',
      packages: 'Paquetes'
    },
    sw: {
      welcome: 'Karibu LuviaPlace',
      search: 'Tafuta',
      hotels: 'Hoteli',
      flights: 'Ndege',
      cars: 'Magari',
      experiences: 'Uzoefu',
      insurance: 'Bima',
      packages: 'Mpaketo'
    }
  };
  
  const data = translations[language] || translations.fr;
  res.json({ success: true, data: data, language: language });
});

// ============================================
// 22. NATIONALITÉ DU CLIENT
// ============================================
app.get("/api/nationality", async (req, res) => {
  console.log("\n🌍 ===== NATIONALITÉ CLIENT ===== 🌍");
  
  const guestNationality = await getGuestNationality(req);
  console.log(`🌍 Nationalité détectée: ${guestNationality}`);
  
  res.json({
    success: true,
    nationality: guestNationality,
    detected: true
  });
});

// ============================================
// 23. TAUX DE CHANGE - API FRANKFURTER
// ============================================
app.get("/api/rates", async (req, res) => {
  console.log("\n💰 ===== TAUX DE CHANGE ===== 💰");
  
  const baseCurrency = req.query.base || 'USD';
  
  try {
    // Appel à l'API Frankfurter (gratuite, sans clé)
    const response = await fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // Ajouter les devises africaines que Frankfurter ne supporte pas toujours
    const africanRates = {
      'CDF': 2800,    // Franc Congolais
      'XAF': 600,     // FCFA (CEMAC)
      'XOF': 600,     // FCFA (UEMOA)
      'NGN': 1500,    // Naira Nigérian
      'GHS': 12,      // Cedi Ghanéen
      'TZS': 2500,    // Shilling Tanzanien
      'UGX': 3700,    // Shilling Ougandais
      'MAD': 10,      // Dirham Marocain
    };
    
    // Fusionner les taux
    const rates = {
      ...data.rates,
      ...africanRates
    };
    
    // Ajouter USD si pas présent
    if (!rates.USD) rates.USD = 1;
    
    console.log(`✅ Taux de change chargés (base: ${baseCurrency})`);
    
    res.json({
      success: true,
      base: data.base || baseCurrency,
      date: data.date || new Date().toISOString().split('T')[0],
      rates: rates
    });
    
  } catch (error) {
    console.error('❌ Erreur taux de change:', error.message);
    
    // Fallback avec taux fixes
    res.json({
      success: true,
      base: baseCurrency,
      date: new Date().toISOString().split('T')[0],
      rates: {
        'USD': 1,
        'EUR': 0.92,
        'GBP': 0.78,
        'CDF': 2800,
        'XAF': 600,
        'XOF': 600,
        'NGN': 1500,
        'GHS': 12,
        'ZAR': 18,
        'KES': 130,
        'TZS': 2500,
        'UGX': 3700,
        'MAD': 10,
        'JPY': 150,
        'CNY': 7.2,
        'CHF': 0.88,
        'CAD': 1.35,
        'AUD': 1.5,
        'BRL': 5.5,
        'RUB': 90,
        'INR': 83,
        'KRW': 1350
      }
    });
  }
});

// ============================================
// 24. CONVERSION DE PRIX
// ============================================
app.post("/api/convert", async (req, res) => {
  console.log("\n🔄 ===== CONVERSION DE PRIX ===== 🔄");
  
  const { amount, from, to } = req.body;
  
  if (!amount || !from || !to) {
    return res.status(400).json({ 
      success: false, 
      error: "amount, from and to are required" 
    });
  }
  
  try {
    // Récupérer les taux
    const ratesResponse = await fetch(`https://api.frankfurter.app/latest?from=${from}`);
    const ratesData = await ratesResponse.json();
    
    // Taux de conversion
    let rate = 1;
    
    if (to === from) {
      rate = 1;
    } else if (ratesData.rates && ratesData.rates[to]) {
      rate = ratesData.rates[to];
    } else {
      // Fallback pour les devises africaines
      const fallbackRates = {
        'CDF': 2800,
        'XAF': 600,
        'XOF': 600,
        'NGN': 1500,
        'GHS': 12,
        'ZAR': 18,
        'KES': 130,
        'TZS': 2500,
        'UGX': 3700,
        'MAD': 10
      };
      rate = fallbackRates[to] || 1;
    }
    
    const converted = amount * rate;
    
    res.json({
      success: true,
      from: from,
      to: to,
      amount: amount,
      rate: rate,
      converted: converted
    });
    
  } catch (error) {
    console.error('❌ Erreur conversion:', error.message);
    
    // Fallback avec taux fixes
    const fallbackRates = {
      'USD': 1,
      'EUR': 0.92,
      'GBP': 0.78,
      'CDF': 2800,
      'XAF': 600,
      'XOF': 600,
      'NGN': 1500,
      'GHS': 12,
      'ZAR': 18,
      'KES': 130,
      'TZS': 2500,
      'UGX': 3700,
      'MAD': 10,
      'JPY': 150,
      'CNY': 7.2,
      'CHF': 0.88,
      'CAD': 1.35,
      'AUD': 1.5,
      'BRL': 5.5,
      'RUB': 90,
      'INR': 83,
      'KRW': 1350
    };
    
    const rate = fallbackRates[to] || 1;
    const converted = amount * rate;
    
    res.json({
      success: true,
      from: from,
      to: to,
      amount: amount,
      rate: rate,
      converted: converted,
      fallback: true
    });
  }
});

// ============================================
// 25. LOYALTY CONFIGURATION
// ============================================
app.get("/api/loyalty/config", (req, res) => {
    console.log("\n⭐ ===== LOYALTY CONFIG ===== ⭐");
    
    res.json({
        success: true,
        data: {
            programName: 'LuviaPlace Rewards',
            rewardType: 'points',
            value: 1,
            reward: 10,
            label: 'Gagnez {points} points',
            color: '#155EEF',
            tiers: {
                bronze: 1,
                silver: 1.5,
                gold: 2,
                platinum: 3
            }
        }
    });
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
  res.sendFile(path.join(__dirname, "hotel-detail.html"));
});

// ============================================
// Gestion des erreurs 404
// ============================================
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

// ============================================
// SERVEUR
// ============================================
const port = process.env.PORT || 10000;

app.listen(port, () => {
  console.log(`\n🚀 ===== LUVIA PLACE SERVER ===== 🚀`);
  console.log(`📡 Server running on http://localhost:${port}`);
  console.log(`📌 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 API Key (prod): ${prod_apiKey ? '✅' : '❌'}`);
  console.log(`🔑 API Key (sandbox): ${sandbox_apiKey ? '✅' : '❌'}`);
  console.log(`🤖 DeepSeek API: ${DEEPSEEK_API_KEY ? '✅' : '❌'}`);
  console.log(`\n📋 ENDPOINTS:`);
  console.log(`   📍 GET  /search-places                 - Recherche de lieux (multilingue)`);
  console.log(`   🔍 GET  /search-hotels                 - Hôtels (multilingue + DeepSeek + Nationalité)`);
  console.log(`   🔍 GET  /search-hotels-stream          - Hôtels STREAMING (multilingue + Nationalité)`);
  console.log(`   💰 GET  /search-rates                  - Tarifs détaillés (multilingue + Nationalité)`);
  console.log(`   🏨 GET  /hotel-details                 - Détails hôtel (multilingue + DeepSeek)`);
  console.log(`   ⭐ GET  /hotel-reviews                 - Avis hôtel (multilingue + DeepSeek)`);
  console.log(`   📋 POST /prebook                       - Pré-réservation hôtel`);
  console.log(`   📝 POST /book                          - Réservation hôtel`);
  console.log(`   ✈️ POST /search-flights                - Recherche vols`);
  console.log(`   ✈️ POST /prebook-flight                - Pré-réservation vol`);
  console.log(`   ✈️ POST /book-flight                   - Réservation vol`);
  console.log(`   🤖 GET  /api/chatbot-key               - Clé chatbot`);
  console.log(`   📦 GET  /api/chatbot-script            - Script chatbot`);
  console.log(`   🌍 GET  /api/languages                 - Langues supportées`);
  console.log(`   💰 GET  /api/currencies                - Devises supportées`);
  console.log(`   🌍 GET  /api/east-africa-destinations  - Destinations Afrique de l'Est`);
  console.log(`   📝 GET  /api/translations              - Traductions UI`);
  console.log(`   🌍 POST /api/translate                 - Traduction DeepSeek`);
  console.log(`   ⭐ POST /api/translate-reviews         - Traduction avis`);
  console.log(`   📝 POST /api/translate-hotel-description - Traduction description`);
  console.log(`   🌍 GET  /api/nationality               - Nationalité du client`);
  console.log(`\n✅ Serveur prêt !`);
  console.log(`🌍 Langues: FR, EN, ES, SW (Kiswahili), PT, IT, DE, AR, ZH`);
  console.log(`💰 Devises: USD, EUR, GBP, KES, TZS, CDF, ...`);
  console.log(`🤖 DeepSeek intégré pour les langues non supportées par LiteAPI`);
  console.log(`🌍 Nationalité: Détection automatique par IP + Override`);
  console.log(`\n🇹🇿 Karibu sana! Swahili supporté !\n`);
});
