const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const liteApi = require("liteapi-node-sdk");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

// ============================================
// CORS
// ============================================
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-API-Key"]
  })
);
app.options("*", cors());

const prod_apiKey = process.env.PROD_API_KEY;
const sandbox_apiKey = process.env.SAND_API_KEY;

app.use(bodyParser.json());

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
// 1) SEARCH PLACES (wrapper pour GET /data/places)
// ============================================
app.get("/search-places", async (req, res) => {
  console.log("\n📍 SEARCH PLACES");
  const { query, environment } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;

  if (!query || query.length < 2) {
    return res.json({ success: true, data: [] });
  }

  try {
    const response = await axios.get(
      `https://api.liteapi.travel/v3.0/data/places?textQuery=${encodeURIComponent(query)}`,
      {
        headers: {
          'X-API-Key': apiKey,
          'accept': 'application/json'
        }
      }
    );
    const places = response.data?.data || [];
    console.log(`✅ ${places.length} lieux trouvés`);
    res.json({ success: true, data: places });
  } catch (error) {
    console.error("❌ Error searching places:", error.message);
    res.status(500).json({ success: false, error: "Failed to search places", message: error.message });
  }
});

// ============================================
// RECHERCHE HÔTELS - VERSION GET (redirige vers POST)
// ============================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS (GET) ===== 🔍");
  // Convertir les query params en body et rediriger vers POST
  const body = req.query;
  req.body = body;
  return app._router.handle(req, res, (err) => {
    if (err) return res.status(500).json({ error: err.message });
  });
});

// ============================================
// RECHERCHE HÔTELS - VERSION POST (100% conforme à l'exemple LiteAPI)
// ============================================
app.post("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS (POST) ===== 🔍");
  
  const {
    checkin,
    checkout,
    adults = 2,
    placeId,
    hotelId,
    aiSearch,
    environment,
    currency = "USD",
    guestNationality = "US",
    limit = 200
  } = req.body;

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`📅 Arrivée: ${checkin}, Départ: ${checkout}`);
  console.log(`👤 Adultes: ${adults}`);
  console.log(`📍 PlaceId: ${placeId || 'non fourni'}`);
  console.log(`🏨 HotelId: ${hotelId || 'non fourni'}`);
  console.log(`🤖 AI Search: ${aiSearch || 'non utilisé'}`);

  if (!checkin || !checkout) {
    return res.status(400).json({
      success: false,
      error: "checkin and checkout are required"
    });
  }

  // ============================================================
  // Fonction pour extraire countryCode et city depuis un placeId
  // ============================================================
  async function getPlaceDetails(placeId) {
    try {
      const url = `https://api.liteapi.travel/v3.0/data/places/${placeId}?language=fr`;
      const response = await axios.get(url, {
        headers: {
          'X-API-Key': apiKey,
          'accept': 'application/json'
        }
      });
      const placeData = response.data?.data;
      if (!placeData) return { city: null, countryCode: null };
      
      const components = placeData.addressComponents || [];
      let city = null, countryCode = null;
      
      for (const comp of components) {
        if (comp.types && comp.types.includes('locality')) {
          city = comp.longText || comp.shortText;
        }
        if (comp.types && comp.types.includes('country')) {
          countryCode = comp.shortText; // ISO-2
        }
      }
      // Fallback : postal_town ou administrative_area_level_2
      if (!city) {
        for (const comp of components) {
          if (comp.types && (comp.types.includes('postal_town') || comp.types.includes('administrative_area_level_2'))) {
            city = comp.longText || comp.shortText;
            break;
          }
        }
      }
      return { city, countryCode };
    } catch (err) {
      console.error("❌ Erreur lors de la récupération des détails du lieu:", err.message);
      return { city: null, countryCode: null };
    }
  }

  try {
    // ------------------------------------------------------------
    // CAS 1 : Recherche par placeId (conforme à l'exemple)
    // ------------------------------------------------------------
    if (placeId) {
      // 1. Récupérer countryCode et city à partir du placeId
      const { city, countryCode } = await getPlaceDetails(placeId);
      if (!city || !countryCode) {
        // Fallback : on utilise l'ancienne méthode (getFullRates avec placeId)
        console.warn("⚠️ Impossible de récupérer city/countryCode, fallback vers getFullRates avec placeId");
        return fallbackSearch(req, res, sdk, { checkin, checkout, adults, placeId, currency, guestNationality, limit });
      }
      console.log(`📍 Recherche par ville: ${city}, pays: ${countryCode}`);

      // 2. Appeler sdk.getHotels (GET /data/hotels)
      const hotelsResponse = await sdk.getHotels(countryCode, city, 0, parseInt(limit) || 200);
      const hotelsData = hotelsResponse.data; // tableau d'hôtels avec name, main_photo, etc.

      if (!hotelsData || hotelsData.length === 0) {
        return res.json({ success: true, hotels: [], total: 0 });
      }

      // 3. Récupérer les IDs
      const hotelIds = hotelsData.map((hotel) => hotel.id);

      // 4. Récupérer les tarifs pour ces hôtels
      const ratesResponse = await sdk.getFullRates({
        hotelIds: hotelIds,
        occupancies: [{ adults: parseInt(adults, 10) }],
        currency: currency,
        guestNationality: guestNationality,
        checkin: checkin,
        checkout: checkout,
        roomMapping: true,
        includeHotelData: false, // inutile car on a déjà les données
        maxRatesPerHotel: 1,     // pour n'avoir qu'un seul tarif par hôtel (le moins cher)
        timeout: 8
      });
      const ratesData = ratesResponse.data; // tableau de rates

      // 5. Fusionner : associer chaque rate à son hôtel
      ratesData.forEach((rate) => {
        rate.hotel = hotelsData.find((hotel) => hotel.id === rate.hotelId);
      });

      // 6. Construire la réponse au format attendu par le frontend
      const hotels = ratesData.map((rate) => {
        const hotel = rate.hotel || {};
        const firstRoom = rate.roomTypes?.[0];
        const bestRate = firstRoom?.rates?.[0];
        return {
          id: hotel.id || rate.hotelId,
          name: hotel.name || 'Hôtel sans nom',
          address: hotel.address || '',
          city: hotel.city || '',
          country: hotel.country || '',
          main_photo: hotel.main_photo || (hotel.hotelImages && hotel.hotelImages.length > 0 ? hotel.hotelImages[0].url : '') || '',
          rating: hotel.rating || 0,
          reviewCount: hotel.reviewCount || 0,
          starRating: hotel.starRating || 0,
          minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
          currency: bestRate?.retailRate?.total?.[0]?.currency || 'USD',
          offerId: firstRoom?.offerId || null,
          roomName: bestRate?.name || 'Chambre standard',
          boardName: bestRate?.boardName || 'Non spécifié',
          refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN'
        };
      }).filter(h => h.minPrice > 0); // exclure ceux sans prix

      // Limiter le nombre
      const finalHotels = hotels.slice(0, parseInt(limit) || 200);

      return res.json({
        success: true,
        hotels: finalHotels,
        total: finalHotels.length,
        city: city,
        country: countryCode
      });
    }

    // ------------------------------------------------------------
    // CAS 2 : Recherche par hotelId (direct)
    // ------------------------------------------------------------
    if (hotelId) {
      // On utilise la méthode fallback avec hotelIds
      return fallbackSearch(req, res, sdk, { checkin, checkout, adults, hotelId, currency, guestNationality, limit });
    }

    // ------------------------------------------------------------
    // CAS 3 : Recherche AI (aiSearch)
    // ------------------------------------------------------------
    if (aiSearch) {
      // On utilise la méthode fallback avec aiSearch
      return fallbackSearch(req, res, sdk, { checkin, checkout, adults, aiSearch, currency, guestNationality, limit });
    }

    // Aucun critère
    return res.status(400).json({
      success: false,
      error: "Missing search criteria: placeId, hotelId, or aiSearch required"
    });

  } catch (error) {
    console.error("❌ Error searching for hotels:", error);
    console.error("📝 Message:", error.message);
    if (error.response) {
      console.error("📄 Response data:", error.response.data);
    }
    res.status(500).json({
      success: false,
      error: "Failed to search hotels",
      message: error.message,
      details: error.response?.data || null
    });
  }
});

// ============================================================
// FONCTION FALLBACK : pour les cas où on ne peut pas utiliser getHotels
// (hotelId, aiSearch, ou échec de récupération city/country)
// ============================================================
async function fallbackSearch(req, res, sdk, params) {
  const { checkin, checkout, adults, hotelId, placeId, aiSearch, currency, guestNationality, limit } = params;
  
  try {
    const requestBody = {
      occupancies: [{ adults: parseInt(adults, 10) }],
      currency: currency || "USD",
      guestNationality: guestNationality || "US",
      checkin: checkin,
      checkout: checkout,
      roomMapping: true,
      includeHotelData: true,
      maxRatesPerHotel: 1,
      timeout: 8
    };

    if (hotelId) {
      requestBody.hotelIds = [hotelId];
    } else if (placeId) {
      requestBody.placeId = placeId;
    } else if (aiSearch) {
      requestBody.aiSearch = aiSearch;
    } else {
      return res.status(400).json({ success: false, error: "Missing search criteria" });
    }

    const response = await sdk.getFullRates(requestBody);
    const ratesData = Array.isArray(response?.data?.data) ? response.data.data : [];
    const hotelsData = response?.data?.hotels || []; // pour AI search

    let hotels = [];

    if (aiSearch && hotelsData.length > 0) {
      // Utiliser les données enrichies de hotelsData
      hotels = hotelsData.map((hotel) => {
        const rateData = ratesData.find((r) => r.hotelId === hotel.id);
        const firstRoom = rateData?.roomTypes?.[0];
        const bestRate = firstRoom?.rates?.[0];
        return {
          id: hotel.id,
          name: hotel.name || 'Hôtel sans nom',
          address: hotel.address || '',
          city: hotel.city || '',
          country: hotel.country || '',
          main_photo: hotel.main_photo || '',
          rating: hotel.rating || 0,
          reviewCount: hotel.reviewCount || 0,
          starRating: hotel.starRating || 0,
          minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
          currency: bestRate?.retailRate?.total?.[0]?.currency || 'USD',
          offerId: firstRoom?.offerId || null,
          roomName: bestRate?.name || 'Chambre standard',
          boardName: bestRate?.boardName || 'Non spécifié',
          refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN'
        };
      });
    } else {
      // Fusionner avec les données de rateData.hotel
      for (const rateData of ratesData) {
        const hotel = rateData.hotel || {};
        const firstRoom = rateData.roomTypes?.[0];
        const bestRate = firstRoom?.rates?.[0];
        // Si hotel.name est vide, on essaie de récupérer via getHotelDetails
        let hotelDetails = null;
        if (!hotel.name) {
          try {
            const details = await sdk.getHotelDetails(rateData.hotelId, 6);
            hotelDetails = details.data;
          } catch (err) {}
        }
        const finalHotel = hotelDetails || hotel;
        hotels.push({
          id: rateData.hotelId,
          name: finalHotel.name || 'Hôtel sans nom',
          address: finalHotel.address || '',
          city: finalHotel.city || '',
          country: finalHotel.country || '',
          main_photo: finalHotel.main_photo || (finalHotel.hotelImages && finalHotel.hotelImages.length > 0 ? finalHotel.hotelImages[0].url : '') || '',
          rating: finalHotel.rating || 0,
          reviewCount: finalHotel.reviewCount || 0,
          starRating: finalHotel.starRating || 0,
          minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
          currency: bestRate?.retailRate?.total?.[0]?.currency || 'USD',
          offerId: firstRoom?.offerId || null,
          roomName: bestRate?.name || 'Chambre standard',
          boardName: bestRate?.boardName || 'Non spécifié',
          refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN'
        });
      }
    }

    // Filtrer et limiter
    hotels = hotels.filter(h => h.minPrice > 0);
    if (limit && hotels.length > limit) {
      hotels = hotels.slice(0, limit);
    }

    return res.json({
      success: true,
      hotels: hotels,
      total: hotels.length,
      aiSearch: !!aiSearch
    });

  } catch (error) {
    console.error("❌ Fallback search error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to search hotels (fallback)",
      message: error.message
    });
  }
}

// ============================================
// 3) SEARCH RATES (POST) - pour obtenir les tarifs détaillés d'un hôtel
//    Conforme à la documentation LiteAPI
// ============================================
app.post("/search-rates", async (req, res) => {
  console.log("\n💰 ===== SEARCH RATES (POST) ===== 💰");

  const {
    checkin,
    checkout,
    adults = 2,
    hotelId,
    placeId,
    aiSearch,
    environment,
    maxRatesPerHotel = 20,
    includeHotelData = true,
    roomMapping = true,
    currency = "USD",
    guestNationality = "US"
  } = req.body;

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`🏨 Hotel ID: ${hotelId || 'non fourni'}`);
  console.log(`📍 Place ID: ${placeId || 'non fourni'}`);
  console.log(`🤖 AI Search: ${aiSearch || 'non utilisé'}`);
  console.log(`📅 Arrivée: ${checkin}, Départ: ${checkout}`);
  console.log(`👤 Adultes: ${adults}`);

  if (!checkin || !checkout) {
    return res.status(400).json({
      success: false,
      error: "checkin and checkout are required"
    });
  }

  // Au moins un critère de recherche
  if (!hotelId && !placeId && !aiSearch) {
    return res.status(400).json({
      success: false,
      error: "Missing search criteria: hotelId, placeId or aiSearch required"
    });
  }

  try {
    const requestBody = {
      occupancies: [{ adults: parseInt(adults, 10) || 2 }],
      currency: currency,
      guestNationality: guestNationality,
      checkin: checkin,
      checkout: checkout,
      maxRatesPerHotel: parseInt(maxRatesPerHotel, 10) || 20,
      roomMapping: roomMapping === "true" || roomMapping === true,
      includeHotelData: includeHotelData === "true" || includeHotelData === true,
      timeout: 8,
    };

    if (hotelId) {
      requestBody.hotelIds = [hotelId];
    } else if (placeId) {
      requestBody.placeId = placeId;
    } else if (aiSearch) {
      requestBody.aiSearch = aiSearch;
    }

    console.log(`📦 Requête envoyée à LiteAPI:`, JSON.stringify(requestBody, null, 2));

    const response = await sdk.getFullRates(requestBody);

    const rates = Array.isArray(response?.data?.data) ? response.data.data : [];
    const hotelsInfo = response?.data?.hotels || [];

    console.log(`✅ ${rates.length} hôtels dans la réponse`);

    if (rates.length === 0) {
      return res.json({
        success: false,
        error: "No availability found",
        message: "Aucun hôtel trouvé pour ces critères",
        hotelInfo: null,
        rateInfo: []
      });
    }

    // On prend le premier hôtel (car la page de détail n'en affiche qu'un)
    const firstHotel = rates[0];
    const hotelIdFromFirst = firstHotel.hotelId;
    let enrichedHotel = hotelsInfo.find(h => h.id === hotelIdFromFirst) || null;
    const hotelFromRate = firstHotel.hotel || {};

    const hotelInfo = {
      id: hotelIdFromFirst,
      name: enrichedHotel?.name || hotelFromRate.name || "Hôtel sans nom",
      address: enrichedHotel?.address || hotelFromRate.address || "",
      city: enrichedHotel?.city || hotelFromRate.city || "",
      country: enrichedHotel?.country || hotelFromRate.country || "",
      starRating: enrichedHotel?.starRating || hotelFromRate.starRating || 0,
      rating: enrichedHotel?.rating || hotelFromRate.rating || 0,
      reviewCount: enrichedHotel?.reviewCount || hotelFromRate.reviewCount || 0,
      main_photo: enrichedHotel?.main_photo 
                  || hotelFromRate.main_photo 
                  || (hotelFromRate.hotelImages && hotelFromRate.hotelImages.length > 0 ? hotelFromRate.hotelImages[0].url : '')
                  || "https://picsum.photos/seed/default/460/380",
      tags: enrichedHotel?.tags || [],
      persona: enrichedHotel?.persona || '',
      style: enrichedHotel?.style || '',
      location_type: enrichedHotel?.location_type || '',
      story: enrichedHotel?.story || '',
      description: hotelFromRate.hotelDescription || ''
    };

    // Extraire tous les tarifs du premier hôtel
    const rateInfo = [];
    (firstHotel.roomTypes || []).forEach((roomType) => {
      (roomType.rates || []).forEach((rate) => {
        rateInfo.push({
          rateName: rate.name || roomType.roomName || "Chambre standard",
          offerId: roomType.offerId || "",
          board: rate.boardName || "Non spécifié",
          boardType: rate.boardType || "",
          refundableTag: rate.cancellationPolicies?.refundableTag || "NRFN",
          retailRate: rate.retailRate?.total?.[0]?.amount || 0,
          originalRate: rate.retailRate?.suggestedSellingPrice?.[0]?.amount || null,
          maxOccupancy: rate.maxOccupancy || 0,
          adultCount: rate.adultCount || 0,
          childCount: rate.childCount || 0,
          mappedRoomId: rate.mappedRoomId || null,
          currency: rate.retailRate?.total?.[0]?.currency || 'USD'
        });
      });
    });

    console.log(`✅ ${rateInfo.length} tarifs extraits pour l'hôtel ${hotelInfo.name}`);

    res.json({
      success: true,
      hotelInfo: hotelInfo,
      rateInfo: rateInfo,
      totalRates: rateInfo.length
    });

  } catch (error) {
    console.error("❌ Error fetching rates:", error);
    console.error("📝 Message:", error.message);
    if (error.response) {
      console.error("📄 Response data:", error.response.data);
    }
    res.status(500).json({
      success: false,
      error: "No availability found",
      message: error.message,
      details: error.response?.data || null,
    });
  }
});

// ============================================
// PREBOOK
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
// BOOK
// ============================================
app.post("/book", async (req, res) => {
  console.log("\n📝 ===== BOOK ===== 📝");
  const { 
    prebookId, 
    guestFirstName, 
    guestLastName, 
    guestEmail, 
    guestPhone,
    transactionId, 
    environment,
    occupancyNumber = 1
  } = req.body;

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
    payment: {
      method: "TRANSACTION_ID",
      transactionId: transactionId
    },
    guests: [{
      occupancyNumber: parseInt(occupancyNumber, 10),
      remarks: "",
      firstName: guestFirstName,
      lastName: guestLastName,
      email: guestEmail
    }]
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
// VOLS (flights) - gardés mais non utilisés pour l'instant
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

app.post("/prebook-flight", async (req, res) => {
  console.log("\n📋 ===== PREBOOK FLIGHT ===== 📋");
  const { offerId, contact, passengers, usePaymentSdk, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);
  try {
    const response = await sdk.prebookFlight({
      offerId, usePaymentSdk: usePaymentSdk !== undefined ? usePaymentSdk : true, contact, passengers
    });
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error prebooking flight:", error);
    res.status(500).json({ success: false, error: "Failed to prebook flight", message: error.message });
  }
});

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
// HOTEL DETAILS
// ============================================
app.get("/hotel-details", async (req, res) => {
  console.log("\n🏨 ===== HOTEL DETAILS ===== 🏨");
  const { hotelId, timeout = 8, environment } = req.query;
  if (!hotelId) {
    return res.status(400).json({ success: false, error: "hotelId is required" });
  }
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.getHotelDetails(hotelId, timeout);
    const hotel = response.data;
    const rooms = (hotel.rooms || []).map(room => ({
      id: room.id,
      roomName: room.roomName || 'Chambre sans nom',
      description: room.description || '',
      maxOccupancy: room.maxOccupancy || 0,
      maxAdults: room.maxAdults || 0,
      maxChildren: room.maxChildren || 0,
      roomSizeSquare: room.roomSizeSquare || 0,
      bedTypes: room.bedTypes || [],
      roomAmenities: (room.roomAmenities || []).map(a => a.name),
      photos: (room.photos || []).map(p => ({ url: p.hd_url || p.url || '', mainPhoto: p.mainPhoto || false }))
    }));
    res.json({ success: true, data: { ...hotel, rooms } });
  } catch (error) {
    console.error("❌ Error getting hotel details:", error);
    res.status(500).json({ success: false, error: "Failed to get hotel details", message: error.message });
  }
});

// ============================================
// HOTEL REVIEWS
// ============================================
app.get("/hotel-reviews", async (req, res) => {
  console.log("\n⭐ ===== HOTEL REVIEWS ===== ⭐");
  const { hotelId, timeout = 8, environment } = req.query;
  if (!hotelId) {
    return res.status(400).json({ success: false, error: "hotelId is required" });
  }
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
// SERVEUR STATIQUE
// ============================================
app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});
app.get("/resultats-hebergement.html", (req, res) => {
  res.sendFile(path.join(__dirname, "resultats-hebergement.html"));
});
app.get("/resultats-vols.html", (req, res) => {
  res.sendFile(path.join(__dirname, "resultats-vols.html"));
});
app.get("/hotel-detail.html", (req, res) => {
  res.sendFile(path.join(__dirname, "hotel-detail.html"));
});

// ============================================
// PORT
// ============================================
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`\n🚀 Server running on http://localhost:${port}`);
});
