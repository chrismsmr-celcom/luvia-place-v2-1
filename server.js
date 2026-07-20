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
// 1. RECHERCHE DE LIEUX (CORRIGÉ)
// ============================================
app.get("/search-places", async (req, res) => {
  console.log("\n📍 ===== SEARCH PLACES ===== 📍");
  const { query, environment } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;

  if (!query || query.length < 2) {
    return res.json({ success: true, data: [] });
  }

  try {
    const url = `https://api.liteapi.travel/v3.0/data/places?textQuery=${encodeURIComponent(query)}&language=fr`;
    console.log(`📍 Appel LiteAPI Places: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json'
      }
    });

    const data = await response.json();
    console.log(`✅ ${data.data?.length || 0} lieux trouvés`);

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
    res.status(500).json({ 
      success: false,
      error: "Failed to search places",
      message: error.message
    });
  }
});

// ============================================
// 2. RECHERCHE HÔTELS - STANDARD
// ============================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS ===== 🔍");
  const { 
    checkin, 
    checkout, 
    adults, 
    placeId, 
    city, 
    environment, 
    limit = 500 
  } = req.query;
  
  const apiKey = environment == "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`📍 Place ID: ${placeId || 'NON'}`);
  console.log(`📍 Ville: ${city || 'NON'}`);
  console.log(`📅 Arrivée: ${checkin}, Départ: ${checkout}`);
  console.log(`👤 Adultes: ${adults}`);

  try {
    let finalPlaceId = placeId;

    // ============================================
    // ÉTAPE 1: Récupérer le placeId
    // ============================================
    if (!finalPlaceId && city) {
      console.log(`⏳ Récupération du placeId pour "${city}" via LiteAPI Places...`);
      try {
        const url = `https://api.liteapi.travel/v3.0/data/places?textQuery=${encodeURIComponent(city)}&language=fr`;
        const response = await fetch(url, {
          headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' }
        });
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          finalPlaceId = data.data[0].placeId;
          console.log(`✅ PlaceId trouvé: ${finalPlaceId}`);
        }
      } catch (error) {
        console.warn(`⚠️ Erreur géocodage: ${error.message}`);
      }
    }

    if (!finalPlaceId) {
      console.error('❌ Aucun placeId trouvé');
      return res.json({ success: true, hotels: [], total: 0, message: "Ville non reconnue" });
    }

    // ============================================
    // ÉTAPE 2: Récupérer les hôtels
    // ============================================
    console.log(`⏳ Recherche des hôtels avec placeId: ${finalPlaceId}...`);
    
    const hotelsResponse = await sdk.getHotels({
      placeId: finalPlaceId,
      limit: Math.min(parseInt(limit) || 500, 2000),
      language: "fr"
    });

    let hotelList = [];
    if (Array.isArray(hotelsResponse.data)) {
      hotelList = hotelsResponse.data;
    } else if (hotelsResponse.data && Array.isArray(hotelsResponse.data.hotels)) {
      hotelList = hotelsResponse.data.hotels;
    } else if (hotelsResponse.data && Array.isArray(hotelsResponse.data.data)) {
      hotelList = hotelsResponse.data.data;
    }

    console.log(`✅ ${hotelList.length} hôtels trouvés`);

    if (hotelList.length === 0) {
      return res.json({ success: true, hotels: [], total: 0, message: "Aucun hôtel trouvé" });
    }

    // ============================================
    // ÉTAPE 3: Récupérer les tarifs
    // ============================================
    const hotelIds = hotelList.map(h => h.hotelId || h.id).filter(id => id);
    console.log(`📋 ${hotelIds.length} IDs d'hôtels extraits`);

    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < Math.min(hotelIds.length, 500); i += BATCH_SIZE) {
      batches.push(hotelIds.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`📦 ${batches.length} lots de ${BATCH_SIZE} hôtels`);

    const rateMap = {};
    let totalWithRates = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`⏳ Lot ${i + 1}/${batches.length}: ${batch.length} hôtels...`);
      
      try {
        const ratesResponse = await sdk.getFullRates({
          hotelIds: batch,  // ← TABLEAU
          occupancies: [{ adults: parseInt(adults, 10) || 2 }],
          currency: "USD",
          guestNationality: "US",
          checkin: checkin,
          checkout: checkout,
          maxRatesPerHotel: 1,
          timeout: 30,
          includeHotelData: true
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
          if (hotelId) {
            rateMap[hotelId] = item;
          }
        });
        
        totalWithRates += batchData.length;
        console.log(`✅ Lot ${i + 1}: ${batchData.length} hôtels avec tarifs`);
        
      } catch (error) {
        console.warn(`⚠️ Erreur lot ${i + 1}: ${error.message}`);
      }
    }

    console.log(`✅ Total: ${Object.keys(rateMap).length} hôtels avec tarifs`);

    // ============================================
    // ÉTAPE 4: Fusionner les données
    // ============================================
    const hotels = hotelList.map(function(hotel) {
      const hotelId = hotel.hotelId || hotel.id;
      const rateItem = rateMap[hotelId] || {};
      const bestRate = rateItem.roomTypes?.[0]?.rates?.[0];
      
      let name = hotel.name || hotel.hotelName || 'Hôtel sans nom';
      let photo = hotel.main_photo || hotel.photo || hotel.image || 
        `https://picsum.photos/seed/${hotelId || Math.random()}/460/380`;

      return {
        id: hotelId || `hotel-${Math.random()}`,
        name: name,
        address: hotel.address || hotel.city || city,
        city: hotel.city || city,
        country: hotel.country || '',
        main_photo: photo,
        rating: hotel.rating || 0,
        reviewCount: hotel.reviewCount || hotel.review_count || 0,
        starRating: hotel.starRating || 0,
        minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
        currency: bestRate?.retailRate?.total?.[0]?.currency || 'USD',
        offerId: rateItem.roomTypes?.[0]?.offerId || null,
        roomName: bestRate?.name || 'Chambre standard',
        refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN'
      };
    });

    const validHotels = hotels
      .filter(h => h.minPrice > 0)
      .sort((a, b) => a.minPrice - b.minPrice);

    const finalHotels = validHotels.slice(0, 500);
    
    console.log(`\n📊 RÉSULTAT FINAL:`);
    console.log(`  - Total hôtels: ${hotelList.length}`);
    console.log(`  - Hôtels avec tarifs: ${validHotels.length}`);
    console.log(`  - Hôtels retournés: ${finalHotels.length}`);

    res.json({ 
      success: true,
      hotels: finalHotels,
      total: finalHotels.length,
      rawTotal: hotelList.length,
      placeIdUsed: finalPlaceId,
      availableWithPrice: validHotels.length
    });
  } catch (error) {
    console.error("❌ Error:", error);
    res.status(500).json({ 
      success: false,
      error: "Internal server error", 
      message: error.message
    });
  }
});

// ============================================
// 3. RECHERCHE HÔTELS - STREAMING (SSE) - CORRIGÉ
// ============================================
app.get("/search-hotels-stream", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS (STREAMING) ===== 🔍");
  const { 
    checkin, 
    checkout, 
    adults, 
    placeId, 
    city, 
    environment, 
    limit = 500 
  } = req.query;
  
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

    // ============================================
    // ÉTAPE 1: Récupérer le placeId
    // ============================================
    if (!finalPlaceId && city) {
      sendEvent('status', { 
        step: 'geocoding', 
        message: `📍 Recherche de "${city}"...` 
      });
      
      try {
        const url = `https://api.liteapi.travel/v3.0/data/places?textQuery=${encodeURIComponent(city)}&language=fr`;
        const response = await fetch(url, {
          headers: { 'X-API-Key': apiKey, 'Accept': 'application/json' }
        });
        const data = await response.json();
        if (data.data && data.data.length > 0) {
          finalPlaceId = data.data[0].placeId;
          sendEvent('status', { 
            step: 'geocoding', 
            message: `✅ PlaceId trouvé: ${finalPlaceId}` 
          });
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

    // ============================================
    // ÉTAPE 2: Récupérer les hôtels
    // ============================================
    sendEvent('status', { 
      step: 'searching', 
      message: `🏨 Recherche des hôtels...` 
    });

    const hotelsResponse = await sdk.getHotels({
      placeId: finalPlaceId,
      limit: Math.min(parseInt(limit) || 500, 2000),
      language: "fr"
    });

    let hotelList = [];
    if (Array.isArray(hotelsResponse.data)) {
      hotelList = hotelsResponse.data;
    } else if (hotelsResponse.data && Array.isArray(hotelsResponse.data.hotels)) {
      hotelList = hotelsResponse.data.hotels;
    } else if (hotelsResponse.data && Array.isArray(hotelsResponse.data.data)) {
      hotelList = hotelsResponse.data.data;
    }

    sendEvent('status', { 
      step: 'found', 
      message: `✅ ${hotelList.length} hôtels trouvés` 
    });

    if (hotelList.length === 0) {
      sendEvent('complete', { hotels: [], total: 0, message: "Aucun hôtel trouvé" });
      return res.end();
    }

    // ============================================
    // ÉTAPE 2.5: Récupérer les starRatings pour tous les hôtels
    // ============================================
    sendEvent('status', { 
      step: 'details', 
      message: `⭐ Récupération des étoiles pour ${Math.min(hotelList.length, 100)} hôtels...` 
    });

    // Créer un map des starRatings par hotelId
    const starRatingMap = {};
    const hotelIds = hotelList.map(h => h.hotelId || h.id).filter(id => id);
    
    // Limiter à 100 hôtels pour éviter les timeouts
    const limitedForDetails = hotelIds.slice(0, 100);
    
    // Récupérer les détails en parallèle (par lots de 10)
    const DETAILS_BATCH_SIZE = 10;
    for (let i = 0; i < limitedForDetails.length; i += DETAILS_BATCH_SIZE) {
      const batch = limitedForDetails.slice(i, i + DETAILS_BATCH_SIZE);
      console.log(`⏳ Récupération des étoiles lot ${i/DETAILS_BATCH_SIZE + 1}...`);
      
      await Promise.all(batch.map(async (hotelId) => {
        try {
          const detailsResponse = await sdk.getHotelDetails(hotelId, 4);
          if (detailsResponse.data && detailsResponse.data.starRating !== undefined) {
            starRatingMap[hotelId] = detailsResponse.data.starRating;
          }
        } catch (error) {
          console.warn(`⚠️ Erreur détails pour ${hotelId}:`, error.message);
        }
      }));
    }

    console.log(`✅ ${Object.keys(starRatingMap).length} starRatings récupérés`);

    // ============================================
    // ÉTAPE 3: Récupérer les tarifs par lots
    // ============================================
    const allHotelIds = hotelList.map(h => h.hotelId || h.id).filter(id => id);
    const BATCH_SIZE = 20;
    
    // ✅ Envoyer les hôtels de base immédiatement (avec starRating si disponible)
    const baseHotels = hotelList.slice(0, 100).map(function(hotel) {
      const hotelId = hotel.hotelId || hotel.id;
      // ✅ Récupérer starRating depuis le map
      const starRating = starRatingMap[hotelId] || 0;
      
      return {
        id: hotelId,
        name: hotel.name || hotel.hotelName || 'Hôtel sans nom',
        address: hotel.address || hotel.city || city,
        city: hotel.city || city,
        country: hotel.country || '',
        main_photo: hotel.main_photo || hotel.photo || hotel.image || 
          `https://picsum.photos/seed/${hotelId || Math.random()}/460/380`,
        rating: hotel.rating || 0,
        reviewCount: hotel.reviewCount || 0,
        starRating: starRating,  // ← MAINTENANT AVEC LA VRAIE VALEUR
        minPrice: 0,
        currency: 'USD',
        loading: true
      };
    });

    sendEvent('hotels', { 
      hotels: baseHotels,
      total: hotelList.length,
      loaded: 0,
      status: 'loading'
    });

    // ✅ Traiter les lots
    const allHotels = [];
    let totalWithRates = 0;

    for (let i = 0; i < Math.min(allHotelIds.length, 500); i += BATCH_SIZE) {
      const batch = allHotelIds.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(Math.min(allHotelIds.length, 500) / BATCH_SIZE);
      
      sendEvent('status', { 
        step: 'rates',
        message: `💰 Lot ${batchNumber}/${totalBatches} - ${batch.length} hôtels...` 
      });

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
          includeHotelData: true
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
          if (hotelId) {
            rateMap[hotelId] = item;
          }
        });

        const batchHotels = batch.map(function(hotelId) {
          const hotel = hotelList.find(h => (h.hotelId || h.id) === hotelId);
          const rateItem = rateMap[hotelId] || {};
          const bestRate = rateItem.roomTypes?.[0]?.rates?.[0];
          
          if (!hotel) return null;

          // ✅ Récupérer starRating depuis le map (ou depuis hotel.hotel si disponible)
          const starRating = starRatingMap[hotelId] || hotel.hotel?.starRating || hotel.starRating || 0;

          return {
            id: hotelId,
            name: hotel.name || hotel.hotelName || 'Hôtel sans nom',
            address: hotel.address || hotel.city || city,
            city: hotel.city || city,
            country: hotel.country || '',
            main_photo: hotel.main_photo || hotel.photo || hotel.image || 
              `https://picsum.photos/seed/${hotelId}/460/380`,
            rating: hotel.rating || 0,
            reviewCount: hotel.reviewCount || 0,
            starRating: starRating,  // ← MAINTENANT AVEC LA VRAIE VALEUR
            minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
            currency: bestRate?.retailRate?.total?.[0]?.currency || 'USD',
            offerId: rateItem.roomTypes?.[0]?.offerId || null,
            roomName: bestRate?.name || 'Chambre standard',
            refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN',
            loading: false
          };
        }).filter(h => h !== null && h.minPrice > 0);

        allHotels.push(...batchHotels);
        totalWithRates += batchHotels.length;

        sendEvent('batch', {
          hotels: batchHotels,
          batch: batchNumber,
          totalBatches: totalBatches,
          loaded: allHotels.length,
          total: hotelList.length,
          message: `✅ ${batchHotels.length} hôtels chargés (${allHotels.length} au total)`
        });

      } catch (error) {
        console.warn(`⚠️ Erreur lot ${batchNumber}: ${error.message}`);
        sendEvent('error', { 
          message: `Erreur lot ${batchNumber}: ${error.message}`,
          batch: batchNumber
        });
      }
    }

    // ✅ Tri final par prix
    allHotels.sort((a, b) => a.minPrice - b.minPrice);

    sendEvent('complete', {
      hotels: allHotels,
      total: allHotels.length,
      rawTotal: hotelList.length,
      message: `✅ ${allHotels.length} hôtels avec tarifs trouvés`
    });

    res.end();

  } catch (error) {
    console.error("❌ Error:", error);
    sendEvent('error', { message: error.message });
    res.end();
  }
});

// ============================================
// 4. TARIFS DÉTAILLÉS HÔTEL
// ============================================
app.get("/search-rates", async (req, res) => {
  console.log("\n💰 ===== SEARCH RATES ===== 💰");
  const { checkin, checkout, adults, hotelId, environment, maxRates = 20 } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.getFullRates({
      hotelIds: [hotelId],
      occupancies: [{ adults: parseInt(adults, 10) }],
      currency: "USD",
      guestNationality: "US",
      checkin: checkin,
      checkout: checkout,
      maxRatesPerHotel: parseInt(maxRates),
      roomMapping: true,
      includeHotelData: true,
      timeout: 8
    });

    let rates = [];
    if (Array.isArray(response.data)) {
      rates = response.data;
    } else if (response.data && Array.isArray(response.data.data)) {
      rates = response.data.data;
    } else if (response.data && Array.isArray(response.data.hotels)) {
      rates = response.data.hotels;
    }

    if (rates.length === 0) {
      return res.json({ success: false, error: "No availability found" });
    }

    const hotel = rates[0];
    const hotelInfo = hotel.hotel || {};

    const rateInfo = (hotel.roomTypes || []).flatMap(function(roomType) {
      return (roomType.rates || []).map(function(rate) {
        return {
          rateName: rate.name,
          offerId: roomType.offerId,
          board: rate.boardName,
          boardType: rate.boardType,
          refundableTag: rate.cancellationPolicies?.refundableTag || 'NRFN',
          retailRate: rate.retailRate?.total?.[0]?.amount || 0,
          originalRate: rate.retailRate?.suggestedSellingPrice?.[0]?.amount || null,
          maxOccupancy: rate.maxOccupancy || 0,
          adultCount: rate.adultCount || 0,
          childCount: rate.childCount || 0,
          mappedRoomId: rate.mappedRoomId || null
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
      hotelInfo: {
        id: hotel.hotelId,
        name: hotelInfo.name || hotel.name || 'Hôtel sans nom',
        address: hotelInfo.address || hotel.address || '',
        city: hotelInfo.city || hotel.city || '',
        country: hotelInfo.country || hotel.country || '',
        starRating: hotelInfo.starRating || hotel.starRating || 0,
        rating: hotelInfo.rating || hotel.rating || 0,
        main_photo: hotelInfo.main_photo || hotel.main_photo || ''
      },
      rateInfo: rateInfo,
      minPrice: minPrice
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
// 11. DÉTAILS HÔTEL
// ============================================
app.get("/hotel-details", async (req, res) => {
  console.log("\n🏨 ===== HOTEL DETAILS ===== 🏨");
  const { hotelId, timeout = 8, environment } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.getHotelDetails(hotelId, timeout);
    const hotel = response.data;

    const rooms = (hotel.rooms || []).map(function(room) {
      return {
        id: room.id,
        roomName: room.roomName || 'Chambre sans nom',
        description: room.description || '',
        maxOccupancy: room.maxOccupancy || 0,
        maxAdults: room.maxAdults || 0,
        maxChildren: room.maxChildren || 0,
        roomSizeSquare: room.roomSizeSquare || 0,
        bedTypes: room.bedTypes || [],
        roomAmenities: (room.roomAmenities || []).map(function(a) { return a.name; }),
        photos: (room.photos || []).map(function(p) {
          return { url: p.hd_url || p.url || '', mainPhoto: p.mainPhoto || false };
        })
      };
    });

    res.json({ success: true, data: { ...hotel, rooms } });
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
  const { hotelId, timeout = 8, environment } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.getHotelReviews(hotelId, timeout);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error getting hotel reviews:", error);
    res.status(500).json({ success: false, error: "Failed to get hotel reviews", message: error.message });
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
  console.log(`   📍 GET  /search-places     - Recherche de lieux (CORRIGÉ)`);
  console.log(`   🔍 GET  /search-hotels     - Hôtels (AVEC PLACE ID)`);
  console.log(`   🔍 GET  /search-hotels-stream - Hôtels (STREAMING SSE)`);
  console.log(`   💰 GET  /search-rates      - Tarifs détaillés`);
  console.log(`   📋 POST /prebook           - Pré-réservation hôtel`);
  console.log(`   📝 POST /book              - Réservation hôtel`);
  console.log(`   🏨 GET  /hotel-details     - Détails hôtel`);
  console.log(`   ⭐ GET  /hotel-reviews     - Avis hôtel`);
  console.log(`   ✈️ POST /search-flights    - Recherche vols`);
  console.log(`   ✈️ POST /prebook-flight    - Pré-réservation vol`);
  console.log(`   ✈️ POST /book-flight       - Réservation vol`);
  console.log(`\n✅ Serveur prêt !\n`);
});
