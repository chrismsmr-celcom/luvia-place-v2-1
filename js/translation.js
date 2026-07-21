// js/translation.js
// ============================================
// GESTIONNAIRE DE TRADUCTION FRONTEND
// ============================================

(function() {
  'use strict';

  var currentLang = localStorage.getItem('luviaplace_language') || 'fr';
  var isTranslating = false;

  // ============================================
  // 1. TRADUIRE UN TEXTE AVEC DEEPSEEK
  // ============================================
  async function translateText(text, targetLang, sourceLang = 'fr') {
    if (!text || !targetLang || targetLang === 'fr') return text;
    if (text.length < 2) return text;

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          targetLang: targetLang,
          sourceLang: sourceLang
        })
      });

      const data = await response.json();
      return data.translation || text;
    } catch (error) {
      console.error('❌ Erreur traduction:', error);
      return text;
    }
  }

  // ============================================
  // 2. TRADUIRE UNE LISTE D'AVIS
  // ============================================
  async function translateReviews(reviews, targetLang) {
    if (!reviews || !Array.isArray(reviews) || reviews.length === 0) return reviews;
    if (targetLang === 'fr') return reviews;

    try {
      const response = await fetch('/api/translate-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviews: reviews,
          targetLang: targetLang
        })
      });

      const data = await response.json();
      return data.reviews || reviews;
    } catch (error) {
      console.error('❌ Erreur traduction avis:', error);
      return reviews;
    }
  }

  // ============================================
  // 3. TRADUIRE UNE DESCRIPTION D'HÔTEL
  // ============================================
  async function translateHotelDescription(description, targetLang) {
    if (!description || targetLang === 'fr') return description;

    try {
      const response = await fetch('/api/translate-hotel-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: description,
          targetLang: targetLang
        })
      });

      const data = await response.json();
      return data.translation || description;
    } catch (error) {
      console.error('❌ Erreur traduction description:', error);
      return description;
    }
  }

  // ============================================
  // 4. TRADUIRE LES HÔTELS D'UNE LISTE
  // ============================================
  async function translateHotels(hotels, targetLang) {
    if (!hotels || !Array.isArray(hotels) || hotels.length === 0) return hotels;
    if (targetLang === 'fr') return hotels;

    try {
      // Traduire les noms en parallèle
      const translatedHotels = await Promise.all(
        hotels.map(async (hotel) => {
          try {
            const translatedName = await translateText(hotel.name, targetLang);
            const translatedAddress = hotel.address ? await translateText(hotel.address, targetLang) : '';
            
            return {
              ...hotel,
              name: translatedName || hotel.name,
              address: translatedAddress || hotel.address,
              translated: true,
              translatedLanguage: targetLang
            };
          } catch (error) {
            console.warn('⚠️ Erreur traduction hôtel:', hotel.id);
            return hotel;
          }
        })
      );

      return translatedHotels;
    } catch (error) {
      console.error('❌ Erreur traduction hôtels:', error);
      return hotels;
    }
  }

  // ============================================
  // 5. RECHERCHER AVEC TRADUCTION
  // ============================================
  async function searchWithTranslation(params) {
    const { destination, checkin, checkout, adults, limit = 20 } = params;
    const language = currentLang;

    try {
      // 1. Faire la recherche avec la langue
      const url = `/search-hotels?city=${encodeURIComponent(destination)}&checkin=${checkin}&checkout=${checkout}&adults=${adults}&language=${language}&limit=${limit}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!data.success || !data.hotels) {
        return data;
      }

      // 2. Si la langue est déjà supportée par LiteAPI, retourner direct
      const supportedLangs = ['fr', 'en', 'es', 'pt', 'it', 'de', 'ar', 'zh', 'ja', 'ru', 'nl', 'pl', 'tr'];
      if (supportedLangs.includes(language) || language === 'fr') {
        return data;
      }

      // 3. Sinon, traduire avec DeepSeek
      console.log(`🔄 Traduction DeepSeek des hôtels en: ${language}`);
      const translatedHotels = await translateHotels(data.hotels, language);
      
      return {
        ...data,
        hotels: translatedHotels,
        translated: true
      };
    } catch (error) {
      console.error('❌ Erreur recherche:', error);
      return { success: false, hotels: [], error: error.message };
    }
  }

  // ============================================
  // 6. CHARGER LES DÉTAILS D'UN HÔTEL
  // ============================================
  async function loadHotelDetails(hotelId, language = currentLang) {
    try {
      const response = await fetch(`/hotel-details?hotelId=${hotelId}&language=${language}`);
      const data = await response.json();

      if (!data.success || !data.data) {
        return data;
      }

      // Si la langue n'est pas supportée, traduire la description
      const supportedLangs = ['fr', 'en', 'es', 'pt', 'it', 'de', 'ar', 'zh', 'ja', 'ru', 'nl', 'pl', 'tr'];
      if (!supportedLangs.includes(language) && language !== 'fr') {
        const hotel = data.data;
        
        hotel.hotelDescription = await translateHotelDescription(hotel.hotelDescription, language);
        
        // Traduire les noms des chambres
        if (hotel.rooms) {
          hotel.rooms = await Promise.all(hotel.rooms.map(async (room) => {
            room.roomName = await translateText(room.roomName, language);
            room.description = await translateText(room.description, language);
            return room;
          }));
        }
        
        data.data = hotel;
        data.translated = true;
      }

      return data;
    } catch (error) {
      console.error('❌ Erreur chargement détails:', error);
      return { success: false, error: error.message };
    }
  }

  // ============================================
  // 7. CHARGER LES AVIS D'UN HÔTEL
  // ============================================
  async function loadHotelReviews(hotelId, language = currentLang) {
    try {
      const response = await fetch(`/hotel-reviews?hotelId=${hotelId}&language=${language}`);
      const data = await response.json();

      if (!data.success || !data.data) {
        return data;
      }

      // Traduire les avis si nécessaire
      const supportedLangs = ['fr', 'en', 'es', 'pt', 'it', 'de', 'ar', 'zh', 'ja', 'ru', 'nl', 'pl', 'tr'];
      if (!supportedLangs.includes(language) && language !== 'fr') {
        data.data = await translateReviews(data.data, language);
        data.translated = true;
      }

      return data;
    } catch (error) {
      console.error('❌ Erreur chargement avis:', error);
      return { success: false, data: [], error: error.message };
    }
  }

  // ============================================
  // 8. CHANGER DE LANGUE
  // ============================================
  function setLanguage(lang) {
    if (!lang) return;
    currentLang = lang;
    localStorage.setItem('luviaplace_language', lang);
    document.documentElement.lang = lang;
    
    // Mettre à jour l'affichage
    var langCurrent = document.getElementById('langCurrent');
    if (langCurrent) {
      var codes = { 'fr': 'FR', 'en': 'EN', 'es': 'ES', 'sw': 'SW', 'pt': 'PT', 'it': 'IT', 'de': 'DE' };
      langCurrent.textContent = codes[lang] || lang.toUpperCase();
    }
    
    // Mettre à jour les boutons actifs
    document.querySelectorAll('.lang-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    
    // Fermer le dropdown
    var dropdown = document.getElementById('langDropdown');
    var toggle = document.getElementById('langToggle');
    if (dropdown) dropdown.classList.remove('open');
    if (toggle) toggle.classList.remove('open');
    
    // Recharger les données
    document.dispatchEvent(new CustomEvent('languageChanged', { 
      detail: { language: lang } 
    }));
    
    console.log(`🌍 Langue changée vers: ${lang}`);
  }

  // ============================================
  // 9. EXPOSER LES FONCTIONS
  // ============================================
  window.translateText = translateText;
  window.translateReviews = translateReviews;
  window.translateHotelDescription = translateHotelDescription;
  window.translateHotels = translateHotels;
  window.searchWithTranslation = searchWithTranslation;
  window.loadHotelDetails = loadHotelDetails;
  window.loadHotelReviews = loadHotelReviews;
  window.setLanguage = setLanguage;
  window.getCurrentLanguage = function() { return currentLang; };

  // ============================================
  // 10. INITIALISATION
  // ============================================
  function initTranslation() {
    var saved = localStorage.getItem('luviaplace_language');
    if (saved) {
      currentLang = saved;
      document.documentElement.lang = currentLang;
      
      var langCurrent = document.getElementById('langCurrent');
      if (langCurrent) {
        var codes = { 'fr': 'FR', 'en': 'EN', 'es': 'ES', 'sw': 'SW', 'pt': 'PT', 'it': 'IT', 'de': 'DE' };
        langCurrent.textContent = codes[currentLang] || currentLang.toUpperCase();
      }
    }
    
    console.log('🌍 Traduction initialisée, langue:', currentLang);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTranslation);
  } else {
    initTranslation();
  }

})();