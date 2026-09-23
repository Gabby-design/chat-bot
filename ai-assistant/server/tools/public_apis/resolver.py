"""
Public API resolver and security validator for Gabby AI Agent.
Enforces allowlisted domains, rate limiting, parameter validation, and secure execution.
"""

from typing import Dict, Any, Optional
import time
from .adapters import ADAPTERS, BasePublicApiAdapter

class PublicApiResolver:
    def __init__(self):
        self.adapters = ADAPTERS
        self._last_call_timestamps: Dict[str, float] = {}

    def get_adapter(self, service_name: str) -> Optional[BasePublicApiAdapter]:
        return self.adapters.get(service_name.lower().strip())

    def list_services(self) -> Dict[str, str]:
        return {name: adapter.description for name, adapter in self.adapters.items()}

    async def execute(self, service: str, params: Dict[str, Any]) -> Dict[str, Any]:
        adapter = self.get_adapter(service)
        if not adapter:
            valid_services = ", ".join(self.adapters.keys())
            return {
                "error": f"Service '{service}' is not available. Available public API services: {valid_services}"
            }

        # Rate-limiting guard (minimum 0.5s per domain call)
        now = time.time()
        last_call = self._last_call_timestamps.get(adapter.domain, 0.0)
        if now - last_call < 0.5:
            return {"error": f"Rate limit guard: please wait a moment before querying {service} again."}
        self._last_call_timestamps[adapter.domain] = now

        try:
            return await adapter.fetch(**params)
        except Exception as e:
            return {"error": f"Public API call to '{service}' failed: {str(e)}"}
