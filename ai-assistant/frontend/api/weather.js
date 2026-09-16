// api/weather.js
// Serverless endpoint for location-aware weather and reverse geocoding
// Uses Open-Meteo (zero API keys required) with OpenStreetMap Nominatim reverse geocoding

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

function getWeatherCondition(code) {
  return WMO_CODES[code] || { label: 'Partly cloudy', icon: 'CloudSun' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let lat = null;
    let lon = null;
    let cityName = null;

    if (req.method === 'POST') {
      const body = req.body || {};
      lat = body.lat != null ? parseFloat(body.lat) : null;
      lon = body.lon != null ? parseFloat(body.lon) : null;
      cityName = typeof body.city === 'string' ? body.city.trim() : null;
    } else {
      const query = req.query || {};
      lat = query.lat != null ? parseFloat(query.lat) : null;
      lon = query.lon != null ? parseFloat(query.lon) : null;
      cityName = typeof query.city === 'string' ? query.city.trim() : null;
    }

    let placeInfo = {
      city: '',
      region: '',
      country: '',
      formatted: ''
    };

    // 1. Resolve coordinates if city name was passed
    if ((lat == null || lon == null || isNaN(lat) || isNaN(lon)) && cityName) {
      try {
        const geoSearchUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1&language=en&format=json`;
        const geoRes = await fetch(geoSearchUrl);
        if (geoRes.ok) {
          const geoData = await geoRes.json();
          const first = geoData.results?.[0];
          if (first) {
            lat = first.latitude;
            lon = first.longitude;
            placeInfo.city = first.name || cityName;
            placeInfo.region = first.admin1 || '';
            placeInfo.country = first.country || '';
            placeInfo.formatted = [first.name, first.admin1, first.country].filter(Boolean).join(', ');
          }
        }
      } catch (e) {
        console.warn('[Weather API] City geocoding error:', e.message);
      }
    }

    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Valid latitude & longitude or city name is required' });
    }

    // 2. Reverse geocode coordinates to place name if not already formatted
    if (!placeInfo.formatted) {
      try {
        const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=en`;
        const nomRes = await fetch(nominatimUrl, {
          headers: {
            'User-Agent': 'GabbyAI-Chatbot/1.0 (weather-location-service)'
          }
        });
        if (nomRes.ok) {
          const nomData = await nomRes.json();
          const addr = nomData.address || {};
          const localPart = addr.suburb || addr.neighbourhood || addr.city_district || addr.town || addr.village || addr.city || '';
          const cityPart = addr.city || addr.town || addr.county || '';
          const statePart = addr.state || addr.state_district || '';
          const countryPart = addr.country || '';

          placeInfo.city = localPart || cityPart || 'Local Area';
          placeInfo.region = statePart || cityPart || '';
          placeInfo.country = countryPart;
          placeInfo.formatted = [localPart, statePart, countryPart].filter(Boolean).join(', ') || nomData.display_name?.split(', ').slice(0, 3).join(', ') || 'Current Location';
        }
      } catch (nomErr) {
        console.warn('[Weather API] Nominatim reverse geocode notice:', nomErr.message);
      }

      // Fallback reverse geocoder if Nominatim had no result
      if (!placeInfo.formatted) {
        try {
          const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
          const bdcRes = await fetch(bdcUrl);
          if (bdcRes.ok) {
            const bdcData = await bdcRes.json();
            placeInfo.city = bdcData.locality || bdcData.city || 'Local Area';
            placeInfo.region = bdcData.principalSubdivision || '';
            placeInfo.country = bdcData.countryName || '';
            placeInfo.formatted = [placeInfo.city, placeInfo.region, placeInfo.country].filter(Boolean).join(', ');
          }
        } catch (bdcErr) {}
      }

      if (!placeInfo.formatted) {
        placeInfo.formatted = `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
        placeInfo.city = 'Current Location';
      }
    }

    // 3. Fetch real-time weather from Open-Meteo
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&timezone=auto`;
    const weatherRes = await fetch(weatherUrl);
    if (!weatherRes.ok) {
      return res.status(502).json({ error: 'Failed to retrieve weather data from provider' });
    }

    const weatherData = await weatherRes.json();
    const cur = weatherData.current || {};
    const cond = getWeatherCondition(cur.weather_code);

    const temp = Math.round(cur.temperature_2m != null ? cur.temperature_2m : 20);
    const apparentTemp = Math.round(cur.apparent_temperature != null ? cur.apparent_temperature : temp);
    const humidity = cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null;
    const windSpeed = cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null;
    const isDay = cur.is_day === 1;

    const weatherPayload = {
      temperature: temp,
      apparentTemperature: apparentTemp,
      condition: cond.label,
      weatherCode: cur.weather_code,
      iconName: cond.icon,
      humidity,
      windSpeed,
      isDay,
      precipitation: cur.precipitation || 0
    };

    const summary = `User's current location: ${placeInfo.formatted}. Weather: ${temp}°C (feels like ${apparentTemp}°C), ${cond.label}.${humidity ? ' Humidity: ' + humidity + '%.' : ''}${windSpeed ? ' Wind: ' + windSpeed + ' km/h.' : ''}`;

    return res.status(200).json({
      location: {
        ...placeInfo,
        latitude: lat,
        longitude: lon
      },
      weather: weatherPayload,
      summary,
      timestamp: Date.now()
    });
  } catch (err) {
    console.error('[Weather API] Unhandled handler error:', err);
    return res.status(500).json({ error: 'Internal server error processing weather and location data' });
  }
}
