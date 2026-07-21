// ============================================
// js/i18n.js - TRADUCTIONS MULTILINGUES
// ============================================

var translations = {
  // ============================================
  // FRANÇAIS
  // ============================================
  fr: {
    // Navigation
    'nav.home': 'Accueil',
    'nav.hotels': 'Hébergement',
    'nav.flights': 'Vols',
    'nav.experiences': 'Expériences',
    'nav.cars': 'Voiture',
    'nav.insurance': 'Assurance',
    'nav.packages': 'Packages',
    'nav.login': 'Se connecter',
    'nav.favorites': 'Favoris',
    'nav.rewards': 'Programme Rewards',
    
    // Langues
    'language.select': 'Choisissez votre langue et devise',
    'language.tab': 'Langue',
    'currency.tab': 'Devise',
    'language.fr': 'Français',
    'language.en': 'English',
    'language.es': 'Español',
    'language.sw': 'Kiswahili',
    'language.pt': 'Português',
    'language.it': 'Italiano',
    'language.de': 'Deutsch',
    'language.ar': 'العربية',
    'language.zh': '中文',
    'language.ja': '日本語',
    'language.ru': 'Русский',
    'language.nl': 'Nederlands',
    
    // Devises
    'currency.africa': '🌍 Afrique',
    'currency.international': '🌐 International',
    'currency.apply': 'Appliquer',
    
    // Hero
    'hero.title': 'Votre voyage commence ici',
    'hero.sub': 'Hébergement, vols et packages tout compris — réservez en un seul endroit.',
    'hero.stats.hotels': 'Établissements',
    'hero.stats.countries': 'Pays',
    'hero.stats.support': 'Support',
    
    // Recherche
    'search.destination': 'Destination',
    'search.checkin': 'Arrivée',
    'search.checkout': 'Départ',
    'search.guests': 'Voyageurs',
    'search.search': 'Rechercher',
    'search.origin': 'Origine',
    'search.return': 'Retour',
    'search.passengers': 'Passagers',
    'search.cabin': 'Cabine',
    'search.economy': 'Économie',
    'search.premium_economy': 'Premium Éco',
    'search.business': 'Affaires',
    'search.first': 'Première',
    'search.adults': 'Adultes',
    'search.children': 'Enfants',
    'search.infants': 'Bébés',
    'search.rooms': 'Chambres',
    'search.night': 'nuit',
    'search.nights': 'nuits',
    'search.from': 'À partir de',
    'search.per_night': '/ nuit',
    'search.around_me': 'Autour de moi',
    'search.recent': 'Récents',
    'search.suggestions': 'Suggestions',
    'search.all_airports': 'Tous les aéroports',
    'search.add_flight': 'Ajouter un vol',
    'search.max_flights': 'Maximum 4 vols pour un itinéraire multi-destinations.',
    'search.complete_flights': 'Merci de compléter tous les vols de votre itinéraire.',
    'search.enter_destination': 'Veuillez indiquer une destination.',
    'search.enter_origin': 'Veuillez indiquer une ville d\'origine.',
    'search.enter_destination_flight': 'Veuillez indiquer une destination.',
    'search.multi_destination': 'Multi-destinations',
    'search.round_trip': 'Aller-retour',
    'search.one_way': 'Aller simple',
    
    // Hôtels
    'hotel.rating': 'Note',
    'hotel.reviews': 'avis',
    'hotel.no_results': 'Aucun hôtel trouvé',
    'hotel.loading': 'Chargement des hôtels...',
    'hotel.best_price': 'Meilleur prix',
    'hotel.available': 'Disponible',
    'hotel.unavailable': 'Indisponible',
    'hotels.recommended': 'Hôtels recommandés',
    'hotels.nearby': 'Hôtels à proximité',
    'hotel.excellent': 'Excellent',
    'hotel.very_good': 'Très bien',
    'hotel.good': 'Bien',
    'hotel.no_offers': 'Aucune offre disponible',
    'hotel.error': 'Impossible de charger les hôtels',
    
    // Collections
    'collections.eyebrow': 'Le courant LuviaPlace',
    'collections.title': 'Collections',
    'collections.sub': 'Des sélections pensées par destination et par envie.',
    
    // Recherches récentes
    'recent.searches': 'Vos recherches récentes',
    
    // Loyalty
    'loyalty.title': 'Plus qu\'un voyage, votre fidélité récompensée',
    'loyalty.desc': 'Découvrez le programme LuviaPlace Rewards. Gagnez des points à chaque réservation.',
    
    // Paiements
    'payments.title': 'Payez comme vous le faites déjà',
    'payments.sub': 'LuviaPlace accepte les moyens de paiement mobiles les plus utilisés en RDC.',
    'payments.orange': 'Orange Money',
    'payments.airtel': 'Airtel Money',
    'payments.mpesa': 'M-Pesa',
    'payments.visa': 'Visa / Mastercard',
    'payments.mobile_money': 'Mobile Money',
    'payments.card': 'Carte bancaire',
    
    // Features
    'best_offers.desc': 'Des tarifs compétitifs sur l\'hébergement, les vols et bien plus.',
    'central_africa.desc': 'Une sélection pensée depuis Kinshasa, Lubumbashi et Goma.',
    'support.desc': 'Notre équipe de support répond en français, avant et pendant le voyage.',
    
    // Détail hôtel
    'detail.overview': 'Vue d\'ensemble',
    'detail.amenities': 'Équipements',
    'detail.rooms': 'Chambres',
    'detail.reviews': 'Avis',
    'detail.location': 'Emplacement',
    'detail.description': 'Description',
    'detail.book_now': 'Réserver maintenant',
    'detail.price_per_night': 'Prix par nuit',
    'detail.include_taxes': 'Taxes incluses',
    'detail.cancellation_policy': 'Politique d\'annulation',
    'detail.free_cancellation': 'Annulation gratuite',
    'detail.non_refundable': 'Non remboursable',
    
    // Réservation
    'booking.guest_details': 'Coordonnées du voyageur',
    'booking.first_name': 'Prénom',
    'booking.last_name': 'Nom',
    'booking.email': 'Email',
    'booking.phone': 'Téléphone',
    'booking.payment': 'Paiement',
    'booking.confirm': 'Confirmer la réservation',
    'booking.success': 'Réservation confirmée !',
    'booking.reference': 'Référence',
    
    // Footer
    'footer.explore': 'Explorer',
    'footer.services': 'Services',
    'footer.company': 'Entreprise',
    'footer.legal': 'Légal',
    'footer.about': 'À propos',
    'footer.careers': 'Carrières',
    'footer.contact': 'Contact',
    'footer.terms': 'Conditions générales',
    'footer.privacy': 'Confidentialité',
    'footer.follow': 'Suivez-nous',
    'footer.desc': 'La plateforme de voyage pensée depuis et pour l\'Afrique centrale.',
    
    // Commun
    'common.loading': 'Chargement...',
    'common.error': 'Erreur',
    'common.retry': 'Réessayer',
    'common.close': 'Fermer',
    'common.save': 'Enregistrer',
    'common.cancel': 'Annuler',
    'common.continue': 'Continuer',
    'common.back': 'Retour',
    'common.next': 'Suivant',
    'common.done': 'Terminé',
    'common.see_all': 'Voir tout',
    'common.show_more': 'Afficher plus',
    'common.show_less': 'Afficher moins',
    'common.per_night': '/ nuit',
    'common.from': 'À partir de',
    'common.rewards': 'Programme Rewards',
    'common.apply': 'Appliquer',
    'best_offers': 'Meilleures offres',
    'central_africa': 'Fait pour l\'Afrique centrale',
    'support': 'Toujours là pour aider'
  },

  // ============================================
  // ENGLISH
  // ============================================
  en: {
    // Navigation
    'nav.home': 'Home',
    'nav.hotels': 'Hotels',
    'nav.flights': 'Flights',
    'nav.experiences': 'Experiences',
    'nav.cars': 'Cars',
    'nav.insurance': 'Insurance',
    'nav.packages': 'Packages',
    'nav.login': 'Sign in',
    'nav.favorites': 'Favorites',
    'nav.rewards': 'Rewards Program',
    
    // Langues
    'language.select': 'Choose your language and currency',
    'language.tab': 'Language',
    'currency.tab': 'Currency',
    'language.fr': 'Français',
    'language.en': 'English',
    'language.es': 'Español',
    'language.sw': 'Kiswahili',
    'language.pt': 'Português',
    'language.it': 'Italiano',
    'language.de': 'Deutsch',
    'language.ar': 'العربية',
    'language.zh': '中文',
    'language.ja': '日本語',
    'language.ru': 'Русский',
    'language.nl': 'Nederlands',
    
    // Devises
    'currency.africa': '🌍 Africa',
    'currency.international': '🌐 International',
    'currency.apply': 'Apply',
    
    // Hero
    'hero.title': 'Your journey starts here',
    'hero.sub': 'Hotels, flights and packages all-in-one — book everything in one place.',
    'hero.stats.hotels': 'Properties',
    'hero.stats.countries': 'Countries',
    'hero.stats.support': 'Support',
    
    // Recherche
    'search.destination': 'Destination',
    'search.checkin': 'Check-in',
    'search.checkout': 'Check-out',
    'search.guests': 'Guests',
    'search.search': 'Search',
    'search.origin': 'Origin',
    'search.return': 'Return',
    'search.passengers': 'Passengers',
    'search.cabin': 'Cabin',
    'search.economy': 'Economy',
    'search.premium_economy': 'Premium Economy',
    'search.business': 'Business',
    'search.first': 'First',
    'search.adults': 'Adults',
    'search.children': 'Children',
    'search.infants': 'Infants',
    'search.rooms': 'Rooms',
    'search.night': 'night',
    'search.nights': 'nights',
    'search.from': 'From',
    'search.per_night': '/ night',
    'search.around_me': 'Around me',
    'search.recent': 'Recent',
    'search.suggestions': 'Suggestions',
    'search.all_airports': 'All airports',
    'search.add_flight': 'Add flight',
    'search.max_flights': 'Maximum 4 flights for multi-destination itinerary.',
    'search.complete_flights': 'Please complete all flight legs.',
    'search.enter_destination': 'Please enter a destination.',
    'search.enter_origin': 'Please enter an origin city.',
    'search.enter_destination_flight': 'Please enter a destination.',
    'search.multi_destination': 'Multi-destination',
    'search.round_trip': 'Round trip',
    'search.one_way': 'One way',
    
    // Hôtels
    'hotel.rating': 'Rating',
    'hotel.reviews': 'reviews',
    'hotel.no_results': 'No hotels found',
    'hotel.loading': 'Loading hotels...',
    'hotel.best_price': 'Best price',
    'hotel.available': 'Available',
    'hotel.unavailable': 'Unavailable',
    'hotels.recommended': 'Recommended Hotels',
    'hotels.nearby': 'Nearby Hotels',
    'hotel.excellent': 'Excellent',
    'hotel.very_good': 'Very good',
    'hotel.good': 'Good',
    'hotel.no_offers': 'No offers available',
    'hotel.error': 'Unable to load hotels',
    
    // Collections
    'collections.eyebrow': 'The LuviaPlace Current',
    'collections.title': 'Collections',
    'collections.sub': 'Selections curated by destination and travel style.',
    
    // Recherches récentes
    'recent.searches': 'Your recent searches',
    
    // Loyalty
    'loyalty.title': 'More than a trip, your loyalty rewarded',
    'loyalty.desc': 'Discover the LuviaPlace Rewards program. Earn points on every booking.',
    
    // Paiements
    'payments.title': 'Pay the way you already do',
    'payments.sub': 'LuviaPlace accepts the most popular mobile payment methods in DRC.',
    'payments.orange': 'Orange Money',
    'payments.airtel': 'Airtel Money',
    'payments.mpesa': 'M-Pesa',
    'payments.visa': 'Visa / Mastercard',
    'payments.mobile_money': 'Mobile Money',
    'payments.card': 'Bank Card',
    
    // Features
    'best_offers.desc': 'Competitive rates on accommodation, flights and more.',
    'central_africa.desc': 'A selection curated from Kinshasa, Lubumbashi and Goma.',
    'support.desc': 'Our support team responds in English, before and during your trip.',
    
    // Détail hôtel
    'detail.overview': 'Overview',
    'detail.amenities': 'Amenities',
    'detail.rooms': 'Rooms',
    'detail.reviews': 'Reviews',
    'detail.location': 'Location',
    'detail.description': 'Description',
    'detail.book_now': 'Book now',
    'detail.price_per_night': 'Price per night',
    'detail.include_taxes': 'Taxes included',
    'detail.cancellation_policy': 'Cancellation policy',
    'detail.free_cancellation': 'Free cancellation',
    'detail.non_refundable': 'Non-refundable',
    
    // Réservation
    'booking.guest_details': 'Guest details',
    'booking.first_name': 'First name',
    'booking.last_name': 'Last name',
    'booking.email': 'Email',
    'booking.phone': 'Phone',
    'booking.payment': 'Payment',
    'booking.confirm': 'Confirm booking',
    'booking.success': 'Booking confirmed!',
    'booking.reference': 'Reference',
    
    // Footer
    'footer.explore': 'Explore',
    'footer.services': 'Services',
    'footer.company': 'Company',
    'footer.legal': 'Legal',
    'footer.about': 'About',
    'footer.careers': 'Careers',
    'footer.contact': 'Contact',
    'footer.terms': 'Terms & Conditions',
    'footer.privacy': 'Privacy',
    'footer.follow': 'Follow us',
    'footer.desc': 'The travel platform built from and for Central Africa.',
    
    // Commun
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.retry': 'Retry',
    'common.close': 'Close',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.continue': 'Continue',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.done': 'Done',
    'common.see_all': 'See all',
    'common.show_more': 'Show more',
    'common.show_less': 'Show less',
    'common.per_night': '/ night',
    'common.from': 'From',
    'common.rewards': 'Rewards Program',
    'common.apply': 'Apply',
    'best_offers': 'Best offers',
    'central_africa': 'Made for Central Africa',
    'support': 'Always here to help'
  },

  // ============================================
  // ESPAÑOL
  // ============================================
  es: {
    // Navigation
    'nav.home': 'Inicio',
    'nav.hotels': 'Alojamiento',
    'nav.flights': 'Vuelos',
    'nav.experiences': 'Experiencias',
    'nav.cars': 'Coches',
    'nav.insurance': 'Seguro',
    'nav.packages': 'Paquetes',
    'nav.login': 'Iniciar sesión',
    'nav.favorites': 'Favoritos',
    'nav.rewards': 'Programa de Recompensas',
    
    // Langues
    'language.select': 'Elige tu idioma y moneda',
    'language.tab': 'Idioma',
    'currency.tab': 'Moneda',
    'language.fr': 'Français',
    'language.en': 'English',
    'language.es': 'Español',
    'language.sw': 'Kiswahili',
    'language.pt': 'Português',
    'language.it': 'Italiano',
    'language.de': 'Deutsch',
    'language.ar': 'العربية',
    'language.zh': '中文',
    'language.ja': '日本語',
    'language.ru': 'Русский',
    'language.nl': 'Nederlands',
    
    // Devises
    'currency.africa': '🌍 África',
    'currency.international': '🌐 Internacional',
    'currency.apply': 'Aplicar',
    
    // Hero
    'hero.title': 'Tu viaje comienza aquí',
    'hero.sub': 'Alojamiento, vuelos y paquetes todo incluido — reserva todo en un solo lugar.',
    'hero.stats.hotels': 'Establecimientos',
    'hero.stats.countries': 'Países',
    'hero.stats.support': 'Soporte',
    
    // Recherche
    'search.destination': 'Destino',
    'search.checkin': 'Llegada',
    'search.checkout': 'Salida',
    'search.guests': 'Viajeros',
    'search.search': 'Buscar',
    'search.origin': 'Origen',
    'search.return': 'Regreso',
    'search.passengers': 'Pasajeros',
    'search.cabin': 'Cabina',
    'search.economy': 'Económica',
    'search.premium_economy': 'Premium Económica',
    'search.business': 'Negocios',
    'search.first': 'Primera',
    'search.adults': 'Adultos',
    'search.children': 'Niños',
    'search.infants': 'Bebés',
    'search.rooms': 'Habitaciones',
    'search.night': 'noche',
    'search.nights': 'noches',
    'search.from': 'Desde',
    'search.per_night': '/ noche',
    'search.around_me': 'Alrededor de mí',
    'search.recent': 'Recientes',
    'search.suggestions': 'Sugerencias',
    'search.all_airports': 'Todos los aeropuertos',
    'search.add_flight': 'Añadir vuelo',
    'search.max_flights': 'Máximo 4 vuelos para itinerario multi-destino.',
    'search.complete_flights': 'Por favor complete todos los vuelos.',
    'search.enter_destination': 'Por favor indique un destino.',
    'search.enter_origin': 'Por favor indique una ciudad de origen.',
    'search.enter_destination_flight': 'Por favor indique un destino.',
    'search.multi_destination': 'Multi-destino',
    'search.round_trip': 'Ida y vuelta',
    'search.one_way': 'Solo ida',
    
    // Hôtels
    'hotel.rating': 'Puntuación',
    'hotel.reviews': 'opiniones',
    'hotel.no_results': 'No se encontraron hoteles',
    'hotel.loading': 'Cargando hoteles...',
    'hotel.best_price': 'Mejor precio',
    'hotel.available': 'Disponible',
    'hotel.unavailable': 'No disponible',
    'hotels.recommended': 'Hoteles recomendados',
    'hotels.nearby': 'Hoteles cercanos',
    'hotel.excellent': 'Excelente',
    'hotel.very_good': 'Muy bueno',
    'hotel.good': 'Bueno',
    'hotel.no_offers': 'No hay ofertas disponibles',
    'hotel.error': 'No se pudieron cargar los hoteles',
    
    // Collections
    'collections.eyebrow': 'La corriente LuviaPlace',
    'collections.title': 'Colecciones',
    'collections.sub': 'Selecciones pensadas por destino y estilo de viaje.',
    
    // Recherches récentes
    'recent.searches': 'Tus búsquedas recientes',
    
    // Loyalty
    'loyalty.title': 'Más que un viaje, tu fidelidad recompensada',
    'loyalty.desc': 'Descubre el programa LuviaPlace Rewards. Gana puntos en cada reserva.',
    
    // Paiements
    'payments.title': 'Paga como ya lo haces',
    'payments.sub': 'LuviaPlace acepta los métodos de pago móvil más usados en RDC.',
    'payments.orange': 'Orange Money',
    'payments.airtel': 'Airtel Money',
    'payments.mpesa': 'M-Pesa',
    'payments.visa': 'Visa / Mastercard',
    'payments.mobile_money': 'Mobile Money',
    'payments.card': 'Tarjeta bancaria',
    
    // Features
    'best_offers.desc': 'Tarifas competitivas en alojamiento, vuelos y más.',
    'central_africa.desc': 'Una selección pensada desde Kinshasa, Lubumbashi y Goma.',
    'support.desc': 'Nuestro equipo de soporte responde en español, antes y durante el viaje.',
    
    // Détail hôtel
    'detail.overview': 'Descripción general',
    'detail.amenities': 'Servicios',
    'detail.rooms': 'Habitaciones',
    'detail.reviews': 'Opiniones',
    'detail.location': 'Ubicación',
    'detail.description': 'Descripción',
    'detail.book_now': 'Reservar ahora',
    'detail.price_per_night': 'Precio por noche',
    'detail.include_taxes': 'Impuestos incluidos',
    'detail.cancellation_policy': 'Política de cancelación',
    'detail.free_cancellation': 'Cancelación gratuita',
    'detail.non_refundable': 'No reembolsable',
    
    // Réservation
    'booking.guest_details': 'Datos del viajero',
    'booking.first_name': 'Nombre',
    'booking.last_name': 'Apellido',
    'booking.email': 'Correo electrónico',
    'booking.phone': 'Teléfono',
    'booking.payment': 'Pago',
    'booking.confirm': 'Confirmar reserva',
    'booking.success': '¡Reserva confirmada!',
    'booking.reference': 'Referencia',
    
    // Footer
    'footer.explore': 'Explorar',
    'footer.services': 'Servicios',
    'footer.company': 'Empresa',
    'footer.legal': 'Legal',
    'footer.about': 'Acerca de',
    'footer.careers': 'Carreras',
    'footer.contact': 'Contacto',
    'footer.terms': 'Condiciones generales',
    'footer.privacy': 'Privacidad',
    'footer.follow': 'Síguenos',
    'footer.desc': 'La plataforma de viajes pensada desde y para África Central.',
    
    // Commun
    'common.loading': 'Cargando...',
    'common.error': 'Error',
    'common.retry': 'Reintentar',
    'common.close': 'Cerrar',
    'common.save': 'Guardar',
    'common.cancel': 'Cancelar',
    'common.continue': 'Continuar',
    'common.back': 'Volver',
    'common.next': 'Siguiente',
    'common.done': 'Hecho',
    'common.see_all': 'Ver todo',
    'common.show_more': 'Mostrar más',
    'common.show_less': 'Mostrar menos',
    'common.per_night': '/ noche',
    'common.from': 'Desde',
    'common.rewards': 'Programa de Recompensas',
    'common.apply': 'Aplicar',
    'best_offers': 'Mejores ofertas',
    'central_africa': 'Hecho para África Central',
    'support': 'Siempre aquí para ayudar'
  },

  // ============================================
  // KISWAHILI (SWAHILI)
  // ============================================
  sw: {
    // Navigation
    'nav.home': 'Nyumbani',
    'nav.hotels': 'Makazi',
    'nav.flights': 'Ndege',
    'nav.experiences': 'Uzoefu',
    'nav.cars': 'Magari',
    'nav.insurance': 'Bima',
    'nav.packages': 'Mpaketo',
    'nav.login': 'Ingia',
    'nav.favorites': 'Vipendwa',
    'nav.rewards': 'Mpango wa Zawadi',
    
    // Langues
    'language.select': 'Chagua lugha na sarafu yako',
    'language.tab': 'Lugha',
    'currency.tab': 'Sarafu',
    'language.fr': 'Français',
    'language.en': 'English',
    'language.es': 'Español',
    'language.sw': 'Kiswahili',
    'language.pt': 'Português',
    'language.it': 'Italiano',
    'language.de': 'Deutsch',
    'language.ar': 'العربية',
    'language.zh': '中文',
    'language.ja': '日本語',
    'language.ru': 'Русский',
    'language.nl': 'Nederlands',
    
    // Devises
    'currency.africa': '🌍 Afrika',
    'currency.international': '🌐 Kimataifa',
    'currency.apply': 'Weka',
    
    // Hero
    'hero.title': 'Safari yako inaanza hapa',
    'hero.sub': 'Makazi, ndege na paket zote pamoja — weka nafasi yote mahali pamoja.',
    'hero.stats.hotels': 'Hoteli',
    'hero.stats.countries': 'Nchi',
    'hero.stats.support': 'Msaada',
    
    // Recherche
    'search.destination': 'Mahali',
    'search.checkin': 'Kuwasili',
    'search.checkout': 'Kuondoka',
    'search.guests': 'Wageni',
    'search.search': 'Tafuta',
    'search.origin': 'Mahali pa kuondoka',
    'search.return': 'Kurudi',
    'search.passengers': 'Abiria',
    'search.cabin': 'Kabati',
    'search.economy': 'Uchumi',
    'search.premium_economy': 'Uchumi wa Premium',
    'search.business': 'Biashara',
    'search.first': 'Kwanza',
    'search.adults': 'Watu wazima',
    'search.children': 'Watoto',
    'search.infants': 'Watoto wachanga',
    'search.rooms': 'Vyumba',
    'search.night': 'usiku',
    'search.nights': 'usiku',
    'search.from': 'Kuanzia',
    'search.per_night': '/ usiku',
    'search.around_me': 'Karibu yangu',
    'search.recent': 'Hivi karibuni',
    'search.suggestions': 'Mapendekezo',
    'search.all_airports': 'Viwanja vyote vya ndege',
    'search.add_flight': 'Ongeza ndege',
    'search.max_flights': 'Upeo wa ndege 4 kwa safari ya maeneo mengi.',
    'search.complete_flights': 'Tafadhali kamilisha ndege zote.',
    'search.enter_destination': 'Tafadhali weka mahali unakoenda.',
    'search.enter_origin': 'Tafadhali weka mji wa kuondokea.',
    'search.enter_destination_flight': 'Tafadhali weka mahali unakoenda.',
    'search.multi_destination': 'Maeneo mengi',
    'search.round_trip': 'Kwenda na kurudi',
    'search.one_way': 'Kwenda tu',
    
    // Hôtels
    'hotel.rating': 'Alama',
    'hotel.reviews': 'maoni',
    'hotel.no_results': 'Hakuna hoteli zilizopatikana',
    'hotel.loading': 'Inapakia hoteli...',
    'hotel.best_price': 'Bei nzuri',
    'hotel.available': 'Inapatikana',
    'hotel.unavailable': 'Haipatikani',
    'hotels.recommended': 'Hoteli zilizopendekezwa',
    'hotels.nearby': 'Hoteli zilizo karibu',
    'hotel.excellent': 'Bora',
    'hotel.very_good': 'Nzuri sana',
    'hotel.good': 'Nzuri',
    'hotel.no_offers': 'Hakuna ofa',
    'hotel.error': 'Impossible kupakia hoteli',
    
    // Collections
    'collections.eyebrow': 'Mkondo wa LuviaPlace',
    'collections.title': 'Mikusanyiko',
    'collections.sub': 'Uchaguzi uliofanywa kwa mahali na aina ya safari.',
    
    // Recherches récentes
    'recent.searches': 'Utafutaji wako wa hivi karibuni',
    
    // Loyalty
    'loyalty.title': 'Zaidi ya safari, uaminifu wako unathawabishwa',
    'loyalty.desc': 'Gundua mpango wa LuviaPlace Rewards. Pata pointi kwa kila nafasi unayoweka.',
    
    // Paiements
    'payments.title': 'Lipa jinsi unavyofanya tayari',
    'payments.sub': 'LuviaPlace inakubali njia za malipo za simu zinazotumika zaidi nchini DRC.',
    'payments.orange': 'Orange Money',
    'payments.airtel': 'Airtel Money',
    'payments.mpesa': 'M-Pesa',
    'payments.visa': 'Visa / Mastercard',
    'payments.mobile_money': 'Mobile Money',
    'payments.card': 'Kadi ya benki',
    
    // Features
    'best_offers.desc': 'Bei shindani kwa makazi, ndege na zaidi.',
    'central_africa.desc': 'Uchaguzi uliofanywa kutoka Kinshasa, Lubumbashi na Goma.',
    'support.desc': 'Timu yetu ya msaada inajibu kwa Kiswahili, kabla na wakati wa safari.',
    
    // Détail hôtel
    'detail.overview': 'Muhtasari',
    'detail.amenities': 'Vifaa',
    'detail.rooms': 'Vyumba',
    'detail.reviews': 'Maoni',
    'detail.location': 'Eneo',
    'detail.description': 'Maelezo',
    'detail.book_now': 'Weka nafasi sasa',
    'detail.price_per_night': 'Bei kwa usiku',
    'detail.include_taxes': 'Kodi zimejumuishwa',
    'detail.cancellation_policy': 'Sera ya kufuta',
    'detail.free_cancellation': 'Kufuta bila malipo',
    'detail.non_refundable': 'Haijarejeshwa',
    
    // Réservation
    'booking.guest_details': 'Maelezo ya msafiri',
    'booking.first_name': 'Jina la kwanza',
    'booking.last_name': 'Jina la mwisho',
    'booking.email': 'Barua pepe',
    'booking.phone': 'Simu',
    'booking.payment': 'Malipo',
    'booking.confirm': 'Thibitisha nafasi',
    'booking.success': 'Nafasi imethibitishwa!',
    'booking.reference': 'Rejea',
    
    // Footer
    'footer.explore': 'Gundua',
    'footer.services': 'Huduma',
    'footer.company': 'Kampuni',
    'footer.legal': 'Sheria',
    'footer.about': 'Kuhusu',
    'footer.careers': 'Kazi',
    'footer.contact': 'Wasiliana',
    'footer.terms': 'Masharti',
    'footer.privacy': 'Faragha',
    'footer.follow': 'Tufuate',
    'footer.desc': 'Jukwaa la usafiri lililoundwa kutoka na kwa Afrika ya Kati.',
    
    // Commun
    'common.loading': 'Inapakia...',
    'common.error': 'Hitilafu',
    'common.retry': 'Jaribu tena',
    'common.close': 'Funga',
    'common.save': 'Hifadhi',
    'common.cancel': 'Ghairi',
    'common.continue': 'Endelea',
    'common.back': 'Rudi',
    'common.next': 'Ijayo',
    'common.done': 'Imekamilika',
    'common.see_all': 'Ona yote',
    'common.show_more': 'Ona zaidi',
    'common.show_less': 'Ona kidogo',
    'common.per_night': '/ usiku',
    'common.from': 'Kuanzia',
    'common.rewards': 'Mpango wa Zawadi',
    'common.apply': 'Weka',
    'best_offers': 'Ofa bora',
    'central_africa': 'Imetengenezwa kwa Afrika ya Kati',
    'support': 'Tuko hapa kusaidia'
  }
};

// Exporter pour utilisation
if (typeof module !== 'undefined' && module.exports) {
  module.exports = translations;
}
