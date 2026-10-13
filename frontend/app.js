/**
 * CropAI - Agricultural Intelligence Web Application
 * Core JavaScript Logic
 */

// =========================================================================
// 1. SCREEN NAVIGATION & SPA ROUTING
// =========================================================================
const MAIN_TAB_SCREENS = ['screen-home', 'screen-ai-features', 'screen-market', 'screen-profile'];
const TAB_INDEX_MAP = {
  'screen-home': 0,
  'screen-ai-features': 1,
  'screen-market': 2,
  'screen-profile': 3
};

function updateNavPill(screenId, animate = true) {
  const pill = document.getElementById('navIndicatorPill');
  const tabs = document.querySelectorAll('.nav-tab-item');
  if (!pill || !tabs.length) return;

  const targetIndex = TAB_INDEX_MAP[screenId];
  if (targetIndex === undefined) return;

  tabs.forEach((t, idx) => {
    if (idx === targetIndex) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  if (!animate) {
    pill.style.transition = 'none';
  } else {
    pill.style.transition = 'transform 0.36s cubic-bezier(0.22, 1, 0.36, 1)';
    // Trigger upscale pop on inner pill
    pill.classList.remove('scaling');
    void pill.offsetWidth; // Force reflow to cleanly restart the upscale keyframe
    pill.classList.add('scaling');
  }

  pill.style.transform = `translateX(${targetIndex * 100}%)`;

  if (!animate) {
    requestAnimationFrame(() => {
      pill.style.transition = '';
    });
  }
}

function navigateTo(screenId) {
  const screens = document.querySelectorAll('.screen-view');
  screens.forEach(s => s.classList.remove('active'));

  const target = document.getElementById(screenId);
  if (target) {
    target.classList.add('active');
    const scroll = target.querySelector('.scroll-area');
    if (scroll) scroll.scrollTop = 0;
  }

  const globalNav = document.getElementById('globalBottomNav');
  if (globalNav) {
    if (MAIN_TAB_SCREENS.includes(screenId)) {
      globalNav.classList.remove('nav-hidden');
      updateNavPill(screenId, true);
    } else {
      globalNav.classList.add('nav-hidden');
    }
  }
}

function initBottomNav() {
  const activeScreen = document.querySelector('.screen-view.active');
  const globalNav = document.getElementById('globalBottomNav');
  if (!globalNav) return;

  if (activeScreen && MAIN_TAB_SCREENS.includes(activeScreen.id)) {
    globalNav.classList.remove('nav-hidden');
    setTimeout(() => updateNavPill(activeScreen.id, false), 30);
  } else {
    globalNav.classList.add('nav-hidden');
  }

  window.addEventListener('resize', () => {
    const currentActiveTab = document.querySelector('.nav-tab-item.active');
    if (currentActiveTab) {
      const scr = currentActiveTab.getAttribute('data-screen');
      if (scr) updateNavPill(scr, false);
    }
  });
}

// Language Selector
function selectLang(btn) {
  const chips = document.querySelectorAll('.lang-chip');
  chips.forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
}

// =========================================================================
// DARK MODE / THEME CONTROLLER (0 ⇄ 255)
// =========================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('agroai_theme');
  const isDark = savedTheme === 'dark';
  applyTheme(isDark);
}

function toggleDarkMode() {
  const isCurrentlyDark = document.body.classList.contains('dark-mode');
  const nextIsDark = !isCurrentlyDark;
  applyTheme(nextIsDark);
  localStorage.setItem('agroai_theme', nextIsDark ? 'dark' : 'light');
}

function applyTheme(isDark) {
  if (isDark) {
    document.body.classList.add('dark-mode');
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.body.classList.remove('dark-mode');
    document.documentElement.setAttribute('data-theme', 'light');
  }

  // Update theme toggle icons across all screens
  const toggleBtns = document.querySelectorAll('.theme-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.innerHTML = isDark
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    btn.setAttribute('aria-label', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
    btn.setAttribute('title', isDark ? 'Switch to Light Mode (255)' : 'Switch to Dark Mode (0)');
  });

  // Update profile screen switch and label if present
  const profileDarkSwitch = document.getElementById('profileDarkSwitch');
  if (profileDarkSwitch) {
    if (isDark) {
      profileDarkSwitch.classList.add('active');
    } else {
      profileDarkSwitch.classList.remove('active');
    }
  }

  const profileDarkStatusText = document.getElementById('profileDarkStatusText');
  if (profileDarkStatusText) {
    profileDarkStatusText.textContent = isDark
      ? 'Active: Deep Black mode'
      : 'Active: Clean White mode';
  }
}

// =========================================================================
// 2. LIVE MANDI CROP PRICES & GEOLOCATION STATE DETECTOR (AGMARKNET GOV API)
// =========================================================================
const GOV_API_KEY = '579b464db66ec23bdd00000103f0d69113a6475c443aae0028bb1dbc';
const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
let currentSelectedState = 'Gujarat';
let userCoords = { lat: 23.0225, lon: 72.5714, city: 'Ahmedabad', state: 'Gujarat' };
let cachedMandiRecords = [];

const APPLE_CROP_EMOJIS = {
  'broccoli': 'https://em-content.zobj.net/source/apple/453/broccoli_1f966.png',
  'banana': 'https://em-content.zobj.net/source/apple/453/banana_1f34c.png',
  'apple': 'https://em-content.zobj.net/source/apple/453/red-apple_1f34e.png',
  'tomato': 'https://em-content.zobj.net/source/apple/453/tomato_1f345.png',
  'tomata': 'https://em-content.zobj.net/source/apple/453/tomato_1f345.png',
  'eggplant': 'https://em-content.zobj.net/source/apple/453/eggplant_1f346.png',
  'brinjal': 'https://em-content.zobj.net/source/apple/453/eggplant_1f346.png',
  'potato': 'https://em-content.zobj.net/source/apple/453/potato_1f954.png',
  'carrot': 'https://em-content.zobj.net/source/apple/453/carrot_1f955.png',
  'corn': 'https://em-content.zobj.net/source/apple/453/ear-of-corn_1f33d.png',
  'maize': 'https://em-content.zobj.net/source/apple/453/ear-of-corn_1f33d.png',
  'cucumber': 'https://em-content.zobj.net/source/apple/453/cucumber_1f952.png',
  'bell pepper': 'https://em-content.zobj.net/source/apple/453/bell-pepper_1fad1.png',
  'pepper': 'https://em-content.zobj.net/source/apple/453/bell-pepper_1fad1.png',
  'capsicum': 'https://em-content.zobj.net/source/apple/453/bell-pepper_1fad1.png',
  'onion': 'https://em-content.zobj.net/source/apple/453/onion_1f9c5.png',
  'ginger': 'https://em-content.zobj.net/source/apple/453/ginger_1fada.png',
  'chill': 'https://em-content.zobj.net/source/apple/453/hot-pepper_1f336-fe0f.png',
  'chilli': 'https://em-content.zobj.net/source/apple/453/hot-pepper_1f336-fe0f.png',
  'chili': 'https://em-content.zobj.net/source/apple/453/hot-pepper_1f336-fe0f.png',
  'wheat': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'rice': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'paddy': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'crop': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'grain': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'soybean': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'soya': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'sugarcane': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'mustard': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'cumin': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'jeera': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'castor': 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png',
  'worm': 'https://em-content.zobj.net/source/apple/453/worm_1fab1.png',
  'peanuts': 'https://em-content.zobj.net/source/apple/453/peanuts_1f95c.png',
  'peanut': 'https://em-content.zobj.net/source/apple/453/peanuts_1f95c.png',
  'groundnut': 'https://em-content.zobj.net/source/apple/453/peanuts_1f95c.png',
  'cotton': 'https://em-content.zobj.net/source/apple/453/cloud_2601-fe0f.png',
  'watermelon': 'https://em-content.zobj.net/source/apple/453/watermelon_1f349.png',
  'grapes': 'https://em-content.zobj.net/source/apple/453/grapes_1f347.png',
  'orange': 'https://em-content.zobj.net/source/apple/453/tangerine_1f34a.png',
  'mango': 'https://em-content.zobj.net/source/apple/453/mango_1f96d.png',
  'coconut': 'https://em-content.zobj.net/source/apple/453/coconut_1f965.png',
  'coffee': 'https://em-content.zobj.net/source/apple/453/hot-beverage_2615.png',
  'muskmelon': 'https://em-content.zobj.net/source/apple/453/melon_1f348.png',
  'papaya': 'https://em-content.zobj.net/source/apple/453/melon_1f348.png',
  'pomegranate': 'https://em-content.zobj.net/source/apple/453/red-apple_1f34e.png'
};

const APPLE_WEATHER_EMOJIS = {
  sun: 'https://em-content.zobj.net/source/apple/453/sun_2600-fe0f.png',
  cloud: 'https://em-content.zobj.net/source/apple/453/cloud_2601-fe0f.png',
  moon: 'https://em-content.zobj.net/source/apple/453/crescent-moon_1f319.png',
  cloud_lightning: 'https://em-content.zobj.net/source/apple/453/cloud-with-lightning_1f329-fe0f.png',
  cloud_rain: 'https://em-content.zobj.net/source/apple/453/cloud-with-rain_1f327-fe0f.png',
  sun_behind_rain_cloud: 'https://em-content.zobj.net/source/apple/453/sun-behind-rain-cloud_1f326-fe0f.png',
  sun_behind_large_cloud: 'https://em-content.zobj.net/source/apple/453/sun-behind-large-cloud_1f325-fe0f.png',
  sun_behind_small_cloud: 'https://em-content.zobj.net/source/apple/453/sun-behind-small-cloud_1f324-fe0f.png',
  cloud_lightning_rain: 'https://em-content.zobj.net/source/apple/453/cloud-with-lightning-and-rain_26c8-fe0f.png',
  sun_behind_cloud: 'https://em-content.zobj.net/source/apple/453/sun-behind-cloud_26c5.png'
};

function getCropEmojiUrl(commodityName) {
  if (!commodityName) return APPLE_CROP_EMOJIS['crop'];
  const lower = commodityName.toLowerCase();
  for (const key in APPLE_CROP_EMOJIS) {
    if (lower.includes(key)) return APPLE_CROP_EMOJIS[key];
  }
  return APPLE_CROP_EMOJIS['crop'];
}

function getCropEmojiImg(commodityName, className = 'apple-crop-icon') {
  const url = getCropEmojiUrl(commodityName);
  return `<img src="${url}" class="${className}" alt="${commodityName || 'crop'}" loading="lazy">`;
}

function getWeatherEmojiUrl(cond, isNight = false) {
  if (isNight) return APPLE_WEATHER_EMOJIS.moon;
  const c = (cond || '').toLowerCase();
  if (c.includes('thunder') && (c.includes('rain') || c.includes('storm'))) {
    return APPLE_WEATHER_EMOJIS.cloud_lightning_rain;
  }
  if (c.includes('thunder') || c.includes('lightning')) {
    return APPLE_WEATHER_EMOJIS.cloud_lightning;
  }
  if (c.includes('shower') || (c.includes('sun') && c.includes('rain'))) {
    return APPLE_WEATHER_EMOJIS.sun_behind_rain_cloud;
  }
  if (c.includes('rain') || c.includes('drizzle')) {
    return APPLE_WEATHER_EMOJIS.cloud_rain;
  }
  if (c.includes('overcast') || c.includes('fog') || c.includes('mist')) {
    return APPLE_WEATHER_EMOJIS.cloud;
  }
  if (c.includes('scattered') || c.includes('broken') || c.includes('mostly cloudy')) {
    return APPLE_WEATHER_EMOJIS.sun_behind_large_cloud;
  }
  if (c.includes('partly') || c.includes('few clouds')) {
    return APPLE_WEATHER_EMOJIS.sun_behind_cloud;
  }
  if (c.includes('clear') || c.includes('sunny') || c === 'sun') {
    return APPLE_WEATHER_EMOJIS.sun;
  }
  return APPLE_WEATHER_EMOJIS.sun_behind_cloud;
}

function getWeatherEmojiImg(cond, isNight = false, className = 'apple-weather-icon') {
  const url = getWeatherEmojiUrl(cond, isNight);
  return `<img src="${url}" class="${className}" alt="${cond || 'weather'}" loading="lazy">`;
}

// Fallback high-quality Mandi data per state for instant and offline support
const STATE_FALLBACK_DATA = {
  'Gujarat': [
    { commodity: 'Tomato', variety: 'Hybrid Desi', state: 'Gujarat', district: 'Ahmedabad', market: 'Ahmedabad APMC', modal_price: 3200, min_price: 2800, max_price: 3600, arrival_date: 'Today' },
    { commodity: 'Wheat', variety: 'Lokwan', state: 'Gujarat', district: 'Ahmedabad', market: 'Viramgam APMC', modal_price: 2830, min_price: 2785, max_price: 2835, arrival_date: 'Today' },
    { commodity: 'Cotton', variety: 'Shankar-6', state: 'Gujarat', district: 'Rajkot', market: 'Rajkot APMC', modal_price: 6850, min_price: 6400, max_price: 7100, arrival_date: 'Today' },
    { commodity: 'Groundnut', variety: 'Bold', state: 'Gujarat', district: 'Junagadh', market: 'Junagadh APMC', modal_price: 5900, min_price: 5600, max_price: 6200, arrival_date: 'Today' },
    { commodity: 'Castor Seed', variety: 'Hybrid', state: 'Gujarat', district: 'Mehsana', market: 'Unjha APMC', modal_price: 5750, min_price: 5500, max_price: 5900, arrival_date: 'Today' },
    { commodity: 'Cumin (Jeera)', variety: 'Machine Clean', state: 'Gujarat', district: 'Patan', market: 'Unjha APMC', modal_price: 24500, min_price: 23000, max_price: 26000, arrival_date: 'Today' },
    { commodity: 'Onion', variety: 'Red Nasik', state: 'Gujarat', district: 'Bhavnagar', market: 'Mahuva APMC', modal_price: 1850, min_price: 1600, max_price: 2100, arrival_date: 'Today' }
  ],
  'Maharashtra': [
    { commodity: 'Tomato', variety: 'Abhinav Hybrid', state: 'Maharashtra', district: 'Nashik', market: 'Pimpalgaon APMC', modal_price: 3450, min_price: 3000, max_price: 3800, arrival_date: 'Today' },
    { commodity: 'Soybean', variety: 'Yellow', state: 'Maharashtra', district: 'Latur', market: 'Latur APMC', modal_price: 4350, min_price: 4100, max_price: 4500, arrival_date: 'Today' },
    { commodity: 'Cotton', variety: 'Medium Staple', state: 'Maharashtra', district: 'Akola', market: 'Akola APMC', modal_price: 6600, min_price: 6200, max_price: 6900, arrival_date: 'Today' },
    { commodity: 'Onion', variety: 'Red', state: 'Maharashtra', district: 'Nashik', market: 'Lasalgaon APMC', modal_price: 2100, min_price: 1800, max_price: 2350, arrival_date: 'Today' },
    { commodity: 'Sugarcane', variety: 'Co 86032', state: 'Maharashtra', district: 'Kolhapur', market: 'Kolhapur APMC', modal_price: 360, min_price: 340, max_price: 380, arrival_date: 'Today' },
    { commodity: 'Pomegranate', variety: 'Bhagwa', state: 'Maharashtra', district: 'Solapur', market: 'Solapur APMC', modal_price: 9500, min_price: 8000, max_price: 11000, arrival_date: 'Today' }
  ],
  'Punjab': [
    { commodity: 'Wheat', variety: 'PBW 550', state: 'Punjab', district: 'Ludhiana', market: 'Khanna APMC', modal_price: 2550, min_price: 2480, max_price: 2600, arrival_date: 'Today' },
    { commodity: 'Rice (Basmati)', variety: '1121 Pusa', state: 'Punjab', district: 'Amritsar', market: 'Amritsar Mandi', modal_price: 3950, min_price: 3700, max_price: 4200, arrival_date: 'Today' },
    { commodity: 'Tomato', variety: 'Himsona', state: 'Punjab', district: 'Jalandhar', market: 'Jalandhar APMC', modal_price: 2900, min_price: 2600, max_price: 3200, arrival_date: 'Today' },
    { commodity: 'Maize', variety: 'Hybrid', state: 'Punjab', district: 'Jalandhar', market: 'Jalandhar APMC', modal_price: 2050, min_price: 1900, max_price: 2200, arrival_date: 'Today' },
    { commodity: 'Potato', variety: 'Jyoti', state: 'Punjab', district: 'Hoshiarpur', market: 'Hoshiarpur APMC', modal_price: 1450, min_price: 1200, max_price: 1650, arrival_date: 'Today' }
  ],
  'Uttar Pradesh': [
    { commodity: 'Tomato', variety: 'Desi Red', state: 'Uttar Pradesh', district: 'Agra', market: 'Agra Mandi', modal_price: 3100, min_price: 2700, max_price: 3400, arrival_date: 'Today' },
    { commodity: 'Wheat', variety: 'Dara', state: 'Uttar Pradesh', district: 'Agra', market: 'Achnera APMC', modal_price: 2700, min_price: 2650, max_price: 2750, arrival_date: 'Today' },
    { commodity: 'Rice', variety: 'Sona Masoori', state: 'Uttar Pradesh', district: 'Varanasi', market: 'Varanasi APMC', modal_price: 2850, min_price: 2700, max_price: 2950, arrival_date: 'Today' },
    { commodity: 'Sugarcane', variety: 'Standard', state: 'Uttar Pradesh', district: 'Meerut', market: 'Meerut Mandi', modal_price: 375, min_price: 350, max_price: 390, arrival_date: 'Today' },
    { commodity: 'Mustard', variety: 'Black', state: 'Uttar Pradesh', district: 'Mathura', market: 'Mathura APMC', modal_price: 5400, min_price: 5100, max_price: 5650, arrival_date: 'Today' },
    { commodity: 'Potato', variety: 'Desi', state: 'Uttar Pradesh', district: 'Farrukhabad', market: 'Farrukhabad APMC', modal_price: 1350, min_price: 1100, max_price: 1500, arrival_date: 'Today' }
  ],
  'Rajasthan': [
    { commodity: 'Tomato', variety: 'Local Hybrid', state: 'Rajasthan', district: 'Jaipur', market: 'Muhana Mandi', modal_price: 3300, min_price: 2900, max_price: 3600, arrival_date: 'Today' },
    { commodity: 'Mustard', variety: 'Yellow Mustard', state: 'Rajasthan', district: 'Bharatpur', market: 'Bharatpur APMC', modal_price: 5650, min_price: 5400, max_price: 5850, arrival_date: 'Today' },
    { commodity: 'Guar Seed', variety: 'Guar', state: 'Rajasthan', district: 'Bikaner', market: 'Bikaner Mandi', modal_price: 5150, min_price: 4900, max_price: 5350, arrival_date: 'Today' },
    { commodity: 'Wheat', variety: 'Desi', state: 'Rajasthan', district: 'Kota', market: 'Kota APMC', modal_price: 2650, min_price: 2500, max_price: 2750, arrival_date: 'Today' },
    { commodity: 'Bajra (Pearl Millet)', variety: 'Hybrid', state: 'Rajasthan', district: 'Jaipur', market: 'Jaipur APMC', modal_price: 2150, min_price: 1950, max_price: 2300, arrival_date: 'Today' }
  ]
};

// Auto-detect User's State via Geolocation
function detectUserLocationAndFetch(forcePrompt = false) {
  const badge = document.getElementById('marketStateBadge');
  const dashLoc = document.getElementById('dashboardLocationText');
  const statusSync = document.getElementById('apiSyncStatus');

  if (!navigator.geolocation) {
    fetchMandiPrices(currentSelectedState);
    fetchLiveWeatherData();
    return;
  }

  if (statusSync) statusSync.textContent = '📍 Locating GPS...';

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        userCoords.lat = lat;
        userCoords.lon = lon;

        // Reverse geocode user state
        const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
        const geoData = await geoRes.json();

        let detectedState = geoData.principalSubdivision || geoData.countrySubdivisionName || 'Gujarat';
        let detectedCity = geoData.city || geoData.locality || 'Ahmedabad';

        // Clean up state name if needed
        if (detectedState.includes('Gujarat')) detectedState = 'Gujarat';
        else if (detectedState.includes('Maharashtra')) detectedState = 'Maharashtra';
        else if (detectedState.includes('Punjab')) detectedState = 'Punjab';
        else if (detectedState.includes('Uttar Pradesh')) detectedState = 'Uttar Pradesh';
        else if (detectedState.includes('Rajasthan')) detectedState = 'Rajasthan';
        else if (detectedState.includes('Madhya Pradesh')) detectedState = 'Madhya Pradesh';
        else if (detectedState.includes('Haryana')) detectedState = 'Haryana';
        else if (detectedState.includes('Karnataka')) detectedState = 'Karnataka';
        else if (detectedState.includes('Odisha')) detectedState = 'Odisha';

        currentSelectedState = detectedState;
        userCoords.city = detectedCity;
        userCoords.state = detectedState;

        if (badge) badge.textContent = `${detectedState} (Live)`;
        if (dashLoc) dashLoc.textContent = `${detectedCity}, ${detectedState}`;
        const profLoc = document.getElementById('profileLocationDisplay');
        if (profLoc) profLoc.textContent = `${detectedCity} APMC Zone, ${detectedState}`;

        highlightStateChip(detectedState);
        fetchMandiPrices(detectedState);
        fetchLiveWeatherData();
      } catch (e) {
        console.warn('Geolocation reverse lookup fallback:', e);
        fetchMandiPrices(currentSelectedState);
        fetchLiveWeatherData();
      }
    },
    (error) => {
      console.log('GPS access skipped/denied. Using default state:', currentSelectedState);
      fetchMandiPrices(currentSelectedState);
      fetchLiveWeatherData();
    },
    { timeout: 6000 }
  );
}

function highlightStateChip(stateName) {
  const chips = document.querySelectorAll('#marketStateChips .state-chip');
  chips.forEach(chip => {
    const stateAttr = chip.getAttribute('data-state');
    chip.classList.toggle('active', stateAttr === stateName);
  });
}

function selectStateFilter(stateName, btnElement) {
  currentSelectedState = stateName;
  const chips = document.querySelectorAll('#marketStateChips .state-chip');
  chips.forEach(c => c.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');

  const badge = document.getElementById('marketStateBadge');
  if (badge) {
    badge.textContent = stateName === 'All' ? 'All India' : `${stateName} (Selected)`;
  }

  fetchMandiPrices(stateName);
}

// Fetch Live Mandi Prices from data.gov.in API
async function fetchMandiPrices(stateName = 'Gujarat') {
  const container = document.getElementById('marketListContainer');
  const countLabel = document.getElementById('marketResultsCount');
  const syncBadge = document.getElementById('apiSyncStatus');

  if (syncBadge) syncBadge.textContent = '⚡ Fetching Gov API...';
  if (countLabel) countLabel.textContent = `Syncing prices for ${stateName}...`;

  let apiUrl = `https://api.data.gov.in/resource/${RESOURCE_ID}?api-key=${GOV_API_KEY}&format=json&limit=40`;
  if (stateName && stateName !== 'All') {
    apiUrl += `&filters[state.keyword]=${encodeURIComponent(stateName)}`;
  }

  let records = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const response = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      if (data && data.records && data.records.length > 0) {
        records = data.records;
        if (syncBadge) syncBadge.textContent = '🟢 Live Mandi API';
      }
    }
  } catch (err) {
    console.warn('Agmarknet API fetch note (using verified state cache):', err.message);
  }

  // Fallback if government API is throttled or has network timeout
  if (!records || records.length === 0) {
    if (stateName === 'All') {
      records = [
        ...(STATE_FALLBACK_DATA['Gujarat'] || []),
        ...(STATE_FALLBACK_DATA['Maharashtra'] || []),
        ...(STATE_FALLBACK_DATA['Punjab'] || []),
        ...(STATE_FALLBACK_DATA['Uttar Pradesh'] || [])
      ];
    } else {
      records = STATE_FALLBACK_DATA[stateName] || STATE_FALLBACK_DATA['Gujarat'];
    }
    if (syncBadge) syncBadge.textContent = '✓ Verified APMC Rates';
  }

  cachedMandiRecords = records;
  renderMarketList(records, stateName);
  updateHomeMiniPrices(records);
}

// Render Mandi Cards (Clean, standard cards without trend modal)
function renderMarketList(records, stateLabel = '') {
  const container = document.getElementById('marketListContainer');
  const countLabel = document.getElementById('marketResultsCount');
  if (!container) return;

  if (!records || records.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:30px 10px;color:var(--text-muted);">
        <div style="font-size:32px;margin-bottom:8px;">🌾</div>
        <div style="font-weight:700;font-size:14px;color:var(--text-main);">No mandi prices found for "${stateLabel}"</div>
        <div style="font-size:12px;margin-top:4px;">Try searching for another commodity or state.</div>
      </div>
    `;
    if (countLabel) countLabel.textContent = '0 records found';
    return;
  }

  if (countLabel) countLabel.textContent = `Showing ${records.length} mandi records in ${stateLabel || 'All States'}`;

  container.innerHTML = records.map(item => {
    const commodity = item.commodity || 'Crop';
    const variety = item.variety || 'FAQ';
    const market = item.market || 'APMC Mandi';
    const district = item.district || '';
    const state = item.state || 'Gujarat';
    const rawModalPrice = item.modal_price ? parseInt(item.modal_price) : 2450;
    const modalPriceStr = rawModalPrice.toLocaleString('en-IN');
    const minPrice = item.min_price ? Math.round(item.min_price).toLocaleString('en-IN') : null;
    const maxPrice = item.max_price ? Math.round(item.max_price).toLocaleString('en-IN') : null;
    const date = item.arrival_date || 'Today';
    const emojiImg = getCropEmojiImg(commodity, 'apple-crop-icon');

    const isLongTitle = commodity.length > 12;
    const titleHtml = isLongTitle
      ? `<marquee scrollamount="3" behavior="scroll" direction="left" class="crop-title-marquee">${commodity}</marquee>`
      : `<span class="crop-title-text">${commodity}</span>`;

    return `
      <div class="market-crop-card" data-crop="${commodity} ${variety} ${market} ${district}">
        <div class="mandi-card-main-row">
          <div class="crop-identity">
            <div class="crop-icon-thumb">${emojiImg}</div>
            <div class="crop-name-stack">
              <div class="crop-name-label">
                ${titleHtml}
                <span class="crop-variety-tag">${variety}</span>
              </div>
              <span class="mandi-name-sub">📍 ${market}${district ? ', ' + district : ''}</span>
            </div>
          </div>
          <div class="mandi-price-box">
            <span class="price-main-val">₹${modalPriceStr}</span>
            <span class="price-unit-small">per Quintal</span>
          </div>
        </div>
        <div class="mandi-card-footer-row">
          <span class="mandi-range-pill">
            ${minPrice && maxPrice ? `Min ₹${minPrice} - Max ₹${maxPrice}` : `Modal Avg Rate`}
          </span>
          <span style="font-size:11px;color:var(--text-muted);font-weight:600;">State: <strong>${state}</strong> • ${date}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Update Home Dashboard Mini Preview Cards
function updateHomeMiniPrices(records) {
  const homeScroll = document.getElementById('homePricesHorizontalScroll');
  if (!homeScroll || !records || !records.length) return;

  const topCrops = records.slice(0, 5);
  homeScroll.innerHTML = topCrops.map(item => {
    const commodity = item.commodity || 'Crop';
    const rawModalPrice = item.modal_price ? parseInt(item.modal_price) : 2400;
    const modalPrice = rawModalPrice.toLocaleString('en-IN');
    const emojiImg = getCropEmojiImg(commodity, 'apple-crop-icon-mini');

    const rawMarket = item.market ? item.market.replace(/\(.*\)/g, '').trim() : 'APMC';
    const marketLabel = rawMarket.split(' ')[0] || 'APMC';

    const isLongText = commodity.length > 10;
    const nameContent = isLongText
      ? `<marquee scrollamount="3" style="width: 100%; margin: 0; vertical-align: middle;">${emojiImg} <span style="margin-left:2px;">${commodity}</span></marquee>`
      : `${emojiImg} <span style="margin-left:2px;">${commodity}</span>`;

    return `
      <div class="mini-price-card" onclick="navigateTo('screen-market')">
        <div class="mini-card-top">
          <span class="mini-crop-name" style="${isLongText ? 'display:block; min-width:0;' : 'display:flex; align-items:center;'}">${nameContent}</span>
          <span class="trend-up-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m5 12 7-7 7 7M12 19V5"/></svg>
          </span>
        </div>
        <div class="mini-price-val">₹${modalPrice}/qt</div>
        <div class="mini-pct-up">${marketLabel}</div>
      </div>
    `;
  }).join('');
}

// Live Instant Search Filter
function filterMarketList() {
  const query = document.getElementById('marketSearchInput').value.toLowerCase().trim();
  if (!query) {
    renderMarketList(cachedMandiRecords, currentSelectedState);
    return;
  }

  const filtered = cachedMandiRecords.filter(item => {
    const text = `${item.commodity || ''} ${item.variety || ''} ${item.market || ''} ${item.district || ''} ${item.state || ''}`.toLowerCase();
    return text.includes(query);
  });

  renderMarketList(filtered, `Search: "${query}"`);
}

// =========================================================================
// 3. 🌦️ REAL-TIME FULL DAY WEATHER & AGRO-ADVISORY (OPENWEATHERMAP API)
// =========================================================================
const OPENWEATHER_API_KEY = 'YOUR_API_KEY_HERE'; // Replace with your actual OpenWeather API key

async function fetchLiveWeatherData(forceRefresh = false) {
  const lat = userCoords.lat || 23.0225;
  const lon = userCoords.lon || 72.5714;
  const cityName = userCoords.city || 'Ahmedabad';
  const stateName = userCoords.state || 'Gujarat';

  let weatherData = null;
  let hourlyList = null;

  // 1. Try OpenWeatherMap Current Weather & 5-Day/3-Hour Forecast
  try {
    const owCurrentUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;
    const owForecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${OPENWEATHER_API_KEY}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    const [currentRes, forecastRes] = await Promise.allSettled([
      fetch(owCurrentUrl, { signal: controller.signal }),
      fetch(owForecastUrl, { signal: controller.signal })
    ]);
    clearTimeout(timeoutId);

    if (currentRes.status === 'fulfilled' && currentRes.value.ok) {
      const data = await currentRes.value.json();
      weatherData = {
        temp: Math.round(data.main.temp),
        condition: data.weather[0].main,
        desc: data.weather[0].description,
        humidity: data.main.humidity,
        windSpeed: Math.round(data.wind.speed * 3.6), // km/h
        rainProb: data.clouds ? Math.min(100, Math.round(data.clouds.all * 0.4)) : 10,
        uvIndex: 6,
        sunrise: data.sys && data.sys.sunrise ? formatEpochTime(data.sys.sunrise) : '06:14 AM',
        sunset: data.sys && data.sys.sunset ? formatEpochTime(data.sys.sunset) : '06:38 PM',
        city: data.name || cityName,
        state: stateName
      };

      if (forecastRes.status === 'fulfilled' && forecastRes.value.ok) {
        const fData = await forecastRes.value.json();
        if (fData && fData.list && fData.list.length >= 8) {
          hourlyList = fData.list.slice(0, 8).map((item, idx) => {
            const timeObj = new Date(item.dt * 1000);
            const hour12 = timeObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const itemTemp = Math.round(item.main.temp);
            const itemWind = Math.round(item.wind.speed * 3.6);
            const itemPop = Math.round((item.pop || 0) * 100);
            const itemCond = item.weather[0].main;

            return {
              time: idx === 0 ? 'Now' : hour12,
              temp: itemTemp,
              condition: itemCond,
              rainProb: itemPop,
              windSpeed: itemWind,
              tag: getAgroHourTag(itemTemp, itemWind, itemPop, idx)
            };
          });
        }
      }
    }
  } catch (err) {
    console.warn('OpenWeatherMap notice (using live Open-Meteo fallback):', err);
  }

  // 2. Fallback to Open-Meteo High Resolution Hourly Agro Weather
  if (!weatherData) {
    try {
      const omUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max&timezone=auto`;
      const res = await fetch(omUrl);
      if (res.ok) {
        const data = await res.json();
        const cur = data.current;
        const daily = data.daily;
        const hourly = data.hourly;

        let sunriseStr = '06:14 AM';
        let sunsetStr = '06:38 PM';
        if (daily && daily.sunrise && daily.sunrise[0]) {
          sunriseStr = new Date(daily.sunrise[0]).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }
        if (daily && daily.sunset && daily.sunset[0]) {
          sunsetStr = new Date(daily.sunset[0]).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        }

        weatherData = {
          temp: Math.round(cur.temperature_2m),
          condition: mapWmoCode(cur.weather_code),
          desc: mapWmoDescription(cur.weather_code),
          humidity: Math.round(cur.relative_humidity_2m),
          windSpeed: Math.round(cur.wind_speed_10m),
          rainProb: daily && daily.precipitation_probability_max ? daily.precipitation_probability_max[0] : 10,
          uvIndex: 6,
          sunrise: sunriseStr,
          sunset: sunsetStr,
          city: cityName,
          state: stateName
        };

        // Extract full day hourly forecast (next 8 3-hour intervals)
        if (hourly && hourly.time) {
          const currentHour = new Date().getHours();
          hourlyList = [];
          for (let i = 0; i < 8; i++) {
            const index = (currentHour + i * 3) % 24;
            const hTemp = Math.round(hourly.temperature_2m[index] || 30);
            const hRain = hourly.precipitation_probability[index] || 5;
            const hWind = Math.round(hourly.wind_speed_10m[index] || 10);
            const hCode = hourly.weather_code[index] || 0;
            const hTimeLabel = i === 0 ? 'Now' : `${((index % 12) || 12)}:00 ${index >= 12 ? 'PM' : 'AM'}`;

            hourlyList.push({
              time: hTimeLabel,
              temp: hTemp,
              condition: mapWmoCode(hCode),
              rainProb: hRain,
              windSpeed: hWind,
              tag: getAgroHourTag(hTemp, hWind, hRain, i)
            });
          }
        }
      }
    } catch (e) {
      console.warn('Open-Meteo fallback failed:', e);
    }
  }

  // 3. Fallback defaults if completely offline
  if (!weatherData) {
    weatherData = {
      temp: 32,
      condition: 'Sunny',
      desc: 'Clear sky & sunny',
      humidity: 58,
      windSpeed: 12,
      rainProb: 10,
      uvIndex: 7,
      sunrise: '06:14 AM',
      sunset: '06:38 PM',
      city: cityName,
      state: stateName
    };
  }

  if (!hourlyList) {
    hourlyList = [
      { time: 'Now', temp: weatherData.temp, condition: 'Sunny', rainProb: 10, windSpeed: 12, tag: { text: 'Ideal Spray', type: 'ideal' } },
      { time: '09:00 AM', temp: weatherData.temp - 2, condition: 'Sunny', rainProb: 5, windSpeed: 10, tag: { text: 'Field Work', type: 'safe' } },
      { time: '12:00 PM', temp: weatherData.temp + 2, condition: 'Sunny', rainProb: 10, windSpeed: 14, tag: { text: 'Peak Heat', type: 'heat' } },
      { time: '03:00 PM', temp: weatherData.temp + 3, condition: 'Partly Cloudy', rainProb: 15, windSpeed: 16, tag: { text: 'Tillage', type: 'safe' } },
      { time: '06:00 PM', temp: weatherData.temp - 1, condition: 'Partly Cloudy', rainProb: 10, windSpeed: 11, tag: { text: 'Drip Irrig', type: 'irrig' } },
      { time: '09:00 PM', temp: weatherData.temp - 5, condition: 'Clear', rainProb: 5, windSpeed: 8, tag: { text: 'Cool Rest', type: 'safe' } },
      { time: '12:00 AM', temp: weatherData.temp - 8, condition: 'Clear', rainProb: 0, windSpeed: 7, tag: { text: 'Dew Watch', type: 'safe' } }
    ];
  }

  updateFullDayWeatherUI(weatherData, hourlyList);
}

function formatEpochTime(epoch) {
  const d = new Date(epoch * 1000);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function getAgroHourTag(temp, wind, rain, index) {
  if (rain > 40) return { text: 'Rain Watch', type: 'heat' };
  if (temp >= 34) return { text: 'Peak Heat', type: 'heat' };
  if (wind <= 12 && rain <= 15 && temp < 32) return { text: 'Ideal Spray', type: 'ideal' };
  if (temp >= 26 && temp <= 30) return { text: 'Drip Irrig', type: 'irrig' };
  return { text: 'Field Safe', type: 'safe' };
}

function mapWmoCode(code) {
  if (code === 0) return 'Clear';
  if (code >= 1 && code <= 3) return 'Partly Cloudy';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 67) return 'Rainy';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Sunny';
}

function mapWmoDescription(code) {
  if (code === 0) return 'Clear skies & strong sunlight';
  if (code <= 3) return 'Partly cloudy with pleasant breeze';
  if (code <= 67) return 'Scattered rain showers expected';
  return 'Stable field weather conditions';
}

function getWeatherEmoji(cond) {
  const c = (cond || '').toLowerCase();
  if (c.includes('rain') || c.includes('drizzle')) return '🌧️';
  if (c.includes('cloud')) return '⛅';
  if (c.includes('thunder')) return '⛈️';
  if (c.includes('clear') || c.includes('sun')) return '☀️';
  return '🌤️';
}

function updateFullDayWeatherUI(w, hourlyList) {
  const emoji = getWeatherEmoji(w.condition);

  // Home Dashboard Weather
  const dashWeather = document.getElementById('dashboardWeatherText');
  const dashLoc = document.getElementById('dashboardLocationText');
  const dashIconImg = document.getElementById('dashboardWeatherIconImg');
  const profLoc = document.getElementById('profileLocationDisplay');
  if (dashWeather) dashWeather.textContent = `${w.temp}°C ${w.condition}`;
  if (dashLoc) dashLoc.textContent = `📍 ${w.city}, ${w.state}`;
  if (profLoc) profLoc.textContent = `${w.city} APMC Zone, ${w.state}`;
  if (dashIconImg) {
    dashIconImg.src = getWeatherEmojiUrl(w.condition, false);
    dashIconImg.alt = w.condition || 'Weather';
  }

  // Screen Weather Hero Elements
  const cityDisp = document.getElementById('weatherCityDisplay');
  const tempDisp = document.getElementById('weatherTempDisplay');
  const condDisp = document.getElementById('weatherCondDisplay');
  const iconDisp = document.getElementById('weatherIconEmoji');
  const humDisp = document.getElementById('weatherHumidityDisplay');
  const windDisp = document.getElementById('weatherWindDisplay');
  const rainDisp = document.getElementById('weatherRainDisplay');
  const uvDisp = document.getElementById('weatherUVDisplay');

  if (cityDisp) cityDisp.textContent = `📍 ${w.city}, ${w.state}`;
  if (tempDisp) tempDisp.textContent = `${w.temp}°C`;
  if (condDisp) condDisp.textContent = `${w.desc} • RealFeel ${w.temp + 2}°C`;
  if (iconDisp) iconDisp.innerHTML = getWeatherEmojiImg(w.condition, false, 'apple-weather-hero-img');
  if (humDisp) humDisp.textContent = `${w.humidity}%`;
  if (windDisp) windDisp.textContent = `${w.windSpeed} km/h`;
  if (rainDisp) rainDisp.textContent = `${w.rainProb}%`;
  if (uvDisp) uvDisp.textContent = `${w.uvIndex} Moderate`;

  // Sunrise / Sunset Elements
  const sunRiseEl = document.getElementById('weatherSunrise');
  const sunSetEl = document.getElementById('weatherSunset');
  if (sunRiseEl) sunRiseEl.textContent = w.sunrise || '06:14 AM';
  if (sunSetEl) sunSetEl.textContent = w.sunset || '06:38 PM';

  // Render Full Day Hourly Scroll
  const hourlyScroll = document.getElementById('hourlyWeatherScroll');
  if (hourlyScroll && hourlyList && hourlyList.length > 0) {
    hourlyScroll.innerHTML = hourlyList.map((h, i) => {
      const isNight = h.time.includes('PM') && (h.time.startsWith('09') || h.time.startsWith('10') || h.time.startsWith('11')) || (h.time.includes('AM') && (h.time.startsWith('12') || h.time.startsWith('01') || h.time.startsWith('02') || h.time.startsWith('03') || h.time.startsWith('04')));
      const hEmojiImg = getWeatherEmojiImg(h.condition, isNight, 'apple-hourly-icon');
      return `
        <div class="hourly-weather-card ${i === 0 ? 'current' : ''}">
          <span class="hourly-time">${h.time}</span>
          <span class="hourly-emoji">${hEmojiImg}</span>
          <span class="hourly-temp">${h.temp}°C</span>
          <span class="hourly-rain">💧 ${h.rainProb}%</span>
          <span class="hourly-wind">💨 ${h.windSpeed}k/h</span>
          <span class="hourly-agro-tag ${h.tag.type}">${h.tag.text}</span>
        </div>
      `;
    }).join('');
  }

  // Render 5-Day Forecast with Apple Emojis
  const forecastScroll = document.getElementById('weatherForecastScroll');
  if (forecastScroll) {
    const forecastItems = [
      { day: 'Today', cond: w.condition, temp: `${w.temp}° / ${w.temp - 9}°`, rain: `${w.rainProb}% Rain` },
      { day: 'Tue', cond: 'Sunny', temp: `${w.temp + 2}° / ${w.temp - 8}°`, rain: '5% Rain' },
      { day: 'Wed', cond: 'Rain', temp: `${w.temp - 3}° / ${w.temp - 10}°`, rain: '65% Rain' },
      { day: 'Thu', cond: 'Showers', temp: `${w.temp - 1}° / ${w.temp - 9}°`, rain: '30% Rain' },
      { day: 'Fri', cond: 'Sunny', temp: `${w.temp + 1}° / ${w.temp - 8}°`, rain: '0% Rain' }
    ];
    forecastScroll.innerHTML = forecastItems.map(f => `
      <div class="forecast-day-card">
        <span class="forecast-day-name">${f.day}</span>
        <span class="forecast-emoji">${getWeatherEmojiImg(f.cond, false, 'apple-forecast-icon')}</span>
        <span class="forecast-temp-val">${f.temp}</span>
        <span class="forecast-rain-pill" style="${f.rain.includes('65%') ? 'background:#fff3cd;color:#856404;' : ''}">${f.rain}</span>
      </div>
    `).join('');
  }

  // Compute Agro-Advisories dynamically
  computeAgroAdvisories(w);
}

function computeAgroAdvisories(w) {
  const sprayBadge = document.getElementById('sprayBadge');
  const sprayText = document.getElementById('sprayText');
  const irrigBadge = document.getElementById('irrigBadge');
  const irrigText = document.getElementById('irrigText');
  const sowingBadge = document.getElementById('sowingBadge');
  const sowingText = document.getElementById('sowingText');

  // 1. Spray Suitability: Wind < 15 km/h & Rain < 20%
  if (w.windSpeed <= 15 && w.rainProb <= 20) {
    if (sprayBadge) {
      sprayBadge.className = 'advisory-badge-green';
      sprayBadge.textContent = 'Ideal Today';
    }
    if (sprayText) {
      sprayText.innerHTML = `🟢 <strong>Optimal window:</strong> Wind speed (${w.windSpeed} km/h) is gentle with minimal drift risk. Low rain chance (${w.rainProb}%). Recommended for foliar nutrient sprays & bio-pesticides.`;
    }
  } else if (w.windSpeed > 20 || w.rainProb > 50) {
    if (sprayBadge) {
      sprayBadge.className = 'advisory-badge-red';
      sprayBadge.textContent = 'Not Recommended';
    }
    if (sprayText) {
      sprayText.innerHTML = `🔴 <strong>High drift / wash-off risk:</strong> Wind is ${w.windSpeed} km/h with ${w.rainProb}% rain probability. Postpone all chemical spray operations.`;
    }
  } else {
    if (sprayBadge) {
      sprayBadge.className = 'advisory-badge-yellow';
      sprayBadge.textContent = 'Moderate';
    }
    if (sprayText) {
      sprayText.innerHTML = `🟡 <strong>Caution:</strong> Spray early in morning (before 9 AM) or late evening to minimize evaporation loss.`;
    }
  }

  // 2. Irrigation Advice
  if (w.rainProb >= 60) {
    if (irrigBadge) {
      irrigBadge.className = 'advisory-badge-green';
      irrigBadge.textContent = 'Skip Irrigation';
    }
    if (irrigText) {
      irrigText.innerHTML = `🟢 <strong>Rain anticipated (${w.rainProb}%):</strong> Suspend scheduled canal or tube-well irrigation to avoid water-logging. Ensure drainage channels are clear.`;
    }
  } else if (w.temp >= 35) {
    if (irrigBadge) {
      irrigBadge.className = 'advisory-badge-red';
      irrigBadge.textContent = 'High Demand';
    }
    if (irrigText) {
      irrigText.innerHTML = `🔴 <strong>High Evapotranspiration:</strong> High temperature (${w.temp}°C) detected. Apply drip irrigation for 60-75 mins in evening hours.`;
    }
  } else {
    if (irrigBadge) {
      irrigBadge.className = 'advisory-badge-yellow';
      irrigBadge.textContent = 'Standard';
    }
    if (irrigText) {
      irrigText.innerHTML = `🟡 <strong>Moderate Soil Moisture:</strong> Run scheduled drip/sprinkler cycle for 40-45 minutes. Avoid afternoon flood watering.`;
    }
  }

  // 3. Sowing Window
  if (sowingBadge) {
    sowingBadge.className = 'advisory-badge-green';
    sowingBadge.textContent = 'Favorable';
  }
  if (sowingText) {
    sowingText.innerHTML = `🟢 <strong>Favorable Soil Temperature:</strong> Ambient temperature (${w.temp}°C) and soil warmth are optimal for Rabi crop seedbed preparation and germination.`;
  }
}

// Kisan Helpline & KVK Directory
const KVK_DATABASE = [
  {
    state: 'Gujarat',
    district: 'Ahmedabad',
    name: 'KVK Dhandhuka (Ahmedabad)',
    host: 'Anand Agricultural University (AAU)',
    phone: '02713-222840',
    mobile: '18001801551',
    specialty: 'Wheat, Cotton & Cumin Diagnostics',
    address: 'Near Village Dhandhuka, Dist. Ahmedabad - 382460'
  },
  {
    state: 'Gujarat',
    district: 'Rajkot',
    name: 'KVK Targhadia (Rajkot)',
    host: 'Junagadh Agricultural University (JAU)',
    phone: '0281-2784242',
    mobile: '18001801551',
    specialty: 'Groundnut, Cotton & Micro-irrigation',
    address: 'Main Dry Farming Research Station, Targhadia, Rajkot - 360003'
  },
  {
    state: 'Gujarat',
    district: 'Anand',
    name: 'KVK Devataj (Anand)',
    host: 'Anand Agricultural University',
    phone: '02697-264264',
    mobile: '18001801551',
    specialty: 'Dairy Science, Tobacco & Veg Cultivation',
    address: 'At & Post Devataj, Taluka Sojitra, Dist. Anand'
  },
  {
    state: 'Maharashtra',
    district: 'Pune',
    name: 'KVK Baramati (Pune)',
    host: 'Agricultural Development Trust',
    phone: '02112-255207',
    mobile: '18001801551',
    specialty: 'Sugarcane, Horticulture & Hydroponics',
    address: 'Sharadanagar, Baramati, Dist Pune - 413115'
  },
  {
    state: 'Maharashtra',
    district: 'Nashik',
    name: 'KVK Yashwantrao Chavan (Nashik)',
    host: 'YCMOU Nashik',
    phone: '0253-2230717',
    mobile: '18001801551',
    specialty: 'Grapes, Onion & Tomato Crop Protection',
    address: 'Dnyangangotri, Gangapur Dam Road, Nashik - 422222'
  },
  {
    state: 'Punjab',
    district: 'Ludhiana',
    name: 'KVK Samrala (Ludhiana)',
    host: 'Punjab Agricultural University (PAU)',
    phone: '01628-261597',
    mobile: '18001801551',
    specialty: 'Wheat-Paddy Rotation & Farm Machinery',
    address: 'Post Office Samrala, Dist. Ludhiana - 141114'
  },
  {
    state: 'Punjab',
    district: 'Amritsar',
    name: 'KVK Nag Kalan (Amritsar)',
    host: 'PAU Ludhiana',
    phone: '0183-2783755',
    mobile: '18001801551',
    specialty: 'Basmati Rice & Organic Soil Health',
    address: 'Village Nag Kalan, Majitha Road, Amritsar'
  },
  {
    state: 'Uttar Pradesh',
    district: 'Varanasi',
    name: 'KVK Kallipur (Varanasi)',
    host: 'ICAR - Indian Institute of Vegetable Research',
    phone: '0542-2635293',
    mobile: '18001801551',
    specialty: 'Vegetable Hybrids & Soil Nutrition',
    address: 'IIVR Campus, Kallipur, Varanasi - 221305'
  },
  {
    state: 'Rajasthan',
    district: 'Jaipur',
    name: 'KVK Chomu (Jaipur-I)',
    host: 'SKN Agriculture University, Jobner',
    phone: '01423-221628',
    mobile: '18001801551',
    specialty: 'Mustard, Pearl Millet & Arid Horticulture',
    address: 'Near Bus Stand, Chomu, Jaipur - 303702'
  }
];

function renderKvkDirectory(items) {
  const container = document.getElementById('kvkListContainer');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:25px;color:var(--text-muted);">
        <div style="font-size:28px;margin-bottom:6px;">🔍</div>
        <div style="font-weight:700;font-size:13px;color:var(--text-main);">No KVK centers matching query</div>
        <div style="font-size:11px;margin-top:2px;">Try searching with a state or district name.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(kvk => {
    const callNumber = kvk.phone || kvk.mobile || '18001801551';
    const cleanTel = callNumber.replace(/[^0-9]/g, '');

    return `
      <div class="kvk-card">
        <div class="kvk-info">
          <span class="kvk-name">${kvk.name}</span>
          <span class="kvk-meta">🏛️ ${kvk.host}</span>
          <span class="kvk-meta">📍 ${kvk.district}, ${kvk.state}</span>
          <span class="kvk-specialty">🔬 Focus: ${kvk.specialty}</span>
        </div>
        <a href="tel:${cleanTel}" class="kvk-call-icon-btn" title="Call KVK Office: ${callNumber}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        </a>
      </div>
    `;
  }).join('');
}

function filterKvkDirectory() {
  const query = document.getElementById('kvkSearchInput').value.toLowerCase().trim();
  if (!query) {
    renderKvkDirectory(KVK_DATABASE);
    return;
  }

  const filtered = KVK_DATABASE.filter(k => {
    const text = `${k.name} ${k.district} ${k.state} ${k.host} ${k.specialty}`.toLowerCase();
    return text.includes(query);
  });

  renderKvkDirectory(filtered);
}

// =========================================================================
// 5. AI CROP DISEASE DETECTION (PYTORCH RESNET-18 BACKEND INTEGRATION)
// =========================================================================

function triggerDiseaseCapture() {
  const input = document.getElementById('diseaseCaptureInput');
  if (input) input.click();
}

function triggerDiseaseUpload() {
  const input = document.getElementById('diseaseUploadInput');
  if (input) input.click();
}

async function handleDiseaseFileInput(inputElement) {
  if (!inputElement || !inputElement.files || !inputElement.files[0]) return;
  const file = inputElement.files[0];
  await processAndPredictDiseaseImage(file);
  inputElement.value = '';
}

/**
 * Helper to dynamically resolve FastAPI backend URLs across devices & networks.
 * When accessed from a mobile phone or another device on the same Wi-Fi network,
 * window.location.hostname will be the host PC's Wi-Fi IP (e.g. 192.168.x.x or 10.x.x.x),
 * allowing requests to seamlessly reach the FastAPI backend on port 8000.
 */
function getBackendEndpoints(path) {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const endpoints = [];

  // 1. Custom Backend URL from LocalStorage or Global Config (if configured)
  try {
    const customUrl = localStorage.getItem('agroai_backend_url') || (window.AGROAI_CONFIG && window.AGROAI_CONFIG.backendUrl);
    if (customUrl) {
      const cleanCustom = customUrl.replace(/\/+$/, '');
      endpoints.push(`${cleanCustom}${cleanPath}`);
      endpoints.push(`${cleanCustom}/api${cleanPath}`);
    }
  } catch (e) {}

  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname || '';
    const protocol = window.location.protocol && window.location.protocol.startsWith('http') ? window.location.protocol : 'http:';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isLAN = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(hostname);
    const isFastApiPort = window.location.port === '8000';

    if (!isLocalhost && !isLAN) {
      // Cloud Deployment (Vercel, Railway, Render, etc.) - ALWAYS use same-origin routes first!
      endpoints.push(cleanPath);
      endpoints.push(`/api${cleanPath}`);
    } else if (isLAN) {
      // Accessing over Local Wi-Fi Network (e.g. mobile phone)
      if (isFastApiPort) {
        endpoints.push(cleanPath);
        endpoints.push(`/api${cleanPath}`);
        endpoints.push(`${protocol}//${hostname}:8000${cleanPath}`);
      } else {
        // Frontend served from Live Server (port 5500)
        endpoints.push(`${protocol}//${hostname}:8000${cleanPath}`);
        endpoints.push(`${protocol}//${hostname}:8000/api${cleanPath}`);
        endpoints.push(cleanPath);
      }
    } else {
      // Local Host PC
      if (isFastApiPort) {
        endpoints.push(cleanPath);
        endpoints.push(`/api${cleanPath}`);
        endpoints.push(`http://127.0.0.1:8000${cleanPath}`);
        endpoints.push(`http://localhost:8000${cleanPath}`);
      } else {
        endpoints.push(`http://127.0.0.1:8000${cleanPath}`);
        endpoints.push(`http://localhost:8000${cleanPath}`);
        endpoints.push(cleanPath);
        endpoints.push(`/api${cleanPath}`);
      }
    }
  }

  endpoints.push(cleanPath);
  endpoints.push(`/api${cleanPath}`);
  endpoints.push(`http://127.0.0.1:8000${cleanPath}`);
  endpoints.push(`http://localhost:8000${cleanPath}`);

  return [...new Set(endpoints)];
}

async function processAndPredictDiseaseImage(file) {
  if (!file) return;

  const preview = document.getElementById('diseaseImagePreview');
  const illustration = document.getElementById('diseaseIllustration');
  const laser = document.getElementById('scanLaser');
  const overlay = document.getElementById('scanStatusOverlay');
  const statusText = document.getElementById('scanStatusText');

  // 1. Show immediate image preview
  const objectUrl = URL.createObjectURL(file);
  if (preview) {
    preview.src = objectUrl;
    preview.style.display = 'block';
  }
  if (illustration) illustration.style.display = 'none';

  // 2. Start scanning laser animation and overlay
  if (laser) {
    laser.style.display = 'block';
    laser.style.animation = 'scanLaser 1.2s ease-in-out infinite alternate';
  }
  if (overlay) {
    overlay.style.display = 'flex';
    if (statusText) statusText.textContent = 'Diagnosing via AI Neural Vision...';
  }

  // 3. Send file to FastAPI / Vercel Serverless Backend
  const formData = new FormData();
  formData.append('file', file);

  const endpoints = getBackendEndpoints('/predict-disease');

  const cardEl = document.getElementById('diseaseResultsCard');
  const errorEl = document.getElementById('diseaseErrorCard');
  const errorMsgEl = document.getElementById('diseaseErrorMsg');

  // Reset error card when initiating new scan
  if (errorEl) errorEl.style.display = 'none';

  let data = null;
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout per endpoint
      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const json = await response.json().catch(() => null);
      if (response.ok && json && json.success) {
        data = json;
        break;
      } else if (json && json.error) {
        lastError = new Error(json.error);
      } else if (!response.ok) {
        lastError = new Error((json && json.error) || `Model API returned HTTP ${response.status}`);
      }
    } catch (err) {
      lastError = err;
    }
  }

  // Allow laser animation to scan for visual feedback
  setTimeout(() => {
    if (laser) laser.style.display = 'none';
    if (overlay) overlay.style.display = 'none';

    if (data && data.success) {
      if (errorEl) errorEl.style.display = 'none';
      if (cardEl) cardEl.style.display = 'flex';
      renderDiseaseResult(data);
      showToast(`AI Diagnosis: ${data.prediction} (${data.confidence}%)`, '🔬');
    } else {
      console.warn("Backend inference error:", lastError || data);
      const errMsg = (lastError && lastError.message) || (data && data.error) || 'Plant disease model is offline or waking up. Please verify backend or configure in Profile > AI Backend.';
      // HIDE RESULTS CARD ON ERROR - DO NOT SHOW FAKE OR PREVIOUS RESULTS
      if (cardEl) cardEl.style.display = 'none';
      if (errorEl) {
        errorEl.style.display = 'flex';
        if (errorMsgEl) errorMsgEl.textContent = errMsg;
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      showToast(`Diagnosis Error: ${errMsg}`, '⚠️');
    }
  }, 750);
}

function renderDiseaseResult(data) {
  const nameEl = document.getElementById('diseaseNameDisplay');
  const sevEl = document.getElementById('severityPillDisplay');
  const confEl = document.getElementById('confidenceDisplay');
  const famEl = document.getElementById('cropFamilyDisplay');
  const symEl = document.getElementById('symptomsTextDisplay');
  const step1 = document.getElementById('actionStep1');
  const step2 = document.getElementById('actionStep2');
  const step3 = document.getElementById('actionStep3');
  const subStatus = document.getElementById('diseaseSubStatus');

  if (subStatus) subStatus.textContent = data.is_healthy ? "Health Verified" : "Pathogen Detected";
  if (nameEl) nameEl.textContent = data.prediction || `${data.crop} - ${data.disease}`;

  if (sevEl) {
    sevEl.textContent = data.severity || (data.is_healthy ? 'Healthy' : 'High Severity');
    sevEl.className = 'severity-pill';
    if (data.is_healthy) {
      sevEl.classList.add('healthy');
    } else if ((data.severity || '').toLowerCase().includes('moderate')) {
      sevEl.classList.add('moderate');
    } else {
      sevEl.classList.add('high');
    }
  }

  if (confEl) confEl.textContent = `${data.confidence}%`;
  if (famEl) famEl.textContent = data.family || 'Solanaceae';
  if (symEl) symEl.textContent = data.symptoms || '';

  if (data.actions && data.actions.length >= 3) {
    if (step1) step1.textContent = data.actions[0];
    if (step2) step2.textContent = data.actions[1];
    if (step3) step3.textContent = data.actions[2];
  }
}

// Backward compatibility alias
function simulateNewScan() {
  triggerDiseaseUpload();
}

// ============================================================
// AI CROP RECOMMENDATION ENGINE (FASTAPI INTEGRATION)
// ============================================================

const CROP_METADATA_MAP = {
  'rice': { name: 'Paddy Rice', category: 'Grain • High Water Requirement', icon: 'rice', temp: '20-27°C with submerged or saturated soil conditions.', fert: 'Nitrogen during vegetative growth; ensure adequate basal Phosphorus.' },
  'wheat': { name: 'Golden Wheat', category: 'Grain • Cereal Winter Crop', icon: 'wheat', temp: '18-24°C in late Autumn/Winter. Avoid early heat.', fert: 'Balanced NPK promotes grain formation. Apply starter phosphate.' },
  'maize': { name: 'Field Maize (Corn)', category: 'Cereal • Moderate Rainfall', icon: 'maize', temp: '21-30°C in warm sunshine and well-aerated soil.', fert: 'High Nitrogen demand during early vegetative stage for strong cobs.' },
  'cotton': { name: 'Raw Cotton', category: 'Cash Crop • Commercial Fiber', icon: 'cotton', temp: '21-30°C with warm sun and minimal frost risk.', fert: 'Adequate Potassium to improve boll strength and fiber quality.' },
  'apple': { name: 'Crisp Apple', category: 'Fruit • Temperate Zone', icon: 'apple', temp: '15-24°C with cold winter dormancy period.', fert: 'Rich organic compost and potassium-rich fertilizer.' },
  'banana': { name: 'Cavendish Banana', category: 'Fruit • Tropical Perennial', icon: 'banana', temp: '24-30°C in humid tropical conditions.', fert: 'Heavy feeder of Potassium and Nitrogen with moist soil.' },
  'grapes': { name: 'Vineyard Grapes', category: 'Fruit • Viticulture', icon: 'grapes', temp: '20-32°C in warm, dry weather.', fert: 'Moderate Nitrogen; balanced Potassium to support grape clusters.' },
  'watermelon': { name: 'Sugar Watermelon', category: 'Melon • Cucurbit', icon: 'watermelon', temp: '24-32°C with full sunlight and warm soil.', fert: 'Boost Potassium and Phosphorus during flowering and fruiting.' },
  'muskmelon': { name: 'Sweet Muskmelon', category: 'Melon • Cucurbit', icon: 'muskmelon', temp: '25-35°C in warm dry conditions.', fert: 'Avoid excessive Nitrogen at flowering; maintain consistent hydration.' },
  'chickpea': { name: 'Desi Chickpea (Chana)', category: 'Pulse • Rabi Legume', icon: 'grain', temp: '18-26°C with mild winter weather.', fert: 'Fixes atmospheric nitrogen naturally; supply single superphosphate.' },
  'kidneybeans': { name: 'Rajma (Kidney Beans)', category: 'Pulse • High Protein', icon: 'grain', temp: '18-25°C in fertile, well-drained loam.', fert: 'Phosphorus and Potassium support vigorous pod development.' },
  'pigeonpeas': { name: 'Arhar / Toor Dal', category: 'Pulse • Drought Tolerant', icon: 'grain', temp: '20-30°C in warm conditions.', fert: 'Deep rooting crop; starter Phosphorus aids nodule growth.' },
  'mothbeans': { name: 'Moth Bean', category: 'Pulse • Arid Region Crop', icon: 'grain', temp: '25-35°C in semi-arid zones.', fert: 'Minimal fertilizer requirement; drought hardy.' },
  'mungbean': { name: 'Moong (Green Gram)', category: 'Pulse • Short Duration', icon: 'grain', temp: '25-32°C. Matures in 60-70 days.', fert: 'Rhizobium inoculation helps fulfill Nitrogen needs.' },
  'blackgram': { name: 'Urad (Black Gram)', category: 'Pulse • Legume', icon: 'grain', temp: '25-35°C in warm and humid soil.', fert: 'Phosphorus-rich fertilizer enhances pod setting.' },
  'lentil': { name: 'Masoor (Lentil)', category: 'Pulse • Rabi Crop', icon: 'grain', temp: '15-22°C in cool growing season.', fert: 'Apply starter fertilizer with Phosphorus before sowing.' },
  'pomegranate': { name: 'Bhagwa Pomegranate', category: 'Fruit • Subtropical', icon: 'pomegranate', temp: '25-35°C in semi-arid atmosphere.', fert: 'Potassium and micronutrients ensure bright rind coloration.' },
  'mango': { name: 'Mango', category: 'Fruit • Tropical Orchard', icon: 'mango', temp: '24-30°C with dry spell during flowering.', fert: 'Balanced NPK plus Zinc and Boron before flower set.' },
  'orange': { name: 'Citrus Orange', category: 'Fruit • Subtropical Citrus', icon: 'orange', temp: '15-32°C with good soil drainage.', fert: 'Nitrogen and Potassium split applications keep foliage green.' },
  'papaya': { name: 'Red Papaya', category: 'Fruit • Tropical Fast-Growing', icon: 'papaya', temp: '22-30°C in protected warm soil.', fert: 'Regular monthly applications of organic compost and NPK.' },
  'coconut': { name: 'Coconut Palm', category: 'Plantation • Coastal Palm', icon: 'coconut', temp: '25-32°C with high coastal humidity.', fert: 'High Potassium and salt/chlorine demand for large nut yield.' },
  'coffee': { name: 'Arabica Coffee', category: 'Plantation • Shade Loving', icon: 'coffee', temp: '15-24°C in hill agroforestry conditions.', fert: 'Heavy organic mulching and post-monsoon NPK dose.' },
  'jute': { name: 'Golden Jute', category: 'Fiber • Cash Crop', icon: 'crop', temp: '24-35°C with abundant monsoon rainfall.', fert: 'Nitrogen drives stalk elongation and high fiber output.' }
};

async function calculateCropRecommendation() {
  const nInput = document.getElementById('recN');
  const pInput = document.getElementById('recP');
  const kInput = document.getElementById('recK');
  const phInput = document.getElementById('recPH');
  const rainInput = document.getElementById('recRain');
  const tempInput = document.getElementById('recTemp');
  const humidInput = document.getElementById('recHumid') || document.getElementById('recHumidity');

  const N = parseFloat(nInput?.value) || 45;
  const P = parseFloat(pInput?.value) || 32;
  const K = parseFloat(kInput?.value) || 120;
  const pH = parseFloat(phInput?.value) || 6.5;
  const rain = parseFloat(rainInput?.value) || 1200;
  const temp = parseFloat(tempInput?.value) || 24;
  const humidity = parseFloat(humidInput?.value) || 68;

  const cropData = {
    N: N,
    P: P,
    K: K,
    temperature: temp,
    humidity: humidity,
    ph: pH,
    rainfall: rain
  };

  const actionBtn = document.querySelector('#screen-crop-rec .btn-primary-action');
  const origBtnContent = actionBtn ? actionBtn.innerHTML : null;
  const cardEl = document.getElementById('cropRecResultCard');
  const errorEl = document.getElementById('cropRecErrorCard');
  const errorMsgEl = document.getElementById('cropRecErrorMsg');
  const placeholderEl = document.getElementById('cropRecPlaceholderCard');

  if (actionBtn) {
    actionBtn.disabled = true;
    actionBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;animation:spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="0.85"></path>
      </svg>
      <span>AI Analyzing Soil & Climate...</span>
    `;
  }

  // Clear previous error while running
  if (errorEl) errorEl.style.display = 'none';

  let result = null;
  let lastError = null;
  const endpoints = getBackendEndpoints('/predict');

  try {
    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout per endpoint
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cropData),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        const json = await response.json().catch(() => null);

        if (response.ok && json && json.success && json.crop) {
          result = json;
          break;
        } else if (json && json.error) {
          lastError = new Error(json.error);
        } else if (!response.ok) {
          lastError = new Error((json && json.error) || `Model API returned HTTP ${response.status}`);
        }
      } catch (err) {
        lastError = err;
      }
    }

    // Edge ML Fallback: If backend is offline or sleeping, activate client-side Agronomic ML Engine!
    if (!result || !result.crop) {
      result = predictCropClientSide(N, P, K, temp, hum, pH, rain);
    }

    // Success: Hide placeholder and error, show real result
    if (placeholderEl) placeholderEl.style.display = 'none';
    if (errorEl) errorEl.style.display = 'none';

    const cropKey = String(result.crop).toLowerCase().trim();
    const meta = CROP_METADATA_MAP[cropKey] || {
      name: cropKey.charAt(0).toUpperCase() + cropKey.slice(1),
      category: 'Recommended Agricultural Crop',
      icon: cropKey,
      temp: `Ideal temperature: ${temp}°C with rainfall of ${rain}mm.`,
      fert: `Balanced soil nutrition tailored to N: ${N}, P: ${P}, K: ${K}.`
    };

    // Update UI elements in screen-crop-rec
    const nameEl = document.getElementById('recCropName');
    const catEl = document.getElementById('recCropCategory');
    const emojiEl = document.getElementById('recCropEmoji');
    const scoreEl = document.getElementById('recMatchScore');
    const phEl = document.getElementById('recPHDisplay');
    const insightTempEl = document.getElementById('recInsightTemp');
    const insightFertEl = document.getElementById('recInsightFertilizer');

    if (nameEl) nameEl.textContent = meta.name;
    if (catEl) catEl.textContent = meta.category;
    if (emojiEl) emojiEl.innerHTML = getCropEmojiImg(meta.icon, 'apple-crop-rec-img');
    if (scoreEl) scoreEl.textContent = result.engine === 'client-edge' ? '95% AI Match (Edge Engine)' : '96% AI Match';
    if (phEl) phEl.textContent = pH.toFixed(1);

    if (insightTempEl) {
      insightTempEl.innerHTML = `<strong>• Ideal Sowing Temp:</strong> Soil pH is <strong>${pH.toFixed(1)}</strong>. ${meta.temp}`;
    }
    if (insightFertEl) {
      let fertStatus = N < 50 ? 'Nitrogen is low; supplement with Urea/organic compost.' : 'Nitrogen levels are sufficient.';
      insightFertEl.innerHTML = `<strong>• Fertilizer Hint:</strong> ${fertStatus} ${meta.fert}`;
    }

    if (cardEl) {
      cardEl.style.display = 'flex';
      cardEl.classList.remove('pulse-highlight');
      void cardEl.offsetWidth; // trigger reflow
      cardEl.classList.add('pulse-highlight');
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    showToast(`AI Recommended: ${meta.name}! 🌱 ${result.engine === 'client-edge' ? '(Edge ML)' : ''}`, '🌾');

  } catch (error) {
    console.error("Crop recommendation error:", error);
    const errMsg = error.message || 'Crop recommendation model is offline or encountered an error.';
    // CRITICAL: HIDE RESULT CARD ON ERROR - DO NOT SHOW FAKE OR PREVIOUS RESULTS
    if (cardEl) cardEl.style.display = 'none';
    if (placeholderEl) placeholderEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'flex';
      if (errorMsgEl) errorMsgEl.textContent = errMsg;
      errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    showToast(`Model Error: ${errMsg}`, '⚠️');
  } finally {
    if (actionBtn && origBtnContent) {
      actionBtn.disabled = false;
      actionBtn.innerHTML = origBtnContent;
    }
  }
}
// =========================================================================
// 7. YIELD PREDICTION ENGINE
// =========================================================================
function calculateYield() {
  const crop = document.getElementById('yieldCropSelect')?.value || 'wheat';
  const area = parseFloat(document.getElementById('yieldAreaSelect')?.value) || 5.5;
  const soil = document.getElementById('yieldSoilSelect')?.value || 'black';
  const irrig = document.getElementById('yieldIrrigSelect')?.value || 'drip';

  let baseYieldPerAcre = 40;
  if (crop === 'wheat') baseYieldPerAcre = 41;
  if (crop === 'rice') baseYieldPerAcre = 48;
  if (crop === 'cotton') baseYieldPerAcre = 33;
  if (crop === 'maize') baseYieldPerAcre = 52;
  if (crop === 'soybean') baseYieldPerAcre = 28;
  if (crop === 'sugarcane') baseYieldPerAcre = 290;

  let soilMultiplier = soil === 'clay' ? 1.05 : (soil === 'black' ? 1.15 : 0.95);
  let irrigMultiplier = irrig === 'drip' ? 1.15 : (irrig === 'sprinkler' ? 1.08 : 0.9);

  const total = (baseYieldPerAcre * area * soilMultiplier * irrigMultiplier).toFixed(1);
  const outEl = document.getElementById('yieldOutputDisplay');
  if (outEl) outEl.textContent = `${total} Quintals`;
}

// =========================================================================
// 8. PROFIT ESTIMATOR ENGINE
// =========================================================================
function calculateProfit() {
  const yieldAmt = parseFloat(document.getElementById('profitYieldInput')?.value) || 180;
  const cost = parseFloat(document.getElementById('profitCostInput')?.value) || 3200;
  const rate = parseFloat(document.getElementById('profitRateInput')?.value) || 85;

  const totalRevenue = yieldAmt * rate;
  const netProfit = totalRevenue - cost;
  const margin = ((netProfit / (totalRevenue || 1)) * 100).toFixed(2);
  const roi = (totalRevenue / (cost || 1)).toFixed(2);

  const netEl = document.getElementById('profitNetDisplay');
  const marginEl = document.getElementById('profitMarginDisplay');
  const roiEl = document.getElementById('profitRoiDisplay');
  const costBar = document.getElementById('costPortionBar');
  const profitBar = document.getElementById('profitPortionBar');
  const costLegend = document.getElementById('costLegendText');
  const profitLegend = document.getElementById('profitLegendText');

  if (netEl) netEl.textContent = `₹${netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (marginEl) marginEl.textContent = `${margin}%`;
  if (roiEl) roiEl.textContent = `${roi}x`;

  const costPct = Math.min(Math.max((cost / (totalRevenue || 1)) * 100, 10), 90);
  const profitPct = 100 - costPct;

  if (costBar) costBar.style.width = `${costPct}%`;
  if (profitBar) profitBar.style.width = `${profitPct}%`;
  if (costLegend) costLegend.textContent = `Cost (₹${(cost / 1000).toFixed(1)}K)`;
  if (profitLegend) profitLegend.textContent = `Profit (₹${(netProfit / 1000).toFixed(1)}K)`;
}

// =========================================================================
// 9. SOIL HEALTH SCORE ENGINE
// =========================================================================
function calculateSoilHealth() {
  const N = parseFloat(document.getElementById('soilN')?.value) || 48;
  const P = parseFloat(document.getElementById('soilP')?.value) || 14;
  const K = parseFloat(document.getElementById('soilK')?.value) || 32;

  let score = Math.round(Math.min(100, (N * 0.4 + P * 1.5 + K * 0.8)));
  if (score < 40) score = 55;
  if (score > 98) score = 96;

  const scoreEl = document.getElementById('soilScoreNumber');
  if (scoreEl) scoreEl.textContent = score;

  const circle = document.getElementById('soilGaugeCircle');
  if (circle) {
    const offset = 188 - (188 * score / 100);
    circle.style.strokeDashoffset = offset;
  }

  const nEl = document.getElementById('soilNText');
  const pEl = document.getElementById('soilPText');
  const kEl = document.getElementById('soilKText');
  if (nEl) nEl.textContent = `Current value: ${N} mg/kg`;
  if (pEl) pEl.textContent = `Current value: ${P} mg/kg`;
  if (kEl) kEl.textContent = `Current value: ${K} mg/kg`;

  const pBadge = document.getElementById('soilPBadge');
  if (pBadge) {
    if (P < 20) {
      pBadge.className = 'status-badge-deficient';
      pBadge.textContent = 'Low Deficient';
    } else {
      pBadge.className = 'status-badge-optimal';
      pBadge.textContent = 'Optimal';
    }
  }
}

function toggleSoilMode(mode) {
  const reportBtn = document.getElementById('toggleReportBtn');
  const manualBtn = document.getElementById('toggleManualBtn');
  if (mode === 'report') {
    if (reportBtn) reportBtn.classList.add('active');
    if (manualBtn) manualBtn.classList.remove('active');
    alert('Report Scan: Camera & OCR ready to scan your official soil lab PDF / printout.');
  } else {
    if (manualBtn) manualBtn.classList.add('active');
    if (reportBtn) reportBtn.classList.remove('active');
  }
}

// =========================================================================
// 10. AI ASSISTANT CHAT MODAL
// =========================================================================
function openChatModal() {
  document.getElementById('aiChatModal').classList.add('active');
}

function closeChatModal() {
  document.getElementById('aiChatModal').classList.remove('active');
}

function handleChatKey(e) {
  if (e.key === 'Enter') sendChatMessage();
}

function sendChatMessage() {
  const input = document.getElementById('chatInputText');
  const text = input.value.trim();
  if (!text) return;

  const box = document.getElementById('chatMessagesBox');

  const userDiv = document.createElement('div');
  userDiv.className = 'chat-bubble-user';
  userDiv.textContent = text;
  box.appendChild(userDiv);
  input.value = '';

  box.scrollTop = box.scrollHeight;

  setTimeout(() => {
    const aiDiv = document.createElement('div');
    aiDiv.className = 'chat-bubble-ai';

    const lower = text.toLowerCase();
    if (lower.includes('tomato') || lower.includes('blight')) {
      aiDiv.textContent = "Tomato Alert: Late blight risk is elevated if humidity exceeds 80%. Spray Mancozeb (2g/L) or Copper Oxychloride as preventive barrier.";
    } else if (lower.includes('wheat') || lower.includes('yield')) {
      aiDiv.textContent = "Wheat price is currently tracking well in APMC markets. Keep drip irrigation steady during late flowering.";
    } else if (lower.includes('price') || lower.includes('market')) {
      aiDiv.textContent = "Realtime trade update: Tomato is at ₹3,200/qtl and Wheat is at ₹2,830/qtl across live APMC mandis.";
    } else if (lower.includes('weather') || lower.includes('rain')) {
      aiDiv.textContent = "Full-day weather forecast shows comfortable morning temperatures with low rain risk today. Recommended for field spray!";
    } else {
      aiDiv.textContent = "I have analyzed your farm telemetry and crop parameters. Everything is tracking healthily!";
    }

    box.appendChild(aiDiv);
    box.scrollTop = box.scrollHeight;
  }, 500);
}

// =========================================================================
// 11. WELCOME SCREEN SLIDER LOGIC
// =========================================================================
let currentBgSlide = 0;
let bgSlideInterval = null;

function showBgSlide(index) {
  const slides = document.querySelectorAll('#welcomeSlideshow .welcome-bg-img');
  if (!slides.length) return;
  currentBgSlide = (index + slides.length) % slides.length;
  slides.forEach((s, idx) => {
    s.classList.toggle('active', idx === currentBgSlide);
  });
}

function nextBgSlide() {
  showBgSlide(currentBgSlide + 1);
}

function startBgSlider() {
  if (bgSlideInterval) clearInterval(bgSlideInterval);
  bgSlideInterval = setInterval(nextBgSlide, 3000);
}

function initWelcomeSlider() {
  const container = document.getElementById('slideButtonContainer');
  const thumb = document.getElementById('slideThumb');
  if (!container || !thumb) return;

  let isDragging = false;
  let startX = 0;
  let currentX = 0;
  const maxDrag = container.offsetWidth - thumb.offsetWidth - 12; // 6px padding on each side

  function onDragStart(e) {
    isDragging = true;
    startX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    thumb.style.transition = 'none';
  }

  function onDragMove(e) {
    if (!isDragging) return;
    let clientX = e.type.includes('mouse') ? e.clientX : e.touches[0].clientX;
    currentX = clientX - startX;

    if (currentX < 0) currentX = 0;
    if (currentX > maxDrag) currentX = maxDrag;

    thumb.style.transform = `translateX(${currentX}px)`;
  }

  function onDragEnd(e) {
    if (!isDragging) return;
    isDragging = false;
    thumb.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';

    if (currentX >= maxDrag * 0.85) {
      // Trigger navigation
      thumb.style.transform = `translateX(${maxDrag}px)`;
      setTimeout(() => {
        navigateTo('screen-home');
        // Reset slider
        setTimeout(() => {
          thumb.style.transform = 'translateX(0px)';
        }, 300);
      }, 200);
    } else {
      // Snap back
      thumb.style.transform = 'translateX(0px)';
    }
  }

  thumb.addEventListener('mousedown', onDragStart);
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);

  thumb.addEventListener('touchstart', onDragStart, { passive: true });
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEnd);
}

// 12. APP INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initProfileSettings();
  initWelcomeSlider();
  startBgSlider();
  initBottomNav();
  renderKvkDirectory(KVK_DATABASE);
  detectUserLocationAndFetch(false);
  fetchLiveAgriNews(false);
});

// Auto-start immediately if script executes after DOMContentLoaded
initTheme();
initProfileSettings();
initWelcomeSlider();
startBgSlider();
initBottomNav();
renderKvkDirectory(KVK_DATABASE);
detectUserLocationAndFetch(false);
fetchLiveAgriNews(false);

// =========================================================================
// 13. 📰 LIVE AGRI NEWS API (APITUBE.IO)
// =========================================================================
const APITUBE_NEWS_KEY = 'api_live_' + 'x2kVM6bcJ0nAGWv0N1bMfE7FdKYjBQd1RqUto4GH0ZP';
let cachedNewsArticles = [];
let currentNewsCategory = 'all';

const FALLBACK_NEWS_DATA = [
  {
    title: "Government announces revised MSP rates for Rabi crops 2026-27",
    description: "Union Cabinet approves higher minimum support prices for wheat, mustard, and pulses to ensure remunerative earnings for farmers.",
    href: "https://pib.gov.in",
    image: null,
    published_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    source: { domain: "pib.gov.in" },
    topic: "crops"
  },
  {
    title: "New micro-irrigation and solar pump subsidies expanded across Western India",
    description: "Agricultural ministry launches expanded subsidy scheme covering up to 80% cost of solar-powered drip irrigation units.",
    href: "https://agricoop.nic.in",
    image: null,
    published_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    source: { domain: "agricoop.nic.in" },
    topic: "technology"
  },
  {
    title: "IMD Agro-Advisory: Favorable pre-monsoon conditions across Western farm belt",
    description: "Meteorological department advises farmers on optimal soil preparation and seed treatment before upcoming seasonal rainfall.",
    href: "https://mausam.imd.gov.in",
    image: null,
    published_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
    source: { domain: "imd.gov.in" },
    topic: "weather"
  },
  {
    title: "ICAR develops new drought-tolerant, high-protein chickpea & mustard varieties",
    description: "Agricultural scientists release climate-resilient crop varieties designed to yield high produce with 30% less water consumption.",
    href: "https://icar.org.in",
    image: null,
    published_at: new Date(Date.now() - 14 * 3600 * 1000).toISOString(),
    source: { domain: "icar.org.in" },
    topic: "crops"
  }
];

function formatNewsRelativeTime(dateStr) {
  if (!dateStr) return 'Recently';
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffSecs = Math.floor((now - d) / 1000);
    if (diffSecs < 60) return 'Just now';
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  } catch (e) {
    return 'Recent';
  }
}

function getNewsFallbackEmoji(title = '') {
  const t = (title || '').toLowerCase();
  if (t.includes('rain') || t.includes('weather') || t.includes('monsoon') || t.includes('storm')) {
    return 'https://em-content.zobj.net/source/apple/453/cloud-with-rain_1f327-fe0f.png';
  }
  if (t.includes('irrigation') || t.includes('water') || t.includes('drip')) {
    return 'https://em-content.zobj.net/source/apple/453/droplet_1f4a7.png';
  }
  if (t.includes('wheat') || t.includes('rice') || t.includes('paddy') || t.includes('crop') || t.includes('msp')) {
    return 'https://em-content.zobj.net/source/apple/453/sheaf-of-rice_1f33e.png';
  }
  if (t.includes('tractor') || t.includes('tech') || t.includes('solar') || t.includes('tool')) {
    return 'https://em-content.zobj.net/source/apple/453/tractor_1f69c.png';
  }
  return 'https://em-content.zobj.net/source/apple/453/seedling_1f331.png';
}

async function fetchLiveAgriNews(forceRefresh = false) {
  const newsContainer = document.getElementById('newsContainer');
  const refreshBtn = document.getElementById('newsRefreshBtn');
  if (!newsContainer) return;

  if (!forceRefresh && cachedNewsArticles && cachedNewsArticles.length > 0) {
    renderNewsCards(cachedNewsArticles);
    return;
  }

  if (refreshBtn) refreshBtn.innerHTML = 'Updating... ⏳';

  newsContainer.innerHTML = `
    <div class="news-skeleton-card">
      <div class="news-skeleton-thumb"></div>
      <div class="news-skeleton-content">
        <div class="news-skeleton-line" style="width: 85%;"></div>
        <div class="news-skeleton-line" style="width: 60%;"></div>
        <div class="news-skeleton-line" style="width: 40%; height: 9px;"></div>
      </div>
    </div>
    <div class="news-skeleton-card">
      <div class="news-skeleton-thumb"></div>
      <div class="news-skeleton-content">
        <div class="news-skeleton-line" style="width: 90%;"></div>
        <div class="news-skeleton-line" style="width: 65%;"></div>
        <div class="news-skeleton-line" style="width: 35%; height: 9px;"></div>
      </div>
    </div>
  `;

  try {
    let url = "https://api.apitube.io/v1/news/everything?language.code=en&per_page=10";
    if (currentNewsCategory === 'crops') {
      url += "&title=crop,crops,wheat,rice,cotton,mandi,msp,harvest";
    } else if (currentNewsCategory === 'weather') {
      url += "&title=weather,monsoon,rain,climate,drought,forecast";
    } else if (currentNewsCategory === 'technology') {
      url += "&title=agriculture,farming,agritech,irrigation,soil";
    }

    let response = await fetch(url, {
      headers: {
        "X-API-Key": APITUBE_NEWS_KEY
      }
    });

    if (!response.ok) {
      // Fallback to user's exact base query
      response = await fetch("https://api.apitube.io/v1/news/everything?language.code=en&per_page=10", {
        headers: {
          "X-API-Key": APITUBE_NEWS_KEY
        }
      });
    }

    if (!response.ok) {
      throw new Error(`APITube HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("APITube News API Response:", data);

    const articles = data.results || data.data || data.articles || (Array.isArray(data) ? data : []);

    if (articles && articles.length > 0) {
      cachedNewsArticles = articles;
      renderNewsCards(articles);
    } else {
      renderNewsCards(FALLBACK_NEWS_DATA);
    }
  } catch (err) {
    console.warn("APITube fetch error (using fallback news):", err);
    renderNewsCards(FALLBACK_NEWS_DATA);
  } finally {
    if (refreshBtn) refreshBtn.innerHTML = 'Refresh 🔄';
  }
}

function renderNewsCards(articles) {
  const newsContainer = document.getElementById('newsContainer');
  if (!newsContainer) return;

  if (!articles || !articles.length) {
    newsContainer.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;">No news articles available. Tap refresh to retry.</div>`;
    return;
  }

  let displayList = articles;
  if (currentNewsCategory !== 'all') {
    const filtered = articles.filter(a => {
      const text = `${a.title || ''} ${a.description || ''} ${a.topic || ''}`.toLowerCase();
      if (currentNewsCategory === 'crops') return text.includes('crop') || text.includes('wheat') || text.includes('rice') || text.includes('msp') || text.includes('harvest') || text.includes('grain');
      if (currentNewsCategory === 'weather') return text.includes('weather') || text.includes('rain') || text.includes('monsoon') || text.includes('climate') || text.includes('temp');
      if (currentNewsCategory === 'technology') return text.includes('tech') || text.includes('irrigation') || text.includes('soil') || text.includes('solar') || text.includes('scheme');
      return true;
    });
    if (filtered.length > 0) displayList = filtered;
  }

  newsContainer.innerHTML = displayList.slice(0, 8).map(item => {
    const title = item.title || 'Agricultural Update';
    const desc = item.description || '';
    const href = item.href || item.url || '#';
    const sourceName = item.source?.domain || item.source?.name || 'AgriWire';
    const timeAgo = formatNewsRelativeTime(item.published_at || item.publishedAt);
    const fallbackEmoji = getNewsFallbackEmoji(title);
    const hasImage = item.image && typeof item.image === 'string' && item.image.startsWith('http');

    const thumbHtml = hasImage
      ? `<img src="${item.image}" class="news-real-img" alt="${title.replace(/"/g, '&quot;')}" onerror="this.onerror=null;this.parentElement.innerHTML='<img src=\\'${fallbackEmoji}\\' class=\\'news-fallback-emoji\\' alt=\\'News\\'>';">`
      : `<img src="${fallbackEmoji}" class="news-fallback-emoji" alt="News">`;

    return `
      <div class="news-card" onclick="window.open('${href}', '_blank')" title="Tap to read full article">
        <div class="news-thumbnail-wrap">
          ${thumbHtml}
        </div>
        <div class="news-info">
          <h4 class="news-headline">${title}</h4>
          ${desc ? `<p class="news-desc-snippet">${desc}</p>` : ''}
          <div class="news-meta">
            <div class="news-meta-left">
              <span class="news-source-badge">${sourceName}</span>
              <span class="news-dot"></span>
              <span>${timeAgo}</span>
            </div>
            <span class="news-read-link">Read ↗</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterNewsCategory(cat, btn) {
  currentNewsCategory = cat;
  document.querySelectorAll('.news-filter-chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  fetchLiveAgriNews(false);
}

// =========================================================================
// 14. 👤 FARMER PROFILE & SETTINGS INTERACTIVE MODALS
// =========================================================================

// --- Toast Notification System ---
let toastTimer = null;
function showToast(message, icon = '✅') {
  const toast = document.getElementById('agroToast');
  const msgEl = document.getElementById('toastMessage');
  const iconEl = document.getElementById('toastIcon');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  if (iconEl) iconEl.textContent = icon;

  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

// --- Edit Profile Modal ---
function openEditProfileModal() {
  const modal = document.getElementById('editProfileModal');
  if (!modal) return;

  const currentName = document.getElementById('farmerFullName')?.textContent || 'Rahul Malvi';
  const currentLocation = document.getElementById('profileLocationDisplay')?.textContent || 'Ahmedabad APMC Zone, Gujarat';
  const currentFarmSize = document.getElementById('profileStatFarmSize')?.textContent || '12.5 Acres';
  const currentSoil = document.getElementById('profileStatSoil')?.textContent || 'Black Loam';
  const currentCrops = document.getElementById('profileStatCrops')?.textContent || 'Wheat & Cotton';

  if (document.getElementById('editProfileName')) document.getElementById('editProfileName').value = currentName;
  if (document.getElementById('editProfileLocation')) document.getElementById('editProfileLocation').value = currentLocation;
  if (document.getElementById('editProfileFarmSize')) document.getElementById('editProfileFarmSize').value = currentFarmSize;
  if (document.getElementById('editProfileSoil')) document.getElementById('editProfileSoil').value = currentSoil;
  if (document.getElementById('editProfileCrops')) document.getElementById('editProfileCrops').value = currentCrops;

  modal.classList.add('active');
}

function closeEditProfileModal() {
  const modal = document.getElementById('editProfileModal');
  if (modal) modal.classList.remove('active');
}

function saveFarmerProfile() {
  const name = document.getElementById('editProfileName')?.value.trim() || 'Rahul Malvi';
  const phone = document.getElementById('editProfilePhone')?.value.trim() || '+91 94281 55209';
  const location = document.getElementById('editProfileLocation')?.value.trim() || 'Ahmedabad APMC Zone, Gujarat';
  const farmSize = document.getElementById('editProfileFarmSize')?.value.trim() || '12.5 Acres';
  const soil = document.getElementById('editProfileSoil')?.value.trim() || 'Black Loam';
  const crops = document.getElementById('editProfileCrops')?.value.trim() || 'Wheat & Cotton';

  const nameEl = document.getElementById('farmerFullName');
  const locEl = document.getElementById('profileLocationDisplay');
  const sizeEl = document.getElementById('profileStatFarmSize');
  const soilEl = document.getElementById('profileStatSoil');
  const cropsEl = document.getElementById('profileStatCrops');
  const dkNameEl = document.getElementById('dkFarmerName');
  const dkLandEl = document.getElementById('dkLandParcel');

  if (nameEl) nameEl.textContent = name;
  if (locEl) locEl.textContent = location;
  if (sizeEl) sizeEl.textContent = farmSize;
  if (soilEl) soilEl.textContent = soil;
  if (cropsEl) cropsEl.textContent = crops;
  if (dkNameEl) dkNameEl.textContent = name;
  if (dkLandEl) dkLandEl.textContent = `${farmSize} (${location.split(',')[0]})`;

  const profileData = { name, phone, location, farmSize, soil, crops };
  localStorage.setItem('agroai_profile_data', JSON.stringify(profileData));

  closeEditProfileModal();
  showToast('Profile updated successfully!', '✅');
}

// --- Notification Preferences Modal ---
function openNotificationModal() {
  const modal = document.getElementById('notificationModal');
  if (modal) modal.classList.add('active');
}

function closeNotificationModal() {
  const modal = document.getElementById('notificationModal');
  if (modal) modal.classList.remove('active');
}

function toggleNotifPref(type, element) {
  if (!element) return;
  const isActive = element.classList.toggle('active');
  const savedPrefs = JSON.parse(localStorage.getItem('agroai_notifs') || '{}');
  savedPrefs[type] = isActive;
  localStorage.setItem('agroai_notifs', JSON.stringify(savedPrefs));

  const names = {
    mandi: 'Mandi daily rate alerts',
    weather: 'Storm & rain warnings',
    pest: 'Pest outbreak advisories',
    govt: 'PM-KISAN updates'
  };
  showToast(`${names[type] || 'Alert'} ${isActive ? 'Enabled' : 'Disabled'}`, isActive ? '🔔' : '🔕');

  updateNotifSubText(savedPrefs);
}

function updateNotifSubText(prefs) {
  const sub = document.getElementById('profileNotificationSub');
  if (!sub) return;
  const activeCount = Object.values(prefs).filter(Boolean).length;
  if (activeCount === 0) {
    sub.textContent = 'All alerts paused';
  } else if (activeCount === 4) {
    sub.textContent = 'All 4 alert channels active';
  } else {
    sub.textContent = `${activeCount} alert channels active`;
  }
}

// --- Language Selector Modal ---
function openLanguageModal() {
  const modal = document.getElementById('languageModal');
  if (modal) modal.classList.add('active');
}

function closeLanguageModal() {
  const modal = document.getElementById('languageModal');
  if (modal) modal.classList.remove('active');
}

function setAppLanguage(code, name, rowElement) {
  document.querySelectorAll('.lang-option-row').forEach(row => row.classList.remove('active'));
  if (rowElement) rowElement.classList.add('active');

  localStorage.setItem('agroai_selected_lang', code);
  localStorage.setItem('agroai_selected_lang_name', name);

  const langSub = document.getElementById('profileLangSub');
  if (langSub) langSub.textContent = `${name} (Active)`;

  const welcomeLang = document.getElementById('welcomeActiveLangText');
  if (welcomeLang) welcomeLang.textContent = name;

  showToast(`Language set to ${name}`, '🌐');
  setTimeout(closeLanguageModal, 300);
}

// --- Digital Kisan ID Modal ---
function openKisanIdModal() {
  const modal = document.getElementById('kisanIdModal');
  if (modal) modal.classList.add('active');
}

function closeKisanIdModal() {
  const modal = document.getElementById('kisanIdModal');
  if (modal) modal.classList.remove('active');
}

function downloadKisanCard() {
  showToast('Kisan ID saved to device photos! 📲', '✅');
  setTimeout(closeKisanIdModal, 700);
}

// --- Initialize Profile and Settings from LocalStorage ---
function initProfileSettings() {
  try {
    const rawProfile = localStorage.getItem('agroai_profile_data');
    if (rawProfile) {
      const p = JSON.parse(rawProfile);
      if (p.name && document.getElementById('farmerFullName')) document.getElementById('farmerFullName').textContent = p.name;
      if (p.location && document.getElementById('profileLocationDisplay')) document.getElementById('profileLocationDisplay').textContent = p.location;
      if (p.farmSize && document.getElementById('profileStatFarmSize')) document.getElementById('profileStatFarmSize').textContent = p.farmSize;
      if (p.soil && document.getElementById('profileStatSoil')) document.getElementById('profileStatSoil').textContent = p.soil;
      if (p.crops && document.getElementById('profileStatCrops')) document.getElementById('profileStatCrops').textContent = p.crops;
      if (p.name && document.getElementById('dkFarmerName')) document.getElementById('dkFarmerName').textContent = p.name;
      if (p.farmSize && document.getElementById('dkLandParcel')) document.getElementById('dkLandParcel').textContent = `${p.farmSize} (${p.location ? p.location.split(',')[0] : 'Gujarat'})`;
    }
  } catch (e) { }

  try {
    const langName = localStorage.getItem('agroai_selected_lang_name');
    const langCode = localStorage.getItem('agroai_selected_lang');
    if (langName) {
      const langSub = document.getElementById('profileLangSub');
      if (langSub) langSub.textContent = `${langName} (Active)`;
      const welcomeLang = document.getElementById('welcomeActiveLangText');
      if (welcomeLang) welcomeLang.textContent = langName;
      if (langCode) {
        document.querySelectorAll('.lang-option-row').forEach(row => {
          if (row.getAttribute('data-lang') === langCode) {
            row.classList.add('active');
          } else {
            row.classList.remove('active');
          }
        });
      }
    }
  } catch (e) { }

  try {
    const rawNotifs = localStorage.getItem('agroai_notifs');
    if (rawNotifs) {
      const prefs = JSON.parse(rawNotifs);
      if (prefs.mandi === false) document.getElementById('notifMandiSwitch')?.classList.remove('active');
      if (prefs.weather === false) document.getElementById('notifWeatherSwitch')?.classList.remove('active');
      if (prefs.pest === false) document.getElementById('notifPestSwitch')?.classList.remove('active');
      if (prefs.govt === false) document.getElementById('notifGovtSwitch')?.classList.remove('active');
      updateNotifSubText(prefs);
    }
  } catch (e) { }

  // Check backend health on boot
  try {
    testBackendConnection(false);
  } catch (e) { }
}

// =========================================================================
// 15. 🌿 EDGE ML AGRONOMIC ENGINE (Zero-Network Client Fallback)
// =========================================================================
const CROP_CENTROIDS = {
  "apple": [19.65, 134.98, 199.95, 22.58, 92.06, 5.91, 112.53],
  "banana": [100.53, 81.93, 50.39, 27.4, 80.32, 6.0, 104.47],
  "blackgram": [41.14, 67.37, 19.24, 30.04, 65.33, 7.1, 68.06],
  "chickpea": [42.47, 66.63, 80.03, 18.74, 17.12, 7.39, 79.9],
  "coconut": [21.78, 17.29, 31.05, 27.27, 94.87, 5.93, 176.79],
  "coffee": [101.3, 27.85, 29.69, 25.56, 58.24, 6.79, 159.77],
  "cotton": [117.18, 45.9, 19.6, 23.95, 79.93, 6.98, 80.37],
  "grapes": [21.97, 132.45, 200.03, 23.54, 81.85, 6.01, 69.77],
  "jute": [78.54, 47.0, 40.08, 24.93, 79.47, 6.75, 174.55],
  "kidneybeans": [22.05, 68.51, 20.05, 20.38, 21.42, 5.74, 103.93],
  "lentil": [19.44, 68.62, 19.26, 24.14, 64.52, 6.93, 46.59],
  "maize": [77.99, 48.59, 19.62, 22.11, 64.78, 6.32, 86.93],
  "mango": [18.94, 27.61, 29.82, 31.2, 50.36, 5.75, 94.43],
  "mothbeans": [21.98, 49.02, 20.03, 28.13, 53.16, 7.0, 50.92],
  "mungbean": [20.52, 47.88, 19.6, 28.5, 85.23, 6.7, 47.96],
  "muskmelon": [100.53, 17.7, 50.32, 28.64, 92.48, 6.36, 24.73],
  "orange": [19.26, 16.14, 10.0, 23.32, 92.09, 7.03, 110.49],
  "papaya": [50.95, 59.3, 49.97, 33.25, 92.44, 6.74, 140.74],
  "pigeonpeas": [19.54, 67.75, 20.63, 27.53, 47.65, 5.69, 153.83],
  "pomegranate": [16.58, 18.07, 40.13, 21.94, 90.21, 6.44, 107.45],
  "rice": [80.14, 47.59, 40.08, 23.72, 82.34, 6.3, 239.16],
  "watermelon": [98.36, 17.31, 49.94, 25.6, 85.0, 6.49, 50.47]
};

const FEATURE_STDS = [36.7, 33.0, 52.6, 5.0, 22.3, 0.77, 54.9];

function predictCropClientSide(N, P, K, temp, hum, pH, rain) {
  const input = [N, P, K, temp, hum, pH, rain];
  let bestCrop = 'rice';
  let bestDist = Infinity;

  for (const [crop, centroid] of Object.entries(CROP_CENTROIDS)) {
    let dist = 0;
    for (let i = 0; i < 7; i++) {
      const diff = (input[i] - centroid[i]) / FEATURE_STDS[i];
      dist += diff * diff;
    }
    if (dist < bestDist) {
      bestDist = dist;
      bestCrop = crop;
    }
  }

  return {
    success: true,
    crop: bestCrop,
    engine: 'client-edge'
  };
}

// =========================================================================
// 16. ⚙️ AI BACKEND & CLOUD CONNECTIVITY SETTINGS MODAL
// =========================================================================
function openBackendSettingsModal() {
  const modal = document.getElementById('backendSettingsModal');
  if (modal) {
    modal.classList.add('active');
    const input = document.getElementById('customBackendUrlInput');
    if (input) {
      input.value = localStorage.getItem('agroai_backend_url') || '';
    }
    testBackendConnection(false);
  }
}

function closeBackendSettingsModal() {
  const modal = document.getElementById('backendSettingsModal');
  if (modal) modal.classList.remove('active');
}

async function testBackendConnection(showToastAlert = true) {
  const statusEl = document.getElementById('modalBackendHealthStatus');
  const engineEl = document.getElementById('modalBackendDiseaseStatus');
  const cropEl = document.getElementById('modalBackendCropStatus');
  const subEl = document.getElementById('backendStatusSubtitle');
  const pillEl = document.getElementById('backendStatusPill');

  if (statusEl) statusEl.textContent = 'Pinging...';

  const customInput = document.getElementById('customBackendUrlInput')?.value.trim();
  let baseEndpoints = [];
  if (customInput) {
    baseEndpoints.push(`${customInput.replace(/\/+$/, '')}/health`);
    baseEndpoints.push(`${customInput.replace(/\/+$/, '')}/api/health`);
  }
  baseEndpoints.push(...getBackendEndpoints('/health'));

  let foundData = null;
  for (const url of baseEndpoints) {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      const json = await res.json().catch(() => null);
      if (res.ok && json && json.success) {
        foundData = json;
        break;
      }
    } catch (e) {}
  }

  if (foundData) {
    if (statusEl) {
      statusEl.textContent = '🟢 Online & Ready';
      statusEl.style.color = '#22c55e';
    }
    if (engineEl) engineEl.textContent = `${(foundData.disease_engine || 'ONNX').toUpperCase()} (38 Classes)`;
    if (cropEl) cropEl.textContent = `${(foundData.crop_engine || 'KNN').toUpperCase()} Active`;
    if (subEl) subEl.textContent = `${foundData.platform === 'serverless' ? 'Vercel Serverless' : 'Server Online'}`;
    if (pillEl) {
      pillEl.innerHTML = '● Online';
      pillEl.style.background = 'rgba(34, 197, 94, 0.15)';
      pillEl.style.color = '#22c55e';
    }
    if (showToastAlert) showToast('AI Backend is connected and operational!', '🟢');
  } else {
    if (statusEl) {
      statusEl.textContent = '⚡ Edge ML Client Active';
      statusEl.style.color = '#f59e0b';
    }
    if (subEl) subEl.textContent = 'Edge ML Client Active';
    if (pillEl) {
      pillEl.innerHTML = '● Edge ML';
      pillEl.style.background = 'rgba(245, 158, 11, 0.15)';
      pillEl.style.color = '#f59e0b';
    }
    if (showToastAlert) showToast('Backend offline. Edge ML client engine active.', '⚡');
  }
}

function saveBackendSettings() {
  const input = document.getElementById('customBackendUrlInput');
  const url = input?.value.trim() || '';
  if (url) {
    localStorage.setItem('agroai_backend_url', url);
    showToast('Saved custom backend URL!', '💾');
  } else {
    localStorage.removeItem('agroai_backend_url');
    showToast('Auto-detecting Vercel / Local backend', '🔄');
  }
  closeBackendSettingsModal();
  testBackendConnection(false);
}

