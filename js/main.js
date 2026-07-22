// ============================================
// main.js - Fichier principal LuviaPlace (CORRIGÉ)
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    var API_BASE_URL = 'https://luvia-place-v2-1-plh1.onrender.com';
    var sharedState = { dest: '' };

    // ============================================
    // UTILITAIRES
    // ============================================
    function scrollHorizontal(id, amount) {
        var c = document.getElementById(id);
        if (c) c.scrollBy({ left: amount, behavior: 'smooth' });
    }
    window.scrollHorizontal = scrollHorizontal;

    function getNights(a, b) {
        if (!a || !b) return 1;
        var d = Math.ceil(Math.abs(new Date(b) - new Date(a)) / 86400000);
        return d > 0 ? d : 1;
    }

    function formatDate(d) {
        return d.toISOString().slice(0, 10);
    }

    function addDays(base, days) {
        var d = new Date(base);
        d.setDate(d.getDate() + days);
        return d;
    }

    function getDefaultCheckin() {
        return formatDate(addDays(new Date(), 1));
    }

    function getDefaultCheckout() {
        return formatDate(addDays(new Date(), 4));
    }

    var toastEl = document.getElementById('toast');
    var toastTimer;

    function showToast(msg) {
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function() {
            toastEl.classList.remove('show');
        }, 3200);
    }

    function flagFieldError(el) {
        if (!el) return;
        var f = el.closest('.field') || el;
        f.classList.add('field-error');
        setTimeout(function() {
            f.classList.remove('field-error');
        }, 1600);
    }

    function mapWithConcurrency(items, limit, worker) {
        return new Promise(function(resolve) {
            var results = new Array(items.length),
                next = 0,
                done = 0;
            if (items.length === 0) { resolve(results); return; }

            function runNext() {
                if (next >= items.length) return;
                var i = next++;
                worker(items[i], i).then(function(r) {
                    results[i] = r;
                    done++;
                    if (done === items.length) resolve(results);
                    else runNext();
                }).catch(function() {
                    results[i] = null;
                    done++;
                    if (done === items.length) resolve(results);
                    else runNext();
                });
            }
            for (var k = 0; k < Math.min(limit, items.length); k++) runNext();
        });
    }

    // Villes avec plusieurs aéroports
    var MULTI_AIRPORT_CITIES = {
        'londres': 'LON',
        'london': 'LON',
        'paris': 'PAR',
        'new york': 'NYC',
        'tokyo': 'TYO',
        'moscou': 'MOW',
        'moscow': 'MOW'
    };

    // ============================================
    // API CALLS
    // ============================================
    async function searchPlaces(query) {
        if (!query || query.length < 2) return [];
        try {
            var res = await fetch(API_BASE_URL + '/search-places?query=' + encodeURIComponent(query) + '&environment=production');
            var data = await res.json();
            if (data.success && data.data) {
                return data.data.map(function(p) {
                    return {
                        placeId: p.placeId || p.id,
                        name: p.name || p.displayName || p.label || 'Lieu sans nom',
                        address: p.address || p.formattedAddress || '',
                        country: p.country || ''
                    };
                });
            }
            return [];
        } catch (e) {
            console.error('Erreur searchPlaces:', e);
            return [];
        }
    }

    async function searchHotels(params) {
        try {
            var qp = new URLSearchParams({
                checkin: params.checkin || getDefaultCheckin(),
                checkout: params.checkout || getDefaultCheckout(),
                adults: params.adults || 2,
                environment: params.environment || 'production',
                limit: params.limit || 200
            });
            if (params.placeId) qp.append('placeId', params.placeId);
            if (params.aiSearch) qp.append('city', params.aiSearch);
            if (params.hotelId) qp.append('hotelId', params.hotelId);
            var res = await fetch(API_BASE_URL + '/search-hotels?' + qp.toString(), { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.json();
        } catch (e) {
            console.error('Erreur searchHotels:', e);
            return { success: false, hotels: [], error: e.message };
        }
    }

    async function getUserLocation() {
        var services = [
            { url: 'https://ipapi.co/json/', parse: function(d) { return { city: d.city, country: d.country_name || d.country, countryCode: d.country_code || d.country }; } },
            { url: 'https://geolocation-db.com/json/', parse: function(d) { return { city: d.city, country: d.country_name, countryCode: d.country_code }; } }
        ];
        for (var i = 0; i < services.length; i++) {
            try {
                var controller = new AbortController();
                var t = setTimeout(function() { controller.abort(); }, 5000);
                var res = await fetch(services[i].url, { signal: controller.signal });
                clearTimeout(t);
                if (!res.ok) continue;
                var data = await res.json();
                var loc = services[i].parse(data);
                if (loc.city && loc.city !== 'unknown' && loc.city !== 'undefined') return loc;
            } catch (e) {}
        }
        try {
            var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            var map = {
                'Africa/Kinshasa': { city: 'Kinshasa', country: 'RDC', countryCode: 'CD' },
                'Africa/Lubumbashi': { city: 'Lubumbashi', country: 'RDC', countryCode: 'CD' },
                'Europe/Paris': { city: 'Paris', country: 'France', countryCode: 'FR' },
                'Europe/London': { city: 'Londres', country: 'Royaume-Uni', countryCode: 'GB' }
            };
            if (tz && map[tz]) return map[tz];
            if (tz) {
                var region = tz.split('/')[0];
                if (region === 'Africa') return { city: 'Kinshasa', country: 'RDC', countryCode: 'CD' };
                if (region === 'Europe') return { city: 'Paris', country: 'France', countryCode: 'FR' };
            }
        } catch (e) {}
        return { city: 'Kinshasa', country: 'RDC', countryCode: 'CD' };
    }

    // ============================================
    // DONNÉES STATIQUES
    // ============================================
    var RECOMMENDED_CITIES = [
        { name: 'Paris', placeId: 'ChIJD7fiBh9u5kcRYJSMaMOCCwQ' },
        { name: 'Londres', placeId: 'ChIJdd4hrwug2EcRmSrV3Vo6llI' },
        { name: 'Milan', placeId: 'ChIJ51cu8IcbhkcRp5qU6z_f2rM' },
        { name: 'Le Cap', placeId: 'ChIJ1-4miA9QzB0R2I6FhH8uO5I' },
        { name: 'Marrakech', placeId: 'ChIJsbqj5zvepQ0R8X5Fg87gFJQ' }
    ];

    var COLLECTIONS = [
        { id: 'nairobi-top-20', title: "Our Top 20 Hotels in Nairobi", image: 'https://nuitee-hotels.b-cdn.net/hotels/ex_2fb9d9b9_z.jpg?height=480&quality=80&sharpen=true', hotelNames: ['Glee Nairobi, a Preferred LVX Hotel', 'Hyatt House Nairobi Westlands', 'Pan Pacific Serviced Suites Nairobi', 'Radisson Blu Hotel Nairobi Upper Hill', 'Fairview Hotel Nairobi, Vignette Collection by IHG', 'Hilton Garden Inn Nairobi Airport', 'Hemingways Nairobi'] },
        { id: 'kinshasa-exception', title: "Séjours d'exception à Kinshasa", image: 'https://nuitee-hotels.b-cdn.net/hotels/553418150.jpg?height=480&quality=80&sharpen=true', hotelNames: ['Protea Hotel by Marriott Kinshasa', 'Hotel Finesse', 'Ixoras Hotel', 'Four Points By Sheraton Kinshasa', 'Hilton Kinshasa', 'Léon Hôtel Kinshasa', 'Golden Tulip Kin-Oasis Kinshasa'] },
        { id: 'international-ideal', title: "Votre hébergement idéal pour l'international", image: 'https://nuitee-hotels.b-cdn.net/hotels/345067577.jpg?width=1200&height=800&quality=85&sharpen=true', hotelNames: ['Hyatt Place Dubai Al Rigga', 'Novotel Paris Centre Bercy', 'Royal Beach Tel Aviv by Isrotel exclusive', 'Fairmont Century Plaza Los Angeles at Beverly Hills', 'Only YOU Hotel Málaga'] },
        { id: 'kivu-escape', title: "Escapades au bord du lac Kivu", image: 'https://nuitee-hotels.b-cdn.net/hotels/291961649.jpg?width=1200&height=800&quality=85&sharpen=true', hotelNames: ['Lake Kivu Serena Hotel', 'Kivu Lodge', 'Bella Vista Hotel', 'Hotel Des Mille Collines', 'Kivu Paradise Resort'] }
    ];

    // ============================================
    // AFFICHAGE DES HÔTELS
    // ============================================
    function displayHotelsScroll(containerId, hotelsData, title) {
        var container = document.getElementById(containerId);
        if (!container) return;
        container.innerHTML = '';

        if (!hotelsData || hotelsData.success === false) {
            container.innerHTML = '<div class="error-state">' + window.t('hotel.error') + '</div>';
            return;
        }
        if (!hotelsData.hotels || hotelsData.hotels.length === 0) {
            container.innerHTML = '<div class="empty-state">' + window.t('hotel.no_results') + '</div>';
            return;
        }

        var hotels = hotelsData.hotels.filter(function(h) { return h.minPrice && h.minPrice > 0; }).slice(0, 6);
        if (hotels.length === 0) {
            container.innerHTML = '<div class="empty-state">' + window.t('hotel.no_offers') + '</div>';
            return;
        }

        var checkin = getDefaultCheckin(),
            checkout = getDefaultCheckout(),
            nights = getNights(checkin, checkout);
        var currentLang = localStorage.getItem('luviaplace_language') || 'fr';
        var currentCurrency = localStorage.getItem('luviaplace_currency') || 'USD';

        hotels.forEach(async function(hotel) {
            var starRating = hotel.starRating || 3,
                fullStars = Math.min(Math.round(starRating), 5);
            var starHtml = '★'.repeat(fullStars) + '☆'.repeat(5 - fullStars);
            var pricePerNightUSD = Math.round(hotel.minPrice / nights);
            var rating = hotel.rating || 0;

            var ratingText = '';
            if (rating >= 8) ratingText = window.t('hotel.excellent');
            else if (rating >= 7) ratingText = window.t('hotel.very_good');
            else ratingText = window.t('hotel.good');

            var reviewCount = hotel.reviewCount || 0;
            var hotelId = hotel.id || '';

            var convertedPrice = pricePerNightUSD;
            if (typeof window.convertPrice === 'function') {
                convertedPrice = window.convertPrice(pricePerNightUSD, 'USD', currentCurrency);
            }
            var formattedPrice = '';
            if (typeof window.formatPrice === 'function') {
                formattedPrice = window.formatPrice(convertedPrice, currentCurrency);
            } else {
                formattedPrice = '$' + convertedPrice.toFixed(2);
            }

            var div = document.createElement('div');
            div.className = 'hotel-card-scroll';
            div.tabIndex = 0;
            div.setAttribute('role', 'link');

            var goTo = function() {
                if (hotelId) window.location.href = 'hotel-detail.html?hotelId=' + encodeURIComponent(hotelId) + '&checkin=' + checkin + '&checkout=' + checkout + '&adults=2';
            };
            div.addEventListener('click', goTo);
            div.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault();
                    goTo(); }
            });

            var img = document.createElement('img');
            img.loading = 'lazy';
            img.alt = hotel.name || 'Hôtel';
            img.src = hotel.main_photo || ('https://picsum.photos/seed/' + encodeURIComponent(hotelId || Math.random()) + '/500/380');

            var photo = document.createElement('div');
            photo.className = 'photo';
            photo.appendChild(img);

            var body = document.createElement('div');
            body.className = 'body';

            var translatedReviews = reviewCount + ' ' + window.t('hotel.reviews');
            var translatedPerNight = window.t('search.per_night');

            body.innerHTML =
                '<div class="stars">' + starHtml + '</div>' +
                '<h3>' + (hotel.name || 'Hôtel sans nom') + '</h3>' +
                '<div class="location">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                '<path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/>' +
                '<circle cx="12" cy="9" r="2.4"/>' +
                '</svg>' +
                '<span>' + (hotel.address || hotel.city || 'Adresse non disponible') + '</span>' +
                '</div>' +
                '<div class="card-bottom">' +
                '<div class="score-pill">' +
                '<div class="score-num">' + (rating > 0 ? rating.toFixed(1) : 'N/A') + '</div>' +
                '<div class="score-text">' + ratingText + '<b>' + translatedReviews + '</b></div>' +
                '</div>' +
                '<div class="price">' +
                '<div class="amount">' + formattedPrice + '</div>' +
                '<div class="per">' + translatedPerNight + '</div>' +
                '</div>' +
                '</div>';

            div.appendChild(photo);
            div.appendChild(body);
            container.appendChild(div);
        });
    }

    function displayCollections(results) {
        var container = document.getElementById('collectionsContainer');
        if (!container) return;
        container.innerHTML = '';
        results.forEach(function(result) {
            var collection = result.collection,
                hotels = result.hotels,
                found = result.total,
                expected = result.expected;
            var div = document.createElement('div');
            div.className = 'collection-card';
            div.tabIndex = 0;
            div.setAttribute('role', 'link');
            div.setAttribute('aria-label', collection.title);
            var goTo = function() { window.location.href = 'collection.html?id=' + encodeURIComponent(collection.id); };
            div.addEventListener('click', goTo);
            div.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault();
                    goTo(); } });
            var preview = hotels.slice(0, 2).map(function(h) { return h.name; }).join(' • ') + (found > 2 ? ' • +' + (found - 2) + ' autres' : '');
            div.innerHTML = '<img src="' + collection.image + '" alt="" loading="lazy"><div class="info"><div class="top"><h4></h4><div class="collection-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 17L17 7M9 7h8v8"/></svg></div></div><div class="count">' + found + '/' + expected + ' propriétés</div><div style="font-size:11px;opacity:.75;margin-top:4px;"></div></div>';
            div.querySelector('h4').textContent = collection.title;
            div.querySelector('.info > div:last-child').textContent = preview;
            container.appendChild(div);
        });
    }

    // ============================================
    // CHARGEMENT DES DONNÉES
    // ============================================
    async function loadCollectionByName(collection) {
        var checkin = getDefaultCheckin(),
            checkout = getDefaultCheckout();
        var matches = await mapWithConcurrency(collection.hotelNames, 4, async function(hotelName) {
            var result = await searchHotels({ checkin: checkin, checkout: checkout, adults: 2, aiSearch: hotelName, environment: 'production', limit: 3 });
            if (!result.success || !result.hotels || result.hotels.length === 0) return null;
            var matched = null,
                best = 0;
            result.hotels.forEach(function(hotel) {
                var nameLower = (hotel.name || '').toLowerCase(),
                    searchLower = hotelName.toLowerCase(),
                    score = 0;
                if (nameLower === searchLower) score = 100;
                else if (nameLower.includes(searchLower) || searchLower.includes(nameLower)) score = 50;
                else {
                    var words2 = searchLower.split(' ');
                    score = nameLower.split(' ').filter(function(w) { return w.length > 2 && words2.indexOf(w) !== -1; }).length * 10;
                }
                if (score > best) { best = score;
                    matched = hotel; }
            });
            return matched && matched.id ? matched : null;
        });
        var allHotels = matches.filter(Boolean);
        return { collection: collection, hotels: allHotels, total: allHotels.length, expected: collection.hotelNames.length };
    }

    async function loadAllCollections() {
        var container = document.getElementById('collectionsContainer');
        if (container) container.innerHTML = COLLECTIONS.map(function() { return '<div class="skeleton-collection"><div class="skeleton-line skeleton w70"></div><div class="skeleton-line skeleton w40"></div></div>'; }).join('');
        try {
            var results = await mapWithConcurrency(COLLECTIONS, 2, loadCollectionByName);
            displayCollections(results.filter(Boolean));
        } catch (e) {
            if (container) container.innerHTML = '<div class="error-state">Impossible de charger les collections pour le moment.</div>';
        }
    }

    async function loadRecommendations() {
        var checkin = getDefaultCheckin(),
            checkout = getDefaultCheckout();
        var container = document.getElementById('recommendedHotels');
        if (container) container.innerHTML = Array.from({ length: 3 }).map(function() { return '<div class="skeleton-scroll"><div class="skeleton-photo skeleton"></div><div class="body"><div class="skeleton-line skeleton w90"></div><div class="skeleton-line skeleton w70"></div><div class="skeleton-line skeleton w50"></div><div class="skeleton-line skeleton w40"></div></div></div>'; }).join('');
        for (var i = 0; i < RECOMMENDED_CITIES.length; i++) {
            var city = RECOMMENDED_CITIES[i];
            try {
                var result = await searchHotels({ checkin: checkin, checkout: checkout, adults: 2, placeId: city.placeId, environment: 'production', limit: 6 });
                if (result.success && result.hotels && result.hotels.length > 0) { displayHotelsScroll('recommendedHotels', result, city.name); return; }
            } catch (e) {}
        }
        displayHotelsScroll('recommendedHotels', { success: false }, null);
    }

    async function loadNearbyHotels() {
        var checkin = getDefaultCheckin(),
            checkout = getDefaultCheckout();
        var container = document.getElementById('nearbyHotels');
        if (container) container.innerHTML = Array.from({ length: 3 }).map(function() { return '<div class="skeleton-scroll"><div class="skeleton-photo skeleton"></div><div class="body"><div class="skeleton-line skeleton w90"></div><div class="skeleton-line skeleton w70"></div><div class="skeleton-line skeleton w50"></div><div class="skeleton-line skeleton w40"></div></div></div>'; }).join('');
        var loc = await getUserLocation();
        var city = loc ? loc.city : 'Kinshasa',
            cc = loc ? loc.countryCode : 'CD';
        var attempts = [city + ', ' + cc, cc, 'Kinshasa, CD'];
        for (var i = 0; i < attempts.length; i++) {
            try {
                var result = await searchHotels({ checkin: checkin, checkout: checkout, adults: 1, aiSearch: attempts[i], environment: 'production', limit: 10 });
                if (result.success && result.hotels && result.hotels.length > 0) { displayHotelsScroll('nearbyHotels', result, i === 0 ? city : null); return; }
            } catch (e) {}
        }
        displayHotelsScroll('nearbyHotels', { success: false }, null);
    }

    // ============================================
    // INITIALISATION - DOMContentLoaded
    // ============================================
    document.addEventListener('DOMContentLoaded', function() {
        var tomorrow = addDays(new Date(), 1);
        var commonConfig = { dateFormat: 'Y-m-d', locale: 'fr', altInput: true, altFormat: 'd M Y', minDate: formatDate(tomorrow), animate: true, monthSelectorType: 'dropdown' };

        function setupDateRange(startId, endId, startOffset, endOffset, onNights) {
            var startEl = document.getElementById(startId),
                endEl = document.getElementById(endId);
            if (!startEl || !endEl) return null;
            var startDefault = formatDate(addDays(new Date(), startOffset)),
                endDefault = formatDate(addDays(new Date(), endOffset));
            startEl.value = startDefault;
            endEl.value = endDefault;
            var endPicker = flatpickr(endEl, Object.assign({}, commonConfig, { defaultDate: endDefault, minDate: startDefault, onChange: function(d, str) { if (onNights) onNights(startEl.value, str); } }));
            var startPicker = flatpickr(startEl, Object.assign({}, commonConfig, { defaultDate: startDefault, onChange: function(d, str) { endPicker.set('minDate', str); if (onNights) onNights(str, endEl.value); } }));
            if (onNights) onNights(startDefault, endDefault);
            return { startPicker: startPicker, endPicker: endPicker };
        }

        function updateNightsNote(noteId, start, end) {
            var note = document.getElementById(noteId);
            if (!note) return;
            var n = getNights(start, end);
            note.textContent = n > 0 ? n + ' nuit' + (n > 1 ? 's' : '') : '';
        }

        setupDateRange('hotelCheckin', 'hotelCheckout', 1, 4, function(s, e) { updateNightsNote('hotelNightsNote', s, e); });
        setupDateRange('flightDeparture', 'flightReturn', 1, 8);
        setupDateRange('pkgCheckin', 'pkgCheckout', 1, 8, function(s, e) { updateNightsNote('pkgNightsNote', s, e); });

        document.querySelectorAll('.leg-date').forEach(function(el, idx) {
            flatpickr(el, Object.assign({}, commonConfig, { defaultDate: formatDate(addDays(new Date(), 1 + idx * 3)) }));
        });

        // --- Onglets ---
        document.querySelectorAll('#serviceTabs .service-tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                document.querySelectorAll('#serviceTabs .service-tab').forEach(function(t) { t.setAttribute('aria-selected', 'false'); });
                tab.setAttribute('aria-selected', 'true');
                document.querySelectorAll('.search-panel').forEach(function(p) { p.hidden = true; });
                var panel = document.querySelector('.search-panel[data-panel="' + tab.dataset.tab + '"]');
                if (panel) {
                    panel.hidden = false;
                    panel.querySelectorAll('.shared-dest').forEach(function(el) {
                        if (sharedState.dest) el.value = sharedState.dest;
                    });
                }
            });
        });
        document.querySelector('#serviceTabs .service-tab[data-tab="hotel"]').click();

        // --- Autocomplétion ---
        var recentSearches = ['Kinshasa, Gombe', 'Lubumbashi, Karavia', 'Goma, bord du lac'];

        function buildSuggestDropdown(container, allowAllAirports) {
            var html = '<div class="sd-label">Récents</div>' + recentSearches.map(function(s) { return '<div class="sd-item" data-value="' + s + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>' + s + '</div>'; }).join('');
            html += '<div class="sd-item sd-geoloc" data-geoloc="1"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.4"/></svg>Autour de moi</div>';
            container.innerHTML = html;
        }

        function closeAllDropdowns() { document.querySelectorAll('.suggest-dropdown.open').forEach(function(d) { d.classList.remove('open'); }); }

        function closeAllPopovers() { document.querySelectorAll('.popover.open').forEach(function(p) { p.classList.remove('open'); }); }

        document.querySelectorAll('.suggest-dropdown').forEach(function(dd) {
            var isFlightField = !!dd.closest('#simpleFlightFields');
            buildSuggestDropdown(dd);
            var input = dd.closest('.field') ? dd.closest('.field').querySelector('input[type=text]') : null;
            if (!input) return;
            input.addEventListener('focus', function() { closeAllDropdowns();
                closeAllPopovers();
                buildSuggestDropdown(dd);
                dd.classList.add('open'); });
            dd.addEventListener('click', function(e) {
                var item = e.target.closest('.sd-item');
                if (!item) return;
                if (item.dataset.geoloc) {
                    input.value = 'Position actuelle';
                    getUserLocation().then(function(loc) { if (loc && loc.city) { input.value = loc.city + ', ' + (loc.countryCode || loc.country || '');
                            input.dispatchEvent(new Event('input')); } });
                } else { input.value = item.dataset.value; }
                input.dispatchEvent(new Event('input'));
                dd.classList.remove('open');
            });
            var debounceTimer;
            input.addEventListener('input', function(e) {
                if (input.classList.contains('shared-dest')) sharedState.dest = e.target.value;
                clearTimeout(debounceTimer);
                var query = e.target.value.trim();
                if (query.length < 2) { buildSuggestDropdown(dd); return; }
                debounceTimer = setTimeout(function() {
                    searchPlaces(query).then(function(places) {
                        var extra = '';
                        if (isFlightField) {
                            var key = query.trim().toLowerCase();
                            if (MULTI_AIRPORT_CITIES[key]) extra = '<div class="sd-item sd-all-airports" data-value="Tous les aéroports, ' + query + ' (' + MULTI_AIRPORT_CITIES[key] + ')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 16l20-8-8 20-3-8-9-4z"/></svg>Tous les aéroports (' + MULTI_AIRPORT_CITIES[key] + ')</div>';
                        }
                        if (places.length === 0 && !extra) { dd.innerHTML = '<div class="sd-empty">Aucun résultat</div>'; return; }
                        dd.innerHTML = extra + '<div class="sd-label">Suggestions</div>' + places.slice(0, 6).map(function(p) {
                            var displayText = p.name + (p.address ? ', ' + p.address : '');
                            return '<div class="sd-item" data-place-id="' + p.placeId + '" data-value="' + displayText.replace(/"/g, '&quot;') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>' + displayText + '</div>';
                        }).join('');
                        dd.classList.add('open');
                    });
                }, 300);
            });
        });
        document.addEventListener('click', function(e) { if (!e.target.closest('.field') && !e.target.closest('.leg-row')) { closeAllDropdowns();
                closeAllPopovers(); } });

        // --- Compteurs ---
        var counts = { rooms: 1, adults: 2, children: 0, fadults: 1, fchildren: 0, finfantslap: 0, finfantsseat: 0, krooms: 1, kadults: 2, kchildren: 0 };
        var mins = { rooms: 1, adults: 1, fadults: 1, krooms: 1, kadults: 1 };

        function renderChildAges(key, selector) {
            var container = document.querySelector(selector);
            if (!container) return;
            var n = counts[key];
            container.style.display = n > 0 ? 'flex' : 'none';
            container.innerHTML = '';
            for (var i = 0; i < n; i++) {
                var sel = document.createElement('select');
                sel.setAttribute('aria-label', "Âge de l'enfant " + (i + 1));
                sel.innerHTML = '<option value="">Âge de l\'enfant ' + (i + 1) + '</option>' + Array.from({ length: 18 }, function(_, a) { return '<option value="' + a + '">' + a + ' an' + (a > 1 ? 's' : '') + '</option>'; }).join('');
                container.appendChild(sel);
            }
        }

        function updateSummaries() {
            var hotelBtn = document.querySelector('[data-panel=hotel] .guests-summary');
            if (hotelBtn) hotelBtn.textContent = counts.rooms + ' chambre' + (counts.rooms > 1 ? 's' : '') + ', ' + counts.adults + ' adulte' + (counts.adults > 1 ? 's' : '') + (counts.children ? ', ' + counts.children + ' enfant' + (counts.children > 1 ? 's' : '') : '');
            var flightBtn = document.querySelector('[data-panel=flight] .guests-summary');
            var cabinSel = document.querySelector('.cabin-select');
            var cabinLabel = cabinSel ? cabinSel.options[cabinSel.selectedIndex].text : 'Économie';
            var totalInfants = counts.finfantslap + counts.finfantsseat;
            if (flightBtn) flightBtn.textContent = counts.fadults + ' adulte' + (counts.fadults > 1 ? 's' : '') + (counts.fchildren ? ', ' + counts.fchildren + ' enf.' : '') + (totalInfants ? ', ' + totalInfants + ' bébé' + (totalInfants > 1 ? 's' : '') : '') + ', ' + cabinLabel;
            var pkgBtn = document.querySelector('[data-panel=package] .guests-summary');
            if (pkgBtn) pkgBtn.textContent = counts.krooms + ' chambre' + (counts.krooms > 1 ? 's' : '') + ', ' + counts.kadults + ' adulte' + (counts.kadults > 1 ? 's' : '') + (counts.kchildren ? ', ' + counts.kchildren + ' enfant' + (counts.kchildren > 1 ? 's' : '') : '');
        }

        document.querySelectorAll('.step-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var key = btn.dataset.step,
                    dir = parseInt(btn.dataset.dir, 10),
                    min = mins[key] || 0;
                counts[key] = Math.max(min, counts[key] + dir);
                document.querySelectorAll('.step-count[data-count="' + key + '"]').forEach(function(s) { s.textContent = counts[key]; });
                if (key === 'children') renderChildAges('children', '[data-ages="hotel"]');
                if (key === 'kchildren') renderChildAges('kchildren', '[data-ages="package"]');
                updateSummaries();
            });
        });
        var cabinSelect = document.querySelector('.cabin-select');
        if (cabinSelect) cabinSelect.addEventListener('change', updateSummaries);
        updateSummaries();

        document.querySelectorAll('.guests-summary').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var pop = btn.closest('.field').querySelector('.popover');
                if (!pop) return;
                var wasOpen = pop.classList.contains('open');
                closeAllPopovers();
                closeAllDropdowns();
                if (!wasOpen) pop.classList.add('open');
            });
        });
        document.querySelectorAll('[data-close-popover]').forEach(function(btn) { btn.addEventListener('click', closeAllPopovers); });

        // --- Pills (trajet vol) ---
        document.querySelectorAll('.pill-toggle').forEach(function(group) {
            group.querySelectorAll('.pill-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    group.querySelectorAll('.pill-btn').forEach(function(b) { b.setAttribute('aria-pressed', 'false'); });
                    btn.setAttribute('aria-pressed', 'true');
                    if (group.dataset.toggle === 'tripType') {
                        var simple = document.getElementById('simpleFlightFields');
                        var legs = document.getElementById('legsContainer');
                        var returnField = document.querySelector('[data-panel=flight] [data-role="return-date"]');
                        if (btn.dataset.trip === 'multi') { simple.hidden = true;
                            legs.hidden = false; } else {
                            simple.hidden = false;
                            legs.hidden = true;
                            if (returnField) returnField.style.display = btn.dataset.trip === 'oneway' ? 'none' : '';
                        }
                    }
                });
            });
        });

        // --- Multi-destination : ajout/suppression d'étapes ---
        var legsContainer = document.getElementById('legsContainer');
        document.getElementById('addLegBtn').addEventListener('click', function() {
            var rows = legsContainer.querySelectorAll('.leg-row');
            if (rows.length >= 4) { showToast('Maximum 4 vols pour un itinéraire multi-destinations.'); return; }
            var newRow = rows[rows.length - 1].cloneNode(true);
            newRow.dataset.leg = rows.length;
            newRow.querySelectorAll('input[type=text]:not(.leg-date)').forEach(function(i) { i.value = ''; });
            var dateInput = newRow.querySelector('.leg-date');
            dateInput.value = '';
            dateInput.removeAttribute('data-fp');
            if (dateInput._flatpickr) dateInput._flatpickr.destroy();
            legsContainer.insertBefore(newRow, document.getElementById('addLegBtn'));
            flatpickr(dateInput, Object.assign({}, commonConfig, { defaultDate: formatDate(addDays(new Date(), 1 + rows.length * 3)) }));
            bindLegRemove(newRow);
        });

        function bindLegRemove(row) {
            row.querySelector('.leg-remove').addEventListener('click', function() {
                if (legsContainer.querySelectorAll('.leg-row').length <= 2) { showToast('Un itinéraire multi-destinations nécessite au moins 2 vols.'); return; }
                row.remove();
            });
        }
        legsContainer.querySelectorAll('.leg-row').forEach(bindLegRemove);

        // --- Recherche ---
        function requireValue(id, message) {
            var el = document.getElementById(id);
            var value = el ? el.value.trim() : '';
            if (!value) { flagFieldError(el);
                showToast(message); }
            return value;
        }

        document.querySelectorAll('[data-search]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var type = btn.dataset.search,
                    params;

                if (type === 'hotel') {
                    var destination = requireValue('hotelDestination', 'Veuillez indiquer une destination.');
                    if (!destination) return;
                    params = new URLSearchParams({ destination: destination, checkin: document.getElementById('hotelCheckin').value, checkout: document.getElementById('hotelCheckout').value, rooms: counts.rooms, adults: counts.adults, children: counts.children });
                    window.location.href = 'resultats-hebergement.html?' + params.toString();

                } else if (type === 'flight') {
                    var tripType = document.querySelector('[data-toggle=tripType] .pill-btn[aria-pressed=true]').dataset.trip;
                    var cabin = (document.querySelector('.cabin-select') || {}).value || 'ECONOMY';

                    if (tripType === 'multi') {
                        var legs = [];
                        var valid = true;
                        legsContainer.querySelectorAll('.leg-row').forEach(function(row) {
                            var o = row.querySelector('.leg-origin').value.trim();
                            var d = row.querySelector('.leg-destination').value.trim();
                            var dt = row.querySelector('.leg-date').value;
                            if (!o || !d || !dt) valid = false;
                            legs.push({ origin: o, destination: d, date: dt });
                        });
                        if (!valid) { showToast('Merci de compléter tous les vols de votre itinéraire.'); return; }
                        params = new URLSearchParams({ tripType: 'multi', legs: JSON.stringify(legs), adults: counts.fadults, children: counts.fchildren, infantsLap: counts.finfantslap, infantsSeat: counts.finfantsseat, cabin: cabin });
                        window.location.href = 'resultats-vols.html?' + params.toString();
                    } else {
                        var origin = requireValue('flightOrigin', "Veuillez indiquer une ville d'origine.");
                        var dest = requireValue('flightDestination', 'Veuillez indiquer une destination.');
                        if (!origin || !dest) return;
                        params = new URLSearchParams({ tripType: tripType, origin: origin, destination: dest, departure: document.getElementById('flightDeparture').value, adults: counts.fadults, children: counts.fchildren, infantsLap: counts.finfantslap, infantsSeat: counts.finfantsseat, cabin: cabin });
                        if (tripType === 'round') params.append('return', document.getElementById('flightReturn').value);
                        window.location.href = 'resultats-vols.html?' + params.toString();
                    }

                } else if (type === 'package') {
                    var pkgDest = requireValue('pkgDestination', 'Veuillez indiquer une destination.');
                    if (!pkgDest) return;
                    params = new URLSearchParams({
                        origin: document.getElementById('pkgOrigin').value,
                        destination: pkgDest,
                        checkin: document.getElementById('pkgCheckin').value,
                        checkout: document.getElementById('pkgCheckout').value,
                        rooms: counts.krooms,
                        adults: counts.kadults,
                        children: counts.kchildren,
                        activities: document.getElementById('pkgActivities').checked ? '1' : '0',
                        type: document.getElementById('pkgType').value
                    });
                    window.location.href = 'resultats-package.html?' + params.toString();
                }
            });
        });

        // --- Chargement des données ---
        loadRecommendations();
        loadNearbyHotels();
        loadAllCollections();

        // --- Intersection Observer pour les animations ---
        var observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(e) {
                if (e.isIntersecting) e.target.classList.add('in');
            });
        }, { threshold: 0.12 });
        document.querySelectorAll('.reveal').forEach(function(el) {
            observer.observe(el);
        });

        console.log('LuviaPlace connecté au backend :', API_BASE_URL);
    });

    // ============================================
    // GESTIONNAIRE MODALE LANGUE + DEVISES
    // ============================================
    (function() {
        'use strict';

        var overlay = document.getElementById('langModalOverlay');
        var toggleBtn = document.getElementById('langToggleBtn');
        var closeBtn = document.getElementById('langModalClose');
        var applyBtn = document.querySelector('.lang-modal-apply');

        var langOptions = document.querySelectorAll('.lang-option');
        var currencyOptions = document.querySelectorAll('.currency-option');
        var tabs = document.querySelectorAll('.lang-currency-tab');
        var panels = {
            language: document.getElementById('langPanel'),
            currency: document.getElementById('currencyPanel')
        };

        var selectedLang = localStorage.getItem('luviaplace_language') || 'fr';
        var selectedCurrency = localStorage.getItem('luviaplace_currency') || 'USD';

        function openModal() {
            if (overlay) {
                overlay.classList.add('open');
                document.body.style.overflow = 'hidden';
                updateSelections();
            }
        }

        function closeModal() {
            if (overlay) {
                overlay.classList.remove('open');
                document.body.style.overflow = '';
            }
        }

        function switchTab(tabId) {
            tabs.forEach(function(tab) {
                tab.classList.toggle('active', tab.dataset.tab === tabId);
            });
            Object.keys(panels).forEach(function(key) {
                panels[key].classList.toggle('active', key === tabId);
            });
        }

        function updateSelections() {
            langOptions.forEach(function(opt) {
                opt.classList.toggle('active', opt.dataset.lang === selectedLang);
            });
            currencyOptions.forEach(function(opt) {
                opt.classList.toggle('active', opt.dataset.currency === selectedCurrency);
            });
        }

        function applyChanges() {
            if (typeof window.changeLanguage === 'function') {
                window.changeLanguage(selectedLang);
            } else {
                localStorage.setItem('luviaplace_language', selectedLang);
                document.documentElement.lang = selectedLang;
            }

            localStorage.setItem('luviaplace_currency', selectedCurrency);

            document.dispatchEvent(new CustomEvent('currencyChanged', {
                detail: { currency: selectedCurrency }
            }));

            closeModal();
        }

        if (toggleBtn) toggleBtn.addEventListener('click', openModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (overlay) overlay.addEventListener('click', function(e) { if (e.target === this) closeModal(); });

        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeModal();
        });

        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                switchTab(this.dataset.tab);
            });
        });

        langOptions.forEach(function(opt) {
            opt.addEventListener('click', function() {
                langOptions.forEach(function(o) { o.classList.remove('active'); });
                this.classList.add('active');
                selectedLang = this.dataset.lang;
            });
        });

        currencyOptions.forEach(function(opt) {
            opt.addEventListener('click', function() {
                currencyOptions.forEach(function(o) { o.classList.remove('active'); });
                this.classList.add('active');
                selectedCurrency = this.dataset.currency;
            });
        });

        if (applyBtn) applyBtn.addEventListener('click', applyChanges);

        document.addEventListener('DOMContentLoaded', function() {
            updateSelections();
        });

        window.openLanguageModal = openModal;
        window.closeLanguageModal = closeModal;
        window.getSelectedCurrency = function() { return selectedCurrency; };

        console.log('🌍 Modale langue + devises initialisée');
    })();

    // ============================================
    // ÉCOUTER LES CHANGEMENTS DE DEVISES
    // ============================================
    document.addEventListener('currencyChanged', function(e) {
        console.log('💰 Devise changée vers:', e.detail.currency);
        loadRecommendations();
        loadNearbyHotels();
    });

})();

// ============================================
// AUTHENTIFICATION SUPABASE - GOOGLE
// ============================================
(function() {
    'use strict';

    const SUPABASE_URL = 'https://ukbekfcjfcjcqrpxfpmq.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrYmVrZmNqZmNqY3FycHhmcG1xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNDk2NzcsImV4cCI6MjA4OTkyNTY3N30.KK3nxQOLTi3IZjYoRtrNC6mS_ixSsrZMI3J4WfxJVYU';

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            flowType: 'pkce'
        }
    });

    function getRedirectUrl() {
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
        if (isLocalhost) {
            return `http://localhost:${window.location.port || '10000'}`;
        }
        return 'https://luvia-place-v2-1-plh1.onrender.com';
    }

    const authModal = document.getElementById('authModalOverlay');
    const authModalClose = document.getElementById('authModalClose');
    const loginBtn = document.getElementById('loginBtn');
    const googleBtn = document.getElementById('googleSignInBtn');
    const guestBtn = document.getElementById('guestContinueBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const authUserInfo = document.getElementById('authUserInfo');
    const authLoginSection = document.getElementById('authLoginSection');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    const userAvatar = document.getElementById('userAvatar');

    let currentUser = null;

    function showAuthToast(message, type = 'info') {
        let toast = document.getElementById('authToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'authToast';
            toast.className = 'auth-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.className = 'auth-toast show';
        if (type === 'error') toast.classList.add('error');
        if (type === 'success') toast.classList.add('success');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }

    function openAuthModal() {
        if (authModal) {
            authModal.classList.add('open');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeAuthModal() {
        if (authModal) {
            authModal.classList.remove('open');
            document.body.style.overflow = '';
        }
    }

    function updateUserUI(user) {
    const loginBtn = document.getElementById('loginBtn');
    const accountTrigger = document.getElementById('accountTrigger');
    const avatarName = document.getElementById('avatarName');
    const avatarInitials = document.getElementById('avatarInitials');

    // Modale de connexion
    const authUserInfo = document.getElementById('authUserInfo');
    const authLoginSection = document.getElementById('authLoginSection');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    const userAvatar = document.getElementById('userAvatar');

    if (user) {
        // Mise à jour de la modale
        if (authUserInfo) authUserInfo.style.display = 'block';
        if (authLoginSection) authLoginSection.style.display = 'none';

        const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilisateur';
        const email = user.email || 'email@exemple.com';

        if (userName) userName.textContent = name;
        if (userEmail) userEmail.textContent = email;

        const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
        if (userAvatar) userAvatar.textContent = initials;

        // ✅ Avatar dans le header
        if (loginBtn) loginBtn.style.display = 'none';
        if (accountTrigger) {
            accountTrigger.style.display = 'flex';
        }
        if (avatarName) avatarName.textContent = name;
        if (avatarInitials) avatarInitials.textContent = initials;

        // Mise à jour du dropdown
        const accountName = document.getElementById('accountName');
        const accountEmail = document.getElementById('accountEmail');
        const accountAvatar = document.getElementById('accountAvatar');
        
        if (accountName) accountName.textContent = name;
        if (accountEmail) accountEmail.textContent = email;
        if (accountAvatar) accountAvatar.textContent = initials;

        // Émettre l'événement
        document.dispatchEvent(new CustomEvent('userLoggedIn', {
            detail: { user: user }
        }));

        console.log('✅ Utilisateur connecté:', name, email);

    } else {
        // Déconnexion
        if (authUserInfo) authUserInfo.style.display = 'none';
        if (authLoginSection) authLoginSection.style.display = 'block';

        // ✅ Réafficher le bouton, cacher l'avatar
        if (loginBtn) loginBtn.style.display = 'block';
        if (accountTrigger) accountTrigger.style.display = 'none';

        // Émettre l'événement
        document.dispatchEvent(new CustomEvent('userLoggedOut'));
        console.log('🔓 Utilisateur déconnecté');
    }

    localStorage.setItem('luviaplace_user', JSON.stringify(user));
}
// ============================================
// ÉVÉNEMENT CLIC SUR L'AVATAR
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    const accountTrigger = document.getElementById('accountTrigger');
    
    if (accountTrigger) {
        accountTrigger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            if (window.accountDropdown && window.accountDropdown.toggle) {
                window.accountDropdown.toggle();
            }
        });
    }
});

    async function signInWithGoogle() {
        try {
            if (googleBtn) {
                googleBtn.disabled = true;
                googleBtn.innerHTML = '<span>⏳ Connexion en cours...</span>';
            }

            const redirectUrl = getRedirectUrl();
            console.log('🔗 URL de redirection:', redirectUrl);

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent'
                    }
                }
            });

            if (error) throw error;
            console.log('✅ Redirection vers Google...');

        } catch (error) {
            console.error('❌ Erreur connexion Google:', error);
            showAuthToast('Erreur de connexion: ' + error.message, 'error');

            if (googleBtn) {
                googleBtn.disabled = false;
                googleBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" style="width:20px;height:20px;">
                        <path fill="#EA4335" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                        <path fill="#4285F4" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#34A853" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Se connecter avec Google</span>
                `;
            }
        }
    }

    async function signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            currentUser = null;
            updateUserUI(null);
            closeAuthModal();
            showAuthToast('Déconnecté avec succès', 'success');
        } catch (error) {
            console.error('❌ Erreur déconnexion:', error.message);
            showAuthToast('Erreur lors de la déconnexion', 'error');
        }
    }

    async function getSession() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) throw error;

            if (session?.user) {
                currentUser = session.user;
                updateUserUI(session.user);
                return session.user;
            } else {
                const cached = localStorage.getItem('luviaplace_user');
                if (cached) {
                    try {
                        const user = JSON.parse(cached);
                        if (user?.email) {
                            const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
                            if (!userError && currentUser) {
                                updateUserUI(currentUser);
                                return currentUser;
                            }
                        }
                    } catch (e) {}
                }
                updateUserUI(null);
                return null;
            }
        } catch (error) {
            console.error('❌ Erreur récupération session:', error.message);
            updateUserUI(null);
            return null;
        }
    }

    async function handleAuthCallback() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const accessToken = urlParams.get('access_token');

            if (code || accessToken) {
                console.log('✅ Token détecté, récupération de la session...');
                const { data: { session }, error } = await supabase.auth.getSession();

                if (error) {
                    console.error('❌ Erreur récupération session:', error);
                    return;
                }

                if (session?.user) {
                    currentUser = session.user;
                    updateUserUI(session.user);
                    closeAuthModal();
                    showAuthToast('Bienvenue ' + (session.user.user_metadata?.full_name || session.user.email), 'success');
                    window.history.replaceState({}, document.title, window.location.pathname);
                }
            }
        } catch (error) {
            console.error('❌ Erreur callback:', error);
        }
    }

    // ============================================
    // ✅ ÉVÉNEMENTS - UN SEUL ÉVÉNEMENT SUR loginBtn
    // ============================================

    // ✅ Bouton de connexion - Gère la modale ET le dropdown
    if (loginBtn) {
        // Nettoyer les anciens événements
        const newLoginBtn = loginBtn.cloneNode(true);
        loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
        
        const updatedLoginBtn = document.getElementById('loginBtn');
        
        updatedLoginBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            console.log('🖱️ Clic loginBtn, loggedIn:', this.dataset.loggedIn);

            const isLoggedIn = this.dataset.loggedIn === 'true' || currentUser !== null;

            if (isLoggedIn) {
                // ✅ Connecté → ouvrir le dropdown
                console.log('👤 Ouverture du dropdown');
                if (window.accountDropdown && window.accountDropdown.toggle) {
                    window.accountDropdown.toggle();
                } else {
                    const dropdown = document.getElementById('accountDropdown');
                    const overlay = document.getElementById('accountDropdownOverlay');
                    if (dropdown) dropdown.classList.toggle('active');
                    if (overlay) overlay.classList.toggle('active');
                }
            } else {
                // ❌ Non connecté → ouvrir la modale
                console.log('🔓 Ouverture de la modale');
                openAuthModal();
            }
        });
    }

    if (authModalClose) {
        authModalClose.addEventListener('click', closeAuthModal);
    }

    if (authModal) {
        authModal.addEventListener('click', function(e) {
            if (e.target === this) closeAuthModal();
        });
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAuthModal();
            if (window.accountDropdown && window.accountDropdown.close) {
                window.accountDropdown.close();
            }
        }
    });

    if (googleBtn) {
        googleBtn.addEventListener('click', signInWithGoogle);
    }

    if (guestBtn) {
        guestBtn.addEventListener('click', function() {
            closeAuthModal();
            showAuthToast('Vous naviguez en tant qu\'invité', 'info');
        });
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            signOut();
        });
    }

    // ============================================
    // INITIALISATION
    // ============================================
    document.addEventListener('DOMContentLoaded', async function() {
        console.log('🔐 Initialisation de l\'authentification...');
        await getSession();
        await handleAuthCallback();

        const urlParams = new URLSearchParams(window.location.search);
        const error = urlParams.get('error');
        const errorDescription = urlParams.get('error_description');

        if (error) {
            console.error('❌ Erreur OAuth:', error, errorDescription);
            showAuthToast('Erreur de connexion: ' + (errorDescription || error), 'error');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    });

    // ============================================
    // EXPOSER LES FONCTIONS
    // ============================================
    window.auth = {
        supabase: supabase,
        signInWithGoogle: signInWithGoogle,
        signOut: signOut,
        getSession: getSession,
        getUser: () => currentUser,
        isLoggedIn: () => !!currentUser,
        openModal: openAuthModal,
        closeModal: closeAuthModal,
        showToast: showAuthToast
    };

    // Exposer aussi les fonctions de modale pour le dropdown
    window.openAuthModal = openAuthModal;
    window.closeAuthModal = closeAuthModal;

    console.log('🔐 Authentification Supabase initialisée');

})();

// ============================================
// ACCOUNT DROPDOWN - GESTION DU MENU UTILISATEUR
// ============================================
(function() {
    'use strict';

    const accountDropdown = document.getElementById('accountDropdown');
    const accountDropdownOverlay = document.getElementById('accountDropdownOverlay');
    const accountName = document.getElementById('accountName');
    const accountEmail = document.getElementById('accountEmail');
    const accountAvatar = document.getElementById('accountAvatar');
    const accountLogoutBtn = document.getElementById('accountLogoutBtn');

    let isDropdownOpen = false;

    function openAccountDropdown() {
        if (accountDropdown) {
            accountDropdown.classList.add('active');
            isDropdownOpen = true;
            if (accountDropdownOverlay) {
                accountDropdownOverlay.classList.add('active');
            }
            document.body.style.overflow = window.innerWidth <= 600 ? 'hidden' : '';
        }
    }

    function closeAccountDropdown() {
        if (accountDropdown) {
            accountDropdown.classList.remove('active');
            isDropdownOpen = false;
            if (accountDropdownOverlay) {
                accountDropdownOverlay.classList.remove('active');
            }
            document.body.style.overflow = '';
        }
    }

    function toggleAccountDropdown() {
        if (isDropdownOpen) {
            closeAccountDropdown();
        } else {
            openAccountDropdown();
        }
    }

    function updateAccountUI(user) {
        if (user) {
            const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilisateur';
            const email = user.email || 'email@exemple.com';

            if (accountName) accountName.textContent = name;
            if (accountEmail) accountEmail.textContent = email;

            const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            if (accountAvatar) accountAvatar.textContent = initials;

            closeAccountDropdown();

        } else {
            closeAccountDropdown();
        }
    }

    // ✅ PLUS D'ÉVÉNEMENT SUR loginBtn ICI (supprimé)

    if (accountDropdownOverlay) {
        accountDropdownOverlay.addEventListener('click', closeAccountDropdown);
    }

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && isDropdownOpen) {
            closeAccountDropdown();
        }
    });

    document.addEventListener('click', function(e) {
        const isLoginBtnClick = e.target.closest('#loginBtn');
        const isDropdownContent = e.target.closest('.account-dropdown');

        if (isLoginBtnClick) return;
        if (isDropdownContent) return;

        if (isDropdownOpen) {
            closeAccountDropdown();
        }
    });

    if (accountLogoutBtn) {
        accountLogoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            if (typeof window.auth !== 'undefined' && window.auth.signOut) {
                window.auth.signOut();
            } else {
                document.dispatchEvent(new CustomEvent('userLoggedOut'));
            }
            closeAccountDropdown();
        });
    }

    document.addEventListener('userLoggedIn', function(e) {
        updateAccountUI(e.detail.user);
        closeAccountDropdown();
    });

    document.addEventListener('userLoggedOut', function() {
        updateAccountUI(null);
        closeAccountDropdown();
    });

    document.addEventListener('DOMContentLoaded', function() {
        const cachedUser = localStorage.getItem('luviaplace_user');
        if (cachedUser) {
            try {
                const user = JSON.parse(cachedUser);
                if (user?.email) {
                    updateAccountUI(user);
                }
            } catch (e) {}
        }
    });

    window.accountDropdown = {
        open: openAccountDropdown,
        close: closeAccountDropdown,
        toggle: toggleAccountDropdown,
        updateUI: updateAccountUI,
        isOpen: () => isDropdownOpen
    };

    console.log('👤 Account dropdown initialisé');

})();

// ============================================
// RÉCUPÉRATION LUVIA COINS
// ============================================
document.addEventListener('userLoggedIn', function(e) {
    const user = e.detail.user;
    console.log('🎉 Utilisateur connecté, bienvenue !');
    fetchLuviaCoins(user.id);
});

async function fetchLuviaCoins(userId) {
    try {
        const response = await fetch(`/api/loyalty/coins?userId=${userId}`);
        const data = await response.json();

        if (data.success) {
            console.log('💰 LuviaCoins:', data.coins);
            const coinsElement = document.getElementById('luviaCoins');
            if (coinsElement) {
                coinsElement.textContent = data.coins + ' LuviaCoins';
            }
        }
    } catch (error) {
        console.error('❌ Erreur récupération coins:', error);
    }
}
