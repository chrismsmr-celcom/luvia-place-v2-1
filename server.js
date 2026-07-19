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
// RECHERCHE HÔTELS - VERSION GET (pour compatibilité frontend)
// ============================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS (GET) ===== 🔍");
  
  const {
    checkin,
    checkout,
    adults = 2,
    placeId,
    hotelId,
    aiSearch,
    environment,
    maxRatesPerHotel = 100, // CHANGÉ: 10 au lieu de 1 pour obtenir plus de données
    includeHotelData = true,
    roomMapping = true,
    currency = "USD",
    guestNationality = "US",
    limit = 1200
  } = req.query;

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
    const requestBody = {
      occupancies: [{ adults: parseInt(adults, 10) }],
      currency: currency,
      guestNationality: guestNationality,
      checkin: checkin,
      checkout: checkout,
      maxRatesPerHotel: parseInt(maxRatesPerHotel, 10),
      roomMapping: roomMapping === "true" || roomMapping === true,
      includeHotelData: includeHotelData === "true" || includeHotelData === true,
      timeout: 8
    };

    if (aiSearch) {
      requestBody.aiSearch = aiSearch;
      console.log(`🔍 Recherche IA: "${aiSearch}"`);
    } else if (placeId) {
      requestBody.placeId = placeId;
      console.log(`📍 Recherche par lieu: ${placeId}`);
    } else if (hotelId) {
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

    // NOUVEAU: Si on a des hôtels dans ratesData, on va chercher leurs détails complets
    let hotels = [];
    
    // Fonction pour récupérer les détails complets d'un hôtel
    async function getHotelDetails(hotelId) {
      try {
        const details = await sdk.getHotelDetails(hotelId, 4);
        return details.data;
      } catch (err) {
        console.log(`⚠️ Impossible de récupérer les détails pour l'hôtel ${hotelId}`);
        return null;
      }
    }

    // Récupérer les détails pour chaque hôtel
    const hotelDetailsPromises = ratesData.map(async (rateData) => {
      const hotelId = rateData.hotelId;
      let hotelDetails = null;
      
      // Essayer d'abord d'utiliser les données de l'IA si disponibles
      if (aiSearch && hotelsData.length > 0) {
        const aiHotel = hotelsData.find((h) => h.id === hotelId);
        if (aiHotel) {
          hotelDetails = aiHotel;
        }
      }
      
      // Si pas de données IA, essayer de récupérer depuis rateData.hotel
      if (!hotelDetails && rateData.hotel && rateData.hotel.name) {
        hotelDetails = rateData.hotel;
      }
      
      // Si toujours pas de données, faire un appel API séparé
      if (!hotelDetails || !hotelDetails.name) {
        hotelDetails = await getHotelDetails(hotelId);
      }
      
      const firstRoom = rateData.roomTypes?.[0];
      const rate = firstRoom?.rates?.[0];
      
      return {
        id: hotelId,
        name: hotelDetails?.name || rateData.hotel?.name || 'Hôtel sans nom',
        address: hotelDetails?.address || rateData.hotel?.address || '',
        city: hotelDetails?.city || rateData.hotel?.city || '',
        country: hotelDetails?.country || rateData.hotel?.country || '',
        main_photo: hotelDetails?.main_photo || hotelDetails?.hotelImages?.[0]?.url || rateData.hotel?.main_photo || '',
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
        story: hotelDetails?.story || '',
        description: hotelDetails?.hotelDescription || hotelDetails?.description || ''
      };
    });

    hotels = await Promise.all(hotelDetailsPromises);

    // Filtrer les hôtels sans prix
    hotels = hotels.filter(h => h.minPrice > 0);

    // Limiter le nombre de résultats
    if (limit && hotels.length > limit) {
      hotels = hotels.slice(0, limit);
    }

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
// RECHERCHE HÔTELS - VERSION POST (conforme documentation)
// ============================================
app.post("/search-hotels", async (req, res) => {
  // Rediriger vers la version GET pour simplifier
  const queryString = new URLSearchParams(req.body).toString();
  const url = `/search-hotels?${queryString}`;
  req.url = url;
  req.method = 'GET';
  return app._router.handle(req, res);
});

// ============================================
// RECHERCHE HÔTELS - VERSION POST (CORRIGÉE)
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
    maxRatesPerHotel = 10,
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
    // Construction du corps de la requête LiteAPI
    const requestBody = {
      occupancies: [{ adults: parseInt(adults, 10) }],
      currency: currency,
      guestNationality: guestNationality,
      checkin: checkin,
      checkout: checkout,
      maxRatesPerHotel: parseInt(maxRatesPerHotel, 10),
      roomMapping: roomMapping === "true" || roomMapping === true,
      includeHotelData: includeHotelData === "true" || includeHotelData === true,
      timeout: 8
    };

    // Ajout du critère de recherche
    if (aiSearch) {
      requestBody.aiSearch = aiSearch;
      console.log(`🔍 Recherche IA: "${aiSearch}"`);
    } else if (placeId) {
      requestBody.placeId = placeId;
      console.log(`📍 Recherche par lieu: ${placeId}`);
    } else if (hotelId) {
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
    const ratesData = Array.isArray(response?.data?.data) ? response.data.data : [];
    const hotelsData = response?.data?.hotels || [];

    console.log(`✅ ${ratesData.length} tarifs trouvés`);
    console.log(`✅ ${hotelsData.length} hôtels enrichis (IA)`);

    // Fonction pour récupérer la meilleure image
    function getMainPhoto(hotelObj) {
      if (hotelObj.main_photo) return hotelObj.main_photo;
      if (hotelObj.hotelImages && hotelObj.hotelImages.length > 0) {
        return hotelObj.hotelImages[0].url || '';
      }
      return '';
    }

    let hotels = [];

    if (aiSearch && hotelsData.length > 0) {
      // Cas AI : on utilise les données enrichies du tableau `hotels`
      hotels = hotelsData.map((hotel) => {
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
      // Cas standard (placeId ou hotelId)
      hotels = ratesData.map((rateData) => {
        const hotel = rateData.hotel || {};
        const firstRoom = rateData.roomTypes?.[0];
        const rate = firstRoom?.rates?.[0];
        const main_photo = getMainPhoto(hotel);

        return {
          id: rateData.hotelId,
          name: hotel.name || 'Hôtel sans nom',
          address: hotel.address || '',
          city: hotel.city || '',
          country: hotel.country || '',
          main_photo: main_photo,
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

    // Filtrer ceux avec un prix > 0 et limiter le nombre
    hotels = hotels.filter(h => h.minPrice > 0);
    if (limit && hotels.length > limit) {
      hotels = hotels.slice(0, limit);
    }

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

    // ------------------------------------------------------------
    // 1. Construire hotelInfo à partir du premier hôtel trouvé
    // ------------------------------------------------------------
    const firstHotel = ratesData[0];
    const hotelIdFromFirst = firstHotel.hotelId;

    // Essayer de trouver les données enrichies dans hotelsData
    let enrichedHotel = hotelsData.find(h => h.id === hotelIdFromFirst) || null;

    // Si on a un hotelId spécifique, on peut aussi faire un appel /data/hotel pour avoir tout
    // mais on va se contenter des données déjà présentes
    const hotelFromRate = firstHotel.hotel || {};

    // Construire l'objet hotelInfo final
    const hotelInfo = {
      id: hotelIdFromFirst,
      name: enrichedHotel?.name || hotelFromRate.name || "Hôtel sans nom",
      address: enrichedHotel?.address || hotelFromRate.address || "",
      city: enrichedHotel?.city || hotelFromRate.city || "",
      country: enrichedHotel?.country || hotelFromRate.country || "",
      starRating: enrichedHotel?.starRating || hotelFromRate.starRating || 0,
      rating: enrichedHotel?.rating || hotelFromRate.rating || 0,
      reviewCount: enrichedHotel?.reviewCount || hotelFromRate.reviewCount || 0,
      // Priorité : main_photo de l'enrichi, puis hotelFromRate.main_photo, puis première image de hotelImages
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

    // ------------------------------------------------------------
    // 2. Construire rateInfo : tous les tarifs de tous les hôtels
    //    (pour l'affichage en liste, on va prendre les tarifs du premier hôtel)
    //    Mais le frontend actuel attend rateInfo pour un seul hôtel,
    //    donc on prend les tarifs du premier.
    // ------------------------------------------------------------
    const rateInfo = [];

    // Parcourir les roomTypes du premier hôtel
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

    // ------------------------------------------------------------
    // 3. Réponse finale
    // ------------------------------------------------------------
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

  const bodyData = {
    offerId: offerId,
    usePaymentSdk: true,
  };

  if (voucherCode) {
    bodyData.voucherCode = voucherCode;
  }

  try {
    const response = await sdk.preBook(bodyData);
    res.json({ 
      success: true, 
      data: response.data 
    });
  } catch (err) {
    console.error("❌ Prebook error:", err);
    res.status(500).json({ 
      success: false,
      error: "Prebook failed",
      message: err.message
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
    res.status(500).json({ 
      success: false,
      error: "Booking failed",
      message: err.message
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
  console.log(`   🔍 GET  /search-hotels      - Recherche hôtels (GET)`);
  console.log(`   🔍 POST /search-hotels      - Recherche hôtels (POST)`);
  console.log(`   💰 GET  /search-rates       - Tarifs détaillés (GET)`);
  console.log(`   💰 POST /search-rates       - Tarifs détaillés (POST)`);
  console.log(`   📋 POST /prebook            - Pré-réservation hôtel`);
  console.log(`   📝 POST /book               - Réservation hôtel`);
  console.log(`   🏨 GET  /hotel-details      - Détails hôtel`);
  console.log(`   ⭐ GET  /hotel-reviews      - Avis hôtel`);
  console.log(`   ✈️ POST /search-flights     - Recherche vols`);
  console.log(`   ✈️ POST /prebook-flight     - Pré-réservation vol`);
  console.log(`   ✈️ POST /book-flight        - Réservation vol`);
  console.log(`\n✅ Serveur prêt !\n`);
});
