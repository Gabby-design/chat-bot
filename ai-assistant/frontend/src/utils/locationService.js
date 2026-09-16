// ai-assistant/frontend/src/utils/locationService.js
// Client-side location detection, permission handling, caching, and weather service

const CACHE_KEY = 'gabby_location_weather_cache';
const CACHE_TTL_MS = 300000; // 5 minutes (matches maximumAge 300000)

const WMO_CODES = {
  0: { label: 'Clear sky', icon: 'Sun' },
  1: { label: 'Mainly clear', icon: 'Sun' },
  2: { label: 'Partly cloudy', icon: 'CloudSun' },
  3: { label: 'Overcast', icon: 'Cloud' },
  45: { label: 'Foggy', icon: 'CloudFog' },
  48: { label: 'Depositing rime fog', icon: 'CloudFog' },
  51: { label: 'Light drizzle', icon: 'CloudDrizzle' },
  53: { label: 'Moderate drizzle', icon: 'CloudDrizzle' },
  55: { label: 'Dense drizzle', icon: 'CloudDrizzle' },
  56: { label: 'Freezing drizzle', icon: 'CloudSnow' },
  57: { label: 'Dense freezing drizzle', icon: 'CloudSnow' },
  61: { label: 'Slight rain', icon: 'CloudRain' },
  63: { label: 'Moderate rain', icon: 'CloudRain' },
  65: { label: 'Heavy rain', icon: 'CloudRain' },
  66: { label: 'Freezing rain', icon: 'CloudSnow' },
  67: { label: 'Heavy freezing rain', icon: 'CloudSnow' },
  71: { label: 'Slight snowfall', icon: 'CloudSnow' },
  73: { label: 'Moderate snowfall', icon: 'CloudSnow' },
  75: { label: 'Heavy snowfall', icon: 'CloudSnow' },
  77: { label: 'Snow grains', icon: 'CloudSnow' },
  80: { label: 'Slight rain showers', icon: 'CloudRain' },
  81: { label: 'Moderate rain showers', icon: 'CloudRain' },
  82: { label: 'Violent rain showers', icon: 'CloudRain' },
  85: { label: 'Slight snow showers', icon: 'CloudSnow' },
  86: { label: 'Heavy snow showers', icon: 'CloudSnow' },
  95: { label: 'Thunderstorm', icon: 'CloudLightning' },
  96: { label: 'Thunderstorm with hail', icon: 'CloudLightning' },
  99: { label: 'Heavy thunderstorm with hail', icon: 'CloudLightning' }
};

/**
 * Checks current browser permission state for geolocation without prompting
 * @returns {Promise<'granted' | 'denied' | 'prompt'>}
 */
export async function getLocationPermissionStatus() {
  if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.geolocation) {
    return 'prompt';
  }
  try {
    const result = await navigator.permissions.query({ name: 'geolocation' });
    return result.state; // 'granted', 'denied', or 'prompt'
  } catch (err) {
    // Safari iOS may throw or not support querying geolocation permission
    return 'prompt';
  }
}

/**
 * Requests the user's current GPS position via browser Geolocation API
 * @returns {Promise<{ lat: number, lon: number }>}
 */
export function requestBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject({
        code: 2,
        message: 'Geolocation is not supported by your browser',
        isUnavailable: true
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        });
      },
      (error) => {
        // Distinct error handling:
        // error.code 1 = PERMISSION_DENIED
        // error.code 2 = POSITION_UNAVAILABLE
        // error.code 3 = TIMEOUT
        reject({
          code: error.code,
          message: error.message,
          isDenied: error.code === 1,
          isUnavailable: error.code === 2,
          isTimeout: error.code === 3
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      }
    );
  });
}

/**
 * Fetches real-time weather and reverse-geocoded place info from serverless /api/weather
 * @param {{ lat?: number, lon?: number, city?: string }} param0
 */
export async function fetchWeatherAndPlace({ lat, lon, city } = {}) {
  try {
    const res = await fetch('/api/weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lon, city })
    });

    if (res.ok) {
      const data = await res.json();
      saveLocationWeatherCache(data);
      return data;
    }
  } catch (apiErr) {
    console.warn('[LocationService] /api/weather endpoint notice, attempting client fallback:', apiErr.message);
  }

  // Client-side fallback if /api/weather endpoint is unreachable
  return fetchWeatherClientFallback({ lat, lon, city });
}

/**
 * Fallback to direct client-side Open-Meteo API if serverless route is temporarily offline
 */
async function fetchWeatherClientFallback({ lat, lon, city }) {
  let resolvedLat = lat;
  let resolvedLon = lon;
  let placeFormatted = city || 'Current Location';
  let cityName = city || 'Local Area';

  if ((resolvedLat == null || resolvedLon == null) && city) {
    try {
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const first = geoData.results?.[0];
        if (first) {
          resolvedLat = first.latitude;
          resolvedLon = first.longitude;
          cityName = first.name || city;
          placeFormatted = [first.name, first.admin1, first.country].filter(Boolean).join(', ');
        }
      }
    } catch (e) {}
  }

  if (resolvedLat == null || resolvedLon == null) {
    throw new Error('Unable to determine coordinates for weather lookup');
  }

  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${resolvedLat}&longitude=${resolvedLon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&timezone=auto`;
  const wRes = await fetch(weatherUrl);
  if (!wRes.ok) {
    throw new Error('Weather data unavailable');
  }

  const wData = await wRes.json();
  const cur = wData.current || {};
  const temp = Math.round(cur.temperature_2m != null ? cur.temperature_2m : 20);
  const apparentTemp = Math.round(cur.apparent_temperature != null ? cur.apparent_temperature : temp);
  const code = cur.weather_code != null ? cur.weather_code : 2;
  const cond = WMO_CODES[code] || { label: 'Partly cloudy', icon: 'CloudSun' };

  const data = {
    location: {
      city: cityName,
      region: '',
      country: '',
      formatted: placeFormatted,
      latitude: resolvedLat,
      longitude: resolvedLon
    },
    weather: {
      temperature: temp,
      apparentTemperature: apparentTemp,
      condition: cond.label,
      weatherCode: code,
      iconName: cond.icon,
      humidity: cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null,
      windSpeed: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null,
      isDay: cur.is_day === 1,
      precipitation: cur.precipitation || 0
    },
    summary: `User's current location: ${placeFormatted}. Weather: ${temp}°C (feels like ${apparentTemp}°C), ${cond.label}.${cur.relative_humidity_2m != null ? ' Humidity: ' + Math.round(cur.relative_humidity_2m) + '%.' : ''}${cur.wind_speed_10m != null ? ' Wind: ' + Math.round(cur.wind_speed_10m) + ' km/h.' : ''}`,
    timestamp: Date.now()
  };

  saveLocationWeatherCache(data);
  return data;
}

/**
 * Returns cached reading if available and fresh (< 5 minutes old)
 */
export function getCachedLocationWeather() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.timestamp) return null;
    if (Date.now() - parsed.timestamp < CACHE_TTL_MS) {
      return parsed;
    }
  } catch (e) {}
  return null;
}

/**
 * Saves location & weather reading to local cache
 */
export function saveLocationWeatherCache(data) {
  try {
    if (!data) return;
    const toSave = {
      ...data,
      timestamp: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(toSave));
  } catch (e) {}
}

/**
 * Clears cached reading
 */
export function clearLocationWeatherCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch (e) {}
}

/**
 * Detects if a user message is asking about weather, temperature, or nearby places
 * @param {string} text
 * @returns {boolean}
 */
export function isWeatherOrLocationQuery(text) {
  if (!text || typeof text !== 'string') return false;
  const q = text.toLowerCase().trim();
  const pattern = /\b(weather|temperature|forecast|rain(ing|y)?|sunny|umbrella|humid(ity)?|cold outside|hot outside|cloudy|snow(ing|y)?|near me|nearby|nearest|closest|around here|where am i|my (current )?location|places near|local time)\b/i;
  return pattern.test(q);
}
