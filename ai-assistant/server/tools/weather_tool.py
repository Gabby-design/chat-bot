"""
Weather and location intelligence tool for Gabby AI Agent.
Retrieves real-time weather, temperature, humidity, wind, and conditions via Open-Meteo.
"""

from typing import Dict, Any, Optional
import urllib.parse
import httpx
from .base import BaseTool, PermissionLevel

WMO_CODE_MAP = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    80: "Rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail"
}

class WeatherTool(BaseTool):
    name = "get_weather"
    description = (
        "Get current weather conditions, temperature, humidity, and forecasts for any city or location."
    )
    permission_level = PermissionLevel.NETWORK_ACCESS
    timeout_seconds = 8.0

    parameters = {
        "type": "OBJECT",
        "properties": {
            "city": {
                "type": "STRING",
                "description": "Name of the city, region, or location (e.g. 'London', 'Tokyo', 'San Francisco')."
            }
        },
        "required": ["city"]
    }

    async def run(self, city: str) -> Dict[str, Any]:
        target_city = (city or "London").strip()
        headers = {"User-Agent": "GabbyAgent/2.0 (Weather)"}

        async with httpx.AsyncClient(timeout=6.0, headers=headers) as client:
            # 1. Geocode
            lat, lon, resolved_name, country = 51.5074, -0.1278, target_city, ""
            geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(target_city)}&count=1&language=en&format=json"
            geo_resp = await client.get(geo_url)
            if geo_resp.status_code == 200:
                geo_data = geo_resp.json()
                results = geo_data.get("results")
                if results and len(results) > 0:
                    lat = results[0].get("latitude")
                    lon = results[0].get("longitude")
                    resolved_name = results[0].get("name", target_city)
                    country = results[0].get("country", "")

            # 2. Fetch current forecast
            weather_url = (
                f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
                f"&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day"
            )
            w_resp = await client.get(weather_url)
            if w_resp.status_code == 200:
                data = w_resp.json()
                current = data.get("current", {})
                code = current.get("weather_code", 0)
                condition = WMO_CODE_MAP.get(code, "Clear")
                temp = round(current.get("temperature_2m", 20))
                apparent_temp = round(current.get("apparent_temperature", 20))
                humidity = current.get("relative_humidity_2m", 50)
                wind = current.get("wind_speed_10m", 5)

                return {
                    "location": f"{resolved_name}{', ' + country if country else ''}",
                    "temperature_celsius": temp,
                    "feels_like_celsius": apparent_temp,
                    "condition": condition,
                    "humidity_percent": humidity,
                    "wind_speed_kmh": wind,
                    "summary": f"{resolved_name}: {temp}°C (feels like {apparent_temp}°C), {condition}. Humidity: {humidity}%, Wind: {wind} km/h."
                }

            return {
                "location": target_city,
                "error": f"Failed to retrieve weather data: status {w_resp.status_code}"
            }
