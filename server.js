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
// 1. RECHERCHE HÔTELS - AVEC PLACE ID (COMME LE WHITELABEL)
// ============================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS (AVEC PLACE ID) ===== 🔍");
  const { 
    checkin, 
    checkout, 
    adults, 
    placeId,        // ← PRIORITAIRE
    city,           // ← Fallback pour géocodage
    environment, 
    limit = 500 
  } = req.query;
  
  const apiKey = environment == "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`📍 Place ID fourni: ${placeId || 'NON'}`);
  console.log(`📍 Ville: ${city || 'NON'}`);
  console.log(`📅 Arrivée: ${checkin}, Départ: ${checkout}`);
  console.log(`👤 Adultes: ${adults}`);

  try {
    let finalPlaceId = placeId;

    // ============================================
    // ÉTAPE 1: Si pas de placeId, le récupérer via la ville
    // ============================================
    if (!finalPlaceId && city) {
      console.log(`⏳ Étape 1: Récupération du placeId pour "${city}"...`);
      
      try {
        // Appel à l'API LiteAPI /places si disponible
        // Sinon, utiliser Google Places API
        const placesResponse = await sdk.getPlaces({
          textQuery: city,
          language: "fr",
          type: "locality"
        });
        
        if (placesResponse.data && placesResponse.data.length > 0) {
          finalPlaceId = placesResponse.data[0].placeId;
          console.log(`✅ PlaceId trouvé: ${finalPlaceId}`);
        }
      } catch (error) {
        console.warn(`⚠️ Erreur getPlaces: ${error.message}`);
        
        // Fallback: Google Places API
        try {
          const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
          if (googleApiKey) {
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/place/findplacefromtext/json` +
              `?input=${encodeURIComponent(city)}` +
              `&inputtype=textquery` +
              `&fields=place_id` +
              `&key=${googleApiKey}`
            );
            const data = await response.json();
            if (data.candidates && data.candidates.length > 0) {
              finalPlaceId = data.candidates[0].place_id;
              console.log(`✅ PlaceId (Google) trouvé: ${finalPlaceId}`);
            }
          }
        } catch (googleError) {
          console.warn(`⚠️ Erreur Google Places: ${googleError.message}`);
        }
      }
    }

    // ============================================
    // ÉTAPE 2: Vérifier qu'on a un placeId
    // ============================================
    if (!finalPlaceId) {
      console.error('❌ Aucun placeId trouvé pour cette ville');
      return res.status(400).json({ 
        success: false,
        error: "Impossible de localiser cette ville",
        message: "Veuillez vérifier le nom de la ville ou fournir un placeId"
      });
    }

    // ============================================
    // ÉTAPE 3: Récupérer les hôtels avec placeId
    // ============================================
    console.log(`⏳ Étape 3: Recherche des hôtels avec placeId: ${finalPlaceId}...`);
    
    // ✅ On enlève currency - ce paramètre n'existe pas pour getHotels
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
    // ÉTAPE 4: Récupérer les tarifs (par lots de 50)
    // ============================================
    const hotelIds = hotelList.map(h => h.hotelId || h.id).filter(id => id);
    console.log(`📋 ${hotelIds.length} IDs d'hôtels extraits`);

    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < Math.min(hotelIds.length, 500); i += BATCH_SIZE) {
      batches.push(hotelIds.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`📦 ${batches.length} lots de ${BATCH_SIZE} hôtels à traiter`);

    const rateMap = {};
    let totalWithRates = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`⏳ Lot ${i + 1}/${batches.length}: ${batch.length} hôtels...`);
      
      try {
        const ratesResponse = await sdk.getFullRates({
          hotelIds: batch.join(','),  // ← Format CSV pour éviter les problèmes
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
    console.log(`⏳ Étape 5: Fusion des données...`);

    const hotels = hotelList.map(function(hotel) {
      const hotelId = hotel.hotelId || hotel.id;
      const rateItem = rateMap[hotelId] || {};
      const bestRate = rateItem.roomTypes?.[0]?.rates?.[0];
      
      // Extraire le nom
      let name = 'Hôtel sans nom';
      const nameCandidates = [
        hotel.name,
        hotel.hotelName,
        hotel.hotel_name,
        hotel.title,
        hotel.fullName,
        hotel.establishmentName,
        hotel.propertyName,
        hotel['Hotel Name'],
        hotel.name_en,
        hotel.name_fr
      ];
      for (let n of nameCandidates) {
        if (n && typeof n === 'string' && n.trim().length > 0) {
          name = n.trim();
          break;
        }
      }

      // Extraire la photo
      let photo = '';
      const photoCandidates = [
        hotel.main_photo,
        hotel.mainPhoto,
        hotel.photo,
        hotel.image,
        hotel.picture,
        hotel.thumbnail,
        hotel.images?.[0],
        hotel.photos?.[0],
        hotel.hotelImage,
        hotel.imageUrl
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

      // Extraire l'adresse
      let address = '';
      const addressCandidates = [
        hotel.address,
        hotel.streetAddress,
        hotel.street,
        hotel.addressLine1,
        hotel.fullAddress,
        hotel.location?.address
      ];
      for (let a of addressCandidates) {
        if (a && typeof a === 'string' && a.trim().length > 0) {
          address = a.trim();
          break;
        }
      }

      // Extraire la note
      let rating = 0;
      const ratingCandidates = [
        hotel.rating,
        hotel.score,
        hotel.averageRating,
        hotel.overallRating,
        hotel.starRating
      ];
      for (let r of ratingCandidates) {
        if (r && !isNaN(parseFloat(r)) && parseFloat(r) > 0) {
          rating = parseFloat(r);
          break;
        }
      }

      // Extraire le nombre d'étoiles
      let starRating = 0;
      const starCandidates = [
        hotel.starRating,
        hotel.stars,
        hotel.star_rating,
        hotel.hotelClass,
        hotel.category
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

    // Filtrer les hôtels sans prix et trier par prix
    const validHotels = hotels
      .filter(h => h.minPrice > 0)
      .sort((a, b) => a.minPrice - b.minPrice);

    const maxReturn = 500;
    const finalHotels = validHotels.slice(0, maxReturn);
    
    console.log(`\n📊 RÉSULTAT FINAL:`);
    console.log(`  - Total hôtels: ${hotelList.length}`);
    console.log(`  - Hôtels avec tarifs: ${validHotels.length}`);
    console.log(`  - Hôtels retournés: ${finalHotels.length}`);
    if (finalHotels.length > 0) {
      console.log(`  - Premier hôtel: "${finalHotels[0].name}"`);
      console.log(`  - Prix min: $${finalHotels[0].minPrice}`);
    }

    res.json({ 
      success: true,
      hotels: finalHotels,
      total: finalHotels.length,
      rawTotal: hotelList.length,
      placeIdUsed: finalPlaceId,
      availableWithPrice: validHotels.length
    });
  } catch (error) {
    console.error("❌ Error searching for hotels:", error);
    console.error("📦 Détails:", error.response?.data || error.message);
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
    if (Array.isArray(response.data)) {
      rates = response.data;
    } else if (response.data && Array.isArray(response.data.data)) {
      rates = response.data.data;
    } else if (response.data && Array.isArray(response.data.hotels)) {
      rates = response.data.hotels;
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
  console.log(`   🔍 GET  /search-hotels     - Hôtels (AVEC PLACE ID)`);
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
