// ============================================
// js/currency.js - GESTIONNAIRE DE DEVISES
// ============================================

(function() {
  'use strict';

  var currentCurrency = localStorage.getItem('luviaplace_currency') || 'USD';
  var rates = {};
  var isRatesLoaded = false;

  // ============================================
  // SYMBOLES DES DEVISES
  // ============================================
  var currencySymbols = {
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
    'UGX': 'USh',
    'MAD': 'DH',
    'JPY': '¥',
    'CNY': '¥',
    'CHF': 'Fr',
    'CAD': 'C$',
    'AUD': 'A$',
    'BRL': 'R$',
    'RUB': '₽',
    'INR': '₹',
    'KRW': '₩'
  };

  // ============================================
  // NOMS DES DEVISES
  // ============================================
  var currencyNames = {
    'USD': 'US Dollar',
    'EUR': 'Euro',
    'GBP': 'British Pound',
    'CDF': 'Franc Congolais',
    'XAF': 'Franc CFA (CEMAC)',
    'XOF': 'Franc CFA (UEMOA)',
    'NGN': 'Naira Nigérian',
    'GHS': 'Cedi Ghanéen',
    'ZAR': 'Rand Sud-Africain',
    'KES': 'Shilling Kenyan',
    'TZS': 'Shilling Tanzanien',
    'UGX': 'Shilling Ougandais',
    'MAD': 'Dirham Marocain',
    'JPY': 'Yen Japonais',
    'CNY': 'Yuan Chinois',
    'CHF': 'Franc Suisse',
    'CAD': 'Dollar Canadien',
    'AUD': 'Dollar Australien',
    'BRL': 'Real Brésilien',
    'RUB': 'Rouble Russe',
    'INR': 'Roupie Indienne',
    'KRW': 'Won Coréen'
  };

  // ============================================
  // CHARGER LES TAUX DE CHANGE
  // ============================================
  async function loadRates(baseCurrency) {
    try {
      const response = await fetch(`/api/rates?base=${baseCurrency}`);
      const data = await response.json();
      
      if (data.success) {
        rates = data.rates;
        isRatesLoaded = true;
        console.log(`✅ Taux de change chargés (base: ${baseCurrency})`);
        console.log('📊 Taux disponibles:', Object.keys(rates).length);
        return rates;
      }
    } catch (error) {
      console.error('❌ Erreur chargement taux:', error);
    }
    
    // Fallback
    rates = {
      'USD': 1,
      'EUR': 0.92,
      'GBP': 0.78,
      'CDF': 2400,
      'XAF': 600,
      'XOF': 600,
      'NGN': 1500,
      'GHS': 12,
      'ZAR': 18,
      'KES': 130,
      'TZS': 2500,
      'UGX': 3700,
      'MAD': 10,
      'JPY': 150,
      'CNY': 7.2,
      'CHF': 0.88,
      'CAD': 1.35,
      'AUD': 1.5,
      'BRL': 5.5,
      'RUB': 90,
      'INR': 83,
      'KRW': 1350
    };
    isRatesLoaded = true;
    return rates;
  }

  // ============================================
  // CONVERTIR UN PRIX
  // ============================================
  function convertPrice(amount, fromCurrency, toCurrency) {
    if (!amount || amount === 0) return 0;
    if (fromCurrency === toCurrency) return amount;
    
    // Si les taux ne sont pas chargés, utiliser les taux fixes
    if (!isRatesLoaded) {
      const fallbackRates = {
        'USD': 1,
        'EUR': 0.92,
        'GBP': 0.78,
        'CDF': 2800,
        'XAF': 600,
        'XOF': 600,
        'NGN': 1500,
        'GHS': 12,
        'ZAR': 18,
        'KES': 130,
        'TZS': 2500,
        'UGX': 3700,
        'MAD': 10,
        'JPY': 150,
        'CNY': 7.2,
        'CHF': 0.88,
        'CAD': 1.35,
        'AUD': 1.5,
        'BRL': 5.5,
        'RUB': 90,
        'INR': 83,
        'KRW': 1350
      };
      
      const fromRate = fallbackRates[fromCurrency] || 1;
      const toRate = fallbackRates[toCurrency] || 1;
      return (amount / fromRate) * toRate;
    }
    
    // Utiliser les taux chargés
    const fromRate = rates[fromCurrency] || 1;
    const toRate = rates[toCurrency] || 1;
    return (amount / fromRate) * toRate;
  }

  // ============================================
  // OBTENIR LE SYMBOLE D'UNE DEVISES
  // ============================================
  function getCurrencySymbol(currency) {
    return currencySymbols[currency] || currency;
  }

  // ============================================
  // OBTENIR LE NOM D'UNE DEVISES
  // ============================================
  function getCurrencyName(currency) {
    return currencyNames[currency] || currency;
  }

  // ============================================
  // FORMATTER UN PRIX
  // ============================================
  function formatPrice(amount, currency, locale = 'fr-FR') {
    const symbol = getCurrencySymbol(currency);
    const formatted = amount.toFixed(2);
    
    // Pour le Franc Congolais et FCFA, pas de décimales
    if (['CDF', 'XAF', 'XOF', 'JPY', 'KRW'].includes(currency)) {
      return symbol + ' ' + Math.round(amount).toLocaleString(locale);
    }
    
    return symbol + ' ' + formatted.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // ============================================
  // CHANGER LA DEVISES
  // ============================================
  function setCurrency(currency) {
    if (!currency) return;
    currentCurrency = currency;
    localStorage.setItem('luviaplace_currency', currency);
    
    // Recharger les taux avec la nouvelle base
    loadRates(currency);
    
    // Émettre l'événement
    document.dispatchEvent(new CustomEvent('currencyChanged', {
      detail: { currency: currency }
    }));
    
    console.log(`💰 Devise changée vers: ${currency}`);
  }

  // ============================================
  // EXPOSER LES FONCTIONS
  // ============================================
  window.loadRates = loadRates;
  window.convertPrice = convertPrice;
  window.getCurrencySymbol = getCurrencySymbol;
  window.getCurrencyName = getCurrencyName;
  window.formatPrice = formatPrice;
  window.setCurrency = setCurrency;
  window.getCurrentCurrency = function() { return currentCurrency; };
  window.getCurrencyRates = function() { return rates; };

  // ============================================
  // INITIALISATION
  // ============================================
  function init() {
    loadRates(currentCurrency);
    console.log('💰 Devise actuelle:', currentCurrency);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
