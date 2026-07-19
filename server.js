const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const liteApi = require("liteapi-node-sdk");
const cors = require("cors");
const path = require("path");
const axios = require("axios");
require("dotenv").config();

// ============================================
// CORS - CONFIGURATION PERMISSIVE
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
// RECHERCHE DE LIEUX (via API directe)
// ============================================
app.get("/search-places", async (req, res) => {
  console.log("\n📍 ===== SEARCH PLACES ===== 📍");
  const { query, environment } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;

  console.log(`🔍 Recherche: "${query}"`);

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

    res.json({ 
      success: true, 
      data: places 
    });
  } catch (error) {
    console.error("❌ Error searching places:", error.message);
    res.status(500).json({ 
      success: false,
      error: "Failed to search places",
      message: error.message
    });
  }
});

// ============================================
// RECHERCHE HÔTELS - CORRIGÉE (POST avec body)
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
    maxRatesPerHotel = 1,
    includeHotelData = true,
    roomMapping = true,
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

  // Validation des dates
  if (!checkin || !checkout) {
    return res.status(400).json({
      success: false,
      error: "checkin and checkout are required"
    });
  }

  try {
    // Construction du corps de la requête selon la documentation
    const requestBody = {
      occupancies: [{ adults: parseInt(adults, 10) }],
      currency: currency,
      guestNationality: guestNationality,
      checkin: checkin,
      checkout: checkout,
      maxRatesPerHotel: parseInt(maxRatesPerHotel, 10),
      roomMapping: roomMapping,
      includeHotelData: includeHotelData,
      timeout: 8
    };

    // Ajout du critère de recherche approprié
    if (aiSearch) {
      // Recherche par IA (free text)
      requestBody.aiSearch = aiSearch;
      console.log(`🔍 Recherche IA: "${aiSearch}"`);
    } else if (placeId) {
      // Recherche par lieu
      requestBody.placeId = placeId;
      console.log(`📍 Recherche par lieu: ${placeId}`);
    } else if (hotelId) {
      // Recherche par hôtel spécifique
      requestBody.hotelIds = [hotelId];
      console.log(`🏨 Recherche par hôtel: ${hotelId}`);
    } else {
      return res.status(400).json({
        success: false,
        error: "Missing search criteria: placeId, hotelId, or aiSearch required"
      });
    }

    console.log(`📦 Requête envoyée à LiteAPI:`, JSON.stringify(requestBody, null, 2));

    const response = await sdk.getFullRates(requestBody);

    // Extraction des données
    const ratesData = Array.isArray(response?.data?.data) ? response.data.data : Array.isArray(response?.data) ? response.data : [];
    const hotelsData = response?.data?.hotels || [];

    console.log(`✅ ${ratesData.length} tarifs trouvés`);
    console.log(`✅ ${hotelsData.length} hôtels trouvés (IA search)`);

    // Si on a une recherche IA, on utilise les données des hôtels pour enrichir
    let hotels = [];
    
    if (aiSearch && hotelsData.length > 0) {
      // Cas AI Search: on utilise les données de l'objet "hotels"
      hotels = hotelsData.map((hotel) => {
        // Trouver le tarif correspondant dans ratesData
        const rateData = ratesData.find((r) => r.hotelId === hotel.id);
        let minPrice = 0;
        let currency = 'USD';
        let offerId = null;
        let roomName = 'Chambre standard';
        let refundable = false;
        let boardName = 'Non spécifié';

        if (rateData && rateData.roomTypes && rateData.roomTypes.length > 0) {
          const firstRoom = rateData.roomTypes[0];
          if (firstRoom.rates && firstRoom.rates.length > 0) {
            const rate = firstRoom.rates[0];
            minPrice = rate.retailRate?.total?.[0]?.amount || 0;
            currency = rate.retailRate?.total?.[0]?.currency || 'USD';
            offerId = firstRoom.offerId;
            roomName = rate.name || 'Chambre standard';
            refundable = rate.cancellationPolicies?.refundableTag === 'RFN';
            boardName = rate.boardName || 'Non spécifié';
          }
        }

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
          minPrice: minPrice,
          currency: currency,
          offerId: offerId,
          roomName: roomName,
          boardName: boardName,
          refundable: refundable,
          tags: hotel.tags || [],
          persona: hotel.persona || '',
          style: hotel.style || '',
          location_type: hotel.location_type || '',
          story: hotel.story || ''
        };
      });
    } else {
      // Cas standard: on utilise les données des tarifs
      hotels = ratesData.map((rateData) => {
        const hotel = rateData.hotel || {};
        const firstRoom = rateData.roomTypes?.[0];
        const rate = firstRoom?.rates?.[0];
        
        return {
          id: rateData.hotelId,
          name: hotel.name || 'Hôtel sans nom',
          address: hotel.address || '',
          city: hotel.city || '',
          country: hotel.country || '',
          main_photo: hotel.main_photo || '',
          rating: hotel.rating || 0,
          reviewCount: hotel.reviewCount || 0,
          starRating: hotel.starRating || 0,
          minPrice: rate?.retailRate?.total?.[0]?.amount || 0,
          currency: rate?.retailRate?.total?.[0]?.currency || 'USD',
          offerId: firstRoom?.offerId || null,
          roomName: rate?.name || 'Chambre standard',
          boardName: rate?.boardName || 'Non spécifié',
          refundable: rate?.cancellationPolicies?.refundableTag === 'RFN'
        };
      });
    }

    // Limiter le nombre de résultats si nécessaire
    if (limit && hotels.length > limit) {
      hotels = hotels.slice(0, limit);
    }

    res.json({
      success: true,
      hotels: hotels,
      total: hotels.length,
      aiSearch: aiSearch || false,
      ratesData: ratesData // Pour les pages de détail
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

// ============================================
// TARIFS DÉTAILLÉS HÔTEL (POST avec body)
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

  try {
    const requestBody = {
      occupancies: [{ adults: parseInt(adults, 10) || 2 }],
      currency: currency,
      guestNationality: guestNationality,
      checkin: checkin,
      checkout: checkout,
      maxRatesPerHotel: parseInt(maxRatesPerHotel, 10) || 20,
      roomMapping: roomMapping,
      includeHotelData: includeHotelData === "true" || includeHotelData === true,
      timeout: 8,
    };

    // Ajout du critère de recherche
    if (hotelId) {
      requestBody.hotelIds = [hotelId];
    } else if (placeId) {
      requestBody.placeId = placeId;
    } else if (aiSearch) {
      requestBody.aiSearch = aiSearch;
    } else {
      return res.status(400).json({
        success: false,
        error: "Missing search criteria: hotelId, placeId or aiSearch required",
      });
    }

    console.log(`📦 Requête envoyée:`, JSON.stringify(requestBody, null, 2));

    const response = await sdk.getFullRates(requestBody);

    const rates = Array.isArray(response?.data?.data) 
      ? response.data.data 
      : Array.isArray(response?.data) 
        ? response.data 
        : [];

    const hotelsInfo = response?.data?.hotels || [];

    console.log(`✅ ${rates.length} hôtels dans la réponse`);
    console.log(`✅ ${hotelsInfo.length} hôtels enrichis (IA)`);

    if (rates.length === 0) {
      return res.json({
        success: false,
        error: "No availability found",
        message: "Aucun hôtel trouvé pour ces critères",
        rates: [],
        hotelInfo: null
      });
    }

    // Structurer les données par hôtel avec tous les tarifs
    const result = rates.map((hotel) => {
      const hotelData = hotel.hotel || {};
      
      // Récupérer les informations de l'hôtel depuis l'objet hotels si disponible (AI search)
      const aiHotelInfo = hotelsInfo.find((h) => h.id === hotel.hotelId);
      
      // Extraire tous les tarifs par type de chambre
      const roomTypes = (hotel.roomTypes || []).map((roomType) => {
        const rates = (roomType.rates || []).map((rate) => {
          return {
            rateName: rate.name || "Chambre standard",
            offerId: roomType.offerId || "",
            boardName: rate.boardName || "Non spécifié",
            boardType: rate.boardType || "",
            refundableTag: rate.cancellationPolicies?.refundableTag || "NRFN",
            retailRate: rate.retailRate?.total?.[0]?.amount || 0,
            originalRate: rate.retailRate?.suggestedSellingPrice?.[0]?.amount || null,
            currency: rate.retailRate?.total?.[0]?.currency || 'USD',
            maxOccupancy: rate.maxOccupancy || 0,
            adultCount: rate.adultCount || 0,
            childCount: rate.childCount || 0,
            mappedRoomId: rate.mappedRoomId || null,
            cancelPolicy: rate.cancellationPolicies?.cancelPolicyInfos?.[0] || null,
            taxesIncluded: rate.retailRate?.taxesAndFees?.[0]?.included || false
          };
        });
        
        return {
          roomName: roomType.rates?.[0]?.name || 'Chambre',
          offerId: roomType.offerId,
          rates: rates,
          mappedRoomId: roomType.rates?.[0]?.mappedRoomId || null
        };
      });

      // Grouper par mappedRoomId
      const groupedRooms = {};
      roomTypes.forEach((roomType) => {
        roomType.rates.forEach((rate) => {
          const key = rate.mappedRoomId || 'default';
          if (!groupedRooms[key]) {
            groupedRooms[key] = {
              roomName: roomType.roomName,
              mappedRoomId: key,
              rates: []
            };
          }
          groupedRooms[key].rates.push({
            ...rate,
            offerId: roomType.offerId
          });
        });
      });

      return {
        hotelId: hotel.hotelId,
        hotelInfo: {
          id: hotel.hotelId,
          name: aiHotelInfo?.name || hotelData.name || "Hôtel sans nom",
          address: aiHotelInfo?.address || hotelData.address || "",
          city: aiHotelInfo?.city || hotelData.city || "",
          country: aiHotelInfo?.country || hotelData.country || "",
          starRating: aiHotelInfo?.starRating || hotelData.starRating || 0,
          rating: aiHotelInfo?.rating || hotelData.rating || 0,
          reviewCount: aiHotelInfo?.reviewCount || hotelData.reviewCount || 0,
          main_photo: aiHotelInfo?.main_photo || hotelData.main_photo || "",
          tags: aiHotelInfo?.tags || [],
          persona: aiHotelInfo?.persona || '',
          style: aiHotelInfo?.style || '',
          location_type: aiHotelInfo?.location_type || '',
          story: aiHotelInfo?.story || '',
          description: hotelData.hotelDescription || ''
        },
        roomTypes: groupedRooms,
        minPrice: Math.min(...Object.values(groupedRooms).flatMap((g) => g.rates.map((r) => r.retailRate))),
        maxPrice: Math.max(...Object.values(groupedRooms).flatMap((g) => g.rates.map((r) => r.retailRate)))
      };
    });

    res.json({
      success: true,
      hotels: result,
      totalHotels: result.length
    });

  } catch (error) {
    console.error("❌ Error fetching rates:", error);
    console.error("📝 Message:", error.message);
    if (error.response) {
      console.error("📄 Response data:", error.response.data);
    }
    res.status(500).json({
      success: false,
      error: "Failed to fetch rates",
      message: error.message,
      details: error.response?.data || null,
    });
  }
});

// ============================================
// PRÉ-RÉSERVATION HÔTEL
// ============================================
app.post("/prebook", async (req, res) => {
  console.log("\n📋 ===== PREBOOK ===== 📋");
  const { offerId, environment, voucherCode } = req.body;
  
  if (!offerId) {
    return res.status(400).json({ 
      success: false,
      error: "offerId is required" 
    });
  }

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`🔑 Offer ID: ${offerId}`);
  console.log(`🌍 Environnement: ${environment || 'sandbox'}`);

  const bodyData = {
    offerId: offerId,
    usePaymentSdk: true,
  };

  if (voucherCode) {
    bodyData.voucherCode = voucherCode;
  }

  try {
    console.log(`📦 Requête prebook:`, JSON.stringify(bodyData, null, 2));
    const response = await sdk.preBook(bodyData);
    
    console.log(`✅ Prebook réussi! prebookId: ${response.data?.prebookId}`);
    
    res.json({ 
      success: true, 
      data: response.data 
    });
  } catch (err) {
    console.error("❌ Prebook error:", err);
    if (err.response) {
      console.error("📄 Response data:", err.response.data);
    }
    res.status(500).json({ 
      success: false,
      error: "Prebook failed",
      message: err.message,
      details: err.response?.data || null
    });
  }
});

// ============================================
// RÉSERVATION FINALE HÔTEL
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

  if (!prebookId) {
    return res.status(400).json({ 
      success: false,
      error: "prebookId is required" 
    });
  }
  if (!guestFirstName || !guestLastName || !guestEmail) {
    return res.status(400).json({ 
      success: false,
      error: "guestFirstName, guestLastName and guestEmail are required" 
    });
  }
  if (!transactionId) {
    return res.status(400).json({ 
      success: false,
      error: "transactionId is required" 
    });
  }

  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  const bodyData = {
    prebookId: prebookId,
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
    guests: [
      {
        occupancyNumber: parseInt(occupancyNumber, 10),
        remarks: "",
        firstName: guestFirstName,
        lastName: guestLastName,
        email: guestEmail
      }
    ]
  };

  console.log(`📦 Données de réservation:`, JSON.stringify(bodyData, null, 2));

  try {
    const response = await sdk.book(bodyData);
    console.log(`✅ Réservation réussie! Booking ID: ${response.data?.bookingId}`);
    res.json({ 
      success: true, 
      data: response.data 
    });
  } catch (err) {
    console.error("❌ Error during booking:", err);
    if (err.response) {
      console.error("📄 Response data:", err.response.data);
    }
    res.status(500).json({ 
      success: false,
      error: "Booking failed",
      message: err.message,
      details: err.response?.data || null
    });
  }
});

// ============================================
// RECHERCHE VOLS
// ============================================
app.post("/search-flights", async (req, res) => {
  console.log("\n✈️ ===== SEARCH FLIGHTS ===== ✈️");
  const { legs, adults, children, infants, currency, country, cabinClass, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`📍 Itinéraire:`, JSON.stringify(legs, null, 2));

  try {
    const response = await sdk.searchFlights({
      legs: legs,
      adults: adults || 1,
      children: children || 0,
      infants: infants || 0,
      currency: currency || "USD",
      country: country || "US",
      cabinClass: cabinClass || "ECONOMY"
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error searching flights:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to search flights",
      message: error.message
    });
  }
});

// ============================================
// VÉRIFICATION VOL
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
    res.status(500).json({ 
      success: false,
      error: "Failed to verify flight",
      message: error.message
    });
  }
});

// ============================================
// PRÉ-RÉSERVATION VOL
// ============================================
app.post("/prebook-flight", async (req, res) => {
  console.log("\n📋 ===== PREBOOK FLIGHT ===== 📋");
  const { offerId, contact, passengers, usePaymentSdk, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.prebookFlight({
      offerId: offerId,
      usePaymentSdk: usePaymentSdk !== undefined ? usePaymentSdk : true,
      contact: contact,
      passengers: passengers
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error prebooking flight:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to prebook flight",
      message: error.message
    });
  }
});

// ============================================
// RÉSERVATION FINALE VOL
// ============================================
app.post("/book-flight", async (req, res) => {
  console.log("\n📝 ===== BOOK FLIGHT ===== 📝");
  const { prebookId, transactionId, method, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  try {
    const response = await sdk.bookFlight({
      prebookId: prebookId,
      payment: {
        method: method || "TRANSACTION_ID",
        transactionId: transactionId
      }
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error booking flight:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to book flight",
      message: error.message
    });
  }
});

// ============================================
// DÉTAILS HÔTEL
// ============================================
app.get("/hotel-details", async (req, res) => {
  console.log("\n🏨 ===== HOTEL DETAILS ===== 🏨");
  const { hotelId, timeout = 8, environment } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  if (!hotelId) {
    return res.status(400).json({
      success: false,
      error: "hotelId is required"
    });
  }

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
          return {
            url: p.hd_url || p.url || '',
            mainPhoto: p.mainPhoto || false
          };
        })
      };
    });

    res.json({ 
      success: true, 
      data: {
        ...hotel,
        rooms: rooms
      }
    });
  } catch (error) {
    console.error("❌ Error getting hotel details:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to get hotel details",
      message: error.message
    });
  }
});

// ============================================
// AVIS HÔTEL
// ============================================
app.get("/hotel-reviews", async (req, res) => {
  console.log("\n⭐ ===== HOTEL REVIEWS ===== ⭐");
  const { hotelId, timeout = 8, environment } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  if (!hotelId) {
    return res.status(400).json({
      success: false,
      error: "hotelId is required"
    });
  }

  try {
    const response = await sdk.getHotelReviews(hotelId, timeout);
    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error("❌ Error getting hotel reviews:", error);
    res.status(500).json({ 
      success: false,
      error: "Failed to get hotel reviews",
      message: error.message
    });
  }
});

// ============================================
// SERVEUR - SERVIR LES FICHIERS STATIQUES
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
  console.log(`\n🚀 ===== LUVIA PLACE SERVER ===== 🚀`);
  console.log(`📡 Server running on http://localhost:${port}`);
  console.log(`📌 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 API Key (prod): ${prod_apiKey ? '✅' : '❌'}`);
  console.log(`🔑 API Key (sandbox): ${sandbox_apiKey ? '✅' : '❌'}`);
  console.log(`\n📋 ENDPOINTS:`);
  console.log(`   📍 GET  /search-places      - Autocomplete de lieux`);
  console.log(`   🔍 POST /search-hotels      - Recherche hôtels (POST avec body)`);
  console.log(`   💰 POST /search-rates       - Tarifs détaillés (POST avec body)`);
  console.log(`   📋 POST /prebook            - Pré-réservation hôtel`);
  console.log(`   📝 POST /book               - Réservation hôtel`);
  console.log(`   🏨 GET  /hotel-details      - Détails hôtel`);
  console.log(`   ⭐ GET  /hotel-reviews      - Avis hôtel`);
  console.log(`   ✈️ POST /search-flights     - Recherche vols`);
  console.log(`   ✈️ POST /prebook-flight     - Pré-réservation vol`);
  console.log(`   ✈️ POST /book-flight        - Réservation vol`);
  console.log(`\n✅ Serveur prêt !\n`);
});
