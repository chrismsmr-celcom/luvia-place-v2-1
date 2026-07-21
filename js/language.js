// ============================================
// js/language.js - Gestionnaire de langue (SANS API)
// ============================================

(function() {
  'use strict';

  // ============================================
  // 1. RÉCUPÉRER LES TRADUCTIONS DE i18n.js
  // ============================================
  // Si i18n.js est chargé avant, utiliser ses traductions
  var translations = window.translations || {
    fr: {
      'nav.home': 'Accueil',
      'nav.hotels': 'Hébergement',
      'nav.flights': 'Vols',
      'nav.packages': 'Packages',
      'nav.login': 'Se connecter',
      'nav.favorites': 'Favoris',
      'nav.rewards': 'Programme Rewards',
      'search.destination': 'Destination',
      'search.checkin': 'Arrivée',
      'search.checkout': 'Départ',
      'search.guests': 'Voyageurs',
      'search.search': 'Rechercher',
      'search.origin': 'Origine',
      'search.return': 'Retour',
      'search.passengers': 'Passagers',
      'search.around_me': 'Autour de moi',
      'search.recent': 'Récents',
      'search.suggestions': 'Suggestions',
      'search.all_airports': 'Tous les aéroports',
      'search.add_flight': 'Ajouter un vol',
      'search.enter_destination': 'Veuillez indiquer une destination.',
      'search.enter_origin': 'Veuillez indiquer une ville d\'origine.',
      'hotel.no_results': 'Aucun hôtel trouvé',
      'hotel.loading': 'Chargement...',
      'common.loading': 'Chargement...',
      'common.error': 'Erreur',
      'common.close': 'Fermer',
      'common.done': 'Terminé',
      'common.from': 'À partir de',
      'common.per_night': '/ nuit',
      'common.see_all': 'Voir tout',
      'common.rewards': 'Programme Rewards',
      'footer.explore': 'Explorer',
      'footer.services': 'Services',
      'footer.company': 'Entreprise',
      'footer.legal': 'Légal',
      'best_offers': 'Meilleures offres',
      'central_africa': 'Fait pour l\'Afrique centrale',
      'support': 'Toujours là pour aider'
    },
    en: {
      'nav.home': 'Home',
      'nav.hotels': 'Hotels',
      'nav.flights': 'Flights',
      'nav.packages': 'Packages',
      'nav.login': 'Sign in',
      'nav.favorites': 'Favorites',
      'nav.rewards': 'Rewards Program',
      'search.destination': 'Destination',
      'search.checkin': 'Check-in',
      'search.checkout': 'Check-out',
      'search.guests': 'Guests',
      'search.search': 'Search',
      'search.origin': 'Origin',
      'search.return': 'Return',
      'search.passengers': 'Passengers',
      'search.around_me': 'Around me',
      'search.recent': 'Recent',
      'search.suggestions': 'Suggestions',
      'search.all_airports': 'All airports',
      'search.add_flight': 'Add flight',
      'search.enter_destination': 'Please enter a destination.',
      'search.enter_origin': 'Please enter an origin city.',
      'hotel.no_results': 'No hotels found',
      'hotel.loading': 'Loading...',
      'common.loading': 'Loading...',
      'common.error': 'Error',
      'common.close': 'Close',
      'common.done': 'Done',
      'common.from': 'From',
      'common.per_night': '/ night',
      'common.see_all': 'See all',
      'common.rewards': 'Rewards Program',
      'footer.explore': 'Explore',
      'footer.services': 'Services',
      'footer.company': 'Company',
      'footer.legal': 'Legal',
      'best_offers': 'Best offers',
      'central_africa': 'Made for Central Africa',
      'support': 'Always here to help'
    },
    es: {
      'nav.home': 'Inicio',
      'nav.hotels': 'Alojamiento',
      'nav.flights': 'Vuelos',
      'nav.packages': 'Paquetes',
      'nav.login': 'Iniciar sesión',
      'nav.favorites': 'Favoritos',
      'nav.rewards': 'Programa de Recompensas',
      'search.destination': 'Destino',
      'search.checkin': 'Llegada',
      'search.checkout': 'Salida',
      'search.guests': 'Viajeros',
      'search.search': 'Buscar',
      'search.origin': 'Origen',
      'search.return': 'Regreso',
      'search.passengers': 'Pasajeros',
      'search.around_me': 'Alrededor de mí',
      'search.recent': 'Recientes',
      'search.suggestions': 'Sugerencias',
      'search.all_airports': 'Todos los aeropuertos',
      'search.add_flight': 'Añadir vuelo',
      'search.enter_destination': 'Por favor indique un destino.',
      'search.enter_origin': 'Por favor indique una ciudad de origen.',
      'hotel.no_results': 'No se encontraron hoteles',
      'hotel.loading': 'Cargando...',
      'common.loading': 'Cargando...',
      'common.error': 'Error',
      'common.close': 'Cerrar',
      'common.done': 'Hecho',
      'common.from': 'Desde',
      'common.per_night': '/ noche',
      'common.see_all': 'Ver todo',
      'common.rewards': 'Programa de Recompensas',
      'footer.explore': 'Explorar',
      'footer.services': 'Servicios',
      'footer.company': 'Empresa',
      'footer.legal': 'Legal',
      'best_offers': 'Mejores ofertas',
      'central_africa': 'Hecho para África Central',
      'support': 'Siempre aquí para ayudar'
    },
    sw: {
      'nav.home': 'Nyumbani',
      'nav.hotels': 'Makazi',
      'nav.flights': 'Ndege',
      'nav.packages': 'Mpaketo',
      'nav.login': 'Ingia',
      'nav.favorites': 'Vipendwa',
      'nav.rewards': 'Mpango wa Zawadi',
      'search.destination': 'Mahali',
      'search.checkin': 'Kuwasili',
      'search.checkout': 'Kuondoka',
      'search.guests': 'Wageni',
      'search.search': 'Tafuta',
      'search.origin': 'Mahali pa kuondoka',
      'search.return': 'Kurudi',
      'search.passengers': 'Abiria',
      'search.around_me': 'Karibu yangu',
      'search.recent': 'Hivi karibuni',
      'search.suggestions': 'Mapendekezo',
      'search.all_airports': 'Viwanja vyote vya ndege',
      'search.add_flight': 'Ongeza ndege',
      'search.enter_destination': 'Tafadhali weka mahali unakoenda.',
      'search.enter_origin': 'Tafadhali weka mji wa kuondokea.',
      'hotel.no_results': 'Hakuna hoteli zilizopatikana',
      'hotel.loading': 'Inapakia...',
      'common.loading': 'Inapakia...',
      'common.error': 'Hitilafu',
      'common.close': 'Funga',
      'common.done': 'Imekamilika',
      'common.from': 'Kuanzia',
      'common.per_night': '/ usiku',
      'common.see_all': 'Ona yote',
      'common.rewards': 'Mpango wa Zawadi',
      'footer.explore': 'Gundua',
      'footer.services': 'Huduma',
      'footer.company': 'Kampuni',
      'footer.legal': 'Sheria',
      'best_offers': 'Ofa bora',
      'central_africa': 'Imetengenezwa kwa Afrika ya Kati',
      'support': 'Tuko hapa kusaidia'
    }
  };

  // ============================================
  // 2. CONFIGURATION
  // ============================================
  var currentLang = localStorage.getItem('luviaplace_language') || 'fr';
  var langCodes = { 'fr': 'FR', 'en': 'EN', 'es': 'ES', 'sw': 'SW' };

  // ============================================
  // 3. FONCTION DE TRADUCTION
  // ============================================
  function t(key) {
    if (translations[currentLang] && translations[currentLang][key] !== undefined) {
      return translations[currentLang][key];
    }
    if (translations.fr && translations.fr[key] !== undefined) {
      return translations.fr[key];
    }
    return key;
  }

  // ============================================
  // 4. TRADUIRE LA PAGE
  // ============================================
  function translatePage() {
    console.log('🔄 Traduction en:', currentLang);
    
    // data-i18n
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.dataset.i18n;
      var translation = t(key);
      if (translation && translation !== key) {
        el.textContent = translation;
      }
    });

    // data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el) {
      var key = el.dataset.i18nPlaceholder;
      var translation = t(key);
      if (translation && translation !== key) {
        el.placeholder = translation;
      }
    });

    // data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(function(el) {
      var key = el.dataset.i18nTitle;
      var translation = t(key);
      if (translation && translation !== key) {
        el.title = translation;
      }
    });

    // data-i18n-aria
    document.querySelectorAll('[data-i18n-aria]').forEach(function(el) {
      var key = el.dataset.i18nAria;
      var translation = t(key);
      if (translation && translation !== key) {
        el.setAttribute('aria-label', translation);
      }
    });

    // Bouton de connexion
    var loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
      loginBtn.textContent = t('nav.login');
    }

    // Titre de la page
    var titleEl = document.querySelector('title');
    if (titleEl) {
      var titles = {
        'fr': 'LuviaPlace — Votre séjour commence ici',
        'en': 'LuviaPlace — Your journey starts here',
        'es': 'LuviaPlace — Tu viaje comienza aquí',
        'sw': 'LuviaPlace — Safari yako inaanza hapa'
      };
      if (titles[currentLang]) {
        titleEl.textContent = titles[currentLang];
      }
    }
  }

  // ============================================
  // 5. CHANGER DE LANGUE
  // ============================================
  function changeLanguage(lang) {
    if (!translations[lang]) return;
    
    currentLang = lang;
    localStorage.setItem('luviaplace_language', lang);
    document.documentElement.lang = lang;
    
    // Mettre à jour l'affichage du bouton
    var langCurrent = document.getElementById('langCurrent');
    if (langCurrent) {
      langCurrent.textContent = langCodes[lang] || lang.toUpperCase();
    }
    
    // Mettre à jour les boutons actifs
    document.querySelectorAll('.lang-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.lang === lang);
    });
    
    // Traduire la page
    translatePage();
    
    // Fermer le dropdown et la modale
    var dropdown = document.getElementById('langDropdown');
    var toggle = document.getElementById('langToggle');
    var overlay = document.getElementById('langModalOverlay');
    
    if (dropdown) dropdown.classList.remove('open');
    if (toggle) toggle.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    
    // Émettre l'événement
    document.dispatchEvent(new CustomEvent('languageChanged', { 
      detail: { language: lang } 
    }));
    
    console.log('🌍 Langue changée vers:', lang);
  }

  // ============================================
  // 6. EXPOSER LES FONCTIONS
  // ============================================
  window.t = t;
  window.changeLanguage = changeLanguage;
  window.translatePage = translatePage;
  window.getCurrentLanguage = function() { return currentLang; };
  window.translations = translations;

  // ============================================
  // 7. INITIALISATION
  // ============================================
  function init() {
    var saved = localStorage.getItem('luviaplace_language');
    if (saved && translations[saved]) {
      currentLang = saved;
    }
    document.documentElement.lang = currentLang;
    
    // Mettre à jour le bouton de langue
    var langCurrent = document.getElementById('langCurrent');
    if (langCurrent) {
      langCurrent.textContent = langCodes[currentLang] || currentLang.toUpperCase();
    }
    
    // Traduire la page
    setTimeout(translatePage, 100);
    
    console.log('🌍 Langue actuelle:', currentLang);
    console.log('📝 Traductions disponibles:', Object.keys(translations).join(', '));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();