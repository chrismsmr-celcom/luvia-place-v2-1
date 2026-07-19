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
// 1. RECHERCHE HÔTELS - ULTRA OPTIMISÉ POUR MAX DE RÉSULTATS
// ============================================
app.get("/search-hotels", async (req, res) => {
  console.log("\n🔍 ===== SEARCH HOTELS (MAX RESULTS) ===== 🔍");
  const { 
    checkin, 
    checkout, 
    adults, 
    city, 
    countryCode, 
    environment, 
    limit = 2000,        // ← Max des max
    maxHotels = 500,     // ← Retourner jusqu'à 500 hôtels
    expandSearch = true  // ← Recherche élargie activée
  } = req.query;
  
  const apiKey = environment == "sandbox" ? sandbox_apiKey : prod_apiKey;
  const sdk = liteApi(apiKey);

  console.log(`📍 Ville: ${city}, Pays: ${countryCode}`);
  console.log(`📅 Arrivée: ${checkin}, Départ: ${checkout}`);
  console.log(`👤 Adultes: ${adults}`);
  console.log(`📊 Limite API: ${limit}, Max retour: ${maxHotels}`);

  try {
    // ============================================
    // ÉTAPE 1: Récupérer la liste des hôtels (recherche principale)
    // ============================================
    console.log(`⏳ Étape 1: Recherche principale à ${city}...`);
    
    const mainSearchParams = {
      countryCode: countryCode || "FR",
      cityName: city,
      currency: "USD",
      limit: Math.min(parseInt(limit), 2000)
    };
    
    console.log('📦 Paramètres de recherche principale:', mainSearchParams);
    
    const hotelsResponse = await sdk.getHotels(mainSearchParams);

    let hotelList = [];
    if (Array.isArray(hotelsResponse.data)) {
      hotelList = hotelsResponse.data;
    } else if (hotelsResponse.data && Array.isArray(hotelsResponse.data.hotels)) {
      hotelList = hotelsResponse.data.hotels;
    } else if (hotelsResponse.data && Array.isArray(hotelsResponse.data.data)) {
      hotelList = hotelsResponse.data.data;
    }

    console.log(`✅ ${hotelList.length} hôtels trouvés dans la recherche principale`);

    // ============================================
    // ÉTAPE 1.5: Recherche élargie (plusieurs stratégies)
    // ============================================
    let expandedHotels = [];
    const MIN_HOTELS = 50;
    
    if (expandSearch === 'true' || expandSearch === true) {
      console.log(`🔍 Recherche élargie activée...`);
      
      // Stratégie 1: Recherche sans ville (par pays uniquement)
      if (hotelList.length < MIN_HOTELS * 2) {
        console.log(`  📍 Stratégie 1: Recherche par pays...`);
        try {
          const countryParams = {
            countryCode: countryCode || "FR",
            currency: "USD",
            limit: Math.min(parseInt(limit), 2000)
          };
          
          const countryResponse = await sdk.getHotels(countryParams);
          let countryList = [];
          if (Array.isArray(countryResponse.data)) {
            countryList = countryResponse.data;
          } else if (countryResponse.data && Array.isArray(countryResponse.data.hotels)) {
            countryList = countryResponse.data.hotels;
          } else if (countryResponse.data && Array.isArray(countryResponse.data.data)) {
            countryList = countryResponse.data.data;
          }
          
          console.log(`  ✅ ${countryList.length} hôtels trouvés par pays`);
          
          // Fusionner et dédoublonner
          const existingIds = new Set(hotelList.map(h => h.hotelId || h.id));
          const newHotels = countryList.filter(h => {
            const id = h.hotelId || h.id;
            return id && !existingIds.has(id);
          });
          
          expandedHotels = [...expandedHotels, ...newHotels];
          console.log(`  🆕 ${newHotels.length} nouveaux hôtels ajoutés (pays)`);
        } catch (error) {
          console.warn(`  ⚠️ Erreur recherche par pays: ${error.message}`);
        }
      }
      
      // Stratégie 2: Recherche avec des variations du nom de la ville
      if (hotelList.length < MIN_HOTELS) {
        console.log(`  📍 Stratégie 2: Variations du nom de la ville...`);
        const cityVariations = [
          city,
          city.toLowerCase(),
          city.toUpperCase(),
          city.replace(/['\s-]/g, ''),
          city.replace(/[éèêë]/g, 'e'),
          city.replace(/[àâä]/g, 'a'),
          city.replace(/[ôö]/g, 'o'),
          city.replace(/[îï]/g, 'i'),
          city.replace(/[ûü]/g, 'u')
        ];
        
        // Enlever les doublons
        const uniqueVariations = [...new Set(cityVariations)];
        
        for (let variant of uniqueVariations) {
          if (variant === city) continue; // Déjà fait
          if (variant.length < 2) continue;
          
          try {
            console.log(`    - Test: "${variant}"`);
            const variantParams = {
              countryCode: countryCode || "FR",
              cityName: variant,
              currency: "USD",
              limit: Math.min(parseInt(limit), 1000)
            };
            
            const variantResponse = await sdk.getHotels(variantParams);
            let variantList = [];
            if (Array.isArray(variantResponse.data)) {
              variantList = variantResponse.data;
            } else if (variantResponse.data && Array.isArray(variantResponse.data.hotels)) {
              variantList = variantResponse.data.hotels;
            } else if (variantResponse.data && Array.isArray(variantResponse.data.data)) {
              variantList = variantResponse.data.data;
            }
            
            if (variantList.length > 0) {
              console.log(`    ✅ ${variantList.length} hôtels trouvés avec "${variant}"`);
              const existingIds = new Set(hotelList.map(h => h.hotelId || h.id));
              const newHotels = variantList.filter(h => {
                const id = h.hotelId || h.id;
                return id && !existingIds.has(id);
              });
              expandedHotels = [...expandedHotels, ...newHotels];
              console.log(`    🆕 ${newHotels.length} nouveaux hôtels ajoutés`);
            }
          } catch (error) {
            // Ignorer les erreurs pour les variations
          }
        }
      }
    }

    // ============================================
    // Fusionner toutes les listes
    // ============================================
    const allHotels = [...hotelList, ...expandedHotels];
    
    // Dédoublonner final
    const uniqueHotels = [];
    const seenIds = new Set();
    for (let hotel of allHotels) {
      const id = hotel.hotelId || hotel.id;
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        uniqueHotels.push(hotel);
      }
    }
    
    console.log(`📊 Total hôtels uniques: ${uniqueHotels.length}`);

    // ============================================
    // ÉTAPE 2: Récupérer les tarifs (en parallèle par lots)
    // ============================================
    const hotelIds = uniqueHotels.map(h => h.hotelId || h.id).filter(id => id);
    console.log(`📋 ${hotelIds.length} IDs d'hôtels extraits`);

    // Diviser en lots de 50 pour éviter les timeouts
    const BATCH_SIZE = 50;
    const batches = [];
    for (let i = 0; i < Math.min(hotelIds.length, 500); i += BATCH_SIZE) {
      batches.push(hotelIds.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`📦 ${batches.length} lots de ${BATCH_SIZE} hôtels à traiter`);

    // Récupérer les tarifs en parallèle
    const rateMap = {};
    let totalWithRates = 0;
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`⏳ Lot ${i + 1}/${batches.length}: ${batch.length} hôtels...`);
      
      try {
        const ratesResponse = await sdk.getFullRates({
          hotelIds: batch,
          occupancies: [{ adults: parseInt(adults, 10) }],
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
        console.log(`✅ Lot ${i + 1}: ${rateData.length} hôtels avec tarifs (total: ${totalWithRates})`);
        
      } catch (error) {
        console.warn(`⚠️ Erreur lot ${i + 1}: ${error.message}`);
      }
    }

    console.log(`✅ Total: ${Object.keys(rateMap).length} hôtels avec tarifs`);

    // ============================================
    // ÉTAPE 3: Fusionner les données
    // ============================================
    console.log(`⏳ Étape 3: Fusion des données...`);

    const hotels = uniqueHotels.map(function(hotel) {
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

      // Extraire le nombre d'avis
      let reviewCount = 0;
      const reviewCandidates = [
        hotel.reviewCount,
        hotel.review_count,
        hotel.totalReviews,
        hotel.numberOfReviews
      ];
      for (let r of reviewCandidates) {
        if (r && !isNaN(parseInt(r)) && parseInt(r) > 0) {
          reviewCount = parseInt(r);
          break;
        }
      }

      return {
        id: hotelId || `hotel-${Math.random()}`,
        name: name,
        address: address || hotel.city || city,
        city: hotel.city || city,
        country: hotel.country || countryCode,
        main_photo: photo,
        rating: rating || 0,
        reviewCount: reviewCount || 0,
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

    // Limiter le nombre retourné
    const maxReturn = parseInt(maxHotels) || 500;
    const finalHotels = validHotels.slice(0, maxReturn);
    
    console.log(`\n📊 RÉSULTAT FINAL:`);
    console.log(`  - Total hôtels uniques: ${uniqueHotels.length}`);
    console.log(`  - Hôtels avec tarifs: ${validHotels.length}`);
    console.log(`  - Hôtels retournés: ${finalHotels.length}`);
    if (finalHotels.length > 0) {
      console.log(`  - Prix min: $${finalHotels[0].minPrice}`);
      console.log(`  - Prix max: $${finalHotels[finalHotels.length - 1].minPrice}`);
    }

    res.json({ 
      success: true,
      hotels: finalHotels,
      total: finalHotels.length,
      rawTotal: uniqueHotels.length,
      availableWithPrice: validHotels.length,
      searchStats: {
        mainSearch: hotelList.length,
        expanded: expandedHotels.length,
        unique: uniqueHotels.length,
        withRates: Object.keys(rateMap).length
      }
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
  console.log(`   🔍 GET  /search-hotels     - Hôtels (MAX RESULTS)`);
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
