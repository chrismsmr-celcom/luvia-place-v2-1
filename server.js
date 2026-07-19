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
// FONCTION : Récupérer le placeId depuis LiteAPI
// ============================================
async function getPlaceIdFromLiteAPI(cityName, apiKey) {
  if (!cityName || cityName.length < 2) return null;
  
  try {
    const url = `https://api.liteapi.travel/v3.0/data/places?textQuery=${encodeURIComponent(cityName)}&language=fr`;
    console.log(`📍 Appel LiteAPI Places: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    console.log(`📦 Réponse Places: ${data.data?.length || 0} résultats`);
    
    if (data.data && data.data.length > 0) {
      // Prendre le premier résultat (le plus pertinent)
      const place = data.data[0];
      console.log(`✅ PlaceId trouvé: ${place.placeId} pour "${place.name}"`);
      return place.placeId;
    }
    
    console.warn(`⚠️ Aucun placeId trouvé pour: ${cityName}`);
    return null;
  } catch (error) {
    console.warn(`⚠️ Erreur LiteAPI Places: ${error.message}`);
    return null;
  }
}

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
    // ✅ Appel direct à l'API LiteAPI /places
    const response = await fetch(
      `https://api.liteapi.travel/v3.0/data/places?textQuery=${encodeURIComponent(query)}&language=fr`,
      {
        headers: {
          'X-API-Key': apiKey,
          'Accept': 'application/json'
        }
      }
    );

    const data = await response.json();
    console.log(`✅ ${data.data?.length || 0} lieux trouvés`);

    // Transformer les données pour le frontend
    const places = (data.data || []).map(function(place) {
      return {
        placeId: place.placeId,
        name: place.name,
        address: place.address,
        country: place.country,
        coordinates: place.coordinates
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
// 2. RECHERCHE HÔTELS - AVEC PLACE ID
// ============================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS ===== 🔍");
  const { 
    checkin, 
    checkout, 
    adults, 
    placeId,        // ← Reçu du frontend ou trouvé via /search-places
    city,           // ← Fallback
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
    // ÉTAPE 1: Si pas de placeId, le récupérer via LiteAPI Places
    // ============================================
    if (!finalPlaceId && city) {
      console.log(`⏳ Récupération du placeId pour "${city}" via LiteAPI Places...`);
      finalPlaceId = await getPlaceIdFromLiteAPI(city, apiKey);
    }

    // ============================================
    // ÉTAPE 2: Vérifier qu'on a un placeId
    // ============================================
    if (!finalPlaceId) {
      console.error('❌ Aucun placeId trouvé pour cette ville');
      
      // ⚠️ FALLBACK : Recherche avec city + countryCode
      console.log('🔄 Fallback: recherche avec city + countryCode');
      return searchHotelsWithCity(req, res, {
        checkin, checkout, adults, city, environment, limit
      });
    }

    // ============================================
    // ÉTAPE 3: Récupérer les hôtels avec placeId
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
      return res.json({ 
        success: true,
        hotels: [],
        total: 0,
        message: "Aucun hôtel trouvé dans cette zone"
      });
    }

    // ============================================
    // ÉTAPE 4: Récupérer les tarifs
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
          hotelIds: batch.join(','),
          occupancies: [{ adults: parseInt(adults, 10) || 2 }],
          currency: "USD",
          guestNationality: "US",
          checkin: checkin,
          checkout: checkout,
          maxRatesPerHotel: 1,
          timeout: 15,
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

        rateData.forEach(function(item) {
          const hotelId = item.hotelId || item.id;
          if (hotelId) {
            rateMap[hotelId] = item;
          }
        });
        
        totalWithRates += rateData.length;
        console.log(`✅ Lot ${i + 1}: ${rateData.length} hôtels avec tarifs`);
        
      } catch (error) {
        console.warn(`⚠️ Erreur lot ${i + 1}: ${error.message}`);
      }
    }

    console.log(`✅ Total: ${Object.keys(rateMap).length} hôtels avec tarifs`);

    // ============================================
    // ÉTAPE 5: Fusionner les données
    // ============================================
    const hotels = hotelList.map(function(hotel) {
      const hotelId = hotel.hotelId || hotel.id;
      const rateItem = rateMap[hotelId] || {};
      const bestRate = rateItem.roomTypes?.[0]?.rates?.[0];
      
      let name = 'Hôtel sans nom';
      const nameCandidates = [
        hotel.name, hotel.hotelName, hotel.hotel_name, hotel.title,
        hotel.fullName, hotel.establishmentName, hotel.propertyName,
        hotel['Hotel Name'], hotel.name_en, hotel.name_fr
      ];
      for (let n of nameCandidates) {
        if (n && typeof n === 'string' && n.trim().length > 0) {
          name = n.trim();
          break;
        }
      }

      let photo = '';
      const photoCandidates = [
        hotel.main_photo, hotel.mainPhoto, hotel.photo, hotel.image,
        hotel.picture, hotel.thumbnail, hotel.images?.[0], hotel.photos?.[0],
        hotel.hotelImage, hotel.imageUrl
      ];
      for (let p of photoCandidates) {
        if (p && typeof p === 'string' && p.trim().length > 0) {
          photo = p.trim();
          break;
        }
      }
      if (!photo) {
        photo = `https://picsum.photos/seed/${hotelId || Math.random()}/460/380`;
      }

      let address = '';
      const addressCandidates = [
        hotel.address, hotel.streetAddress, hotel.street,
        hotel.addressLine1, hotel.fullAddress, hotel.location?.address
      ];
      for (let a of addressCandidates) {
        if (a && typeof a === 'string' && a.trim().length > 0) {
          address = a.trim();
          break;
        }
      }

      let rating = 0;
      const ratingCandidates = [
        hotel.rating, hotel.score, hotel.averageRating,
        hotel.overallRating, hotel.starRating
      ];
      for (let r of ratingCandidates) {
        if (r && !isNaN(parseFloat(r)) && parseFloat(r) > 0) {
          rating = parseFloat(r);
          break;
        }
      }

      let starRating = 0;
      const starCandidates = [
        hotel.starRating, hotel.stars, hotel.star_rating,
        hotel.hotelClass, hotel.category
      ];
      for (let s of starCandidates) {
        if (s && !isNaN(parseFloat(s)) && parseFloat(s) > 0) {
          starRating = parseFloat(s);
          break;
        }
      }

      return {
        id: hotelId || `hotel-${Math.random()}`,
        name: name,
        address: address || hotel.city || city,
        city: hotel.city || city,
        country: hotel.country || '',
        main_photo: photo,
        rating: rating || 0,
        reviewCount: hotel.reviewCount || hotel.review_count || 0,
        starRating: starRating || 0,
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

    const maxReturn = 500;
    const finalHotels = validHotels.slice(0, maxReturn);
    
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
// FALLBACK : Recherche avec city + countryCode
// ============================================
async function searchHotelsWithCity(req, res, params) {
  const { checkin, checkout, adults, city, environment, limit = 500 } = params;
  const apiKey = environment == "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`🔄 FALLBACK: Recherche avec city="${city}"`);

  try {
    const hotelsResponse = await sdk.getHotels({
      countryCode: "FR",  // Fallback sur la France
      cityName: city,
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

    console.log(`✅ FALLBACK: ${hotelList.length} hôtels trouvés`);

    if (hotelList.length === 0) {
      return res.json({ 
        success: true,
        hotels: [],
        total: 0,
        message: "Aucun hôtel trouvé pour cette ville"
      });
    }

    // Limiter à 50 pour les rates
    const limitedHotels = hotelList.slice(0, 50);
    const hotelIds = limitedHotels.map(h => h.hotelId || h.id).filter(id => id);

    const ratesResponse = await sdk.getFullRates({
      hotelIds: hotelIds.join(','),
      occupancies: [{ adults: parseInt(adults, 10) || 2 }],
      currency: "USD",
      guestNationality: "US",
      checkin: checkin,
      checkout: checkout,
      maxRatesPerHotel: 1,
      timeout: 15,
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
      if (hotelId) rateMap[hotelId] = item;
    });

    const hotels = limitedHotels.map(function(hotel) {
      const hotelId = hotel.hotelId || hotel.id;
      const rateItem = rateMap[hotelId] || {};
      const bestRate = rateItem.roomTypes?.[0]?.rates?.[0];
      
      let name = hotel.name || hotel.hotelName || 'Hôtel sans nom';
      let photo = hotel.main_photo || hotel.photo || hotel.image || 
        `https://picsum.photos/seed/${hotelId}/460/380`;

      return {
        id: hotelId || `hotel-${Math.random()}`,
        name: name,
        address: hotel.address || hotel.city || city,
        city: hotel.city || city,
        country: hotel.country || 'FR',
        main_photo: photo,
        rating: hotel.rating || 0,
        reviewCount: hotel.reviewCount || 0,
        starRating: hotel.starRating || 0,
        minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
        currency: bestRate?.retailRate?.total?.[0]?.currency || 'USD',
        offerId: rateItem.roomTypes?.[0]?.offerId || null,
        roomName: bestRate?.name || 'Chambre standard',
        refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN'
      };
    });

    const validHotels = hotels.filter(h => h.minPrice > 0).sort((a, b) => a.minPrice - b.minPrice);
    const finalHotels = validHotels.slice(0, 500);

    res.json({ 
      success: true,
      hotels: finalHotels,
      total: finalHotels.length,
      rawTotal: hotelList.length,
      fallbackUsed: true
    });
  } catch (error) {
    console.error("❌ Fallback error:", error);
    res.status(500).json({ 
      success: false,
      error: "Internal server error", 
      message: error.message
    });
  }
}

// ============================================
// 3. TARIFS DÉTAILLÉS HÔTEL
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
// 4. PRÉ-RÉSERVATION HÔTEL
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
// 5. RÉSERVATION FINALE HÔTEL
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
// 6. RECHERCHE VOLS
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
// 7. VÉRIFICATION VOL
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
// 8. PRÉ-RÉSERVATION VOL
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
// 9. RÉSERVATION FINALE VOL
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
// 10. DÉTAILS HÔTEL
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
// 11. AVIS HÔTEL
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
  console.log(`   🔍 GET  /search-hotels     - Hôtels (AVEC PLACE ID)`);
  console.log(`   📍 GET  /search-places     - Recherche de lieux (CORRIGÉ)`);
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
