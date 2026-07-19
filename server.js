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
// FONCTION UTILITAIRE : Décoder la clé "et"
// ============================================
function decodeHotelData(encodedData) {
  if (!encodedData || typeof encodedData !== 'string') return null;
  try {
    // La clé "et" contient des données encodées en base64
    const decoded = Buffer.from(encodedData, 'base64').toString('utf-8');
    // Essayer de parser en JSON
    try {
      return JSON.parse(decoded);
    } catch {
      // Si ce n'est pas du JSON, retourner la chaîne décodée
      return decoded;
    }
  } catch (error) {
    console.warn('⚠️ Erreur de décodage de "et":', error.message);
    return null;
  }
}

// ============================================
// 1. RECHERCHE HÔTELS - CORRIGÉ
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
      countryCode: countryCode || "FR",
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

    // Extraction des données
    let data = [];
    if (response.data && typeof response.data === 'object') {
      if (response.data.data && Array.isArray(response.data.data)) {
        data = response.data.data;
      } else if (Array.isArray(response.data)) {
        data = response.data;
      } else if (response.data.hotels && Array.isArray(response.data.hotels)) {
        data = response.data.hotels;
      }
    }

    console.log(`✅ ${data.length} hôtels trouvés`);

    // Afficher la structure du premier hôtel pour debug
    if (data.length > 0) {
      const first = data[0];
      console.log('📦 Clés du premier hôtel:', Object.keys(first));
      console.log('📦 Contenu de "et":', first.et ? first.et.substring(0, 200) : 'NON TROUVÉ');
    }

    const hotels = data.map(function(hotel, index) {
      const bestRate = hotel.roomTypes?.[0]?.rates?.[0];
      
      // 🔍 DÉCODER LA CLÉ "et" QUI CONTIENT LES INFOS DE L'HÔTEL
      let hotelInfo = null;
      let hotelName = 'Hôtel sans nom';
      let hotelAddress = '';
      let hotelCity = city;
      let hotelCountry = countryCode;
      let hotelPhoto = '';
      let hotelRating = 0;
      let hotelStarRating = 0;
      let hotelReviewCount = 0;

      // Décoder "et" si présent
      if (hotel.et) {
        try {
          const decoded = decodeHotelData(hotel.et);
          console.log(`🏨 Hôtel #${index + 1} - "et" décodé:`, decoded);
          
          if (typeof decoded === 'object') {
            hotelInfo = decoded;
            
            // Extraire le nom
            hotelName = hotelInfo.name || 
                       hotelInfo.hotelName || 
                       hotelInfo.hotel_name || 
                       hotelInfo.title ||
                       hotelInfo.fullName ||
                       hotelInfo.establishmentName ||
                       hotelInfo['Hotel Name'] ||
                       'Hôtel sans nom';
            
            // Extraire l'adresse
            hotelAddress = hotelInfo.address || 
                          hotelInfo.streetAddress || 
                          hotelInfo.street ||
                          hotelInfo.addressLine1 ||
                          hotelInfo.location?.address ||
                          '';
            
            // Extraire la ville
            hotelCity = hotelInfo.city || 
                       hotelInfo.location?.city || 
                       hotelInfo.hotelCity ||
                       city;
            
            // Extraire le pays
            hotelCountry = hotelInfo.country || 
                          hotelInfo.location?.country || 
                          hotelInfo.hotelCountry ||
                          countryCode;
            
            // Extraire la photo
            hotelPhoto = hotelInfo.main_photo || 
                        hotelInfo.mainPhoto || 
                        hotelInfo.image || 
                        hotelInfo.photo || 
                        hotelInfo.picture ||
                        hotelInfo.images?.[0] ||
                        hotelInfo.photos?.[0] ||
                        '';
            
            // Extraire la note
            hotelRating = parseFloat(hotelInfo.rating || hotelInfo.score || hotelInfo.averageRating || 0);
            
            // Extraire le nombre d'étoiles
            hotelStarRating = parseFloat(hotelInfo.starRating || hotelInfo.stars || hotelInfo.star_rating || 0);
            
            // Extraire le nombre d'avis
            hotelReviewCount = parseInt(hotelInfo.reviewCount || hotelInfo.review_count || hotelInfo.totalReviews || 0);
          } else if (typeof decoded === 'string') {
            // Si c'est une chaîne, essayer d'en extraire des infos
            hotelName = decoded.substring(0, 100) || 'Hôtel sans nom';
          }
        } catch (error) {
          console.warn(`⚠️ Erreur de décodage pour l'hôtel #${index + 1}:`, error.message);
        }
      }

      // 🔍 SI "et" n'a pas donné de nom, chercher ailleurs
      if (hotelName === 'Hôtel sans nom') {
        const fallbackNames = [
          hotel.name,
          hotel.hotelName,
          hotel.hotel_name,
          hotel.title,
          hotel.hotel?.name,
          hotel.hotel?.hotelName
        ];
        for (let name of fallbackNames) {
          if (name && typeof name === 'string' && name.trim().length > 0) {
            hotelName = name.trim();
            break;
          }
        }
      }

      // 🔍 SI "et" n'a pas donné de photo, chercher ailleurs
      if (!hotelPhoto) {
        const fallbackPhotos = [
          hotel.main_photo,
          hotel.mainPhoto,
          hotel.photo,
          hotel.image,
          hotel.hotel?.main_photo,
          hotel.hotel?.mainPhoto
        ];
        for (let photo of fallbackPhotos) {
          if (photo && typeof photo === 'string' && photo.trim().length > 0) {
            hotelPhoto = photo.trim();
            break;
          }
        }
      }

      // Si pas de photo, générer une URL placeholder
      if (!hotelPhoto) {
        hotelPhoto = `https://picsum.photos/seed/${hotel.hotelId || hotel.id || index}/460/380`;
      }

      // Log pour le premier hôtel
      if (index === 0) {
        console.log(`🏨 PREMIER HÔTEL EXTRAIT:`);
        console.log(`  - ID: ${hotel.hotelId || hotel.id}`);
        console.log(`  - Nom trouvé: "${hotelName}"`);
        console.log(`  - Photo trouvée: "${hotelPhoto}"`);
        console.log(`  - Adresse: "${hotelAddress}"`);
        console.log(`  - Note: ${hotelRating}`);
        console.log(`  - Étoiles: ${hotelStarRating}`);
        console.log(`  - Prix: ${bestRate?.retailRate?.total?.[0]?.amount || 0}`);
        if (hotelInfo) {
          console.log(`  - Infos décodées:`, Object.keys(hotelInfo));
        }
      }

      return {
        id: hotel.hotelId || hotel.id || `hotel-${index}`,
        name: hotelName,
        address: hotelAddress || hotel.city || city,
        city: hotelCity,
        country: hotelCountry,
        main_photo: hotelPhoto,
        rating: hotelRating || 0,
        reviewCount: hotelReviewCount || 0,
        starRating: hotelStarRating || 0,
        minPrice: bestRate?.retailRate?.total?.[0]?.amount || 0,
        currency: bestRate?.retailRate?.total?.[0]?.currency || 'USD',
        offerId: hotel.roomTypes?.[0]?.offerId || null,
        roomName: bestRate?.name || 'Chambre standard',
        refundable: bestRate?.cancellationPolicies?.refundableTag === 'RFN',
        // Debug: garder les infos décodées pour le développement
        _debug: hotelInfo ? {
          keys: Object.keys(hotelInfo),
          name: hotelInfo.name,
          photo: hotelInfo.main_photo || hotelInfo.image
        } : null
      };
    });

    // Filtrer les hôtels sans prix
    const validHotels = hotels.filter(h => h.minPrice > 0);
    
    console.log(`\n📊 RÉSULTAT FINAL:`);
    console.log(`  - Total hôtels extraits: ${data.length}`);
    console.log(`  - Hôtels avec prix: ${validHotels.length}`);
    if (validHotels.length > 0) {
      console.log(`  - Premier hôtel: "${validHotels[0].name}"`);
      console.log(`  - Photo: ${validHotels[0].main_photo}`);
    }

    res.json({ 
      success: true,
      hotels: validHotels.length > 0 ? validHotels : hotels,
      total: validHotels.length > 0 ? validHotels.length : hotels.length,
      rawTotal: data.length
    });
  } catch (error) {
    console.error("❌ Error searching for hotels:", error);
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
    
    // Décoder "et" si présent pour obtenir les infos de l'hôtel
    let hotelName = 'Hôtel sans nom';
    let hotelPhoto = '';
    if (hotel.et) {
      try {
        const decoded = decodeHotelData(hotel.et);
        if (typeof decoded === 'object') {
          hotelName = decoded.name || decoded.hotelName || hotelName;
          hotelPhoto = decoded.main_photo || decoded.mainPhoto || decoded.image || decoded.photo || '';
        }
      } catch (error) {
        console.warn('⚠️ Erreur de décodage de "et" dans search-rates:', error.message);
      }
    }
    
    // Fallback
    if (hotelName === 'Hôtel sans nom') {
      hotelName = hotel.hotel?.name || hotel.name || hotelName;
    }
    if (!hotelPhoto) {
      hotelPhoto = hotel.hotel?.main_photo || hotel.main_photo || '';
    }

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
        name: hotelName,
        address: hotelInfo.address || hotel.address || '',
        city: hotelInfo.city || hotel.city || '',
        country: hotelInfo.country || hotel.country || '',
        starRating: hotelInfo.starRating || hotel.starRating || 0,
        rating: hotelInfo.rating || hotel.rating || 0,
        main_photo: hotelPhoto || hotelInfo.main_photo || hotel.main_photo || ''
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
// FONCTION DE DÉCODAGE (exposée pour les autres routes)
// ============================================
function decodeHotelData(encodedData) {
  if (!encodedData || typeof encodedData !== 'string') return null;
  try {
    const decoded = Buffer.from(encodedData, 'base64').toString('utf-8');
    try {
      return JSON.parse(decoded);
    } catch {
      return decoded;
    }
  } catch (error) {
    return null;
  }
}

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
