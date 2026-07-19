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
// 1. RECHERCHE HÔTELS - AVEC LOGS DÉTAILLÉS
// ============================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS ===== 🔍");
  const { checkin, checkout, adults, city, countryCode, environment, limit = 200 } = req.query;
  const apiKey = environment == "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`📍 Ville: ${city}, Pays: ${countryCode}`);
  console.log(`📅 Arrivée: ${checkin}, Départ: ${checkout}`);
  console.log(`👤 Adultes: ${adults}`);

  try {
    console.log(`⏳ Recherche des tarifs pour ${city}...`);
    
    const response = await sdk.getFullRates({
      countryCode: countryCode || "CD",
      cityName: city,
      checkin: checkin,
      checkout: checkout,
      currency: "USD",
      guestNationality: "US",
      occupancies: [{ adults: parseInt(adults, 10) }],
      limit: parseInt(limit),
      maxRatesPerHotel: 1,
      timeout: 8,
      includeHotelData: true
    });

    // 🔍 LOGS ULTRA-DÉTAILLÉS
    console.log('📦 === RÉPONSE COMPLÈTE DE LITEAPI ===');
    console.log('📦 Type de response:', typeof response);
    console.log('📦 Clés de response:', Object.keys(response));
    console.log('📦 response.status:', response.status);
    console.log('📦 Type de response.data:', typeof response.data);
    console.log('📦 response.data complet:', JSON.stringify(response.data, null, 2).substring(0, 2000));
    
    // ✅ Extraction des données - TEST DE TOUTES LES STRUCTURES POSSIBLES
    let data = [];
    let extractionMethod = 'aucune';
    
    if (response.data) {
      // Structure 1: response.data est un tableau
      if (Array.isArray(response.data)) {
        data = response.data;
        extractionMethod = 'response.data est un tableau';
        console.log(`✅ ${extractionMethod} avec ${data.length} éléments`);
      } 
      // Structure 2: response.data.data est un tableau
      else if (response.data.data && Array.isArray(response.data.data)) {
        data = response.data.data;
        extractionMethod = 'response.data.data est un tableau';
        console.log(`✅ ${extractionMethod} avec ${data.length} éléments`);
      }
      // Structure 3: response.data.hotels est un tableau
      else if (response.data.hotels && Array.isArray(response.data.hotels)) {
        data = response.data.hotels;
        extractionMethod = 'response.data.hotels est un tableau';
        console.log(`✅ ${extractionMethod} avec ${data.length} éléments`);
      }
      // Structure 4: response.data.results est un tableau
      else if (response.data.results && Array.isArray(response.data.results)) {
        data = response.data.results;
        extractionMethod = 'response.data.results est un tableau';
        console.log(`✅ ${extractionMethod} avec ${data.length} éléments`);
      }
      // Structure 5: response.data.items est un tableau
      else if (response.data.items && Array.isArray(response.data.items)) {
        data = response.data.items;
        extractionMethod = 'response.data.items est un tableau';
        console.log(`✅ ${extractionMethod} avec ${data.length} éléments`);
      }
      // Structure 6: Si c'est un objet unique
      else if (response.data.hotelId || response.data.hotel || response.data.id) {
        data = [response.data];
        extractionMethod = 'objet unique transformé en tableau';
        console.log(`✅ ${extractionMethod} avec ${data.length} élément`);
      }
      // Structure 7: Parcourir toutes les clés pour trouver un tableau
      else {
        console.log('🔍 Recherche d\'un tableau dans les propriétés de response.data...');
        for (let key in response.data) {
          if (Array.isArray(response.data[key]) && response.data[key].length > 0) {
            data = response.data[key];
            extractionMethod = `response.data.${key} est un tableau`;
            console.log(`✅ ${extractionMethod} avec ${data.length} éléments`);
            break;
          }
        }
      }
    }

    console.log(`📊 Données extraites: ${data.length} éléments (méthode: ${extractionMethod})`);

    // Si data est vide, essayer de récupérer depuis response directement
    if (data.length === 0 && response.hotels) {
      data = response.hotels;
      console.log(`🔄 Tentative avec response.hotels: ${data.length} éléments`);
    }

    // 🔍 LOG DU PREMIER ÉLÉMENT POUR VOIR SA STRUCTURE
    if (data.length > 0) {
      console.log('📦 === STRUCTURE DU PREMIER HÔTEL ===');
      console.log('🔑 Clés:', Object.keys(data[0]));
      console.log('📄 Contenu:', JSON.stringify(data[0], null, 2).substring(0, 500));
      
      // Vérifier si hotel existe
      if (data[0].hotel) {
        console.log('🏨 Clés de hotel:', Object.keys(data[0].hotel));
        console.log('🏨 hotel.name:', data[0].hotel.name);
        console.log('🏨 hotel.main_photo:', data[0].hotel.main_photo);
      }
    }

    // Enrichir chaque hôtel
    const hotels = data.map(function(hotel, index) {
      // 🔍 Log pour chaque hôtel
      console.log(`\n🏨 HÔTEL #${index + 1}:`);
      console.log(`  - hotelId: ${hotel.hotelId || hotel.id || 'NON TROUVÉ'}`);
      console.log(`  - hotel existe? ${!!hotel.hotel}`);
      console.log(`  - hotel.name: ${hotel.hotel?.name || hotel.name || 'NON TROUVÉ'}`);
      console.log(`  - hotel.main_photo: ${hotel.hotel?.main_photo || hotel.main_photo || 'NON TROUVÉ'}`);
      console.log(`  - roomTypes: ${hotel.roomTypes?.length || 0} chambres`);
      
      const bestRate = hotel.roomTypes?.[0]?.rates?.[0];
      
      // Construction de l'objet hôtel avec toutes les possibilités
      return {
        id: hotel.hotelId || hotel.id || `hotel-${index}`,
        // Essayer plusieurs chemins pour le nom
        name: hotel.hotel?.name || hotel.name || hotel.hotelName || hotel.hotel_name || 'Hôtel sans nom',
        // Essayer plusieurs chemins pour l'adresse
        address: hotel.hotel?.address || hotel.address || hotel.hotelAddress || '',
        // Essayer plusieurs chemins pour la ville
        city: hotel.hotel?.city || hotel.city || hotel.hotelCity || city,
        // Essayer plusieurs chemins pour le pays
        country: hotel.hotel?.country || hotel.country || hotel.hotelCountry || countryCode,
        // Essayer plusieurs chemins pour la photo principale
        main_photo: hotel.hotel?.main_photo || hotel.main_photo || hotel.mainPhoto || hotel.image || hotel.photo || hotel.hotelImage || '',
        // Essayer plusieurs chemins pour la note
        rating: hotel.hotel?.rating || hotel.rating || hotel.hotelRating || 0,
        // Essayer plusieurs chemins pour le nombre d'avis
        reviewCount: hotel.hotel?.reviewCount || hotel.reviewCount || hotel.review_count || 0,
        // Essayer plusieurs chemins pour le nombre d'étoiles
        starRating: hotel.hotel?.starRating || hotel.starRating || hotel.star_rating || hotel.rating || 0,
        // Prix minimum
        minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
        currency: bestRate?.retailRate?.total?.[0]?.currency || 'USD',
        offerId: hotel.roomTypes?.[0]?.offerId || null,
        roomName: bestRate?.name || 'Chambre standard',
        refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN'
      };
    });

    // Filtrer les hôtels sans prix
    const validHotels = hotels.filter(h => h.minPrice > 0);
    
    console.log(`\n📊 RÉSULTAT FINAL:`);
    console.log(`  - Total hôtels extraits: ${data.length}`);
    console.log(`  - Hôtels avec prix: ${validHotels.length}`);
    console.log(`  - Premier hôtel: ${validHotels[0]?.name || 'AUCUN'}`);
    console.log(`  - Photo: ${validHotels[0]?.main_photo || 'AUCUNE'}`);

    res.json({ 
      success: true,
      hotels: validHotels.length > 0 ? validHotels : hotels.filter(h => h.id !== 'N/A'),
      total: validHotels.length > 0 ? validHotels.length : hotels.length,
      rawTotal: data.length,
      extractionMethod: extractionMethod,
      debug: {
        firstHotel: data.length > 0 ? {
          keys: Object.keys(data[0]),
          hasHotel: !!data[0].hotel,
          hotelKeys: data[0].hotel ? Object.keys(data[0].hotel) : []
        } : null
      }
    });
  } catch (error) {
    console.error("❌ Error searching for hotels:", error);
    console.error("📦 Détails:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    res.status(500).json({ 
      success: false,
      error: "Internal server error", 
      message: error.message
    });
  }
});

// ============================================
// 2. TARIFS DÉTAILLÉS HÔTEL
// ============================================
app.get("/search-rates", async (req, res) => {
  console.log("\n💰 ===== SEARCH RATES ===== 💰");
  const { checkin, checkout, adults, hotelId, environment, maxRates = 20 } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`🏨 Hotel ID: ${hotelId}`);
  console.log(`📅 Arrivée: ${checkin}, Départ: ${checkout}`);
  console.log(`👤 Adultes: ${adults}`);

  try {
    console.log(`⏳ Récupération des tarifs pour l'hôtel ${hotelId}...`);
    
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
    if (response.data && typeof response.data === 'object') {
      if (response.data.data && Array.isArray(response.data.data)) {
        rates = response.data.data;
      } else if (Array.isArray(response.data)) {
        rates = response.data;
      } else if (response.data.hotels && Array.isArray(response.data.hotels)) {
        rates = response.data.hotels;
      }
    }

    console.log(`✅ ${rates.length} hôtels dans la réponse`);

    if (rates.length === 0) {
      return res.json({ 
        success: false,
        error: "No availability found" 
      });
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

    console.log(`✅ ${rateInfo.length} tarifs disponibles`);
    console.log(`💰 Prix minimum: $${minPrice}`);

    res.json({ 
      success: true,
      hotelInfo: {
        id: hotel.hotelId,
        name: hotelInfo.name,
        address: hotelInfo.address,
        city: hotelInfo.city,
        country: hotelInfo.country,
        starRating: hotelInfo.starRating,
        rating: hotelInfo.rating,
        main_photo: hotelInfo.main_photo
      },
      rateInfo: rateInfo,
      minPrice: minPrice
    });
  } catch (error) {
    console.error("❌ Error fetching rates:", error);
    res.status(500).json({ 
      success: false,
      error: "No availability found",
      message: error.message
    });
  }
});

// ============================================
// 3. PRÉ-RÉSERVATION HÔTEL
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
  console.log(`🎫 Voucher: ${voucherCode || 'Aucun'}`);

  const bodyData = {
    offerId: offerId,
    usePaymentSdk: true,
  };

  if (voucherCode) {
    bodyData.voucherCode = voucherCode;
  }

  try {
    console.log(`⏳ Pré-réservation en cours...`);
    const response = await sdk.preBook(bodyData);
    
    console.log(`✅ Pré-réservation réussie!`);
    console.log(`🆔 Prebook ID: ${response.data?.prebookId}`);
    
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
// 4. RÉSERVATION FINALE HÔTEL
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
    environment 
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

  console.log(`🆔 Prebook ID: ${prebookId}`);
  console.log(`👤 Guest: ${guestFirstName} ${guestLastName}`);
  console.log(`📧 Email: ${guestEmail}`);
  console.log(`📱 Phone: ${guestPhone}`);
  console.log(`💳 Transaction ID: ${transactionId}`);

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
        occupancyNumber: 1,
        remarks: "",
        firstName: guestFirstName,
        lastName: guestLastName,
        email: guestEmail
      }
    ]
  };

  console.log(`📦 Données de réservation:`, JSON.stringify(bodyData, null, 2));

  try {
    console.log(`⏳ Réservation en cours...`);
    const response = await sdk.book(bodyData);
    
    console.log(`✅ Réservation réussie!`);
    console.log(`🆔 Booking ID: ${response.data?.bookingId}`);
    
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
// 5. RECHERCHE VOLS
// ============================================
app.post("/search-flights", async (req, res) => {
  console.log("\n✈️ ===== SEARCH FLIGHTS ===== ✈️");
  const { legs, adults, children, infants, currency, country, cabinClass, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`📍 Itinéraire:`, JSON.stringify(legs, null, 2));
  console.log(`👤 Adultes: ${adults}, Enfants: ${children}, Bébés: ${infants}`);

  try {
    console.log(`⏳ Recherche de vols...`);
    const response = await sdk.searchFlights({
      legs: legs,
      adults: adults || 1,
      children: children || 0,
      infants: infants || 0,
      currency: currency || "USD",
      country: country || "US",
      cabinClass: cabinClass || "ECONOMY"
    });

    const journeys = response.data?.[0]?.journeys || [];
    console.log(`✅ ${journeys.length} voyages trouvés`);
    
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
// 6. VÉRIFICATION VOL
// ============================================
app.post("/verify-flight", async (req, res) => {
  console.log("\n🔎 ===== VERIFY FLIGHT ===== 🔎");
  const { offerId, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`🆔 Offer ID: ${offerId}`);

  try {
    console.log(`⏳ Vérification de l'offre...`);
    const response = await sdk.verifyFlight({ offerId });
    console.log(`✅ Offre vérifiée avec succès`);
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
// 7. PRÉ-RÉSERVATION VOL
// ============================================
app.post("/prebook-flight", async (req, res) => {
  console.log("\n📋 ===== PREBOOK FLIGHT ===== 📋");
  const { offerId, contact, passengers, usePaymentSdk, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`🆔 Offer ID: ${offerId}`);
  console.log(`👤 Contact: ${contact?.firstName} ${contact?.lastName}`);

  try {
    console.log(`⏳ Pré-réservation du vol...`);
    const response = await sdk.prebookFlight({
      offerId: offerId,
      usePaymentSdk: usePaymentSdk !== undefined ? usePaymentSdk : true,
      contact: contact,
      passengers: passengers
    });

    console.log(`✅ Pré-réservation réussie!`);
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
// 8. RÉSERVATION FINALE VOL
// ============================================
app.post("/book-flight", async (req, res) => {
  console.log("\n📝 ===== BOOK FLIGHT ===== 📝");
  const { prebookId, transactionId, method, environment } = req.body;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`🆔 Prebook ID: ${prebookId}`);
  console.log(`💳 Transaction ID: ${transactionId}`);

  try {
    console.log(`⏳ Réservation du vol...`);
    const response = await sdk.bookFlight({
      prebookId: prebookId,
      payment: {
        method: method || "TRANSACTION_ID",
        transactionId: transactionId
      }
    });

    console.log(`✅ Réservation réussie!`);
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
// 9. DÉTAILS HÔTEL
// ============================================
app.get("/hotel-details", async (req, res) => {
  console.log("\n🏨 ===== HOTEL DETAILS ===== 🏨");
  const { hotelId, timeout = 8, environment } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`🆔 Hotel ID: ${hotelId}`);

  try {
    console.log(`⏳ Récupération des détails...`);
    const response = await sdk.getHotelDetails(hotelId, timeout);
    const hotel = response.data;

    console.log(`🏨 Hôtel: ${hotel.name}`);
    console.log(`🛏️ Chambres: ${hotel.rooms?.length || 0}`);

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
// 10. AVIS HÔTEL
// ============================================
app.get("/hotel-reviews", async (req, res) => {
  console.log("\n⭐ ===== HOTEL REVIEWS ===== ⭐");
  const { hotelId, timeout = 8, environment } = req.query;
  const apiKey = environment === "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`🆔 Hotel ID: ${hotelId}`);

  try {
    console.log(`⏳ Récupération des avis...`);
    const response = await sdk.getHotelReviews(hotelId, timeout);
    console.log(`✅ ${response.data?.length || 0} avis récupérés`);
    
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
  res.status(404).json({ 
    success: false,
    error: "Route not found" 
  });
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
  console.log(`   🔍 GET  /search-hotels     - Hôtels`);
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
