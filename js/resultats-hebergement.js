// ============================================
// resultats-hebergement.js - Page de résultats
// ============================================

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    var API_BASE_URL = 'https://luvia-place-v2-1-plh1.onrender.com';
    var params = new URLSearchParams(window.location.search);
    var allHotels = [];
    var displayedHotels = [];
    var currentSort = 'popularity';
    var currentView = 'list';
    var selectedHotelId = null;
    var editAdultsValue = 2;

    // ============================================
    // UTILITAIRES (réutilisés depuis main.js)
    // ============================================
    function getNights(checkin, checkout) {
        if (!checkin || !checkout) return 1;
        var start = new Date(checkin);
        var end = new Date(checkout);
        var diffDays = Math.ceil(Math.abs(end - start) / 86400000);
        return diffDays > 0 ? diffDays : 1;
    }

    function getDefaultCheckin() {
        var d = new Date();
        d.setDate(d.getDate() + 1);
        return d.toISOString().slice(0, 10);
    }

    function getDefaultCheckout() {
        var d = new Date();
        d.setDate(d.getDate() + 4);
        return d.toISOString().slice(0, 10);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }

    function escapeHtml(str) {
        var div = document.createElement('div');
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
        var symbols = {
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

    function showToast(msg) {
        var toastEl = document.getElementById('toast');
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastEl._timer);
        toastEl._timer = setTimeout(function() {
            toastEl.classList.remove('show');
        }, 3200);
    }

    function debounce(fn, delay) {
        var timer;
        return function() {
            clearTimeout(timer);
            var args = arguments;
            timer = setTimeout(function() { fn.apply(null, args); }, delay);
        };
    }

    // ============================================
    // CONTRÔLEUR DE CARTE
    // ============================================
    function createMapController(containerId) {
        var map = null,
            markers = [],
            markerMap = {},
            initialized = false;

        function buildIcon(count, highlighted, markerId) {
            var cls = highlighted ? 'marker-pin marker-pin-active' : 'marker-pin';
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
            var bounds = [],
                count = 0;
            hotels.forEach(function(hotel) {
                var lat = hotel.latitude || hotel.lat;
                var lng = hotel.longitude || hotel.lon;
                if (!lat || !lng) return;
                lat = parseFloat(lat);
                lng = parseFloat(lng);
                if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) return;
                count++;
                var markerId = containerId + '-marker-' + hotel.id;
                var marker = L.marker([lat, lng], { icon: buildIcon(count, false, markerId) })
                    .addTo(map)
                    .bindPopup(
                        '<strong>' + escapeHtml(hotel.name || 'Hôtel') + '</strong>' +
                        (hotel.address ? '<br>' + escapeHtml(hotel.address) : '') +
                        '<br><a href="hotel-detail.html?hotelId=' + encodeURIComponent(hotel.id) +
                        '" style="color:#155EEF;font-weight:600;">' + window.t('detail.book_now') + '</a>'
                    );
                marker.hotelId = hotel.id;
                marker.count = count;
                markers.push(marker);
                markerMap[hotel.id] = marker;
                bounds.push([lat, lng]);
                marker.on('click', function() { selectHotel(this.hotelId); });
            });
            if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
        }

        function init(lat, lng, hotels) {
            if (initialized) {
                if (hotels && hotels.length) addMarkers(hotels);
                return;
            }
            var container = document.getElementById(containerId);
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
                var marker = markerMap[hotelId];
                marker.setIcon(buildIcon(marker.count, true, containerId + '-marker-' + hotelId));
                marker.openPopup();
                map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
            }
        }

        function invalidate() {
            if (map) map.invalidateSize();
        }

        function isInitialized() {
            return initialized;
        }

        return {
            init: init,
            addMarkers: addMarkers,
            highlight: highlight,
            invalidate: invalidate,
            isInitialized: isInitialized
        };
    }

    var desktopMapCtrl = createMapController('mapContainer');
    var mobileMapCtrl = createMapController('mobileMapContainer');

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

        var labels = {
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
        var sorted = hotels.slice();
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
    // FILTRES - UTILITAIRES
    // ============================================
    function getCheckedValues(group) {
        return Array.prototype.slice.call(
            document.querySelectorAll('[data-filter-group="' + group + '"] input[type="checkbox"]:checked')
        ).map(function(el) { return el.getAttribute('data-value'); });
    }

    // ============================================
    // FILTRES DYNAMIQUES
    // ============================================
    function createDynamicStarsFilter(hotels) {
        var starCounts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0, 0: 0 };
        hotels.forEach(function(h) {
            var stars = Math.round(h.starRating || 0);
            if (stars >= 1 && stars <= 5) starCounts[stars]++;
            else starCounts[0]++;
        });

        var hasStars = Object.keys(starCounts).some(function(k) { return starCounts[k] > 0; });
        if (!hasStars) return null;

        var labels = { 5: '5 étoiles', 4: '4 étoiles', 3: '3 étoiles', 2: '2 étoiles', 1: '1 étoile', 0: 'Non classé' };

        var div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        var html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Évaluation par étoiles</label>';

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
        var hasRating = hotels.some(function(h) { return h.rating > 0; });
        if (!hasRating) return null;

        var ratings = [
            { value: 9, label: 'Fabuleux : 9+' },
            { value: 8, label: 'Très bien : 8+' },
            { value: 7, label: 'Bien : 7+' },
            { value: 6, label: 'Agréable : 6+' }
        ];

        var div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        var html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Évaluation des clients</label>';

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
        var mealLabels = {
            'RO': 'Room Only',
            'BB': 'Petit déjeuner inclus',
            'HB': 'Demi-pension',
            'FB': 'Pension complète',
            'AI': 'Tout inclus',
            'BI': 'Petit déjeuner inclus'
        };

        var meals = {};
        hotels.forEach(function(h) {
            var code = h.boardType || h.mealPlan || h.board;
            if (code && code !== 'RO') meals[code] = (meals[code] || 0) + 1;
        });

        var codes = Object.keys(meals);
        if (codes.length === 0) return null;

        var div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        var html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Plans de repas</label>';

        codes.forEach(function(code) {
            var label = mealLabels[code] || code;
            html += '<label class="check-item" data-filter-group="meal">' +
                '<input type="checkbox" data-value="' + code + '" onchange="applyFilters()">' +
                '<span>' + label + ' (' + meals[code] + ')</span>' +
                '</label>';
        });

        div.innerHTML = html;
        return div;
    }

    function createDynamicAmenitiesFilter(hotels) {
        var amenities = {};
        hotels.forEach(function(h) {
            (h.amenities || []).forEach(function(a) {
                if (a && typeof a === 'string') amenities[a] = (amenities[a] || 0) + 1;
            });
        });

        var amenityKeys = Object.keys(amenities);
        if (amenityKeys.length === 0) return null;

        amenityKeys.sort(function(a, b) { return amenities[b] - amenities[a]; });
        amenityKeys = amenityKeys.slice(0, 8);

        var div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        var html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Équipements de la chambre</label>';

        amenityKeys.forEach(function(a) {
            html += '<label class="check-item" data-filter-group="amenity">' +
                '<input type="checkbox" data-value="' + a.replace(/"/g, '&quot;') + '" onchange="applyFilters()">' +
                '<span>' + a + ' (' + amenities[a] + ')</span>' +
                '</label>';
        });

        div.innerHTML = html;
        return div;
    }

    function createDynamicDistrictFilter(hotels) {
        var districts = {};
        hotels.forEach(function(h) {
            var district = h.district || h.neighborhood || h.area || h.quarter || h.suburb;
            if (district) districts[district] = (districts[district] || 0) + 1;
        });

        var districtKeys = Object.keys(districts);
        if (districtKeys.length === 0) return null;

        districtKeys.sort(function(a, b) { return districts[b] - districts[a]; });
        districtKeys = districtKeys.slice(0, 8);

        var div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        var html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Quartier</label>';

        districtKeys.forEach(function(d) {
            html += '<label class="check-item" data-filter-group="district">' +
                '<input type="checkbox" data-value="' + d.replace(/"/g, '&quot;') + '" onchange="applyFilters()">' +
                '<span>' + d + ' (' + districts[d] + ')</span>' +
                '</label>';
        });

        div.innerHTML = html;
        return div;
    }

    function createDynamicBrandFilter(hotels) {
        var brands = {};
        hotels.forEach(function(h) {
            var brand = h.brand || h.chain || null;
            if (brand && brand !== 'Indépendant' && brand !== 'Independent') {
                brands[brand] = (brands[brand] || 0) + 1;
            }
        });

        var brandKeys = Object.keys(brands);
        if (brandKeys.length === 0) return null;

        brandKeys.sort(function(a, b) { return brands[b] - brands[a]; });

        var div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        var html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Marque</label>';

        var count = 0;
        var totalBrands = brandKeys.length;
        brandKeys.forEach(function(brand) {
            var hiddenClass = count >= 5 ? 'brand-hidden' : '';
            var displayStyle = count >= 5 ? 'display:none;' : '';
            html += '<label class="check-item ' + hiddenClass + '" style="' + displayStyle + '" data-filter-group="brand">' +
                '<input type="checkbox" data-value="' + brand.replace(/"/g, '&quot;') + '" onchange="applyFilters()">' +
                '<span>' + brand + ' (' + brands[brand] + ')</span>' +
                '</label>';
            count++;
        });

        if (totalBrands > 5) {
            html += '<a class="show-all" href="#" onclick="this.parentElement.querySelectorAll(\'.brand-hidden\').forEach(function(el){el.style.display=\'flex\';});this.style.display=\'none\';return false;">Afficher tous ' + totalBrands + '</a>';
        }

        div.innerHTML = html;
        return div;
    }

    function createDynamicDistanceFilter(hotels) {
        var hasCoords = hotels.some(function(h) {
            return (h.latitude || h.lat) && (h.longitude || h.lon);
        });
        if (!hasCoords) return null;

        var distances = [
            { value: 1, label: 'Moins de 1 km' },
            { value: 3, label: 'Moins de 3 km' },
            { value: 5, label: 'Moins de 5 km' },
            { value: 10, label: 'Moins de 10 km' }
        ];

        var div = document.createElement('div');
        div.className = 'filter dynamic-filter';
        var html = '<label style="font-size:12px;font-weight:700;margin-top:8px;">Distance du centre</label>';

        distances.forEach(function(d) {
            html += '<label class="check-item" data-filter-group="distance">' +
                '<input type="checkbox" data-value="' + d.value + '" onchange="applyFilters()">' +
                '<span>' + d.label + '</span>' +
                '</label>';
        });

        div.innerHTML = html;
        return div;
    }

    function updatePropertyTypes(hotels) {
        var container = document.getElementById('propertyTypeContainer');
        if (!container) return;

        var types = {};
        hotels.forEach(function(h) {
            var type = h.type || h.propertyType || 'Hôtel';
            types[type] = (types[type] || 0) + 1;
        });

        var typeKeys = Object.keys(types);
        if (typeKeys.length === 0) return;

        container.innerHTML = '';
        typeKeys.forEach(function(type) {
            var checked = type === 'Hôtel' ? 'checked' : '';
            var label = type;
            if (type === 'Hôtel') label = 'Hôtel';
            else if (type === 'Apartment' || type === 'Appartement') label = 'Appartement';
            else if (type === 'Villa') label = 'Villa';
            else if (type === 'Guest house' || type === "Maison d'hôtes") label = "Maison d'hôtes";

            container.innerHTML +=
                '<label class="check-item" data-filter-group="type">' +
                '<input type="checkbox" data-value="' + type.replace(/"/g, '&quot;') + '" onchange="applyFilters()" ' + checked + '>' +
                '<span>' + label + ' (' + types[type] + ')</span>' +
                '</label>';
        });
    }

    function refreshPopularFiltersVisibility(hotels) {
        var tagChecks = {
            filterParking: 'Parking',
            filterBreakfast: 'Breakfast',
            filterPool: 'Pool',
            filterWifi: 'WiFi'
        };

        Object.keys(tagChecks).forEach(function(id) {
            var input = document.getElementById(id);
            if (!input) return;
            var label = input.closest('label');
            var tagName = tagChecks[id];
            var hasData = hotels.some(function(h) {
                return Array.isArray(h.tags) && h.tags.indexOf(tagName) !== -1;
            });
            if (label) label.style.display = hasData ? '' : 'none';
            if (!hasData) input.checked = false;
        });
    }

    // ============================================
    // SLIDER DE PRIX
    // ============================================
    function updatePriceLabels(minPrice, maxPrice) {
        var currency = localStorage.getItem('luviaplace_currency') || 'USD';
        var symbol = getCurrencySymbol(currency);
        var minLabel = document.getElementById('priceMinLabel');
        var maxLabel = document.getElementById('priceMaxLabel');
        var minValue = document.getElementById('priceMinValue');
        var maxValue = document.getElementById('priceMaxValue');

        if (minLabel) minLabel.textContent = symbol + Math.round(minPrice);
        if (maxLabel) maxLabel.textContent = symbol + Math.round(maxPrice);
        if (minValue) minValue.textContent = symbol + Math.round(minPrice);
        if (maxValue) maxValue.textContent = symbol + Math.round(maxPrice);
    }

    function updatePriceSlider(hotels) {
        var prices = hotels.filter(function(h) { return h.minPrice && h.minPrice > 0; }).map(function(h) { return h.minPrice; });
        if (prices.length === 0) return;

        var minPrice = Math.floor(Math.min.apply(null, prices));
        var maxPrice = Math.ceil(Math.max.apply(null, prices));

        var track = document.getElementById('priceTrack');
        if (track) {
            track.dataset.minPrice = minPrice;
            track.dataset.maxPrice = maxPrice;
        }

        var minHandle = document.getElementById('priceMinHandle');
        var maxHandle = document.getElementById('priceMaxHandle');
        var fill = document.getElementById('priceFill');

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
    // APPLIQUER LES FILTRES
    // ============================================
    function applyFilters() {
        var nameFilter = document.getElementById('filterName');
        var nameValue = nameFilter ? nameFilter.value.toLowerCase() : '';

        var track = document.getElementById('priceTrack');
        var datasetMin = track && track.dataset.minPrice !== undefined ? parseFloat(track.dataset.minPrice) : 0;
        var datasetMax = track && track.dataset.maxPrice !== undefined ? parseFloat(track.dataset.maxPrice) : Infinity;
        var minHandle = document.getElementById('priceMinHandle');
        var maxHandle = document.getElementById('priceMaxHandle');
        var minPrice = minHandle && minHandle.getAttribute('aria-valuenow') !== null ? parseFloat(minHandle.getAttribute('aria-valuenow')) : datasetMin;
        var maxPrice = maxHandle && maxHandle.getAttribute('aria-valuenow') !== null ? parseFloat(maxHandle.getAttribute('aria-valuenow')) : datasetMax;

        var fc = document.getElementById('filterFreeCancellation');
        var pk = document.getElementById('filterParking');
        var bf = document.getElementById('filterBreakfast');
        var pl = document.getElementById('filterPool');
        var wf = document.getElementById('filterWifi');

        var brandChecked = getCheckedValues('brand');
        var typeChecked = getCheckedValues('type');
        var starsChecked = getCheckedValues('stars');
        var ratingChecked = getCheckedValues('rating');
        var mealChecked = getCheckedValues('meal');
        var amenityChecked = getCheckedValues('amenity');
        var districtChecked = getCheckedValues('district');

        var filtered = allHotels.filter(function(hotel) {
            if (nameValue && !(hotel.name || '').toLowerCase().includes(nameValue)) return false;

            if (hotel.minPrice > 0 && (hotel.minPrice < minPrice || hotel.minPrice > maxPrice)) return false;

            if (fc && fc.checked && !hotel.refundable) return false;
            if (pk && pk.checked && !(hotel.tags && hotel.tags.indexOf('Parking') !== -1)) return false;
            if (bf && bf.checked && !(hotel.tags && hotel.tags.indexOf('Breakfast') !== -1)) return false;
            if (pl && pl.checked && !(hotel.tags && hotel.tags.indexOf('Pool') !== -1)) return false;
            if (wf && wf.checked && !(hotel.tags && hotel.tags.indexOf('WiFi') !== -1)) return false;

            if (brandChecked.length) {
                var brand = hotel.brand || hotel.chain || 'Indépendant';
                if (brandChecked.indexOf(brand) === -1) return false;
            }

            if (typeChecked.length) {
                var type = hotel.type || hotel.propertyType || 'Hôtel';
                if (typeChecked.indexOf(type) === -1) return false;
            }

            if (starsChecked.length) {
                var stars = String(Math.round(hotel.starRating || 0));
                if (starsChecked.indexOf(stars) === -1) return false;
            }

            if (ratingChecked.length) {
                var rating = hotel.rating || 0;
                var found = ratingChecked.some(function(val) { return rating >= parseFloat(val); });
                if (!found) return false;
            }

            if (mealChecked.length) {
                var meal = hotel.boardType || hotel.mealPlan || hotel.board || '';
                if (mealChecked.indexOf(meal) === -1) return false;
            }

            if (amenityChecked.length) {
                var amenities = hotel.amenities || [];
                var hasAmenity = amenityChecked.some(function(a) { return amenities.indexOf(a) !== -1; });
                if (!hasAmenity) return false;
            }

            if (districtChecked.length) {
                var district = hotel.district || hotel.neighborhood || hotel.area || hotel.quarter || hotel.suburb || '';
                if (districtChecked.indexOf(district) === -1) return false;
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
        var count = document.getElementById('resultsCount');
        if (!count) return;
        var destination = params.get('destination') || '';
        var cityName = destination || 'cette région';
        var total = hotels.length;
        count.textContent = total + ' propriétés dans ' + cityName;
    }

    function updateToolbarState() {
        var btn = document.getElementById('mtFilters');
        if (!btn) return;
        var nameVal = (document.getElementById('filterName') || {}).value || '';
        var anyChecked = ['filterFreeCancellation', 'filterParking', 'filterBreakfast', 'filterPool'].some(function(id) {
            var el = document.getElementById(id);
            return el && el.checked;
        });
        btn.classList.toggle('has-active', !!nameVal || anyChecked);
    }

    function clearFilters() {
        var nameEl = document.getElementById('filterName');
        if (nameEl) nameEl.value = '';

        ['filterFreeCancellation', 'filterParking', 'filterBreakfast', 'filterPool', 'filterWifi'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.checked = false;
        });

        document.querySelectorAll('#dynamicFiltersContainer input[type="checkbox"]').forEach(function(el) {
            el.checked = false;
        });
        document.querySelectorAll('#propertyTypeContainer input[type="checkbox"]').forEach(function(el) {
            el.checked = false;
        });

        var track = document.getElementById('priceTrack');
        var minHandle = document.getElementById('priceMinHandle');
        var maxHandle = document.getElementById('priceMaxHandle');
        var fill = document.getElementById('priceFill');
        var datasetMin = track && track.dataset.minPrice !== undefined ? parseFloat(track.dataset.minPrice) : 0;
        var datasetMax = track && track.dataset.maxPrice !== undefined ? parseFloat(track.dataset.maxPrice) : 1000;

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
        var buttons = document.querySelectorAll('.view-toggle button');
        buttons.forEach(function(btn) { btn.classList.remove('active'); });
        if (view === 'list') {
            buttons[0].classList.add('active');
            document.getElementById('resultsContainer').style.display = '';
            document.querySelector('.sidebar').style.display = '';
            document.querySelector('.results-layout').style.gridTemplateColumns = '290px 1fr';
        } else {
            buttons[1].classList.add('active');
            document.getElementById('resultsContainer').style.display = 'none';
            document.querySelector('.sidebar').style.display = 'none';
            document.querySelector('.results-layout').style.gridTemplateColumns = '1fr';
            setTimeout(function() { desktopMapCtrl.invalidate(); }, 300);
        }
    }
    window.setView = setView;

    // ============================================
    // BUILD ALL DYNAMIC FILTERS
    // ============================================
    function buildAllDynamicFilters(hotels) {
        var container = document.getElementById('dynamicFiltersContainer');
        if (!container) {
            console.warn('dynamicFiltersContainer non trouvé');
            return;
        }

        container.innerHTML = '';

        var brandFilter = createDynamicBrandFilter(hotels);
        if (brandFilter) container.appendChild(brandFilter);

        var starsFilter = createDynamicStarsFilter(hotels);
        if (starsFilter) container.appendChild(starsFilter);

        var mealFilter = createDynamicMealFilter(hotels);
        if (mealFilter) container.appendChild(mealFilter);

        var ratingFilter = createDynamicRatingFilter(hotels);
        if (ratingFilter) container.appendChild(ratingFilter);

        var amenitiesFilter = createDynamicAmenitiesFilter(hotels);
        if (amenitiesFilter) container.appendChild(amenitiesFilter);

        var districtFilter = createDynamicDistrictFilter(hotels);
        if (districtFilter) container.appendChild(districtFilter);

        var distanceFilter = createDynamicDistanceFilter(hotels);
        if (distanceFilter) container.appendChild(distanceFilter);

        updatePropertyTypes(hotels);
        updatePriceSlider(hotels);
        refreshPopularFiltersVisibility(hotels);

        console.log('✅ Filtres dynamiques construits');
    }

    // ============================================
    // LOYALTY BADGE
    // ============================================
    var LOYALTY_LOGO = 'https://whitelabel-production-addonsstac-whitelabelbucket-rr8j7rddkm0b.s3.amazonaws.com/images/loyalty_program_logo-1780140543599';

    function calculateLuviaCoins(amountUSD) {
        var coins = amountUSD * 0.05;
        return Math.floor(coins * 100) / 100;
    }

    // ============================================
// RENDU DES HÔTELS (CORRIGÉ)
// ============================================
function renderHotels(hotels) {
    var container = document.getElementById('resultsContainer');
    var count = document.getElementById('resultsCount');

    if (!hotels || hotels.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--ink-soft);"><h3>' + window.t('hotel.no_results') + '</h3><p>' + window.t('hotel.try_modify_filters') + '</p></div>';
        count.textContent = '0 propriétés trouvées';
        return;
    }

    var destination = params.get('destination') || '';
    var cityName = destination || 'cette région';
    var validHotels = hotels.filter(function(h) { return h.minPrice && h.minPrice > 0; });
    var total = validHotels.length;

    count.textContent = total + ' propriétés dans ' + cityName;
    container.innerHTML = '';

    var checkin = params.get('checkin') || getDefaultCheckin();
    var checkout = params.get('checkout') || getDefaultCheckout();
    var nights = getNights(checkin, checkout);
    var currentCurrency = localStorage.getItem('luviaplace_currency') || 'USD';
    
    // ✅ Vérifier si l'utilisateur est connecté
    var isLoggedIn = false;
    if (typeof window.auth !== 'undefined' && window.auth.isLoggedIn) {
        isLoggedIn = window.auth.isLoggedIn();
    }
    // Fallback: vérifier le cache
    if (!isLoggedIn) {
        try {
            var cachedUser = localStorage.getItem('luviaplace_user');
            if (cachedUser) {
                var user = JSON.parse(cachedUser);
                if (user && user.email) {
                    isLoggedIn = true;
                }
            }
        } catch (e) {}
    }

    hotels.forEach(function(hotel) {
        var hotelId = hotel.hotelId || hotel.id || null;
        if (!hotelId) {
            console.warn('⚠️ Hôtel sans ID:', hotel);
            return;
        }

        // ✅ AFFICHER UNIQUEMENT LES ÉTOILES DISPONIBLES
        var starRating = hotel.starRating || 0;
        var fullStars = Math.min(Math.round(starRating), 5);
        // ✅ Si pas d'étoiles ou 0, on n'affiche rien
        var starHtml = '';
        if (starRating > 0 && fullStars > 0) {
            starHtml = '★'.repeat(fullStars);
        }

        // ✅ CALCUL DES PRIX
        var pricePerNightUSD = hotel.minPrice > 0 ? Math.round(hotel.minPrice / nights) : 0;
        var totalPriceUSD = hotel.minPrice > 0 ? Math.round(hotel.minPrice) : 0;

        // ✅ Prix public = prix actuel (c'est le vrai prix)
        var publicPricePerNight = pricePerNightUSD;
        var publicTotalPrice = totalPriceUSD;

        // ✅ Prix membre = prix public - 10% (pour les connectés)
        var memberDiscount = 0.10;
        var memberPricePerNight = publicPricePerNight - (publicPricePerNight * memberDiscount);
        var memberTotalPrice = publicTotalPrice - (publicTotalPrice * memberDiscount);

        // ✅ Prix invité = prix public + 10% (pour les non connectés)
        var guestSurcharge = 0.10;
        var guestPricePerNight = publicPricePerNight + (publicPricePerNight * guestSurcharge);
        var guestTotalPrice = publicTotalPrice + (publicTotalPrice * guestSurcharge);

        // ✅ Déterminer quel prix afficher selon le statut de connexion
        var displayPricePerNight = isLoggedIn ? memberPricePerNight : guestPricePerNight;
        var displayTotalPrice = isLoggedIn ? memberTotalPrice : guestTotalPrice;
        var displayPriceLabel = isLoggedIn ? 'Prix membre' : 'Prix public';

        // ✅ Convertir les prix dans la devise choisie
        var pricePerNight = displayPricePerNight;
        var totalPrice = displayTotalPrice;
        if (typeof window.convertPrice === 'function') {
            pricePerNight = window.convertPrice(displayPricePerNight, 'USD', currentCurrency);
            totalPrice = window.convertPrice(displayTotalPrice, 'USD', currentCurrency);
        }

        var formattedPricePerNight = '';
        if (typeof window.formatPrice === 'function') {
            formattedPricePerNight = window.formatPrice(pricePerNight, currentCurrency);
        } else {
            formattedPricePerNight = '$' + pricePerNight.toFixed(2);
        }

        // ✅ Prix public original (pour référence)
        var publicPriceFormatted = '';
        if (typeof window.formatPrice === 'function') {
            publicPriceFormatted = window.formatPrice(publicPricePerNight, currentCurrency);
        } else {
            publicPriceFormatted = '$' + publicPricePerNight.toFixed(2);
        }

        var rating = hotel.rating || 0;

        var div = document.createElement('div');
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

        // Photo
        var photo = document.createElement('div');
        photo.className = 'photo';
        var img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = hotel.name || 'Hôtel';
        img.src = hotel.main_photo || ('https://picsum.photos/seed/' + encodeURIComponent(hotelId) + '/460/380');
        photo.appendChild(img);

        var wishlistBtn = document.createElement('button');
        wishlistBtn.className = 'wishlist-btn';
        wishlistBtn.setAttribute('aria-label', 'Ajouter aux favoris');
        wishlistBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.5-9.5-9A5 5 0 0112 6a5 5 0 019.5 5c-2.5 4.5-9.5 9-9.5 9z"/></svg>';
        wishlistBtn.addEventListener('click', function(e) { e.stopPropagation(); });
        photo.appendChild(wishlistBtn);

        // Info
        var info = document.createElement('div');
        info.className = 'info';

        // ✅ Étoiles - uniquement celles disponibles
        var starsDiv = document.createElement('div');
        starsDiv.className = 'stars';
        starsDiv.textContent = starHtml;
        // Si pas d'étoiles, cacher l'élément
        if (!starHtml) {
            starsDiv.style.display = 'none';
        }
        info.appendChild(starsDiv);

        var h3 = document.createElement('h3');
        h3.textContent = hotel.name || 'Hôtel sans nom';
        info.appendChild(h3);

        var addrRow = document.createElement('div');
        addrRow.className = 'addr-row';
        addrRow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.4"/></svg><span></span>';
        addrRow.querySelector('span').textContent = hotel.address || hotel.city || 'Adresse non disponible';
        info.appendChild(addrRow);

        var distRow = document.createElement('div');
        distRow.className = 'dist-row';
        distRow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 5l7 7-7 7M5 12h15"/></svg><span></span>';
        distRow.querySelector('span').textContent = hotel.roomName || 'Chambre standard';
        info.appendChild(distRow);

        // Side
        var side = document.createElement('div');
        side.className = 'side';

        // Score Chip
        var scoreChip = document.createElement('div');
        scoreChip.className = 'score-chip';
        var scoreNum = document.createElement('span');
        scoreNum.className = 'score-num';
        var ratingValue = rating > 0 ? rating.toFixed(1) : 'N/A';
        scoreNum.textContent = ratingValue;
        if (rating >= 8) scoreNum.classList.add('good');
        else if (rating >= 6) scoreNum.classList.add('ok');
        else if (rating > 0) scoreNum.classList.add('bad');
        else scoreNum.classList.add('ok');

        var ratingText = document.createElement('span');
        ratingText.className = 'score-text';
        ratingText.textContent = ratingTier(rating);

        var separator = document.createElement('span');
        separator.className = 'sep';
        separator.textContent = '•';

        var reviewText = document.createElement('span');
        reviewText.className = 'review-count';
        reviewText.textContent = (hotel.reviewCount || 0) + ' ' + window.t('hotel.reviews');

        scoreChip.appendChild(scoreNum);
        scoreChip.appendChild(ratingText);
        scoreChip.appendChild(separator);
        scoreChip.appendChild(reviewText);
        side.appendChild(scoreChip);

        // ✅ Savings Pill - Afficher l'économie si connecté
        if (isLoggedIn && hotel.minPrice > 0) {
            var savingsAmount = publicPricePerNight - memberPricePerNight;
            var savingsAmountInCurrency = savingsAmount;
            if (typeof window.convertPrice === 'function') {
                savingsAmountInCurrency = window.convertPrice(savingsAmount, 'USD', currentCurrency);
            }
            var formattedSavings = '';
            if (typeof window.formatPrice === 'function') {
                formattedSavings = window.formatPrice(savingsAmountInCurrency, currentCurrency);
            } else {
                formattedSavings = '$' + savingsAmountInCurrency.toFixed(2);
            }
            if (savingsAmount > 0) {
                var savingsPill = document.createElement('div');
                savingsPill.className = 'savings-pill';
                savingsPill.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg><span></span>';
                savingsPill.querySelector('span').textContent = 'Économisez ' + formattedSavings + ' / ' + window.t('search.night');
                side.appendChild(savingsPill);
            }
        } else if (!isLoggedIn && hotel.minPrice > 0) {
            // ✅ Message d'invitation à se connecter pour économiser
            var connectPill = document.createElement('div');
            connectPill.className = 'savings-pill';
            connectPill.style.background = '#c1ebab';
            connectPill.style.color = '#000000';
            connectPill.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 6h6l-5 4 2 6-6-4-6 4 2-6-5-4h6z"/></svg><span></span>';
            connectPill.querySelector('span').textContent = 'Connectez-vous pour économiser 10%';
            connectPill.addEventListener('click', function(e) {
                e.stopPropagation();
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal();
                }
            });
            connectPill.style.cursor = 'pointer';
            side.appendChild(connectPill);
        }

        // ✅ Price Block
        // ✅ CORRECTION : Price Block
var priceBlock = document.createElement('div');
priceBlock.className = 'price-block';

if (hotel.minPrice > 0) {
    var nightsText = nights + ' ' + window.t('search.nights');
    var roomsText = '1 ' + window.t('search.rooms');

    // ✅ Prix de base = prix réel de l'API (celui affiché en grand)
    var basePricePerNight = pricePerNightUSD;
    var baseTotalPrice = totalPriceUSD;

    // ✅ Prix public (non-membre) = prix de base + 10%
    var publicPricePerNight = basePricePerNight + (basePricePerNight * 0.10);
    var publicTotalPrice = baseTotalPrice + (baseTotalPrice * 0.10);

    // ✅ Prix affiché = prix de base (pour tout le monde)
    var displayPricePerNight = basePricePerNight;
    var displayTotalPrice = baseTotalPrice;

    // ✅ Si connecté, on affiche le prix de base (déjà le meilleur prix)
    // ✅ Si non connecté, on affiche aussi le prix de base (pour ne pas faire peur)
    // Le prix public barré montre l'économie réalisée

    // ✅ Convertir les prix dans la devise choisie
    var displayPrice = displayPricePerNight;
    var publicPriceConverted = publicPricePerNight;
    if (typeof window.convertPrice === 'function') {
        displayPrice = window.convertPrice(displayPricePerNight, 'USD', currentCurrency);
        publicPriceConverted = window.convertPrice(publicPricePerNight, 'USD', currentCurrency);
    }

    var formattedDisplayPrice = '';
    var formattedPublicPrice = '';
    if (typeof window.formatPrice === 'function') {
        formattedDisplayPrice = window.formatPrice(displayPrice, currentCurrency);
        formattedPublicPrice = window.formatPrice(publicPriceConverted, currentCurrency);
    } else {
        formattedDisplayPrice = '$' + displayPrice.toFixed(2);
        formattedPublicPrice = '$' + publicPriceConverted.toFixed(2);
    }

    // ✅ AFFICHAGE :
    // - amount : prix de base (prix réel)
    // - public-price : prix public majoré de 10% (barré)
    priceBlock.innerHTML =
        '<div class="amount">' + formattedDisplayPrice + ' <span class="per">' + window.t('search.per_night') + '</span></div>' +
        '<div class="note">' + nightsText + ', ' + roomsText + ', taxes et frais inclus</div>' +
        '<div class="public-price">Prix public <s>' + formattedPublicPrice + '</s></div>';
} else {
    priceBlock.innerHTML = '<span style="font-size:14px;color:var(--ink-soft);">' + window.t('hotel.price_unavailable') + '</span>';
}
side.appendChild(priceBlock);
        // Loyalty Badge
        if (hotel.minPrice > 0 && totalPriceUSD >= 1500) {
            var coinsEarned = calculateLuviaCoins(totalPriceUSD);
            var loyaltyBadge = document.createElement('div');
            loyaltyBadge.className = 'loyalty-badge';
            loyaltyBadge.style.cssText =
                'display:flex;align-items:center;gap:8px;margin-top:8px;padding:6px 12px 6px 8px;background:#ffffff;border:1px solid #E7EAF0;border-radius:8px;font-size:12px;color:#1f87e8;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,0.06);';
            var logoImg = document.createElement('img');
            logoImg.src = LOYALTY_LOGO;
            logoImg.alt = 'Luvia Rewards';
            logoImg.style.cssText = 'height:20px;width:auto;max-width:60px;object-fit:contain;';
            var text = document.createElement('span');
            text.textContent = 'Validez votre commande et gagnez ' + coinsEarned.toFixed(2) + ' LuviaCoins';
            text.style.cssText = 'font-size:11px;color:#1f87e8;';
            loyaltyBadge.appendChild(logoImg);
            loyaltyBadge.appendChild(text);
            info.appendChild(loyaltyBadge);
        }

        // CTA Button
        var ctaBtn = document.createElement('button');
        ctaBtn.className = 'cta-btn-sm';
        ctaBtn.innerHTML = 'Voir les disponibilités' + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M9 6l6 6-6 6"/></svg>';
        ctaBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            voirHotel(hotelId);
        });
        side.appendChild(ctaBtn);

        div.appendChild(photo);
        div.appendChild(info);
        div.appendChild(side);
        container.appendChild(div);
    });
}

    function voirHotel(hotelId) {
        if (!hotelId) {
            console.error('❌ Aucun ID d\'hôtel spécifié');
            showToast('Erreur : ID d\'hôtel manquant');
            return;
        }

        var checkin = params.get('checkin') || getDefaultCheckin();
        var checkout = params.get('checkout') || getDefaultCheckout();
        var adults = params.get('adults') || '2';
        var children = params.get('children') || '0';

        var url = 'hotel-detail.html?hotelId=' + encodeURIComponent(hotelId);
        url += '&checkin=' + encodeURIComponent(checkin);
        url += '&checkout=' + encodeURIComponent(checkout);
        url += '&adults=' + encodeURIComponent(adults);
        if (children > 0) {
            url += '&children=' + encodeURIComponent(children);
        }

        console.log('🔗 Navigation vers:', url);
        window.location.href = url;
    }
    window.voirHotel = voirHotel;

    function generateSkeleton() {
        var container = document.getElementById('resultsContainer');
        var html = '';
        for (var i = 0; i < 6; i++) {
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
        var destination = params.get('destination') || '';
        var checkin = params.get('checkin') || '';
        var checkout = params.get('checkout') || '';
        var adults = parseInt(params.get('adults') || '2', 10);
        var children = parseInt(params.get('children') || '0', 10);

        var destText = destination || 'Destination non spécifiée';
        var datesText = checkin && checkout ? formatDate(checkin) + ' - ' + formatDate(checkout) : 'Sélectionnez vos dates';
        var totalGuests = adults + children;
        var guestsText = totalGuests + ' clients';

        var elDest = document.getElementById('sumDest');
        if (elDest) elDest.textContent = destText;
        var elDates = document.getElementById('sumDates');
        if (elDates) elDates.textContent = datesText;
        var elGuests = document.getElementById('sumGuests');
        if (elGuests) elGuests.textContent = guestsText;
        var mssDest = document.getElementById('mssDest');
        if (mssDest) mssDest.textContent = destText;
        var mssSub = document.getElementById('mssSub');
        if (mssSub) mssSub.textContent = datesText + ' • ' + guestsText;
    }

    function prefillEditSheet() {
        document.getElementById('editDestination').value = params.get('destination') || '';
        document.getElementById('editCheckin').value = params.get('checkin') || getDefaultCheckin();
        document.getElementById('editCheckout').value = params.get('checkout') || getDefaultCheckout();
        editAdultsValue = parseInt(params.get('adults') || '2', 10);
        document.getElementById('editAdultsCount').textContent = editAdultsValue;
    }

    // ============================================
    // CHARGEMENT DES RÉSULTATS - VERSION STREAMING
    // ============================================
    function loadResultsStream() {
        var destination = params.get('destination') || '';
        var checkin = params.get('checkin') || '';
        var checkout = params.get('checkout') || '';
        var adults = parseInt(params.get('adults') || '2', 10);
        var placeId = params.get('placeId') || '';

        updateSearchSummary();

        if (!checkin || !checkout || !destination) {
            document.getElementById('resultsContainer').innerHTML =
                '<div style="text-align:center;padding:60px 20px;color:var(--ink-soft);">' +
                '<h3>Paramètres manquants</h3>' +
                '<p>Veuillez retourner à la page d\'accueil et effectuer une recherche.</p>' +
                '<a href="index.html" style="display:inline-block;margin-top:16px;padding:10px 20px;background:var(--blue);color:#FFF;border-radius:10px;">Retour à l\'accueil</a>' +
                '</div>';
            document.getElementById('resultsCount').textContent = 'Paramètres manquants';
            return;
        }

        // ✅ Afficher les squelettes
        generateSkeleton();
        document.getElementById('resultsCount').textContent = 'Recherche en cours...';

        // ✅ Construire l'URL de streaming
        var queryParams = new URLSearchParams({
            checkin: checkin,
            checkout: checkout,
            adults: adults,
            environment: 'production',
            limit: 2000
        });
        if (placeId) queryParams.append('placeId', placeId);
        else queryParams.append('city', destination);

        var streamUrl = API_BASE_URL + '/search-hotels-stream?' + queryParams.toString();

        // ✅ Établir la connexion SSE
        var eventSource = new EventSource(streamUrl);

        // ✅ Variable pour accumuler les hôtels
        var accumulatedHotels = [];
        var totalHotels = 0;
        var isComplete = false;

        // ✅ Écouter les événements "batch" (arrivée par lots)
        eventSource.addEventListener('batch', function(e) {
            try {
                var data = JSON.parse(e.data);
                var batchHotels = data.hotels || [];
                
                // Ajouter les nouveaux hôtels
                accumulatedHotels = accumulatedHotels.concat(batchHotels);
                
                // Mettre à jour l'affichage
                allHotels = accumulatedHotels;
                displayedHotels = accumulatedHotels;
                
                // Re-rendre les hôtels (incrémental)
                renderHotels(accumulatedHotels);
                
                // Mettre à jour le compteur
                var countText = accumulatedHotels.length + ' propriétés trouvées';
                if (data.total && data.total > 0) {
                    countText = accumulatedHotels.length + ' / ' + data.total + ' propriétés';
                }
                document.getElementById('resultsCount').textContent = countText;
                
                console.log(`📦 Batch reçu: ${batchHotels.length} hôtels, total: ${accumulatedHotels.length}`);
                
            } catch (error) {
                console.error('❌ Erreur traitement batch:', error);
            }
        });

        // ✅ Écouter l'événement "status" (informations de progression)
        eventSource.addEventListener('status', function(e) {
            try {
                var data = JSON.parse(e.data);
                console.log(`📊 Status: ${data.step} - ${data.message}`);
                
                if (data.step === 'found') {
                    // On sait combien d'hôtels vont arriver
                    document.getElementById('resultsCount').textContent = 'Chargement des ' + data.message + '...';
                }
            } catch (error) {
                console.error('❌ Erreur traitement status:', error);
            }
        });

        // ✅ Écouter l'événement "complete" (fin du chargement)
        eventSource.addEventListener('complete', function(e) {
            try {
                var data = JSON.parse(e.data);
                var finalHotels = data.hotels || [];
                
                // Mettre à jour avec les résultats finaux
                allHotels = finalHotels;
                displayedHotels = finalHotels;
                
                // Re-rendre une dernière fois
                renderHotels(finalHotels);
                
                // Mettre à jour le compteur final
                var countText = finalHotels.length + ' propriétés trouvées';
                document.getElementById('resultsCount').textContent = countText;
                
                // Fermer la connexion
                eventSource.close();
                isComplete = true;
                
                console.log(`✅ Streaming terminé: ${finalHotels.length} hôtels`);
                
                // ✅ Construire les filtres dynamiques une fois que tout est chargé
                buildAllDynamicFilters(finalHotels);
                applyFilters();
                
                // ✅ Initialiser la carte
                desktopMapCtrl.init(null, null, finalHotels);
                if (mobileMapCtrl.isInitialized()) mobileMapCtrl.addMarkers(finalHotels);
                
            } catch (error) {
                console.error('❌ Erreur traitement complete:', error);
            }
        });

        // ✅ Gérer les erreurs
        eventSource.addEventListener('error', function(e) {
            console.error('❌ Erreur SSE:', e);
            
            // Si on a déjà des hôtels, on les garde
            if (accumulatedHotels.length > 0) {
                document.getElementById('resultsCount').textContent = accumulatedHotels.length + ' propriétés trouvées (chargement interrompu)';
                eventSource.close();
                return;
            }
            
            // Si aucun hôtel, afficher un message d'erreur
            document.getElementById('resultsContainer').innerHTML =
                '<div style="text-align:center;padding:60px 20px;color:var(--ink-soft);"><h3>' + window.t('common.error') + '</h3><p>Erreur de connexion au serveur</p>' +
                '<button onclick="loadResultsStream()" style="margin-top:20px;padding:10px 30px;background:var(--blue);color:#FFF;border:none;border-radius:10px;cursor:pointer;">' + window.t('common.retry') + '</button></div>';
            document.getElementById('resultsCount').textContent = '0 propriétés trouvées';
            eventSource.close();
        });

        // ✅ Timeout de sécurité (5 minutes)
        setTimeout(function() {
            if (!isComplete) {
                console.warn('⏰ Timeout: fermeture de la connexion');
                eventSource.close();
                
                if (accumulatedHotels.length > 0) {
                    document.getElementById('resultsCount').textContent = accumulatedHotels.length + ' propriétés trouvées (timeout)';
                }
            }
        }, 300000);
    }

    // ============================================
    // BOTTOM SHEETS
    // ============================================
    function openSheet(id) {
        document.querySelectorAll('.bottom-sheet.open').forEach(function(s) { s.classList.remove('open'); });
        var sheet = document.getElementById(id);
        if (!sheet) return;
        sheet.classList.add('open');
        document.getElementById('sheetOverlay').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeAllSheets() {
        document.querySelectorAll('.bottom-sheet.open').forEach(function(s) { s.classList.remove('open'); });
        document.getElementById('sheetOverlay').classList.remove('open');
        document.body.style.overflow = '';
    }

    // ============================================
    // RÉPARTITION RESPONSIVE DES FILTRES
    // ============================================
    function relocateFilterPanel() {
        var panel = document.getElementById('filtersPanelContent');
        var desktopSlot = document.getElementById('filtersSlotDesktop');
        var mobileSlot = document.getElementById('filtersSlotMobile');
        if (!panel || !desktopSlot || !mobileSlot) return;
        var isMobile = window.matchMedia('(max-width:960px)').matches;
        var target = isMobile ? mobileSlot : desktopSlot;
        if (panel.parentElement !== target) target.appendChild(panel);
    }

    // ============================================
    // INITIALISATION
    // ============================================
    document.addEventListener('DOMContentLoaded', function() {
        // ✅ Utiliser le streaming
        loadResultsStream();
        
        relocateFilterPanel();
        window.addEventListener('resize', debounce(relocateFilterPanel, 200));

        document.addEventListener('click', function(e) {
            if (!e.target.closest('.sort-select')) {
                document.getElementById('sortDropdown').classList.remove('open');
            }
        });

        // Slider de prix
        var minHandle = document.getElementById('priceMinHandle');
        var maxHandle = document.getElementById('priceMaxHandle');
        var fill = document.getElementById('priceFill');
        var priceTrackEl = document.getElementById('priceTrack');
        var isDragging = null;

        function recalcPriceRangeFromHandles() {
            var datasetMin = parseFloat(priceTrackEl.dataset.minPrice) || 0;
            var datasetMax = parseFloat(priceTrackEl.dataset.maxPrice) || 1000;
            var minLeft = parseFloat(minHandle.style.left) || 0;
            var maxLeft = parseFloat(maxHandle.style.left);
            if (isNaN(maxLeft)) maxLeft = 100;
            if (minLeft > maxLeft) {
                minHandle.style.left = maxLeft + '%';
                minLeft = maxLeft;
            }

            var minValue = datasetMin + (minLeft / 100) * (datasetMax - datasetMin);
            var maxValue = datasetMin + (maxLeft / 100) * (datasetMax - datasetMin);

            minHandle.setAttribute('aria-valuenow', Math.round(minValue));
            maxHandle.setAttribute('aria-valuenow', Math.round(maxValue));
            updatePriceLabels(minValue, maxValue);

            fill.style.left = minLeft + '%';
            fill.style.right = (100 - maxLeft) + '%';

            applyFilters();
        }

        function onDragXY(clientX) {
            var rect = isDragging.parentElement.getBoundingClientRect();
            var x = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
            isDragging.style.left = x + '%';
            recalcPriceRangeFromHandles();
        }

        function onMouseMove(e) {
            if (isDragging) onDragXY(e.clientX);
        }

        function onTouchMove(e) {
            if (isDragging) {
                e.preventDefault();
                onDragXY(e.touches[0].clientX);
            }
        }

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

        // Barre d'outils mobile
        var mtFilters = document.getElementById('mtFilters');
        var mtAccess = document.getElementById('mtAccessibility');
        var mtSort = document.getElementById('mtSort');

        if (mtFilters) mtFilters.addEventListener('click', function() { openSheet('filtersSheet'); });
        if (mtAccess) mtAccess.addEventListener('click', function() { openSheet('accessibilitySheet'); });
        if (mtSort) mtSort.addEventListener('click', function() { openSheet('sortSheet'); });

        document.querySelectorAll('.sheet-sort-item').forEach(function(el) {
            el.addEventListener('click', function() {
                applySort(el.dataset.sort);
                closeAllSheets();
            });
        });

        document.getElementById('sheetOverlay').addEventListener('click', closeAllSheets);
        document.querySelectorAll('[data-close-sheet]').forEach(function(btn) {
            btn.addEventListener('click', closeAllSheets);
        });

        // Modifier la recherche
        var mssEditBtn = document.getElementById('mssEditBtn');
        var mobileSearchSummary = document.getElementById('mobileSearchSummary');
        var condensedEditBtn = document.getElementById('condensedEditBtn');
        var searchSummary = document.getElementById('searchSummary');

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

        if (mssEditBtn) {
            mssEditBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                openEditSheet();
            });
        }

        if (mobileSearchSummary) {
            mobileSearchSummary.addEventListener('click', openEditSheet);
            mobileSearchSummary.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openEditSheet();
                }
            });
        }

        if (condensedEditBtn) {
            condensedEditBtn.addEventListener('click', openEditSheet);
        }

        document.getElementById('editAdultsMinus').addEventListener('click', function() {
            editAdultsValue = Math.max(1, editAdultsValue - 1);
            document.getElementById('editAdultsCount').textContent = editAdultsValue;
        });

        document.getElementById('editAdultsPlus').addEventListener('click', function() {
            editAdultsValue = editAdultsValue + 1;
            document.getElementById('editAdultsCount').textContent = editAdultsValue;
        });

        document.getElementById('editSearchApply').addEventListener('click', function() {
            var destination = document.getElementById('editDestination').value.trim();
            var checkin = document.getElementById('editCheckin').value;
            var checkout = document.getElementById('editCheckout').value;
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

        // Carte plein écran mobile
        var mapFab = document.getElementById('mapFab');
        var mmoClose = document.getElementById('mmoClose');
        var mobileMapOverlay = document.getElementById('mobileMapOverlay');

        if (window.innerWidth > 960) {
            if (mapFab) {
                mapFab.addEventListener('click', function() {
                    mobileMapOverlay.classList.add('open');
                    if (!mobileMapCtrl.isInitialized()) {
                        mobileMapCtrl.init(null, null, allHotels);
                    } else {
                        mobileMapCtrl.invalidate();
                    }
                });
            }
            if (mmoClose) {
                mmoClose.addEventListener('click', function() {
                    mobileMapOverlay.classList.remove('open');
                });
            }
        }

        // Sélecteur de service
        var btn = document.getElementById('switcherBtn');
        var menu = document.getElementById('switcherMenu');
        if (btn && menu) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                menu.classList.toggle('open');
            });
            document.addEventListener('click', function() {
                menu.classList.remove('open');
            });
        }
    });

    // ============================================
    // TRADUCTION
    // ============================================
    document.addEventListener('languageChanged', function(e) {
        console.log('🔄 Langue changée vers:', e.detail.language);
        if (allHotels.length > 0) renderHotels(displayedHotels);
        updateSearchSummary();
    });

})();