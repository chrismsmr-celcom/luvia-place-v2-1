// ============================================
// resultats-hebergement.js — Compatible LiteAPI v3.0
// Filtres supportés : prix, étoiles, note, repas, distance, annulation
// ============================================

(function() {
    'use strict';

    const API_BASE_URL = 'https://luvia-place-v2-1.onrender.com';
    const params = new URLSearchParams(window.location.search);
    let allHotels = [];
    let displayedHotels = [];
    let currentSort = 'popularity';
    let currentView = 'list';
    let selectedHotelId = null;
    let editAdultsValue = 2;

    // ============================================
    // UTILITAIRES
    // ============================================
    function getNights(checkin, checkout) {
        if (!checkin || !checkout) return 1;
        const start = new Date(checkin);
        const end = new Date(checkout);
        const diffDays = Math.ceil(Math.abs(end - start) / 86400000);
        return diffDays > 0 ? diffDays : 1;
    }

    function getDefaultCheckin() {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
    }

    function getDefaultCheckout() {
        const d = new Date();
        d.setDate(d.getDate() + 4);
        return d.toISOString().slice(0, 10);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    function ratingTier(rating) {
        if (rating >= 9) return 'Fabuleux';
        if (rating >= 8.5) return 'Merveilleux';
        if (rating >= 8) return 'Très bien';
        if (rating >= 7) return 'Bien';
        if (rating >= 6) return 'Agréable';
        return 'Correct';
    }

    function getCurrencySymbol(currency) {
        const symbols = {
            'USD': '$', 'EUR': '€', 'GBP': '£', 'CDF': 'FC',
            'XAF': 'FCFA', 'XOF': 'FCFA', 'NGN': '₦', 'GHS': 'GH₵',
            'ZAR': 'R', 'KES': 'KSh', 'TZS': 'TSh', 'UGX': 'USh'
        };
        return symbols[currency] || currency + ' ';
    }

    function showToast(msg) {
        const toastEl = document.getElementById('toast');
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastEl._timer);
        toastEl._timer = setTimeout(function() {
            toastEl.classList.remove('show');
        }, 3200);
    }

    function debounce(fn, delay) {
        let timer;
        return function() {
            clearTimeout(timer);
            const args = arguments;
            timer = setTimeout(function() { fn.apply(null, args); }, delay);
        };
    }

    // ============================================
    // CONTRÔLEUR DE CARTE
    // ============================================
    function createMapController(containerId) {
        let map = null, markers = [], markerMap = {}, initialized = false;

        function buildIcon(count, highlighted, markerId) {
            const cls = highlighted ? 'marker-pin marker-pin-active' : 'marker-pin';
            return L.divIcon({
                className: 'custom-marker',
                html: '<div id="' + markerId + '" class="' + cls + '">' + count + '</div>',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });
        }

        function addMarkers(hotels) {
            if (!map) return;
            markers.forEach(function(m) { map.removeLayer(m); });
            markers = [];
            markerMap = {};
            const bounds = [];
            let count = 0;
            hotels.forEach(function(hotel) {
                const lat = hotel.latitude || hotel.lat;
                const lng = hotel.longitude || hotel.lon;
                if (!lat || !lng) return;
                const latF = parseFloat(lat);
                const lngF = parseFloat(lng);
                if (isNaN(latF) || isNaN(lngF) || latF === 0 || lngF === 0) return;
                count++;
                const markerId = containerId + '-marker-' + hotel.id;
                const marker = L.marker([latF, lngF], { icon: buildIcon(count, false, markerId) })
                    .addTo(map)
                    .bindPopup(
                        '<strong>' + escapeHtml(hotel.name || 'Hôtel') + '</strong>' +
                        (hotel.address ? '<br>' + escapeHtml(hotel.address) : '') +
                        '<br><a href="hotel-detail.html?hotelId=' + encodeURIComponent(hotel.id) +
                        '" style="color:#155EEF;font-weight:600;">Voir détail</a>'
                    );
                marker.hotelId = hotel.id;
                marker.count = count;
                markers.push(marker);
                markerMap[hotel.id] = marker;
                bounds.push([latF, lngF]);
                marker.on('click', function() { selectHotel(this.hotelId); });
            });
            if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
        }

        function init(lat, lng, hotels) {
            if (initialized) {
                if (hotels && hotels.length) addMarkers(hotels);
                return;
            }
            const container = document.getElementById(containerId);
            if (!container) return;
            if (container.offsetHeight === 0) {
                setTimeout(function() { init(lat, lng, hotels); }, 300);
                return;
            }
            try {
                map = L.map(container, {
                    center: [lat || -4.325, lng || 15.322],
                    zoom: 13,
                    zoomControl: true
                });
                L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                }).addTo(map);
                initialized = true;
                if (hotels && hotels.length) addMarkers(hotels);
                setTimeout(function() { map.invalidateSize(); }, 400);
            } catch (error) {
                console.error('Erreur carte:', error);
            }
        }

        function highlight(hotelId) {
            markers.forEach(function(m) {
                m.setIcon(buildIcon(m.count, false, containerId + '-marker-' + m.hotelId));
            });
            if (hotelId && markerMap[hotelId]) {
                const marker = markerMap[hotelId];
                marker.setIcon(buildIcon(marker.count, true, containerId + '-marker-' + hotelId));
                marker.openPopup();
                map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
            }
        }

        function invalidate() { if (map) map.invalidateSize(); }
        function isInitialized() { return initialized; }

        return { init, addMarkers, highlight, invalidate, isInitialized };
    }

    const desktopMapCtrl = createMapController('mapContainer');
    const mobileMapCtrl = createMapController('mobileMapContainer');

    // ============================================
    // SÉLECTION D'HÔTEL
    // ============================================
    function highlightHotelInList(hotelId) {
        document.querySelectorAll('.hotel-result').forEach(function(item) {
            item.classList.toggle('active', item.id === 'hotel-' + hotelId);
            if (item.id === 'hotel-' + hotelId) {
                item.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        });
    }

    function selectHotel(hotelId) {
        if (!hotelId) return;
        selectedHotelId = hotelId;
        desktopMapCtrl.highlight(hotelId);
        if (mobileMapCtrl.isInitialized()) mobileMapCtrl.highlight(hotelId);
        highlightHotelInList(hotelId);
    }
    window.selectHotel = selectHotel;

    // ============================================
    // TRI
    // ============================================
    function toggleSortDropdown() {
        document.getElementById('sortDropdown').classList.toggle('open');
    }
    window.toggleSortDropdown = toggleSortDropdown;

    function applySort(sortType) {
        currentSort = sortType;
        document.querySelectorAll('.sort-item').forEach(function(item) {
            item.classList.toggle('active', item.dataset.sort === sortType);
        });

        const labels = {
            popularity: 'nos meilleurs choix',
            price_asc: 'prix (du plus bas au plus élevé)',
            price_desc: 'prix (du plus élevé au plus bas)',
            stars_asc: 'étoiles (du plus bas au plus haut)',
            stars_desc: 'étoiles (du plus haut au plus bas)',
            distance: 'distance depuis centre',
            rating: 'note (du plus élevé au plus bas)',
            favorites: 'favoris',
            travaxy: 'score de travaxy'
        };

        document.getElementById('sortLabel').textContent = 'Trier par : ' + (labels[sortType] || sortType);
        document.getElementById('sortDropdown').classList.remove('open');
        applyFilters();
    }
    window.applySort = applySort;

    function applySortToArray(hotels, sortType) {
        const sorted = hotels.slice();
        if (sortType === 'price_asc') {
            sorted.sort(function(a, b) { return a.minPrice - b.minPrice; });
        } else if (sortType === 'price_desc') {
            sorted.sort(function(a, b) { return b.minPrice - a.minPrice; });
        } else if (sortType === 'stars_asc') {
            sorted.sort(function(a, b) { return (a.starRating || 0) - (b.starRating || 0); });
        } else if (sortType === 'stars_desc') {
            sorted.sort(function(a, b) { return (b.starRating || 0) - (a.starRating || 0); });
        } else if (sortType === 'rating') {
            sorted.sort(function(a, b) { return (b.rating || 0) - (a.rating || 0); });
        }
        return sorted;
    }

    // ============================================
    // FILTRES — UTILITAIRES
    // ============================================
    function getCheckedValues(group) {
        return Array.prototype.slice.call(
            document.querySelectorAll('[data-filter-group="' + group + '"] input[type="checkbox"]:checked')
        ).map(function(el) { return el.getAttribute('data-value'); });
    }

    // ============================================
    // FILTRES DYNAMIQUES (uniquement données backend)
    // ============================================
    function createDynamicStarsFilter(hotels) {
        const starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
        hotels.forEach(function(h) {
            const stars = Math.round(h.starRating || 0);
            if (stars >= 1 && stars <= 5) starCounts[stars]++;
            else starCounts[0]++;
        });

        const hasStars = Object.keys(starCounts).some(function(k) { return starCounts[k] > 0; });
        if (!hasStars) return null;

        const labels = { 5: '5 étoiles', 4: '4 étoiles', 3: '3 étoiles', 2: '2 étoiles', 1: '1 étoile', 0: 'Non classé' };
        const div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        let html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Évaluation par étoiles</label>';

        [5, 4, 3, 2, 1, 0].forEach(function(stars) {
            if (starCounts[stars] === 0) return;
            html += '<label class="check-item" data-filter-group="stars">' +
                '<input type="checkbox" data-value="' + stars + '" onchange="applyFilters()">' +
                '<span>' + labels[stars] + '</span>' +
                '</label>';
        });
        div.innerHTML = html;
        return div;
    }

    function createDynamicRatingFilter(hotels) {
        const hasRating = hotels.some(function(h) { return h.rating > 0; });
        if (!hasRating) return null;

        const ratings = [
            { value: 9, label: 'Fabuleux : 9+' },
            { value: 8, label: 'Très bien : 8+' },
            { value: 7, label: 'Bien : 7+' },
            { value: 6, label: 'Agréable : 6+' }
        ];

        const div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        let html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Évaluation des clients</label>';

        ratings.forEach(function(r) {
            html += '<label class="check-item" data-filter-group="rating">' +
                '<input type="checkbox" data-value="' + r.value + '" onchange="applyFilters()">' +
                '<span>' + r.label + '</span>' +
                '</label>';
        });
        div.innerHTML = html;
        return div;
    }

    function createDynamicMealFilter(hotels) {
        const mealLabels = {
            'RO': 'Chambre seule',
            'BB': 'Petit déjeuner inclus',
            'HB': 'Demi-pension',
            'FB': 'Pension complète',
            'AI': 'Tout inclus',
            'BI': 'Petit déjeuner inclus'
        };

        const meals = {};
        hotels.forEach(function(h) {
            const code = h.boardType || h.mealPlan || h.board;
            if (code && code !== 'RO') meals[code] = (meals[code] || 0) + 1;
        });

        const codes = Object.keys(meals);
        if (codes.length === 0) return null;

        const div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        let html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Plans de repas</label>';

        codes.forEach(function(code) {
            const label = mealLabels[code] || code;
            html += '<label class="check-item" data-filter-group="meal">' +
                '<input type="checkbox" data-value="' + code + '" onchange="applyFilters()">' +
                '<span>' + label + ' (' + meals[code] + ')</span>' +
                '</label>';
        });
        div.innerHTML = html;
        return div;
    }

    function createDynamicDistanceFilter(hotels) {
        const hasCoords = hotels.some(function(h) {
            return (h.latitude || h.lat) && (h.longitude || h.lon);
        });
        if (!hasCoords) return null;

        const distances = [
            { value: 1, label: 'Moins de 1 km' },
            { value: 3, label: 'Moins de 3 km' },
            { value: 5, label: 'Moins de 5 km' },
            { value: 10, label: 'Moins de 10 km' }
        ];

        const div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        let html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Distance du centre</label>';

        distances.forEach(function(d) {
            html += '<label class="check-item" data-filter-group="distance">' +
                '<input type="checkbox" data-value="' + d.value + '" onchange="applyFilters()">' +
                '<span>' + d.label + '</span>' +
                '</label>';
        });
        div.innerHTML = html;
        return div;
    }

    // ============================================
    // SLIDER DE PRIX
    // ============================================
    function updatePriceLabels(minPrice, maxPrice) {
        const currency = localStorage.getItem('luviaplace_currency') || 'USD';
        const symbol = getCurrencySymbol(currency);
        const minLabel = document.getElementById('priceMinLabel');
        const maxLabel = document.getElementById('priceMaxLabel');
        const minValue = document.getElementById('priceMinValue');
        const maxValue = document.getElementById('priceMaxValue');

        if (minLabel) minLabel.textContent = symbol + Math.round(minPrice);
        if (maxLabel) maxLabel.textContent = symbol + Math.round(maxPrice);
        if (minValue) minValue.textContent = symbol + Math.round(minPrice);
        if (maxValue) maxValue.textContent = symbol + Math.round(maxPrice);
    }

    function updatePriceSlider(hotels) {
        const prices = hotels.filter(function(h) { return h.minPrice && h.minPrice > 0; }).map(function(h) { return h.minPrice; });
        if (prices.length === 0) return;

        const minPrice = Math.floor(Math.min.apply(null, prices));
        const maxPrice = Math.ceil(Math.max.apply(null, prices));

        const track = document.getElementById('priceTrack');
        if (track) {
            track.dataset.minPrice = minPrice;
            track.dataset.maxPrice = maxPrice;
        }

        const minHandle = document.getElementById('priceMinHandle');
        const maxHandle = document.getElementById('priceMaxHandle');
        const fill = document.getElementById('priceFill');

        if (minHandle) {
            minHandle.style.left = '0%';
            minHandle.setAttribute('aria-valuemin', minPrice);
            minHandle.setAttribute('aria-valuemax', maxPrice);
            minHandle.setAttribute('aria-valuenow', minPrice);
        }
        if (maxHandle) {
            maxHandle.style.left = '100%';
            maxHandle.setAttribute('aria-valuemin', minPrice);
            maxHandle.setAttribute('aria-valuemax', maxPrice);
            maxHandle.setAttribute('aria-valuenow', maxPrice);
        }
        if (fill) {
            fill.style.left = '0%';
            fill.style.right = '0%';
        }

        updatePriceLabels(minPrice, maxPrice);
    }

    // ============================================
    // APPLIQUER LES FILTRES (simplifié, données réelles)
    // ============================================
    function applyFilters() {
        const nameFilter = document.getElementById('filterName');
        const nameValue = nameFilter ? nameFilter.value.toLowerCase() : '';

        const track = document.getElementById('priceTrack');
        const datasetMin = track && track.dataset.minPrice !== undefined ? parseFloat(track.dataset.minPrice) : 0;
        const datasetMax = track && track.dataset.maxPrice !== undefined ? parseFloat(track.dataset.maxPrice) : Infinity;
        const minHandle = document.getElementById('priceMinHandle');
        const maxHandle = document.getElementById('priceMaxHandle');
        const minPrice = minHandle && minHandle.getAttribute('aria-valuenow') !== null ? parseFloat(minHandle.getAttribute('aria-valuenow')) : datasetMin;
        const maxPrice = maxHandle && maxHandle.getAttribute('aria-valuenow') !== null ? parseFloat(maxHandle.getAttribute('aria-valuenow')) : datasetMax;

        const fc = document.getElementById('filterFreeCancellation');

        const starsChecked = getCheckedValues('stars');
        const ratingChecked = getCheckedValues('rating');
        const mealChecked = getCheckedValues('meal');

        const filtered = allHotels.filter(function(hotel) {
            if (nameValue && !(hotel.name || '').toLowerCase().includes(nameValue)) return false;
            if (hotel.minPrice > 0 && (hotel.minPrice < minPrice || hotel.minPrice > maxPrice)) return false;
            if (fc && fc.checked && !hotel.refundable) return false;

            if (starsChecked.length) {
                const stars = String(Math.round(hotel.starRating || 0));
                if (starsChecked.indexOf(stars) === -1) return false;
            }

            if (ratingChecked.length) {
                const rating = hotel.rating || 0;
                const found = ratingChecked.some(function(val) { return rating >= parseFloat(val); });
                if (!found) return false;
            }

            if (mealChecked.length) {
                const meal = hotel.boardType || hotel.mealPlan || hotel.board || '';
                if (mealChecked.indexOf(meal) === -1) return false;
            }

            return true;
        });

        displayedHotels = applySortToArray(filtered, currentSort);
        renderHotels(displayedHotels);
        updateResultsCount(displayedHotels);
        updateToolbarState();
    }
    window.applyFilters = applyFilters;

    function updateResultsCount(hotels) {
        const count = document.getElementById('resultsCount');
        if (!count) return;
        const destination = params.get('destination') || '';
        const cityName = destination || 'cette région';
        count.textContent = hotels.length + ' propriétés dans ' + cityName;
    }

    function updateToolbarState() {
        const btn = document.getElementById('mtFilters');
        if (!btn) return;
        const nameVal = (document.getElementById('filterName') || {}).value || '';
        const fc = document.getElementById('filterFreeCancellation');
        const anyChecked = fc && fc.checked;
        btn.classList.toggle('has-active', !!nameVal || anyChecked);
    }

    function clearFilters() {
        const nameEl = document.getElementById('filterName');
        if (nameEl) nameEl.value = '';

        const fc = document.getElementById('filterFreeCancellation');
        if (fc) fc.checked = false;

        document.querySelectorAll('#dynamicFiltersContainer input[type="checkbox"]').forEach(function(el) {
            el.checked = false;
        });

        const track = document.getElementById('priceTrack');
        const minHandle = document.getElementById('priceMinHandle');
        const maxHandle = document.getElementById('priceMaxHandle');
        const fill = document.getElementById('priceFill');
        const datasetMin = track && track.dataset.minPrice !== undefined ? parseFloat(track.dataset.minPrice) : 0;
        const datasetMax = track && track.dataset.maxPrice !== undefined ? parseFloat(track.dataset.maxPrice) : 1000;

        if (minHandle) {
            minHandle.style.left = '0%';
            minHandle.setAttribute('aria-valuenow', datasetMin);
        }
        if (maxHandle) {
            maxHandle.style.left = '100%';
            maxHandle.setAttribute('aria-valuenow', datasetMax);
        }
        if (fill) {
            fill.style.left = '0%';
            fill.style.right = '0%';
        }
        updatePriceLabels(datasetMin, datasetMax);
        applyFilters();
    }
    window.clearFilters = clearFilters;

    // ============================================
    // VUE (LISTE / CARTE)
    // ============================================
    function setView(view) {
        currentView = view;
        const buttons = document.querySelectorAll('.view-toggle button');
        buttons.forEach(function(btn) { btn.classList.remove('active'); });
        if (view === 'list') {
            buttons[0] && buttons[0].classList.add('active');
            document.getElementById('resultsContainer').style.display = '';
            document.querySelector('.sidebar').style.display = '';
            document.querySelector('.results-layout').style.gridTemplateColumns = '290px 1fr';
        } else {
            buttons[1] && buttons[1].classList.add('active');
            document.getElementById('resultsContainer').style.display = 'none';
            document.querySelector('.sidebar').style.display = 'none';
            document.querySelector('.results-layout').style.gridTemplateColumns = '1fr';
            setTimeout(function() { desktopMapCtrl.invalidate(); }, 300);
        }
    }
    window.setView = setView;

    // ============================================
    // BUILD DYNAMIC FILTERS (uniquement compatibles)
    // ============================================
    function buildAllDynamicFilters(hotels) {
        const container = document.getElementById('dynamicFiltersContainer');
        if (!container) {
            console.warn('dynamicFiltersContainer non trouvé');
            return;
        }
        container.innerHTML = '';

        const starsFilter = createDynamicStarsFilter(hotels);
        if (starsFilter) container.appendChild(starsFilter);

        const ratingFilter = createDynamicRatingFilter(hotels);
        if (ratingFilter) container.appendChild(ratingFilter);

        const mealFilter = createDynamicMealFilter(hotels);
        if (mealFilter) container.appendChild(mealFilter);

        const distanceFilter = createDynamicDistanceFilter(hotels);
        if (distanceFilter) container.appendChild(distanceFilter);

        updatePriceSlider(hotels);
        console.log('✅ Filtres dynamiques construits (compatibles backend)');
    }

    // ============================================
    // LOYALTY BADGE
    // ============================================
    const LOYALTY_LOGO = 'https://whitelabel-production-addonsstac-whitelabelbucket-rr8j7rddkm0b.s3.amazonaws.com/images/loyalty_program_logo-1780140543599';

    function calculateLuviaCoins(amountUSD) {
        return Math.floor(amountUSD * 0.05 * 100) / 100;
    }

    // ============================================
    // RENDU DES HÔTELS
    // ============================================
    function renderHotels(hotels) {
        const container = document.getElementById('resultsContainer');
        const count = document.getElementById('resultsCount');

        if (!hotels || hotels.length === 0) {
            if (container) container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--ink-soft);"><h3>' + (window.t ? window.t('hotel.no_results') : 'Aucun résultat') + '</h3><p>' + (window.t ? window.t('hotel.try_modify_filters') : 'Modifiez vos filtres') + '</p></div>';
            if (count) count.textContent = '0 propriétés trouvées';
            return;
        }

        const destination = params.get('destination') || '';
        const cityName = destination || 'cette région';
        const validHotels = hotels.filter(function(h) { return h.minPrice && h.minPrice > 0; });

        if (count) count.textContent = validHotels.length + ' propriétés dans ' + cityName;
        if (container) container.innerHTML = '';

        const checkin = params.get('checkin') || getDefaultCheckin();
        const checkout = params.get('checkout') || getDefaultCheckout();
        const nights = getNights(checkin, checkout);
        const currentCurrency = localStorage.getItem('luviaplace_currency') || 'USD';

        let isLoggedIn = false;
        if (typeof window.auth !== 'undefined' && window.auth.isLoggedIn) {
            isLoggedIn = window.auth.isLoggedIn();
        }
        if (!isLoggedIn) {
            try {
                const cachedUser = localStorage.getItem('luviaplace_user');
                if (cachedUser) {
                    const user = JSON.parse(cachedUser);
                    if (user && user.email) isLoggedIn = true;
                }
            } catch (e) {}
        }

        hotels.forEach(function(hotel) {
            const hotelId = hotel.id || null;
            if (!hotelId) {
                console.warn('⚠️ Hôtel sans ID:', hotel);
                return;
            }

            const starRating = hotel.starRating || 0;
            const fullStars = Math.min(Math.round(starRating), 5);
            let starHtml = '';
            if (starRating > 0 && fullStars > 0) {
                starHtml = '★'.repeat(fullStars);
            }

            const pricePerNightUSD = hotel.minPrice > 0 ? Math.round(hotel.minPrice / nights) : 0;
            const totalPriceUSD = hotel.minPrice > 0 ? Math.round(hotel.minPrice) : 0;

            const basePricePerNight = pricePerNightUSD;
            const baseTotalPrice = totalPriceUSD;
            const publicPricePerNight = basePricePerNight + (basePricePerNight * 0.10);
            const publicTotalPrice = baseTotalPrice + (baseTotalPrice * 0.10);

            let displayPrice = basePricePerNight;
            let publicPriceConverted = publicPricePerNight;
            if (typeof window.convertPrice === 'function') {
                displayPrice = window.convertPrice(basePricePerNight, 'USD', currentCurrency);
                publicPriceConverted = window.convertPrice(publicPricePerNight, 'USD', currentCurrency);
            }

            let formattedDisplayPrice = '';
            let formattedPublicPrice = '';
            if (typeof window.formatPrice === 'function') {
                formattedDisplayPrice = window.formatPrice(displayPrice, currentCurrency);
                formattedPublicPrice = window.formatPrice(publicPriceConverted, currentCurrency);
            } else {
                formattedDisplayPrice = '$' + displayPrice.toFixed(2);
                formattedPublicPrice = '$' + publicPriceConverted.toFixed(2);
            }

            const rating = hotel.rating || 0;

            // === CRÉATION DE LA CARTE HÔTEL ===
            const div = document.createElement('div');
            div.className = 'hotel-result';
            div.id = 'hotel-' + hotelId;
            div.tabIndex = 0;

            div.addEventListener('click', function() { selectHotel(hotelId); });
            div.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    selectHotel(hotelId);
                }
            });

            // PHOTO
            const photo = document.createElement('div');
            photo.className = 'photo';
            const img = document.createElement('img');
            img.loading = 'lazy';
            img.alt = hotel.name || 'Hôtel';
            img.src = hotel.main_photo || ('https://picsum.photos/seed/' + encodeURIComponent(hotelId) + '/460/380');
            photo.appendChild(img);

            const wishlistBtn = document.createElement('button');
            wishlistBtn.className = 'wishlist-btn';
            wishlistBtn.setAttribute('aria-label', 'Ajouter aux favoris');
            wishlistBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.5-9.5-9A5 5 0 0112 6a5 5 0 019.5 5c-2.5 4.5-9.5 9-9.5 9z"/></svg>';
            wishlistBtn.addEventListener('click', function(e) { e.stopPropagation(); });
            photo.appendChild(wishlistBtn);

            // INFO
            const info = document.createElement('div');
            info.className = 'info';

            const starsDiv = document.createElement('div');
            starsDiv.className = 'stars';
            starsDiv.textContent = starHtml;
            if (!starHtml) starsDiv.style.display = 'none';
            info.appendChild(starsDiv);

            const h3 = document.createElement('h3');
            h3.textContent = hotel.name || 'Hôtel sans nom';
            info.appendChild(h3);

            const addrRow = document.createElement('div');
            addrRow.className = 'addr-row';
            addrRow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.4"/></svg><span></span>';
            addrRow.querySelector('span').textContent = hotel.address || hotel.city || 'Adresse non disponible';
            info.appendChild(addrRow);

            const distRow = document.createElement('div');
            distRow.className = 'dist-row';
            distRow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 5l7 7-7 7M5 12h15"/></svg><span></span>';
            distRow.querySelector('span').textContent = hotel.roomName || 'Chambre standard';
            info.appendChild(distRow);

            // SIDE
            const side = document.createElement('div');
            side.className = 'side';

            // Score Chip
            const scoreChip = document.createElement('div');
            scoreChip.className = 'score-chip';
            const scoreNum = document.createElement('span');
            scoreNum.className = 'score-num';
            const ratingValue = rating > 0 ? rating.toFixed(1) : 'N/A';
            scoreNum.textContent = ratingValue;
            if (rating >= 8) scoreNum.classList.add('good');
            else if (rating >= 6) scoreNum.classList.add('ok');
            else if (rating > 0) scoreNum.classList.add('bad');
            else scoreNum.classList.add('ok');

            const ratingText = document.createElement('span');
            ratingText.className = 'score-text';
            ratingText.textContent = ratingTier(rating);

            const separator = document.createElement('span');
            separator.className = 'sep';
            separator.textContent = '•';

            const reviewText = document.createElement('span');
            reviewText.className = 'review-count';
            reviewText.textContent = (hotel.reviewCount || 0) + ' avis';

            scoreChip.appendChild(scoreNum);
            scoreChip.appendChild(ratingText);
            scoreChip.appendChild(separator);
            scoreChip.appendChild(reviewText);
            side.appendChild(scoreChip);

            // Savings Pill (non connecté)
            if (!isLoggedIn && hotel.minPrice > 0) {
                const connectPill = document.createElement('div');
                connectPill.className = 'savings-pill';
                connectPill.style.background = '#c1ebab';
                connectPill.style.color = '#000000';
                connectPill.style.cursor = 'pointer';
                connectPill.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z"/></svg><span></span>';
                connectPill.querySelector('span').textContent = 'Connectez-vous pour économiser 10%';
                connectPill.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (typeof window.openAuthModal === 'function') window.openAuthModal();
                });
                side.appendChild(connectPill);
            }

            // Price Block
            const priceBlock = document.createElement('div');
            priceBlock.className = 'price-block';

            if (hotel.minPrice > 0) {
                const nightsText = nights + ' nuits';
                priceBlock.innerHTML =
                    '<div class="amount">' + formattedDisplayPrice + ' <span class="per">/ nuit</span></div>' +
                    '<div class="note">' + nightsText + ', 1 chambre, taxes incluses</div>' +
                    '<div class="public-price">Prix public <s>' + formattedPublicPrice + '</s></div>';
            } else {
                priceBlock.innerHTML = '<span style="font-size:14px;color:var(--ink-soft);">Prix non disponible</span>';
            }
            side.appendChild(priceBlock);

            // Loyalty Badge
            if (hotel.minPrice > 0 && totalPriceUSD >= 1500) {
                const coinsEarned = calculateLuviaCoins(totalPriceUSD);
                const loyaltyBadge = document.createElement('div');
                loyaltyBadge.className = 'loyalty-badge';
                loyaltyBadge.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 12px 6px 8px;background:#ffffff;border:1px solid #E7EAF0;border-radius:8px;font-size:12px;color:#1f87e8;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.06);';
                const logoImg = document.createElement('img');
                logoImg.src = LOYALTY_LOGO;
                logoImg.alt = 'Luvia Rewards';
                logoImg.style.cssText = 'height:20px;width:auto;max-width:60px;object-fit:contain;';
                const text = document.createElement('span');
                text.textContent = 'Gagnez ' + coinsEarned.toFixed(2) + ' LuviaCoins';
                text.style.cssText = 'font-size:11px;color:#1f87e8;';
                loyaltyBadge.appendChild(logoImg);
                loyaltyBadge.appendChild(text);
                info.appendChild(loyaltyBadge);
            }

            // CTA
            const ctaBtn = document.createElement('button');
            ctaBtn.className = 'cta-btn-sm';
            ctaBtn.innerHTML = 'Voir les disponibilités <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg>';
            ctaBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                voirHotel(hotelId);
            });
            side.appendChild(ctaBtn);

            // ASSEMBLAGE
            div.appendChild(photo);
            div.appendChild(info);
            div.appendChild(side);
            if (container) container.appendChild(div);
        });
    }

    function voirHotel(hotelId) {
        if (!hotelId) {
            showToast('Erreur : ID d\'hôtel manquant');
            return;
        }
        const checkin = params.get('checkin') || getDefaultCheckin();
        const checkout = params.get('checkout') || getDefaultCheckout();
        const adults = params.get('adults') || '2';
        const children = params.get('children') || '0';

        let url = 'hotel-detail.html?hotelId=' + encodeURIComponent(hotelId);
        url += '&checkin=' + encodeURIComponent(checkin);
        url += '&checkout=' + encodeURIComponent(checkout);
        url += '&adults=' + encodeURIComponent(adults);
        if (parseInt(children) > 0) url += '&children=' + encodeURIComponent(children);

        window.location.href = url;
    }
    window.voirHotel = voirHotel;

    function generateSkeleton() {
        const container = document.getElementById('resultsContainer');
        if (!container) return;
        let html = '';
        for (let i = 0; i < 6; i++) {
            html += '<div class="hotel-result skeleton" style="cursor:default;">' +
                '<div class="skeleton-photo"></div>' +
                '<div class="info"><div class="skeleton-line w70"></div><div class="skeleton-line w50"></div><div class="skeleton-line w40"></div><div class="skeleton-line w90"></div><div class="skeleton-line w30"></div></div>' +
                '<div class="side"><div class="skeleton-line w50"></div><div class="skeleton-line w40"></div><div class="skeleton-line w40"></div></div>' +
                '</div>';
        }
        container.innerHTML = html;
    }

    // ============================================
    // RÉSUMÉ DE RECHERCHE
    // ============================================
    function updateSearchSummary() {
        const destination = params.get('destination') || '';
        const checkin = params.get('checkin') || '';
        const checkout = params.get('checkout') || '';
        const adults = parseInt(params.get('adults') || '2', 10);
        const children = parseInt(params.get('children') || '0', 10);

        const destText = destination || 'Destination non spécifiée';
        const datesText = checkin && checkout ? formatDate(checkin) + ' - ' + formatDate(checkout) : 'Sélectionnez vos dates';
        const totalGuests = adults + children;
        const guestsText = totalGuests + ' clients';

        const elDest = document.getElementById('sumDest');
        if (elDest) elDest.textContent = destText;
        const elDates = document.getElementById('sumDates');
        if (elDates) elDates.textContent = datesText;
        const elGuests = document.getElementById('sumGuests');
        if (elGuests) elGuests.textContent = guestsText;
        const mssDest = document.getElementById('mssDest');
        if (mssDest) mssDest.textContent = destText;
        const mssSub = document.getElementById('mssSub');
        if (mssSub) mssSub.textContent = datesText + ' • ' + guestsText;
    }

    function prefillEditSheet() {
        const ed = document.getElementById('editDestination');
        const eci = document.getElementById('editCheckin');
        const eco = document.getElementById('editCheckout');
        if (ed) ed.value = params.get('destination') || '';
        if (eci) eci.value = params.get('checkin') || getDefaultCheckin();
        if (eco) eco.value = params.get('checkout') || getDefaultCheckout();
        editAdultsValue = parseInt(params.get('adults') || '2', 10);
        const eac = document.getElementById('editAdultsCount');
        if (eac) eac.textContent = editAdultsValue;
    }

    // ============================================
    // CHARGEMENT STREAMING SSE
    // ============================================
    function loadResultsStream() {
        const destination = params.get('destination') || '';
        const checkin = params.get('checkin') || '';
        const checkout = params.get('checkout') || '';
        const adults = parseInt(params.get('adults') || '2', 10);
        const placeId = params.get('placeId') || '';

        updateSearchSummary();

        if (!checkin || !checkout || !destination) {
            const rc = document.getElementById('resultsContainer');
            if (rc) rc.innerHTML =
                '<div style="text-align:center;padding:60px 20px;color:var(--ink-soft);">' +
                '<h3>Paramètres manquants</h3>' +
                '<p>Veuillez retourner à la page d\'accueil et effectuer une recherche.</p>' +
                '<a href="index.html" style="display:inline-block;margin-top:16px;padding:10px 20px;background:var(--blue);color:#FFF;border-radius:10px;">Retour à l\'accueil</a>' +
                '</div>';
            const rcount = document.getElementById('resultsCount');
            if (rcount) rcount.textContent = 'Paramètres manquants';
            return;
        }

        generateSkeleton();
        const rcount = document.getElementById('resultsCount');
        if (rcount) rcount.textContent = 'Recherche en cours...';

        const queryParams = new URLSearchParams({
            checkin: checkin,
            checkout: checkout,
            adults: adults,
            environment: 'production',
            limit: 2000
        });
        if (placeId) queryParams.append('placeId', placeId);
        else queryParams.append('city', destination);

        const streamUrl = API_BASE_URL + '/search-hotels-stream?' + queryParams.toString();
        let eventSource;
        try {
            eventSource = new EventSource(streamUrl);
        } catch (e) {
            console.error('❌ EventSource non supporté ou erreur:', e);
            if (rcount) rcount.textContent = 'Erreur de connexion';
            return;
        }

        let accumulatedHotels = [];
        let isComplete = false;

        eventSource.addEventListener('batch', function(e) {
            try {
                const data = JSON.parse(e.data);
                const batchHotels = data.hotels || [];
                accumulatedHotels = accumulatedHotels.concat(batchHotels);
                allHotels = accumulatedHotels;
                displayedHotels = accumulatedHotels;
                renderHotels(accumulatedHotels);
                const countText = data.total ? (accumulatedHotels.length + ' / ' + data.total + ' propriétés') : (accumulatedHotels.length + ' propriétés trouvées');
                if (rcount) rcount.textContent = countText;
                console.log('📦 Batch:', batchHotels.length, 'total:', accumulatedHotels.length);
            } catch (error) {
                console.error('❌ Erreur batch:', error);
            }
        });

        eventSource.addEventListener('status', function(e) {
            try {
                const data = JSON.parse(e.data);
                console.log('📊 Status:', data.step, data.message);
                if (data.step === 'found' && rcount) {
                    rcount.textContent = 'Chargement des ' + data.message + '...';
                }
            } catch (error) {
                console.error('❌ Erreur status:', error);
            }
        });

        eventSource.addEventListener('complete', function(e) {
            try {
                const data = JSON.parse(e.data);
                const finalHotels = data.hotels || [];
                allHotels = finalHotels;
                displayedHotels = finalHotels;
                renderHotels(finalHotels);
                if (rcount) rcount.textContent = finalHotels.length + ' propriétés trouvées';
                eventSource.close();
                isComplete = true;
                console.log('✅ Streaming terminé:', finalHotels.length);
                buildAllDynamicFilters(finalHotels);
                applyFilters();
                desktopMapCtrl.init(null, null, finalHotels);
                if (mobileMapCtrl.isInitialized()) mobileMapCtrl.addMarkers(finalHotels);
            } catch (error) {
                console.error('❌ Erreur complete:', error);
            }
        });

        eventSource.addEventListener('error', function(e) {
            console.error('❌ Erreur SSE:', e);
            if (accumulatedHotels.length > 0) {
                if (rcount) rcount.textContent = accumulatedHotels.length + ' propriétés trouvées (chargement interrompu)';
                eventSource.close();
                return;
            }
            const rc = document.getElementById('resultsContainer');
            if (rc) rc.innerHTML =
                '<div style="text-align:center;padding:60px 20px;color:var(--ink-soft);"><h3>Erreur</h3><p>Erreur de connexion au serveur</p>' +
                '<button onclick="loadResultsStream()" style="margin-top:20px;padding:10px 30px;background:var(--blue);color:#FFF;border:none;border-radius:10px;cursor:pointer;">Réessayer</button></div>';
            if (rcount) rcount.textContent = '0 propriétés trouvées';
            eventSource.close();
        });

        setTimeout(function() {
            if (!isComplete && eventSource) {
                console.warn('⏰ Timeout SSE');
                eventSource.close();
                if (accumulatedHotels.length > 0 && rcount) {
                    rcount.textContent = accumulatedHotels.length + ' propriétés trouvées (timeout)';
                }
            }
        }, 300000);
    }

    // ============================================
    // BOTTOM SHEETS
    // ============================================
    function openSheet(id) {
        document.querySelectorAll('.bottom-sheet.open').forEach(function(s) { s.classList.remove('open'); });
        const sheet = document.getElementById(id);
        if (!sheet) return;
        sheet.classList.add('open');
        const overlay = document.getElementById('sheetOverlay');
        if (overlay) overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeAllSheets() {
        document.querySelectorAll('.bottom-sheet.open').forEach(function(s) { s.classList.remove('open'); });
        const overlay = document.getElementById('sheetOverlay');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    // ============================================
    // RÉPARTITION RESPONSIVE DES FILTRES
    // ============================================
    function relocateFilterPanel() {
        const panel = document.getElementById('filtersPanelContent');
        const desktopSlot = document.getElementById('filtersSlotDesktop');
        const mobileSlot = document.getElementById('filtersSlotMobile');
        if (!panel || !desktopSlot || !mobileSlot) return;
        const isMobile = window.matchMedia('(max-width:960px)').matches;
        const target = isMobile ? mobileSlot : desktopSlot;
        if (panel.parentElement !== target) target.appendChild(panel);
    }

    // ============================================
    // INITIALISATION
    // ============================================
    document.addEventListener('DOMContentLoaded', function() {
        loadResultsStream();
        relocateFilterPanel();
        window.addEventListener('resize', debounce(relocateFilterPanel, 200));

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.sort-select')) {
                const sd = document.getElementById('sortDropdown');
                if (sd) sd.classList.remove('open');
            }
        });

        // Slider prix
        const minHandle = document.getElementById('priceMinHandle');
        const maxHandle = document.getElementById('priceMaxHandle');
        const fill = document.getElementById('priceFill');
        const priceTrackEl = document.getElementById('priceTrack');
        let isDragging = null;

        function recalcPriceRangeFromHandles() {
            if (!priceTrackEl || !minHandle || !maxHandle) return;
            const datasetMin = parseFloat(priceTrackEl.dataset.minPrice) || 0;
            const datasetMax = parseFloat(priceTrackEl.dataset.maxPrice) || 1000;
            let minLeft = parseFloat(minHandle.style.left) || 0;
            let maxLeft = parseFloat(maxHandle.style.left);
            if (isNaN(maxLeft)) maxLeft = 100;
            if (minLeft > maxLeft) {
                minHandle.style.left = maxLeft + '%';
                minLeft = maxLeft;
            }
            const minValue = datasetMin + (minLeft / 100) * (datasetMax - datasetMin);
            const maxValue = datasetMin + (maxLeft / 100) * (datasetMax - datasetMin);
            minHandle.setAttribute('aria-valuenow', Math.round(minValue));
            maxHandle.setAttribute('aria-valuenow', Math.round(maxValue));
            updatePriceLabels(minValue, maxValue);
            if (fill) {
                fill.style.left = minLeft + '%';
                fill.style.right = (100 - maxLeft) + '%';
            }
            applyFilters();
        }

        function onDragXY(clientX) {
            if (!isDragging || !isDragging.parentElement) return;
            const rect = isDragging.parentElement.getBoundingClientRect();
            const x = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
            isDragging.style.left = x + '%';
            recalcPriceRangeFromHandles();
        }

        function onMouseMove(e) { if (isDragging) onDragXY(e.clientX); }
        function onTouchMove(e) { if (isDragging) { e.preventDefault(); onDragXY(e.touches[0].clientX); } }
        function stopDrag() {
            isDragging = null;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', stopDrag);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', stopDrag);
        }
        function startDrag(e, handle) {
            isDragging = handle;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', stopDrag);
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', stopDrag);
            e.preventDefault();
        }

        if (minHandle && maxHandle) {
            minHandle.addEventListener('mousedown', function(e) { startDrag(e, minHandle); });
            maxHandle.addEventListener('mousedown', function(e) { startDrag(e, maxHandle); });
            minHandle.addEventListener('touchstart', function(e) { startDrag(e, minHandle); }, { passive: false });
            maxHandle.addEventListener('touchstart', function(e) { startDrag(e, maxHandle); }, { passive: false });
        }

        // Toolbar mobile
        const mtFilters = document.getElementById('mtFilters');
        const mtSort = document.getElementById('mtSort');
        if (mtFilters) mtFilters.addEventListener('click', function() { openSheet('filtersSheet'); });
        if (mtSort) mtSort.addEventListener('click', function() { openSheet('sortSheet'); });

        document.querySelectorAll('.sheet-sort-item').forEach(function(el) {
            el.addEventListener('click', function() {
                applySort(el.dataset.sort);
                closeAllSheets();
            });
        });

        const sheetOverlay = document.getElementById('sheetOverlay');
        if (sheetOverlay) sheetOverlay.addEventListener('click', closeAllSheets);
        document.querySelectorAll('[data-close-sheet]').forEach(function(btn) {
            btn.addEventListener('click', closeAllSheets);
        });

        // Modifier recherche
        const mssEditBtn = document.getElementById('mssEditBtn');
        const mobileSearchSummary = document.getElementById('mobileSearchSummary');
        const condensedEditBtn = document.getElementById('condensedEditBtn');
        const searchSummary = document.getElementById('searchSummary');

        function openEditSheet() {
            prefillEditSheet();
            openSheet('editSearchSheet');
        }

        if (searchSummary) {
            searchSummary.addEventListener('click', function(e) {
                if (e.target.closest('#condensedEditBtn')) return;
                openEditSheet();
            });
        }
        if (mssEditBtn) mssEditBtn.addEventListener('click', function(e) { e.stopPropagation(); openEditSheet(); });
        if (mobileSearchSummary) {
            mobileSearchSummary.addEventListener('click', openEditSheet);
            mobileSearchSummary.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEditSheet(); }
            });
        }
        if (condensedEditBtn) condensedEditBtn.addEventListener('click', openEditSheet);

        const eam = document.getElementById('editAdultsMinus');
        const eap = document.getElementById('editAdultsPlus');
        const eac = document.getElementById('editAdultsCount');
        if (eam) eam.addEventListener('click', function() {
            editAdultsValue = Math.max(1, editAdultsValue - 1);
            if (eac) eac.textContent = editAdultsValue;
        });
        if (eap) eap.addEventListener('click', function() {
            editAdultsValue = editAdultsValue + 1;
            if (eac) eac.textContent = editAdultsValue;
        });

        const esa = document.getElementById('editSearchApply');
        if (esa) esa.addEventListener('click', function() {
            const dest = document.getElementById('editDestination');
            const ci = document.getElementById('editCheckin');
            const co = document.getElementById('editCheckout');
            if (!dest || !ci || !co) return;
            const destination = dest.value.trim();
            const checkin = ci.value;
            const checkout = co.value;
            if (!destination || !checkin || !checkout) return;
            params.set('destination', destination);
            params.set('checkin', checkin);
            params.set('checkout', checkout);
            params.set('adults', editAdultsValue);
            params.delete('placeId');
            history.replaceState(null, '', window.location.pathname + '?' + params.toString());
            closeAllSheets();
            loadResultsStream();
        });

        // Carte mobile
        const mapFab = document.getElementById('mapFab');
        const mmoClose = document.getElementById('mmoClose');
        const mobileMapOverlay = document.getElementById('mobileMapOverlay');
        if (window.innerWidth <= 960) {
            if (mapFab) {
                mapFab.addEventListener('click', function() {
                    if (mobileMapOverlay) mobileMapOverlay.classList.add('open');
                    if (!mobileMapCtrl.isInitialized()) {
                        mobileMapCtrl.init(null, null, allHotels);
                    } else {
                        mobileMapCtrl.invalidate();
                    }
                });
            }
            if (mmoClose && mobileMapOverlay) {
                mmoClose.addEventListener('click', function() {
                    mobileMapOverlay.classList.remove('open');
                });
            }
        }

        // Service switcher
        const btn = document.getElementById('switcherBtn');
        const menu = document.getElementById('switcherMenu');
        if (btn && menu) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                menu.classList.toggle('open');
            });
            document.addEventListener('click', function() { menu.classList.remove('open'); });
        }
    });

    document.addEventListener('languageChanged', function(e) {
        console.log('🔄 Langue changée vers:', e.detail.language);
        if (allHotels.length > 0) renderHotels(displayedHotels);
        updateSearchSummary();
    });

})();
