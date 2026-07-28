// ============================================
// hotels-details.js - Page détail hôtel (CORRIGÉ - SANS ÉMOJIS)
// ============================================

// ============================================
// CONFIGURATION
// ============================================
const API_BASE_URL = 'https://luvia-place-v2-1.onrender.com';
const qp = new URLSearchParams(window.location.search);
const hotelId = qp.get('hotelId') || '';
let checkin = qp.get('checkin') || '';
let checkout = qp.get('checkout') || '';
let adults = qp.get('adults') || '2';
let children = qp.get('children') || '0';
let childrenAges = qp.get('childrenAges') || '';
let currentHotel = null;
let currentRateInfo = [];
let currentImages = [];
let galleryImages = [];
let galleryIndex = 0;
let roomGalleries = {};
let amenitiesVisible = false;
let aiConversationHistory = [];
let isAiLoading = false;
let isLoggedIn = false;

// ============================================
// ICONS SVG
// ============================================
const ICONS = {
    // Capacité
    capacity: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    // Taille chambre
    size: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>',
    // Lit
    bed: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8"/><path d="M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4"/><path d="M6 6h.01"/><path d="M18 6h.01"/><path d="M8 14h8"/></svg>',
    // Économie
    savings: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z"/></svg>',
    // Annulation gratuite
    freeCancellation: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    // Non remboursable
    nonRefundable: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    // Verrou (membre)
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    // Étoile
    star: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    // Flèche droite
    arrowRight: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
    // Flèche gauche
    arrowLeft: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    // Coins (LuviaCoins)
    coins: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/><path d="M12 6v12M8 8h8M8 16h8" stroke="#fff" stroke-width="1.5"/></svg>',
    // Check (confirmation)
    check: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    // Fermer (close)
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    // Localisation
    location: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    // Menu hamburger
    menu: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    // Langue
    globe: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    // Favoris (cœur)
    heart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    // Retour
    back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
    // Info (alerte)
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    // Plus
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    // Moins
    minus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    // Cadenas badge (style original)
    lockBadge: '<svg width="14" height="14" viewBox="0 0 13 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.668 15.72H2.33464C1.4138 15.72 0.667969 14.9741 0.667969 14.0533V7.38664C0.667969 6.4658 1.4138 5.71997 2.33464 5.71997H10.668C11.5888 5.71997 12.3346 6.4658 12.3346 7.38664V14.0533C12.3346 14.9741 11.5888 15.72 10.668 15.72Z" fill="#1A360B"/><path d="M6.50391 12.2658L6.50391 10.009" stroke="#C1EBAB" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M6.50115 9.17432C6.18661 9.17432 5.93133 9.4296 5.93361 9.74414C5.93361 10.0587 6.18889 10.314 6.50343 10.314C6.81797 10.314 7.07325 10.0587 7.07325 9.74414C7.07325 9.4296 6.81797 9.17432 6.50115 9.17432Z" stroke="#C1EBAB" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.66406 6.53335L3.66406 4.76074" stroke="#1A360B" stroke-width="1.4031" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.66345 4.76077C3.09185 3.30289 3.81042 1.65743 5.2683 1.08583C6.72619 0.514223 8.37164 1.2328 8.94325 2.69068" stroke="#1A360B" stroke-width="1.4031" stroke-miterlimit="10" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

// ============================================
// VÉRIFICATION CONNEXION
// ============================================
function checkIfLoggedIn() {
    if (typeof window.auth !== 'undefined' && window.auth.isLoggedIn) {
        return window.auth.isLoggedIn();
    }
    try {
        const cachedUser = localStorage.getItem('luviaplace_user');
        if (cachedUser) {
            const user = JSON.parse(cachedUser);
            if (user && user.email) {
                return true;
            }
        }
    } catch (e) {}
    return false;
}

// ============================================
// SYNCHRONISATION DES PRIX
// ============================================
function updatePrices(pricePerNight) {
    const fromPrice = document.getElementById('fromPrice');
    if (fromPrice) {
        fromPrice.textContent = '$' + pricePerNight + ' / nuit';
    }
    const mobilePrice = document.getElementById('mobileFromPriceAmount');
    if (mobilePrice) {
        mobilePrice.textContent = '$' + pricePerNight;
    }
}

// ============================================
// GALERIE MODALE
// ============================================
function openGalleryModal(index) {
    galleryIndex = index || 0;
    const modal = document.getElementById('galleryModal');
    const img = document.getElementById('modalImage');
    const counter = document.getElementById('modalCounter');
    if (galleryImages.length === 0) return;
    img.src = galleryImages[galleryIndex];
    counter.textContent = (galleryIndex + 1) + ' / ' + galleryImages.length;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeGalleryModal() {
    document.getElementById('galleryModal').classList.remove('open');
    document.body.style.overflow = '';
}

function changeGalleryImage(direction) {
    galleryIndex = (galleryIndex + direction + galleryImages.length) % galleryImages.length;
    const img = document.getElementById('modalImage');
    const counter = document.getElementById('modalCounter');
    img.src = galleryImages[galleryIndex];
    counter.textContent = (galleryIndex + 1) + ' / ' + galleryImages.length;
}

// ============================================
// MODAL DÉTAILS CHAMBRE
// ============================================
function openRoomDetailModal(room) {
    const modal = document.getElementById('roomDetailModal');
    const body = document.getElementById('roomDetailBody');

    const amenitiesHtml = (room.roomAmenities || []).map(function(a) {
        return '<span>' + escapeHtml(a) + '</span>';
    }).join('');

    const ratesHtml = (room.rates || []).map(function(rate) {
        const refundClass = rate.refundableTag === 'RFN' ? 'rfn' : 'nrfn';
        const refundLabel = rate.refundableTag === 'RFN' ? 'Annulation gratuite' : 'Non remboursable';
        const savingsPct = rate.originalRate && rate.originalRate > rate.retailRate ?
            '<span style="font-size:12px;color:var(--green);font-weight:600;">' + ICONS.savings + ' Économisez ' + Math.round((1 - rate.retailRate / rate.originalRate) * 100) + '%</span>' :
            '';

        return '<div class="rate-option">' +
            '<div><div class="rate-name">' + escapeHtml(rate.board || 'Chambre seule') + '</div>' +
            '<div class="rate-sub">' + escapeHtml(rate.rateName) + ' ' + savingsPct + '</div>' +
            '<span class="refund-badge ' + refundClass + '">' + (rate.refundableTag === 'RFN' ? ICONS.freeCancellation + ' ' : ICONS.nonRefundable + ' ') + refundLabel + '</span></div>' +
            '<div style="text-align:right;"><div class="rate-price">$' + Math.round(rate.retailRate) + ' <span class="per">/ total</span></div>' +
            '<button class="cta-btn-sm" onclick="reserverChambre(\'' + rate.offerId + '\', ' + rate.retailRate + ', \'' + escapeHtml(room.roomName).replace(/'/g, "\\'") + '\', ' + (rate.refundableTag === 'RFN' ? 'true' : 'false') + ');closeRoomDetailModal();">Réserver</button></div>' +
            '</div>';
    }).join('');

    body.innerHTML =
        '<h2>' + escapeHtml(room.roomName) + '</h2>' +
        '<div class="room-meta">' +
        (room.maxOccupancy ? '<span>' + ICONS.capacity + ' Capacité ' + room.maxOccupancy + '</span>' : '') +
        (room.roomSizeSquare ? '<span>' + ICONS.size + ' ' + room.roomSizeSquare + ' m²</span>' : '') +
        (room.bedTypes && room.bedTypes.length ? '<span>' + ICONS.bed + ' ' + escapeHtml(room.bedTypes.join(', ')) + '</span>' : '') +
        '</div>' +
        (room.description ? '<div class="room-description">' + escapeHtml(room.description) + '</div>' : '') +
        (room.roomAmenities && room.roomAmenities.length ? '<div class="room-amenities">' + amenitiesHtml + '</div>' : '') +
        '<h3 style="font-family:var(--font-head);font-weight:700;font-size:16px;margin-bottom:12px;">Tarifs disponibles</h3>' +
        ratesHtml;

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeRoomDetailModal() {
    document.getElementById('roomDetailModal').classList.remove('open');
    document.body.style.overflow = '';
}

// ============================================
// INSTALLATIONS - VOIR PLUS
// ============================================
function toggleAmenities() {
    amenitiesVisible = !amenitiesVisible;
    const pills = document.querySelectorAll('#hAmenities .amenity-pill');
    const btn = document.getElementById('amenitiesToggle');
    pills.forEach(function(pill, index) {
        if (index >= 8) {
            pill.style.display = amenitiesVisible ? 'flex' : 'none';
        }
    });
    btn.textContent = amenitiesVisible ? 'Voir moins' : 'Voir plus (' + (pills.length - 8) + ' autres)';
}

// ============================================
// CHAMBRES - GALERIE PAR CHAMBRE
// ============================================
function changeRoomImage(roomId, direction) {
    if (!roomGalleries[roomId]) return;
    const gallery = roomGalleries[roomId];
    gallery.index = (gallery.index + direction + gallery.images.length) % gallery.images.length;
    const img = document.getElementById('roomImg-' + roomId);
    const counter = document.getElementById('roomCounter-' + roomId);
    if (img) img.src = gallery.images[gallery.index];
    if (counter) counter.textContent = (gallery.index + 1) + ' / ' + gallery.images.length;
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================
function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s);
    if (isNaN(d)) return s;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function showError(msg) {
    document.getElementById('loadingSkeleton').classList.add('hidden');
    document.getElementById('hotelContent').classList.add('hidden');
    document.getElementById('errorMsg').classList.remove('hidden');
    document.getElementById('errorText').textContent = msg;
}

function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    document.querySelectorAll('.tab-link').forEach(function(l) {
        l.classList.remove('active');
    });
    document.querySelectorAll('.tab-link').forEach(function(l) {
        const tabText = l.textContent.trim().toLowerCase().replace(/\s+/g, '');
        const targetId = id.toLowerCase().replace('-', '');
        if (tabText === targetId) {
            l.classList.add('active');
        }
    });
}

function getNights(checkin, checkout) {
    if (!checkin || !checkout) return 1;
    const start = new Date(checkin);
    const end = new Date(checkout);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 1;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getCurrencySymbol(currency) {
    const symbols = {
        'USD': '$',
        'EUR': '€',
        'GBP': '£',
        'CDF': 'FC',
        'XAF': 'FCFA',
        'XOF': 'FCFA',
        'NGN': '₦',
        'GHS': 'GH₵',
        'ZAR': 'R',
        'KES': 'KSh',
        'TZS': 'TSh',
        'UGX': 'USh'
    };
    return symbols[currency] || currency + ' ';
}

const AMENITY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>';
const HIGHLIGHT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z"/></svg>';

// ============================================
// CHARGEMENT DES DONNÉES (CORRIGÉ)
// ============================================
async function loadHotel() {
    if (!hotelId) { showError("Aucun identifiant d'hôtel fourni dans le lien."); return; }

    isLoggedIn = checkIfLoggedIn();

    // Affichage du résumé
    document.getElementById('sumDestSeg').textContent = qp.get('hotelName') || 'Hôtel';
    document.getElementById('sumDatesSeg').textContent = (checkin && checkout) ? (fmtDate(checkin) + ' - ' + fmtDate(checkout)) : '—';
    
    let guestsText = adults + ' adulte' + (adults > 1 ? 's' : '');
    if (children > 0) {
        guestsText += ', ' + children + ' enfant' + (children > 1 ? 's' : '');
    }
    document.getElementById('sumGuestsSeg').textContent = guestsText;
    document.getElementById('modCheckin').value = checkin;
    document.getElementById('modCheckout').value = checkout;
    document.getElementById('modGuests').textContent = guestsText;

    document.getElementById('loadingSkeleton').classList.remove('hidden');

    const detailsPromise = fetch(API_BASE_URL + '/hotel-details?hotelId=' + encodeURIComponent(hotelId) + '&environment=production')
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });

    const ratesPromise = (checkin && checkout) ?
        fetch(API_BASE_URL + '/search-rates?hotelId=' + encodeURIComponent(hotelId) 
            + '&checkin=' + checkin 
            + '&checkout=' + checkout 
            + '&adults=' + adults
            + (children > 0 ? '&children=' + children : '')
            + (childrenAges ? '&childrenAges=' + childrenAges : '')
            + '&environment=production&maxRates=100')
        .then(function(r) { return r.json(); })
        .catch(function() { return null; }) :
        Promise.resolve(null);

    const reviewsPromise = fetch(API_BASE_URL + '/hotel-reviews?hotelId=' + encodeURIComponent(hotelId) + '&environment=production')
        .then(function(r) { return r.json(); })
        .catch(function() { return null; });

    const results = await Promise.all([detailsPromise, ratesPromise, reviewsPromise]);
    const detailsRes = results[0],
        ratesRes = results[1],
        reviewsRes = results[2];

    if ((!detailsRes || !detailsRes.success) && (!ratesRes || !ratesRes.success)) {
        showError('Cet hôtel est introuvable ou temporairement indisponible.');
        return;
    }

    const hotel = (detailsRes && detailsRes.success) ? detailsRes.data : {};
    const hotelInfoFallback = (ratesRes && ratesRes.success) ? ratesRes.hotelInfo : {};
    currentHotel = hotel;

    const name = hotel.name || hotelInfoFallback.name || 'Hôtel sans nom';
    const address = hotel.address || hotelInfoFallback.address || '';
    const city = hotel.city || hotelInfoFallback.city || '';
    const country = hotel.country || hotelInfoFallback.country || '';
    const fullAddress = [address, city, country].filter(Boolean).join(', ') || 'Adresse non disponible';

    const starRating = hotel.starRating || hotelInfoFallback.starRating || 0;
    const rating = hotel.rating || hotelInfoFallback.rating || null;
    const reviewCount = hotel.reviewCount || hotelInfoFallback.reviewCount || 0;
    const mainPhoto = hotel.main_photo || hotelInfoFallback.main_photo || '';

    let images = (hotel.hotelImages || []).map(function(i) { return i.url; }).filter(Boolean);
    if (mainPhoto) images.unshift(mainPhoto);
    if (images.length === 0) images = ['https://picsum.photos/seed/hotel-' + hotelId + '/1200/800'];
    currentImages = images;
    galleryImages = images;

    document.title = name + ' — LuviaPlace';
    document.getElementById('hName').textContent = name;
    document.getElementById('hAddress').textContent = fullAddress;
    document.getElementById('mapLink').href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(fullAddress);

    const starDisplay = starRating > 0 ? Math.min(Math.round(starRating), 5) : 3;
    let starHtml = '';
    if (starDisplay > 0) {
        starHtml = ICONS.star.repeat(starDisplay);
    }
    document.getElementById('hStars').innerHTML = starHtml;

    // Galerie
    const galleryHtml = images.slice(0, 5).map(function(url, i) {
        const last = i === Math.min(images.length, 5) - 1;
        const moreBtn = last && images.length > 5 ?
            '<button class="gallery-more" onclick="event.stopPropagation();openGalleryModal(0)">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15l5-5 4 4 4-4 5 5"/></svg>' +
            'Afficher toutes les images</button>' :
            '';
        return '<div onclick="openGalleryModal(' + i + ')"><img src="' + url + '" alt="' + name + '" loading="lazy">' + moreBtn + '</div>';
    }).join('');
    document.getElementById('gallery').innerHTML = galleryHtml;

    // Points forts
    const highlightGrid = document.getElementById('highlightGrid');
    const facilities = hotel.hotelFacilities || [];
    if (facilities.length) {
        highlightGrid.innerHTML = facilities.slice(0, 6).map(function(f) {
            return '<div class="highlight-card"><div class="h-icon">' + HIGHLIGHT_ICON + '</div><h4>' + escapeHtml(f) + '</h4><p>Disponible dans cet établissement.</p></div>';
        }).join('');
    } else {
        highlightGrid.innerHTML = '<p style="color:var(--ink-soft);font-size:13.5px;">Aucune information disponible pour le moment.</p>';
    }

    // Installations
    const amenitiesContainer = document.getElementById('hAmenities');
    if (facilities.length) {
        const allAmenities = facilities.map(function(f) {
            return '<div class="amenity-pill">' + AMENITY_ICON + escapeHtml(f) + '</div>';
        }).join('');
        amenitiesContainer.innerHTML = allAmenities;
        const pills = amenitiesContainer.querySelectorAll('.amenity-pill');
        pills.forEach(function(pill, index) {
            if (index >= 8) pill.style.display = 'none';
        });
        if (pills.length > 8) {
            document.getElementById('amenitiesToggle').style.display = 'inline';
            document.getElementById('amenitiesToggle').textContent = 'Voir plus (' + (pills.length - 8) + ' autres)';
        } else {
            document.getElementById('amenitiesToggle').style.display = 'none';
        }
    } else {
        amenitiesContainer.innerHTML = '<p style="color:var(--ink-soft);font-size:13.5px;">Liste des équipements non disponible.</p>';
        document.getElementById('amenitiesToggle').style.display = 'none';
    }

    // Note et avis
    if (rating) {
        document.getElementById('hScoreNum').textContent = rating.toFixed(1);
        document.getElementById('hReviewCount').textContent = 'Basé sur ' + reviewCount + ' avis';
        const scoreLabel = document.getElementById('scoreLabel');
        if (scoreLabel) {
            scoreLabel.textContent = getRatingLabel(rating);
        }
        const scoreNum = document.getElementById('hScoreNum');
        if (scoreNum) {
            scoreNum.style.backgroundColor = getRatingColor(rating);
        }
    }

    // Description
    const desc = hotel.hotelDescription || hotel.description || '';
    document.getElementById('hDescription').innerHTML = desc || 'Description non disponible pour le moment.';

    // Avis
    if (reviewsRes && reviewsRes.success && Array.isArray(reviewsRes.data) && reviewsRes.data.length) {
        renderReviews(reviewsRes.data);
        renderQuotePills(reviewsRes.data);
        renderTravelerTypes(reviewsRes.data);
    } else {
        document.getElementById('reviewsContainer').innerHTML = '<p style="color:var(--ink-soft);font-size:13.5px;">Aucun avis détaillé disponible pour le moment.</p>';
    }

    // Tarifs
    currentRateInfo = (ratesRes && ratesRes.success) ? ratesRes.rateInfo : [];
    renderRooms(currentRateInfo, hotel);
    loadHighlights(hotelId, 'fr');

    document.getElementById('loadingSkeleton').classList.add('hidden');
    document.getElementById('hotelContent').classList.remove('hidden');
}

// ============================================
// AFFICHAGE DES AVIS
// ============================================
function renderReviews(reviews) {
    const container = document.getElementById('reviewsContainer');

    if (!reviews || reviews.length === 0) {
        container.innerHTML = '<p style="color:var(--ink-soft);font-size:13.5px;text-align:center;padding:20px;">Aucun avis disponible pour le moment.</p>';
        return;
    }

    const totalReviews = reviews.length;
    const avgRating = reviews.reduce(function(sum, r) { return sum + (r.rating || 0); }, 0) / totalReviews;

    const scoreNum = document.getElementById('hScoreNum');
    const scoreLabel = document.getElementById('scoreLabel');
    const reviewCount = document.getElementById('hReviewCount');

    if (scoreNum) {
        scoreNum.textContent = avgRating ? avgRating.toFixed(1) : 'N/A';
        scoreNum.style.backgroundColor = getRatingColor(avgRating);
    }
    if (scoreLabel) {
        scoreLabel.textContent = getRatingLabel(avgRating);
    }
    if (reviewCount) {
        reviewCount.textContent = 'Basé sur ' + totalReviews + ' avis';
    }

    let displayCount = 4;
    const displayedReviews = reviews.slice(0, displayCount);

    container.innerHTML = displayedReviews.map(function(rv) {
        const author = rv.reviewerName || rv.author || rv.name || 'Voyageur';
        const text = rv.comment || rv.text || rv.reviewComments || rv.review || '';
        const score = rv.rating || rv.score || rv.overallRating || 0;
        const date = rv.date || rv.reviewDate || '';
        const type = rv.type || rv.travelerType || '';
        const ratingColor = getRatingColor(score);

        return `
            <div class="review-card">
                <div class="review-header">
                    <div class="reviewer-info">
                        <div class="flex gap-2 flex-column md:flex-row">
                            <h4>${escapeHtml(author)}</h4>
                            ${type ? `<span class="room-type"><span class="hidden md:inline">•</span> ${escapeHtml(type)}</span>` : ''}
                        </div>
                        <p class="review-date">${date ? fmtDate(date) : ''}</p>
                    </div>
                    <div class="ribbon review-rating" style="background-color: ${ratingColor};">${score}</div>
                </div>
                <div class="review-content">
                    <p>${text ? escapeHtml(text) : 'Avis sans commentaire.'}</p>
                </div>
            </div>
        `;
    }).join('');

    if (totalReviews > displayCount) {
        const showMoreDiv = document.createElement('div');
        showMoreDiv.className = 'show-more-reviews';
        showMoreDiv.innerHTML = `
            <button class="load-more--btn" id="loadMoreReviews">Charger plus d'avis</button>
            <div class="reviews-count">
                <p>Affichage de ${displayCount} sur ${totalReviews} avis</p>
            </div>
        `;
        container.appendChild(showMoreDiv);

        document.getElementById('loadMoreReviews').addEventListener('click', function() {
            const currentCount = container.querySelectorAll('.review-card').length;
            const newCount = Math.min(currentCount + 4, totalReviews);

            const newReviews = reviews.slice(currentCount, newCount);
            newReviews.forEach(function(rv) {
                const author = rv.reviewerName || rv.author || rv.name || 'Voyageur';
                const text = rv.comment || rv.text || rv.reviewComments || rv.review || '';
                const score = rv.rating || rv.score || rv.overallRating || 0;
                const date = rv.date || rv.reviewDate || '';
                const type = rv.type || rv.travelerType || '';
                const ratingColor = getRatingColor(score);

                const card = document.createElement('div');
                card.className = 'review-card';
                card.innerHTML = `
                    <div class="review-header">
                        <div class="reviewer-info">
                            <div class="flex gap-2 flex-column md:flex-row">
                                <h4>${escapeHtml(author)}</h4>
                                ${type ? `<span class="room-type"><span class="hidden md:inline">•</span> ${escapeHtml(type)}</span>` : ''}
                            </div>
                            <p class="review-date">${date ? fmtDate(date) : ''}</p>
                        </div>
                        <div class="ribbon review-rating" style="background-color: ${ratingColor};">${score}</div>
                    </div>
                    <div class="review-content">
                        <p>${text ? escapeHtml(text) : 'Avis sans commentaire.'}</p>
                    </div>
                `;
                container.insertBefore(card, showMoreDiv);
            });

            const countDisplay = container.querySelector('.reviews-count p');
            if (countDisplay) {
                countDisplay.textContent = 'Affichage de ' + newCount + ' sur ' + totalReviews + ' avis';
            }
            if (newCount >= totalReviews) {
                showMoreDiv.style.display = 'none';
            }
        });
    }
}

// ============================================
// FONCTIONS POUR LES NOTES
// ============================================
function getRatingColor(rating) {
    if (rating >= 9) return '#12805C';
    if (rating >= 8) return '#10A760';
    if (rating >= 7) return '#F5A623';
    if (rating >= 6) return '#F59E0B';
    if (rating >= 5) return '#F97316';
    return '#D92D20';
}

function getRatingLabel(rating) {
    if (rating >= 9) return 'Fabuleux';
    if (rating >= 8.5) return 'Merveilleux';
    if (rating >= 8) return 'Très bien';
    if (rating >= 7) return 'Bien';
    if (rating >= 6) return 'Agréable';
    return 'Correct';
}

// ============================================
// QUOTE PILLS - MEILLEURS COMMENTAIRES
// ============================================
function renderQuotePills(reviews) {
    const container = document.getElementById('quotePills');
    if (!container || !reviews || reviews.length === 0) {
        container.innerHTML = '';
        return;
    }

    const themes = {
        'Propreté': 0,
        'Service': 0,
        'Emplacement': 0,
        'Qualité de la chambre': 0,
        'Équipements': 0,
        'Rapport qualité-prix': 0,
        'Alimentation et boissons': 0
    };

    reviews.forEach(function(rv) {
        const text = (rv.comment || rv.text || '').toLowerCase();
        if (text.includes('propre') || text.includes('propreté')) themes['Propreté'] += 0.5;
        if (text.includes('service') || text.includes('personnel')) themes['Service'] += 0.5;
        if (text.includes('emplacement') || text.includes('situé') || text.includes('centre')) themes['Emplacement'] += 0.5;
        if (text.includes('chambre') || text.includes('confort')) themes['Qualité de la chambre'] += 0.5;
        if (text.includes('équipement') || text.includes('piscine') || text.includes('parking')) themes['Équipements'] += 0.5;
        if (text.includes('prix') || text.includes('qualité-prix') || text.includes('tarif')) themes['Rapport qualité-prix'] += 0.5;
        if (text.includes('petit-déjeuner') || text.includes('restaurant') || text.includes('repas')) themes['Alimentation et boissons'] += 0.5;
    });

    const avgRating = reviews.reduce(function(sum, r) { return sum + (r.rating || 0); }, 0) / reviews.length;

    const quoteData = [
        { label: 'Propreté', score: Math.min(10, avgRating + 0.5) },
        { label: 'Service', score: Math.min(10, avgRating + 1) },
        { label: 'Emplacement', score: Math.min(10, avgRating + 1.5) },
        { label: 'Qualité de la chambre', score: Math.min(10, avgRating + 0.8) },
        { label: 'Équipements', score: Math.min(10, avgRating + 0.3) },
        { label: 'Rapport qualité-prix', score: Math.min(10, avgRating - 0.2) },
        { label: 'Alimentation et boissons', score: Math.min(10, avgRating - 0.5) }
    ];

    container.innerHTML = quoteData.map(function(item) {
        return `
            <span class="p-tag" title="${escapeHtml(getCommentForTheme(item.label))}" style="${item.score >= 8 ? 'background:var(--green-bg);color:var(--green);' : ''}">
                ${escapeHtml(item.label)} (${item.score.toFixed(1)})
            </span>
        `;
    }).join('');
}

function getCommentForTheme(theme) {
    const comments = {
        'Propreté': 'Généralement positif sur la propreté',
        'Service': 'Service régulièrement salué',
        'Emplacement': 'Emplacement pratique mentionné positivement',
        'Qualité de la chambre': 'Bonne qualité des chambres',
        'Équipements': 'Équipements corrects',
        'Rapport qualité-prix': 'Bon rapport qualité-prix',
        'Alimentation et boissons': 'Qualité de la restauration'
    };
    return comments[theme] || '';
}

// ============================================
// TRAVELER TYPES - QUI RESTE ICI
// ============================================
function renderTravelerTypes(reviews) {
    const container = document.getElementById('travelerTypes');
    if (!container || !reviews || reviews.length === 0) {
        container.innerHTML = '';
        return;
    }

    const types = {
        'solo': { label: 'Solo', icon: 'user', count: 0 },
        'family': { label: 'Famille', icon: 'family', count: 0 },
        'couple': { label: 'Couple', icon: 'heart', count: 0 },
        'group': { label: 'Amis/Groupe', icon: 'users', count: 0 }
    };

    reviews.forEach(function(rv) {
        const type = (rv.type || rv.travelerType || '').toLowerCase();
        if (type.includes('solo')) types.solo.count++;
        else if (type.includes('family') || type.includes('famille')) types.family.count++;
        else if (type.includes('couple')) types.couple.count++;
        else if (type.includes('group') || type.includes('groupe')) types.group.count++;
        else types.solo.count++;
    });

    const total = reviews.length;
    const icons = {
        'user': '<svg class="svg-inline--fa fa-user" viewBox="0 0 448 512"><path fill="currentColor" d="M320 128a96 96 0 1 0 -192 0 96 96 0 1 0 192 0zM96 128a128 128 0 1 1 256 0A128 128 0 1 1 96 128zM32 480l384 0c-1.2-79.7-66.2-144-146.3-144l-91.4 0c-80 0-145 64.3-146.3 144zM0 482.3C0 383.8 79.8 304 178.3 304l91.4 0C368.2 304 448 383.8 448 482.3c0 16.4-13.3 29.7-29.7 29.7L29.7 512C13.3 512 0 498.7 0 482.3z"/></svg>',
        'family': '<svg class="svg-inline--fa fa-family" viewBox="0 0 512 512"><path fill="currentColor" d="M128 96a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm0-96a64 64 0 1 1 0 128A64 64 0 1 1 128 0zM105.6 192c-25 0-45.8 19.1-47.8 44l-4.1 49.3C52.1 304 66.8 320 85.6 320l59.6 0c-.7 5.2-1.1 10.6-1.1 16l0 16-48 0 0 144c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-147.7c-26.5-9.5-44.7-35.8-42.2-65.6l4.1-49.3C29.3 191.9 64 160 105.6 160l44.8 0c7 0 13.8 .9 20.2 2.6c-1.7 6.9-2.6 14-2.6 21.4c0 3.9 .3 7.8 .8 11.6c-5.7-2.4-11.9-3.6-18.4-3.6l-44.8 0zM416 384l-49.6 0c1-5.2 1.6-10.5 1.6-16l0-16 101.6 0L430.5 215.2C426.6 201.5 414 192 399.7 192l-31.4 0c-11.5 0-21.8 6.1-27.5 15.6c2.1-7.5 3.2-15.4 3.2-23.6c0-6.3-.7-12.5-1.9-18.4c8.1-3.6 17-5.6 26.2-5.6l31.4 0c28.6 0 53.7 18.9 61.5 46.4l39.1 136.8c5.8 20.4-9.5 40.8-30.8 40.8L448 384l0 112c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-112zM384 96a32 32 0 1 0 0-64 32 32 0 1 0 0 64zm0-96a64 64 0 1 1 0 128A64 64 0 1 1 384 0zM256 208a24 24 0 1 0 0-48 24 24 0 1 0 0 48zm0-80a56 56 0 1 1 0 112 56 56 0 1 1 0-112zm0 160c-26.5 0-48 21.5-48 48l0 32c0 8.8 7.2 16 16 16l64 0c8.8 0 16-7.2 16-16l0-32c0-26.5-21.5-48-48-48zM208 413.3c-18.6-6.6-32-24.4-32-45.3l0-32c0-44.2 35.8-80 80-80s80 35.8 80 80l0 32c0 20.9-13.4 38.7-32 45.3l0 82.7c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-80-32 0 0 80c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-82.7z"/></svg>',
        'heart': '<svg class="svg-inline--fa fa-heart" viewBox="0 0 512 512"><path fill="currentColor" d="M244 130.6l-12-13.5-4.2-4.7c-26-29.2-65.3-42.8-103.8-35.8c-53.3 9.7-92 56.1-92 110.3l0 3.5c0 32.3 13.4 63.1 37.1 85.1L253 446.8c.8 .7 1.9 1.2 3 1.2s2.2-.4 3-1.2L443 275.5c23.6-22 37-52.8 37-85.1l0-3.5c0-54.2-38.7-100.6-92-110.3c-38.5-7-77.8 6.6-103.8 35.8l-4.2 4.7-12 13.5c-3 3.4-7.4 5.4-12 5.4s-8.9-2-12-5.4zm34.9-57.1C311 48.4 352.7 37.7 393.7 45.1C462.2 57.6 512 117.3 512 186.9l0 3.5c0 36-13.1 70.6-36.6 97.5c-3.4 3.8-6.9 7.5-10.7 11l-184 171.3c-.8 .8-1.7 1.5-2.6 2.2c-6.3 4.9-14.1 7.5-22.1 7.5c-9.2 0-18-3.5-24.8-9.7L47.2 299c-3.8-3.5-7.3-7.2-10.7-11C13.1 261 0 226.4 0 190.4l0-3.5C0 117.3 49.8 57.6 118.3 45.1c40.9-7.4 82.6 3.2 114.7 28.4c6.7 5.3 13 11.1 18.7 17.6l4.2 4.7 4.2-4.7c4.2-4.7 8.6-9.1 13.3-13.1c1.8-1.5 3.6-3 5.4-4.5z"/></svg>',
        'users': '<svg class="svg-inline--fa fa-users" viewBox="0 0 640 512"><path fill="currentColor" d="M96 80a48 48 0 1 1 96 0A48 48 0 1 1 96 80zm128 0A80 80 0 1 0 64 80a80 80 0 1 0 160 0zm96 80a64 64 0 1 1 0 128 64 64 0 1 1 0-128zm0 160a96 96 0 1 0 0-192 96 96 0 1 0 0 192zm-58.7 64l117.3 0c54.2 0 98.4 42.5 101.2 96l-319.7 0c2.8-53.5 47-96 101.2-96zm0-32C187.7 352 128 411.7 128 485.3c0 14.7 11.9 26.7 26.7 26.7l330.7 0c14.7 0 26.7-11.9 26.7-26.7C512 411.7 452.3 352 378.7 352l-117.3 0zM512 32a48 48 0 1 1 0 96 48 48 0 1 1 0-96zm0 128A80 80 0 1 0 512 0a80 80 0 1 0 0 160zm16 64c44.2 0 80 35.8 80 80c0 8.8 7.2 16 16 16s16-7.2 16-16c0-61.9-50.1-112-112-112l-84 0c2.6 10.2 4 21 4 32l80 0zm-336 0c0-11 1.4-21.8 4-32l-84 0C50.1 192 0 242.1 0 304c0 8.8 7.2 16 16 16s16-7.2 16-16c0-44.2 35.8-80 80-80l80 0z"/></svg>'
    };

    const typeOrder = ['solo', 'couple', 'family', 'group'];

    container.innerHTML = typeOrder.map(function(key) {
        const type = types[key];
        const percentage = total > 0 ? Math.round((type.count / total) * 100) : 0;
        return `
            <div class="traveler-type">
                <div class="icon-container">${icons[type.icon] || icons.user}</div>
                <p>${type.label}</p>
                <p class="percentage">${percentage}%</p>
            </div>
        `;
    }).join('');
}

// ============================================
// AFFICHAGE DES CHAMBRES (CORRIGÉ avec prix membre)
// ============================================
function renderRooms(rateInfo, hotel) {
    const roomsById = {};
    (hotel.rooms || []).forEach(function(r) {
        roomsById[r.id] = r;
    });
    const container = document.getElementById('roomsContainer');

    if (!rateInfo || !rateInfo.length) {
        container.innerHTML = '<div class="state-msg" style="padding:40px 0;"><h3>Aucune disponibilité</h3><p>Essayez d\'autres dates.</p></div>';
        document.getElementById('fromPrice').textContent = '—';
        return;
    }

    const nights = getNights(checkin, checkout);
    let minAll = Infinity;
    rateInfo.forEach(function(r) {
        if (r.retailRate > 0 && r.retailRate < minAll) minAll = r.retailRate;
    });
    if (isFinite(minAll) && minAll > 0) {
        const pricePerNight = Math.round(minAll / nights);
        updatePrices(pricePerNight);
    }

    const breakfastOnly = document.getElementById('breakfastFilter').checked;
    const currentCurrency = localStorage.getItem('luviaplace_currency') || 'USD';

    // Grouper par type de chambre
    const groups = {};
    rateInfo.forEach(function(rate) {
        const key = rate.mappedRoomId || rate.rateName || 'chambre';
        if (!groups[key]) {
            groups[key] = {
                room: roomsById[rate.mappedRoomId] || null,
                rateName: rate.rateName,
                rates: []
            };
        }
        groups[key].rates.push(rate);
    });

    const groupValues = Object.values(groups);
    if (!groupValues.length) {
        container.innerHTML = '<div class="state-msg" style="padding:40px 0;"><h3>Aucune chambre ne correspond</h3><p>Essayez de désactiver le filtre petit-déjeuner.</p></div>';
        return;
    }

    container.innerHTML = groupValues.map(function(group, groupIndex) {
        const room = group.room;
        const roomId = room ? room.id : 'room-' + groupIndex;
        const roomName = (room && room.roomName) || group.rateName || 'Chambre';

        let roomPhotos = (room && room.photos && room.photos.length) ?
            room.photos.map(function(p) { return p.url; }).filter(Boolean) :
            (currentImages.length ? currentImages : ['https://picsum.photos/seed/room-' + roomId + '/500/380']);

        if (roomPhotos.length === 0) {
            roomPhotos = ['https://picsum.photos/seed/room-' + roomId + '/500/380'];
        }

        roomGalleries[roomId] = {
            images: roomPhotos,
            index: 0
        };

        const metaParts = [];
        if (room && room.roomSizeSquare) metaParts.push(room.roomSizeSquare + ' m²');
        if (room && room.maxOccupancy) metaParts.push('Capacité ' + room.maxOccupancy);
        if (room && room.bedTypes && room.bedTypes.length) metaParts.push(room.bedTypes.join(', '));

        let ratesHtml = group.rates.map(function(rate) {
            if (breakfastOnly && !/petit|breakfast|dej|BB|BI/i.test(rate.board || '')) return '';

            const refundable = rate.refundableTag === 'RFN';
            const boardLabel = /petit|breakfast|dej|BB|BI/i.test(rate.board || '') ? 'Chambre avec petit-déjeuner' : 'Chambre seule';
            const savingsPct = rate.originalRate && rate.originalRate > rate.retailRate ? Math.round((1 - rate.retailRate / rate.originalRate) * 100) : 0;
            
            const pricePerNight = Math.round(rate.retailRate / nights);
            const totalPrice = Math.round(rate.retailRate);
            
            const publicPricePerNight = pricePerNight + (pricePerNight * 0.10);
            const publicTotalPrice = totalPrice + (totalPrice * 0.10);
            
            const displayPricePerNight = pricePerNight;
            const displayTotalPrice = totalPrice;
            
            let displayPrice = displayPricePerNight;
            let publicPrice = publicPricePerNight;
            let displayTotal = displayTotalPrice;
            let publicTotal = publicTotalPrice;
            
            if (typeof window.convertPrice === 'function') {
                displayPrice = window.convertPrice(displayPricePerNight, 'USD', currentCurrency);
                publicPrice = window.convertPrice(publicPricePerNight, 'USD', currentCurrency);
                displayTotal = window.convertPrice(displayTotalPrice, 'USD', currentCurrency);
                publicTotal = window.convertPrice(publicTotalPrice, 'USD', currentCurrency);
            }
            
            const currencySymbol = getCurrencySymbol(currentCurrency);
            const priceDisplay = currencySymbol + displayPrice.toFixed(2);
            const publicPriceDisplay = currencySymbol + publicPrice.toFixed(2);
            const totalDisplay = currencySymbol + displayTotal.toFixed(2);
            const publicTotalDisplay = currencySymbol + publicTotal.toFixed(2);

            let memberBadge = '';
            if (!isLoggedIn) {
                memberBadge = '<div class="member-badge">' +
                    ICONS.lockBadge +
                    '<span class="badge-text">Connectez-vous pour économiser 10%</span>' +
                '</div>';
            }

            return '<div class="rate-row">' +
                '<div class="rate-info"><div class="board">' + boardLabel + '</div>' +
                '<div class="sub">' + escapeHtml(rate.board || 'Room Only') + '</div>' +
                '<span class="refund-tag ' + (refundable ? 'rfn' : 'nrfn') + '">' + (refundable ? ICONS.freeCancellation + ' Annulation gratuite' : ICONS.nonRefundable + ' Non remboursable') + '</span>' +
                memberBadge +
                '</div>' +
                '<div class="rate-side">' +
                (savingsPct > 0 ? '<span class="savings-pill">' + ICONS.savings + ' Économisez ' + savingsPct + '%</span>' : '') +
                '<div class="rate-price">' + 
                (rate.originalRate && rate.originalRate > rate.retailRate ? '<div class="strike">' + priceDisplay + '</div>' : '') +
                '<div class="amount">' + priceDisplay + ' <span class="per">/ nuit</span></div>' +
                (!isLoggedIn ? '<div class="public-price" style="font-size:11px;color:var(--ink-soft);">Prix public <s>' + publicPriceDisplay + '</s></div>' : '') +
                '<div class="note">Total ' + totalDisplay + ' pour ' + nights + ' nuit' + (nights > 1 ? 's' : '') + 
                (!isLoggedIn ? ' (public: ' + publicTotalDisplay + ')' : '') +
                '</div></div>' +
                '<button class="cta-btn-sm" onclick="reserverChambre(\'' + rate.offerId + '\', ' + rate.retailRate + ', \'' + escapeHtml(roomName).replace(/'/g, "\\'") + '\', ' + (refundable ? 'true' : 'false') + ')">Choisir</button>' +
                '</div></div>';
        }).filter(function(html) { return html !== ''; }).join('');

        if (!ratesHtml) return '';

        // Préparer les données pour le modal
        const roomData = {
            roomName: roomName,
            maxOccupancy: room.maxOccupancy || 0,
            roomSizeSquare: room.roomSizeSquare || 0,
            bedTypes: room.bedTypes || [],
            description: room.description || '',
            roomAmenities: room.roomAmenities || [],
            rates: group.rates.map(function(rate) {
                return {
                    rateName: rate.rateName || 'Chambre',
                    board: rate.board || 'Room Only',
                    retailRate: rate.retailRate,
                    originalRate: rate.originalRate,
                    refundableTag: rate.refundableTag,
                    offerId: rate.offerId
                };
            })
        };

        return '<div class="room-group">' +
            '<div class="room-group-head">' +
            '<div class="thumb">' +
            '<button class="room-gallery-nav prev" onclick="event.stopPropagation();changeRoomImage(\'' + roomId + '\', -1)">‹</button>' +
            '<img id="roomImg-' + roomId + '" src="' + roomPhotos[0] + '" alt="' + escapeHtml(roomName) + '" loading="lazy">' +
            '<button class="room-gallery-nav next" onclick="event.stopPropagation();changeRoomImage(\'' + roomId + '\', 1)">›</button>' +
            '<span class="room-image-counter" id="roomCounter-' + roomId + '">1 / ' + roomPhotos.length + '</span>' +
            '</div>' +
            '<h4>' + escapeHtml(roomName) + '</h4>' +
            '<div class="meta">' + metaParts.map(function(m) { return '<span>' + escapeHtml(m) + '</span>'; }).join('') + '</div>' +
            '<button class="details-link" onclick="openRoomDetailModal(' + JSON.stringify(roomData).replace(/"/g, '&quot;') + ')">Voir les détails</button>' +
            '</div>' +
            '<div class="room-rates">' + ratesHtml + '</div>' +
            '</div>';
    }).join('');
}

// ============================================
// RECHARGER LES TARIFS (CORRIGÉ)
// ============================================
function reloadRates() {
    const newCheckin = document.getElementById('modCheckin').value;
    const newCheckout = document.getElementById('modCheckout').value;
    if (!newCheckin || !newCheckout) return;
    const url = new URL(window.location.href);
    url.searchParams.set('checkin', newCheckin);
    url.searchParams.set('checkout', newCheckout);
    if (children) url.searchParams.set('children', children);
    if (childrenAges) url.searchParams.set('childrenAges', childrenAges);
    window.location.href = url.toString();
}

document.getElementById('breakfastFilter').addEventListener('change', function() {
    renderRooms(currentRateInfo, currentHotel || {});
});

// ============================================
// RÉSERVER UNE CHAMBRE (CORRIGÉ)
// ============================================
function reserverChambre(offerId, price, roomName, refundable) {
    const hotelName = document.getElementById('hName') ? document.getElementById('hName').textContent : '';
    const url = 'prebook.html?offerId=' + encodeURIComponent(offerId) +
        '&hotelId=' + encodeURIComponent(hotelId) +
        '&checkin=' + checkin + '&checkout=' + checkout + 
        '&adults=' + adults +
        (children > 0 ? '&children=' + children : '') +
        (childrenAges ? '&childrenAges=' + childrenAges : '') +
        '&price=' + encodeURIComponent(price || '') +
        '&roomName=' + encodeURIComponent(roomName || '') +
        '&hotelName=' + encodeURIComponent(hotelName) +
        '&refundable=' + (refundable ? '1' : '0');
    window.location.href = url;
}

// ============================================
// ASK AI
// ============================================
function askAi() {
    const input = document.getElementById('aiInput');
    const question = input.value.trim();
    const sendBtn = document.getElementById('aiSendBtn');
    const statusEl = document.getElementById('aiStatus');
    const responseEl = document.getElementById('aiResponse');
    const answerEl = document.getElementById('aiAnswer');
    const sourceEl = document.getElementById('aiSource');
    const errorEl = document.getElementById('aiError');
    const errorTextEl = document.getElementById('aiErrorText');
    const loadingEl = document.getElementById('aiLoading');

    if (!question) {
        showToast('Veuillez poser une question.');
        return;
    }
    if (!hotelId) {
        showToast('Aucun hôtel sélectionné.');
        return;
    }
    if (isAiLoading) return;
    isAiLoading = true;

    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;"></span>';
    statusEl.style.display = 'inline';
    responseEl.style.display = 'none';
    errorEl.style.display = 'none';
    loadingEl.style.display = 'block';

    aiConversationHistory.push({ role: 'user', content: question });

    fetch('/api/ask-hotel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hotelId: hotelId,
                question: question,
                allowWebSearch: false,
                language: localStorage.getItem('luviaplace_language') || 'fr'
            })
        })
        .then(function(response) {
            if (!response.ok) {
                return response.json().then(function(data) {
                    throw new Error(data.error?.message || data.message || 'Erreur lors de la requête');
                }).catch(function() {
                    throw new Error('Erreur lors de la requête');
                });
            }
            return response.json();
        })
        .then(function(data) {
            if (data.success && data.data && data.data.answer) {
                const answer = data.data.answer;
                const searchUsed = data.data.search_used || false;
                const citations = data.data.citations || [];

                aiConversationHistory.push({ role: 'assistant', content: answer });
                answerEl.textContent = answer;

                let sourceText = '';
                if (searchUsed) {
                    sourceText = '🔍 Réponse enrichie par recherche web';
                } else if (citations && citations.length > 0) {
                    sourceText = '📚 Sources: ' + citations.join(', ');
                } else {
                    sourceText = '📋 Réponse basée sur les informations de l\'hôtel';
                }
                sourceEl.textContent = sourceText;

                responseEl.style.display = 'block';
                loadingEl.style.display = 'none';
                input.value = '';
            } else {
                throw new Error('Aucune réponse reçue');
            }
        })
        .catch(function(error) {
            console.error('❌ Erreur IA:', error);
            errorTextEl.textContent = error.message || 'Une erreur est survenue. Veuillez réessayer.';
            errorEl.style.display = 'block';
            loadingEl.style.display = 'none';
        })
        .finally(function() {
            isAiLoading = false;
            sendBtn.disabled = false;
            sendBtn.innerHTML = `
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M5 12h14M13 6l6 6-6 6"/>
                </svg>
            `;
            statusEl.style.display = 'none';
        });
}

function askQuickQuestion(question) {
    document.getElementById('aiInput').value = question;
    askAi();
}

function showToast(message) {
    const toast = document.getElementById('toast');
    if (toast) {
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
    }
}

// ============================================
// CHARGEMENT DES POINTS FORTS (HIGHLIGHTS)
// ============================================
async function loadHighlights(hotelId, language) {
    language = language || 'fr';
    const container = document.getElementById('highlightGrid');

    container.innerHTML = `
        <div class="highlight-skeleton">
            <div class="skeleton-icon"></div>
            <div class="skeleton-title"></div>
            <div class="skeleton-desc"></div>
            <div class="skeleton-desc"></div>
        </div>
        <div class="highlight-skeleton">
            <div class="skeleton-icon"></div>
            <div class="skeleton-title"></div>
            <div class="skeleton-desc"></div>
            <div class="skeleton-desc"></div>
        </div>
        <div class="highlight-skeleton">
            <div class="skeleton-icon"></div>
            <div class="skeleton-title"></div>
            <div class="skeleton-desc"></div>
            <div class="skeleton-desc"></div>
        </div>
    `;

    try {
        const response = await fetch('/api/hotel-highlights', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                hotelId: hotelId,
                language: language,
                count: 3,
                tone: 'professionnel et invitant',
                style: 'titres courts, descriptions d\'une phrase'
            })
        });

        if (!response.ok) {
            throw new Error('HTTP ' + response.status);
        }

        const data = await response.json();

        if (data.success && data.data && data.data.highlights && data.data.highlights.length > 0) {
            renderHighlights(data.data.highlights, data.data.generated);
        } else {
            const facilities = currentHotel?.hotelFacilities || [];
            if (facilities.length > 0) {
                renderFallbackHighlights(facilities);
            } else {
                container.innerHTML = '<p style="color:var(--ink-soft);font-size:13.5px;grid-column:1/-1;text-align:center;padding:20px;">Aucune information disponible pour le moment.</p>';
            }
        }
    } catch (error) {
        console.warn('⚠️ Erreur chargement highlights:', error);
        const facilities = currentHotel?.hotelFacilities || [];
        if (facilities.length > 0) {
            renderFallbackHighlights(facilities);
        } else {
            container.innerHTML = '<p style="color:var(--ink-soft);font-size:13.5px;grid-column:1/-1;text-align:center;padding:20px;">Aucune information disponible pour le moment.</p>';
        }
    }
}

// ============================================
// RENDU DES HIGHLIGHTS - CORRIGÉ
// ============================================
function renderHighlights(highlights, generated) {
    const container = document.getElementById('highlightGrid');

    const svgIcons = {
        'location': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
        'experience': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
        'features': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
        'service': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
        'dining': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v8a4 4 0 0 0 8 0V3"/><path d="M7 3v4"/><path d="M11 3v8a4 4 0 0 0 8 0V3"/><path d="M15 3v4"/></svg>`,
        'amenities': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`
    };

    const defaultIcon = svgIcons['features'];

    container.innerHTML = highlights.map(function(highlight) {
        const iconSvg = svgIcons[highlight.type] || defaultIcon;

        return `
            <div class="highlight-wrapper">
                <div class="highlight-card ${highlight.type || ''}">
                    <div class="card-icon-wrapper">
                        <span class="card-icon">${iconSvg}</span>
                        <h2 class="card-title">${escapeHtml(highlight.title || 'Point fort')}</h2>
                    </div>
                    <p class="card-description">${escapeHtml(highlight.description || '')}</p>
                    ${!generated ? '<span style="font-size:10px;color:var(--ink-soft);opacity:0.6;">Basé sur les informations disponibles</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// FALLBACK : Utiliser les équipements disponibles
// ============================================
function renderFallbackHighlights(facilities) {
    const container = document.getElementById('highlightGrid');

    const shuffled = facilities.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 3);

    const iconSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;

    container.innerHTML = selected.map(function(facility) {
        return `
            <div class="highlight-wrapper">
                <div class="highlight-card">
                    <div class="card-icon-wrapper">
                        <span class="card-icon">${iconSvg}</span>
                        <h2 class="card-title">${escapeHtml(facility)}</h2>
                    </div>
                    <p class="card-description">Disponible dans cet établissement.</p>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// UI - MENU
// ============================================
const switcherBtn = document.getElementById('switcherBtn');
const switcherMenu = document.getElementById('switcherMenu');
if (switcherBtn && switcherMenu) {
    switcherBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        switcherMenu.classList.toggle('open');
    });
    document.addEventListener('click', function() {
        switcherMenu.classList.remove('open');
    });
}

// ============================================
// INITIALISATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const cachedUser = localStorage.getItem('luviaplace_user');
    if (cachedUser) {
        try {
            const user = JSON.parse(cachedUser);
            if (user && user.email) {
                const loginBtns = document.querySelectorAll('#loginBtn, .btn-primary[data-i18n="nav.login"]');
                const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilisateur';
                loginBtns.forEach(function(btn) {
                    btn.textContent = '👤 ' + name;
                    btn.classList.add('logged-in');
                    btn.dataset.loggedIn = 'true';
                });

                const accountTrigger = document.getElementById('accountTrigger');
                if (accountTrigger) {
                    accountTrigger.style.display = 'flex';
                    const avatarName = document.getElementById('avatarName');
                    const avatarInitials = document.getElementById('avatarInitials');
                    if (avatarName) avatarName.textContent = name;
                    if (avatarInitials) {
                        const initials = name.split(' ').map(function(n) { return n[0]; }).join('').toUpperCase().slice(0, 2);
                        avatarInitials.textContent = initials;
                    }
                }
            }
        } catch (e) {
            console.warn('⚠️ Erreur lecture cache utilisateur:', e);
        }
    }

    loadHotel();
});

// Événements d'authentification
document.addEventListener('userLoggedIn', function(e) {
    const user = e.detail.user;
    const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilisateur';

    const loginBtns = document.querySelectorAll('#loginBtn, .btn-primary[data-i18n="nav.login"]');
    loginBtns.forEach(function(btn) {
        btn.textContent = '👤 ' + name;
        btn.classList.add('logged-in');
        btn.dataset.loggedIn = 'true';
    });

    const accountTrigger = document.getElementById('accountTrigger');
    if (accountTrigger) {
        accountTrigger.style.display = 'flex';
        const avatarName = document.getElementById('avatarName');
        const avatarInitials = document.getElementById('avatarInitials');
        if (avatarName) avatarName.textContent = name;
        if (avatarInitials) {
            const initials = name.split(' ').map(function(n) { return n[0]; }).join('').toUpperCase().slice(0, 2);
            avatarInitials.textContent = initials;
        }
    }

    if (currentHotel && currentRateInfo) {
        renderRooms(currentRateInfo, currentHotel);
    }
});

document.addEventListener('userLoggedOut', function() {
    const loginBtns = document.querySelectorAll('#loginBtn, .btn-primary[data-i18n="nav.login"]');
    loginBtns.forEach(function(btn) {
        btn.textContent = 'Se connecter';
        btn.classList.remove('logged-in');
        btn.dataset.loggedIn = 'false';
    });

    const accountTrigger = document.getElementById('accountTrigger');
    if (accountTrigger) {
        accountTrigger.style.display = 'none';
    }

    if (currentHotel && currentRateInfo) {
        renderRooms(currentRateInfo, currentHotel);
    }
});

// Gestion des touches Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeGalleryModal();
        closeRoomDetailModal();
    }
});
