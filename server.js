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
// RECHERCHE HÔTELS - VERSION GET (compatibilité)
// ============================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS (GET) ===== 🔍");
  // On redirige vers la version POST en convertissant les query params en body
  const body = req.query;
  req.body = body;
  return app._router.handle(req, res, (err) => {
    if (err) return res.status(500).json({ error: err.message });
  });
});

// ============================================
// RECHERCHE HÔTELS - VERSION POST (améliorée selon l'exemple LiteAPI)
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
    maxRatesPerHotel = 50,   // Augmenté pour obtenir plus d'hôtels
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

  if (!checkin || !checkout) {
    return res.status(400).json({
      success: false,
      error: "checkin and checkout are required"
    });
  }

  try {
    // 1. Construction de la requête vers l'API LiteAPI (POST /hotels/rates)
    const requestBody = {
      occupancies: [{ adults: parseInt(adults, 10) }],
      currency: currency,
      guestNationality: guestNationality,
      checkin: checkin,
      checkout: checkout,
      maxRatesPerHotel: parseInt(maxRatesPerHotel, 10),
      roomMapping: roomMapping === "true" || roomMapping === true,
      includeHotelData: includeHotelData === "true" || includeHotelData === true,
      timeout: 10   // Timeout un peu plus long
    };

    if (aiSearch) {
      requestBody.aiSearch = aiSearch;
    } else if (placeId) {
      requestBody.placeId = placeId;
    } else if (hotelId) {
      requestBody.hotelIds = [hotelId];
    } else {
      return res.status(400).json({
        success: false,
        error: "Missing search criteria: placeId, hotelId, or aiSearch required"
      });
    }

    console.log(`📦 Requête envoyée à LiteAPI (rates):`, JSON.stringify(requestBody, null, 2));

    // 2. Appel à l'API
    const response = await sdk.getFullRates(requestBody);

    // 3. Extraction des données
    const ratesData = Array.isArray(response?.data?.data) ? response.data.data : [];
    const hotelsData = response?.data?.hotels || []; // tableau enrichi pour AI search

    console.log(`✅ ${ratesData.length} tarifs trouvés`);
    console.log(`✅ ${hotelsData.length} hôtels enrichis (IA)`);

    // 4. Fonction utilitaire pour récupérer les détails complets d'un hôtel
    async function getHotelDetailsFull(hotelId) {
      try {
        const details = await sdk.getHotelDetails(hotelId, 10); // timeout 10s
        return details.data;
      } catch (err) {
        console.log(`⚠️ Échec pour l'hôtel ${hotelId}: ${err.message}`);
        return null;
      }
    }

    // 5. Fonction pour extraire la photo principale
    function getMainPhoto(hotelObj) {
      if (hotelObj.main_photo) return hotelObj.main_photo;
      if (hotelObj.hotelImages && hotelObj.hotelImages.length > 0) {
        return hotelObj.hotelImages[0].url || '';
      }
      return '';
    }

    // 6. Construction de la liste finale des hôtels
    let hotels = [];

    if (aiSearch && hotelsData.length > 0) {
      // Cas AI : on utilise les données enrichies du tableau `hotels`
      hotels = hotelsData.map((hotel) => {
        const rateData = ratesData.find((r) => r.hotelId === hotel.id);
        let minPrice = 0, currency = 'USD', offerId = null;
        let roomName = 'Chambre standard', boardName = 'Non spécifié', refundable = false;

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
          main_photo: getMainPhoto(hotel),
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
      // Cas standard (placeId ou hotelId) : on enrichit chaque hôtel avec getHotelDetails
      // si les données de rateData.hotel sont insuffisantes
      const hotelPromises = ratesData.map(async (rateData) => {
        const hotelId = rateData.hotelId;
        let hotelDetails = null;

        // On regarde d'abord ce que contient rateData.hotel
        if (rateData.hotel && rateData.hotel.name) {
          hotelDetails = rateData.hotel;
        } else {
          // Si absent, on appelle getHotelDetails
          hotelDetails = await getHotelDetailsFull(hotelId);
        }

        const firstRoom = rateData.roomTypes?.[0];
        const rate = firstRoom?.rates?.[0];
        const main_photo = getMainPhoto(hotelDetails || rateData.hotel || {});

        return {
          id: hotelId,
          name: hotelDetails?.name || rateData.hotel?.name || 'Hôtel sans nom',
          address: hotelDetails?.address || rateData.hotel?.address || '',
          city: hotelDetails?.city || rateData.hotel?.city || '',
          country: hotelDetails?.country || rateData.hotel?.country || '',
          main_photo: main_photo,
          rating: hotelDetails?.rating || rateData.hotel?.rating || 0,
          reviewCount: hotelDetails?.reviewCount || rateData.hotel?.reviewCount || 0,
          starRating: hotelDetails?.starRating || rateData.hotel?.starRating || 0,
          minPrice: rate?.retailRate?.total?.[0]?.amount || 0,
          currency: rate?.retailRate?.total?.[0]?.currency || 'USD',
          offerId: firstRoom?.offerId || null,
          roomName: rate?.name || 'Chambre standard',
          boardName: rate?.boardName || 'Non spécifié',
          refundable: rate?.cancellationPolicies?.refundableTag === 'RFN',
          tags: hotelDetails?.tags || [],
          persona: hotelDetails?.persona || '',
          style: hotelDetails?.style || '',
          location_type: hotelDetails?.location_type || '',
          story: hotelDetails?.story || ''
        };
      });

      hotels = await Promise.all(hotelPromises);
    }

    // 7. Filtrer ceux sans prix et limiter le nombre
    hotels = hotels.filter(h => h.minPrice > 0);
    if (limit && hotels.length > limit) {
      hotels = hotels.slice(0, limit);
    }

    console.log(`✅ ${hotels.length} hôtels retournés avec données complètes`);

    res.json({
      success: true,
      hotels: hotels,
      total: hotels.length,
      aiSearch: aiSearch || false
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
