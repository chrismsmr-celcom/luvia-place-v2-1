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
// 2. RECHERCHE HÔTELS - STANDARD MULTILINGUE
// ============================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS ===== 🔍");
  const { checkin, checkout, adults, placeId, city, environment, limit = 500, language = 'fr' } = req.query;
  const apiKey = environment == "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

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
      language: language // 👈 MULTILINGUE
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
          guestNationality: "US",
          checkin: checkin,
          checkout: checkout,
          maxRatesPerHotel: 1,
          timeout: 30,
          includeHotelData: true,
          language: language // 👈 MULTILINGUE
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
        language: language // 👈 Ajout de la langue utilisée
      };
    });

    const validHotels = hotels.filter(h => h.minPrice > 0).sort((a, b) => a.minPrice - b.minPrice);
    const finalHotels = validHotels.slice(0, 500);

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
      language: language // 👈 MULTILINGUE
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

    // Envoyer les hôtels de base
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
          guestNationality: "US",
          checkin: checkin,
          checkout: checkout,
          maxRatesPerHotel: 1,
          timeout: 20,
          includeHotelData: true,
          language: language // 👈 MULTILINGUE
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
    sendEvent('complete', { hotels: allHotels, total: allHotels.length, language: language });
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

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;

  try {
    const body = {
      hotelIds: [hotelId],
      occupancies: [{ adults: parseInt(adults, 10) || 2 }],
      currency: "USD",
      guestNationality: "US",
      checkin: checkin,
      checkout: checkout,
      maxRatesPerHotel: parseInt(maxRates) || 20,
      roomMapping: true,
      includeHotelData: true,
      timeout: 10,
      language: language // 👈 MULTILINGUE
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
// 11. DÉTAILS HÔTEL - MULTILINGUE
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
    const hotel = {
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
      language: language // 👈 Ajout de la langue
    };

    console.log(`✅ Hôtel trouvé: ${hotel.name} (${language})`);
    res.json({ success: true, data: hotel });
  } catch (error) {
    console.error("❌ Error getting hotel details:", error);
    res.status(500).json({ success: false, error: "Failed to get hotel details", message: error.message });
  }
});

// ============================================
// 12. AVIS HÔTEL
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

    const formattedReviews = reviews.map(function(rv) {
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

    console.log(`✅ ${formattedReviews.length} avis récupérés (${language})`);
    res.json({ success: true, data: formattedReviews, total: formattedReviews.length, language: language });
  } catch (error) {
    console.error("❌ Error getting hotel reviews:", error);
    res.json({ success: true, data: [], total: 0, message: "Avis non disponibles pour le moment" });
  }
});

// ============================================
// 13. CHATBOT - Récupération de la clé (sécurisée)
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
    return res.status(500).send('Configuration API manquante');
  }
  
  try {
    const scriptUrl = `https://components.liteapi.travel/chatbot/v1.js?liteApiKey=${apiKey}`;
    console.log(`📡 Chargement depuis: ${scriptUrl}`);
    
    const response = await fetch(scriptUrl);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const script = await response.text();
    
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(script);
    
    console.log('✅ Script chatbot envoyé');
  } catch (error) {
    console.error('❌ Erreur proxy chatbot:', error);
    res.status(500).send('Erreur de chargement du chatbot');
  }
});

// ============================================
// 15. LISTE DES LANGUES SUPPORTÉES (AVEC SWAHILI)
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
    
    // Ajouter les langues par défaut + SWAHILI
    const defaultLanguages = [
      { code: 'fr', name: 'Français', nativeName: 'Français', flag: '🇫🇷' },
      { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧' },
      { code: 'es', name: 'Español', nativeName: 'Español', flag: '🇪🇸' },
      { code: 'sw', name: 'Kiswahili', nativeName: 'Kiswahili', flag: '🇹🇿' }, // 👈 SWAHILI
      { code: 'pt', name: 'Português', nativeName: 'Português', flag: '🇵🇹' },
      { code: 'it', name: 'Italiano', nativeName: 'Italiano', flag: '🇮🇹' },
      { code: 'de', name: 'Deutsch', nativeName: 'Deutsch', flag: '🇩🇪' },
      { code: 'ar', name: 'العربية', nativeName: 'العربية', flag: '🇦🇪' },
      { code: 'zh', name: '中文', nativeName: '中文', flag: '🇨🇳' }
    ];
    
    // Fusionner les langues de l'API avec celles par défaut
    const allLanguages = [...languages];
    defaultLanguages.forEach(function(lang) {
      if (!allLanguages.some(l => l.code === lang.code)) {
        allLanguages.push(lang);
      }
    });
    
    // Trier par code
    allLanguages.sort((a, b) => a.code.localeCompare(b.code));
    
    res.json({ success: true, data: allLanguages });
  } catch (error) {
    console.error("❌ Erreur récupération langues:", error);
    // Fallback complet avec Swahili
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
    'sw': '🇹🇿', // Swahili - Tanzanie
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
    'sw-ke': '🇰🇪', // Kenya
    'sw-ug': '🇺🇬', // Ouganda
    'sw-cd': '🇨🇩'  // RDC
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
    
    // Ajouter les devises d'Afrique de l'Est
    const defaultCurrencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
      { code: 'GBP', name: 'British Pound', symbol: '£' },
      { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
      { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr' },
      { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
      { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' }, // Kenya
      { code: 'TZS', name: 'Tanzanian Shilling', symbol: 'TSh' }, // Tanzanie
      { code: 'UGX', name: 'Ugandan Shilling', symbol: 'USh' }, // Ouganda
      { code: 'CDF', name: 'Congolese Franc', symbol: 'FC' } // RDC
    ];
    
    // Fusionner
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
// 17. DESTINATIONS AFRIQUE DE L'EST (SWAHILI)
// ============================================
app.get("/api/east-africa-destinations", async (req, res) => {
  console.log("\n🌍 ===== EAST AFRICA DESTINATIONS ===== 🌍");
  
  const language = req.query.language || 'fr';
  
  const destinations = {
    fr: [
      { 
        name: 'Zanzibar', 
        country: 'Tanzanie', 
        countryCode: 'TZ', 
        image: 'zanzibar.jpg',
        description: 'Île paradisiaque avec des plages de sable blanc'
      },
      { 
        name: 'Nairobi', 
        country: 'Kenya', 
        countryCode: 'KE', 
        image: 'nairobi.jpg',
        description: 'Capitale dynamique du Kenya'
      },
      { 
        name: 'Kinshasa', 
        country: 'RDC', 
        countryCode: 'CD', 
        image: 'kinshasa.jpg',
        description: 'Capitale de la République Démocratique du Congo'
      },
      { 
        name: 'Goma', 
        country: 'RDC', 
        countryCode: 'CD', 
        image: 'goma.jpg',
        description: 'Ville au bord du lac Kivu'
      },
      { 
        name: 'Dar es Salaam', 
        country: 'Tanzanie', 
        countryCode: 'TZ', 
        image: 'dar-es-salaam.jpg',
        description: 'Plus grande ville de Tanzanie'
      },
      { 
        name: 'Kampala', 
        country: 'Ouganda', 
        countryCode: 'UG', 
        image: 'kampala.jpg',
        description: 'Capitale de l\'Ouganda'
      }
    ],
    en: [
      { 
        name: 'Zanzibar', 
        country: 'Tanzania', 
        countryCode: 'TZ', 
        image: 'zanzibar.jpg',
        description: 'Paradise island with white sand beaches'
      },
      { 
        name: 'Nairobi', 
        country: 'Kenya', 
        countryCode: 'KE', 
        image: 'nairobi.jpg',
        description: 'Dynamic capital of Kenya'
      },
      { 
        name: 'Kinshasa', 
        country: 'DRC', 
        countryCode: 'CD', 
        image: 'kinshasa.jpg',
        description: 'Capital of the Democratic Republic of Congo'
      },
      { 
        name: 'Goma', 
        country: 'DRC', 
        countryCode: 'CD', 
        image: 'goma.jpg',
        description: 'City on the shores of Lake Kivu'
      }
    ],
    sw: [
      { 
        name: 'Zanzibar', 
        country: 'Tanzania', 
        countryCode: 'TZ', 
        image: 'zanzibar.jpg',
        description: 'Kisiwa cha peponi na fukwe nyeupe'
      },
      { 
        name: 'Nairobi', 
        country: 'Kenya', 
        countryCode: 'KE', 
        image: 'nairobi.jpg',
        description: 'Mji mkuu wa Kenya'
      },
      { 
        name: 'Kinshasa', 
        country: 'DRC', 
        countryCode: 'CD', 
        image: 'kinshasa.jpg',
        description: 'Mji mkuu wa Jamhuri ya Kidemokrasia ya Kongo'
      },
      { 
        name: 'Goma', 
        country: 'DRC', 
        countryCode: 'CD', 
        image: 'goma.jpg',
        description: 'Mji wa ziwa Kivu'
      },
      { 
        name: 'Dar es Salaam', 
        country: 'Tanzania', 
        countryCode: 'TZ', 
        image: 'dar-es-salaam.jpg',
        description: 'Mji mkubwa wa Tanzania'
      },
      { 
        name: 'Kampala', 
        country: 'Uganda', 
        countryCode: 'UG', 
        image: 'kampala.jpg',
        description: 'Mji mkuu wa Uganda'
      }
    ]
  };
  
  const data = destinations[language] || destinations.fr;
  res.json({ success: true, data: data, language: language });
});

// ============================================
// 18. TRANSLATIONS - Récupérer les traductions
// ============================================
app.get("/api/translations", (req, res) => {
  console.log("\n📝 ===== TRANSLATIONS ===== 📝");
  
  const language = req.query.language || 'fr';
  
  // Traductions communes disponibles sur le serveur
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
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

app.post('/api/translate', async (req, res) => {
  const { text, targetLang, sourceLang = 'fr' } = req.body;
  
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
            content: `Tu es un traducteur professionnel. Traduis le texte suivant du ${sourceLang} vers le ${targetLang} en gardant le sens et le ton.`
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });
    
    const data = await response.json();
    res.json({
      success: true,
      translation: data.choices[0].message.content
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
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
  console.log(`\n📋 ENDPOINTS:`);
  console.log(`   📍 GET  /search-places          - Recherche de lieux (multilingue)`);
  console.log(`   🔍 GET  /search-hotels          - Hôtels (multilingue)`);
  console.log(`   🔍 GET  /search-hotels-stream   - Hôtels STREAMING (multilingue)`);
  console.log(`   💰 GET  /search-rates           - Tarifs détaillés (multilingue)`);
  console.log(`   🏨 GET  /hotel-details          - Détails hôtel (multilingue)`);
  console.log(`   ⭐ GET  /hotel-reviews          - Avis hôtel (multilingue)`);
  console.log(`   📋 POST /prebook                - Pré-réservation hôtel`);
  console.log(`   📝 POST /book                   - Réservation hôtel`);
  console.log(`   ✈️ POST /search-flights         - Recherche vols`);
  console.log(`   ✈️ POST /prebook-flight         - Pré-réservation vol`);
  console.log(`   ✈️ POST /book-flight            - Réservation vol`);
  console.log(`   🤖 GET  /api/chatbot-key        - Clé chatbot`);
  console.log(`   📦 GET  /api/chatbot-script     - Script chatbot`);
  console.log(`   🌍 GET  /api/languages          - Langues supportées (🇹🇿 Swahili inclus)`);
  console.log(`   💰 GET  /api/currencies         - Devises supportées`);
  console.log(`   🌍 GET  /api/east-africa-destinations - Destinations Afrique de l'Est`);
  console.log(`   📝 GET  /api/translations       - Traductions`);
  console.log(`\n✅ Serveur prêt !`);
  console.log(`🌍 Langues: FR, EN, ES, SW (Kiswahili), PT, IT, DE, AR, ZH`);
  console.log(`💰 Devises: USD, EUR, GBP, KES, TZS, CDF, ...`);
  console.log(`\n🇹🇿 Karibu sana! Swahili supporté !\n`);
});
