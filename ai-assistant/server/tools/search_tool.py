"""
Web search tool for Gabby AI Agent.
Multi-tier search using Wikipedia REST API, DuckDuckGo Instant Answers,
with optional Tavily and Serper integration if API keys are configured.
"""

from typing import Dict, Any, List
import urllib.parse
import re
import os
import httpx
from .base import BaseTool, PermissionLevel

class WebSearchTool(BaseTool):
    name = "web_search"
    description = (
        "Search the web for up-to-date facts, current news, reference documentation, "
        "and factual information from Wikipedia and online search indexes."
    )
    permission_level = PermissionLevel.NETWORK_ACCESS
    timeout_seconds = 10.0

    parameters = {
        "type": "OBJECT",
        "properties": {
            "query": {
                "type": "STRING",
                "description": "Specific search query, question, or keywords."
            },
            "limit": {
                "type": "INTEGER",
                "description": "Maximum number of search results to return (default 5)."
            }
        },
        "required": ["query"]
    }

    async def run(self, query: str, limit: int = 5) -> List[Dict[str, str]]:
        clean_query = (query or "").strip().slice if hasattr(query, 'slice') else (query or "").strip()
        if not clean_query:
            return []

        results: List[Dict[str, str]] = []
        headers = {"User-Agent": "GabbyAgent/2.0 (AI Assistant; +https://github.com/Gabby-design)"}

        # 1. Tavily Search if key configured
        tavily_key = os.getenv("TAVILY_API_KEY")
        if tavily_key:
            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    resp = await client.post(
                        "https://api.tavily.com/search",
                        json={
                            "api_key": tavily_key,
                            "query": clean_query,
                            "search_depth": "basic",
                            "max_results": limit
                        }
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for item in data.get("results", []):
                            results.append({
                                "title": item.get("title", ""),
                                "snippet": item.get("content", ""),
                                "url": item.get("url", "")
                            })
                        if results:
                            return results[:limit]
            except Exception:
                pass

        # 2. Serper Search if key configured
        serper_key = os.getenv("SERPER_API_KEY")
        if serper_key:
            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    resp = await client.post(
                        "https://google.serper.dev/search",
                        headers={"X-API-KEY": serper_key, "Content-Type": "application/json"},
                        json={"q": clean_query, "num": limit}
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for item in data.get("organic", []):
                            results.append({
                                "title": item.get("title", ""),
                                "snippet": item.get("snippet", ""),
                                "url": item.get("link", "")
                            })
                        if results:
                            return results[:limit]
            except Exception:
                pass

        # 3. DuckDuckGo Instant Answers
        try:
            ddg_url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(clean_query)}&format=json&no_html=1&skip_disambig=1"
            async with httpx.AsyncClient(timeout=6.0, headers=headers) as client:
                resp = await client.get(ddg_url)
                if resp.status_code == 200:
                    data = resp.json()
                    abstract = data.get("AbstractText")
                    if abstract:
                        results.append({
                            "title": data.get("Heading") or clean_query,
                            "snippet": abstract,
                            "url": data.get("AbstractURL") or f"https://duckduckgo.com/?q={urllib.parse.quote(clean_query)}"
                        })
                    for topic in data.get("RelatedTopics", [])[:3]:
                        if isinstance(topic, dict) and topic.get("Text") and not topic.get("Topics"):
                            results.append({
                                "title": clean_query,
                                "snippet": topic.get("Text", ""),
                                "url": topic.get("FirstURL", "")
                            })
        except Exception:
            pass

        # 4. Wikipedia Search API
        try:
            wiki_url = (
                f"https://en.wikipedia.org/w/api.php?action=query&list=search"
                f"&srsearch={urllib.parse.quote(clean_query)}&format=json&srlimit={limit}"
            )
            async with httpx.AsyncClient(timeout=6.0, headers=headers) as client:
                resp = await client.get(wiki_url)
                if resp.status_code == 200:
                    data = resp.json()
                    for item in data.get("query", {}).get("search", []):
                        snippet = re.sub(r'<[^>]+>', '', item.get("snippet", "")).strip()
                        if snippet:
                            results.append({
                                "title": item.get("title", ""),
                                "snippet": snippet,
                                "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(item.get('title', '').replace(' ', '_'))}"
                            })
        except Exception:
            pass

        return results[:limit]
