"""
Public API tool exposing allowlisted public APIs to Gabby AI Agent.
"""

from typing import Dict, Any
from ..base import BaseTool, PermissionLevel
from .resolver import PublicApiResolver

class PublicApiTool(BaseTool):
    name = "call_public_api"
    description = (
        "Call vetted public APIs for structured information: "
        "'dictionary' (word definitions and phonetics), "
        "'exchange_rates' (currency exchange rates), "
        "or 'country_info' (capital, population, languages of nations)."
    )
    permission_level = PermissionLevel.NETWORK_ACCESS
    timeout_seconds = 8.0

    parameters = {
        "type": "OBJECT",
        "properties": {
            "service": {
                "type": "STRING",
                "description": "Public API service to call: 'dictionary', 'exchange_rates', or 'country_info'.",
                "enum": ["dictionary", "exchange_rates", "country_info"]
            },
            "parameters": {
                "type": "OBJECT",
                "description": "Parameters for the target service (e.g. {'word': 'serendipity'}, {'base_currency': 'USD', 'target_currency': 'EUR'}, or {'country': 'Japan'})."
            }
        },
        "required": ["service"]
    }

    def __init__(self):
        self.resolver = PublicApiResolver()

    async def run(self, service: str, parameters: Dict[str, Any] = None) -> Dict[str, Any]:
        params = parameters or {}
        return await self.resolver.execute(service, params)
