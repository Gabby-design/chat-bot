"""
Vetted public API adapters for Gabby AI Agent.
Curated from public-apis catalog. Zero credentials required, HTTPS only, strict response caps.
"""

from typing import Dict, Any
import urllib.parse
import httpx

class BasePublicApiAdapter:
    name: str = ""
    description: str = ""
    domain: str = ""
    timeout: float = 6.0

    async def fetch(self, **kwargs) -> Dict[str, Any]:
        raise NotImplementedError

class DictionaryAdapter(BasePublicApiAdapter):
    name = "dictionary"
    description = "Look up word definitions, phonetics, origins, parts of speech, and example sentences."
    domain = "api.dictionaryapi.dev"

    async def fetch(self, word: str) -> Dict[str, Any]:
        clean_word = urllib.parse.quote((word or "").strip().lower())
        url = f"https://api.dictionaryapi.dev/api/v2/entries/en/{clean_word}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    entry = data[0]
                    meanings = []
                    for m in entry.get("meanings", [])[:3]:
                        defs = [d.get("definition") for d in m.get("definitions", [])[:2]]
                        meanings.append({
                            "partOfSpeech": m.get("partOfSpeech"),
                            "definitions": defs
                        })
                    return {
                        "word": entry.get("word"),
                        "phonetic": entry.get("phonetic"),
                        "meanings": meanings
                    }
            elif resp.status_code == 404:
                return {"error": f"No definition found for word: '{word}'"}
            return {"error": f"Dictionary service returned status {resp.status_code}"}

class ExchangeRateAdapter(BasePublicApiAdapter):
    name = "exchange_rates"
    description = "Get real-time global foreign exchange rates and currency conversions."
    domain = "open.er-api.com"

    async def fetch(self, base_currency: str = "USD", target_currency: str = "") -> Dict[str, Any]:
        base = (base_currency or "USD").strip().upper()
        target = (target_currency or "").strip().upper()
        url = f"https://open.er-api.com/v6/latest/{base}"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                rates = data.get("rates", {})
                if target:
                    rate = rates.get(target)
                    if rate:
                        return {
                            "base": base,
                            "target": target,
                            "rate": rate,
                            "summary": f"1 {base} = {rate} {target}"
                        }
                    return {"error": f"Target currency code '{target}' not found."}
                else:
                    # Return top global currencies
                    common = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "NGN"]
                    filtered = {c: rates[c] for c in common if c in rates}
                    return {"base": base, "rates": filtered}
            return {"error": f"Exchange rate service returned status {resp.status_code}"}

class CountryInfoAdapter(BasePublicApiAdapter):
    name = "country_info"
    description = "Retrieve factual details about countries (capital, population, region, currencies, languages)."
    domain = "restcountries.com"

    async def fetch(self, country: str) -> Dict[str, Any]:
        clean = urllib.parse.quote((country or "").strip())
        url = f"https://restcountries.com/v3.1/name/{clean}?fields=name,capital,population,region,subregion,currencies,languages,flags"
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    c = data[0]
                    currencies = list(c.get("currencies", {}).keys())
                    languages = list(c.get("languages", {}).values())
                    return {
                        "name": c.get("name", {}).get("common"),
                        "official_name": c.get("name", {}).get("official"),
                        "capital": c.get("capital", ["N/A"])[0] if c.get("capital") else "N/A",
                        "population": f"{c.get('population', 0):,}",
                        "region": f"{c.get('region')} ({c.get('subregion', '')})",
                        "currencies": currencies,
                        "languages": languages
                    }
            return {"error": f"Could not find information for country '{country}'"}

# Registry of active public API adapters
ADAPTERS: Dict[str, BasePublicApiAdapter] = {
    "dictionary": DictionaryAdapter(),
    "exchange_rates": ExchangeRateAdapter(),
    "country_info": CountryInfoAdapter(),
}
