// src/utils/webSearch.js
// Provides live web search grounding for Gabby

/**
 * Searches the web for relevant snippets using public endpoints and Wikipedia
 * @param {string} query
 * @returns {Promise<Array<{ title: string, snippet: string, url: string }>>}
 */
export async function performWebSearch(query) {
  if (!query || !query.trim()) return [];

  const cleanQuery = query.trim().slice(0, 200);
  const results = [];

  // 1. Try serverless search endpoint if available
  try {
    const apiRes = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: cleanQuery })
    });
    if (apiRes.ok) {
      const data = await apiRes.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        return data.results.slice(0, 5);
      }
    }
  } catch (e) {
    // Fall back to direct browser-safe public search APIs
  }

  // 2. Direct Wikipedia Search API (Free, high speed, reliable)
  try {
    const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      cleanQuery
    )}&format=json&origin=*&srlimit=4`;
    const wikiRes = await fetch(wikiUrl);
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const wikiItems = wikiData.query?.search || [];
      for (const item of wikiItems) {
        const cleanSnippet = (item.snippet || '')
          .replace(/<span class="searchmatch">([^<]+)<\/span>/g, '$1')
          .replace(/<[^>]+>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/&amp;/g, '&')
          .trim();

        if (cleanSnippet) {
          results.push({
            title: item.title,
            snippet: cleanSnippet,
            url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`
          });
        }
      }
    }
  } catch (err) {
    console.warn('Wikipedia search fallback error:', err);
  }

  // 3. DuckDuckGo Instant Answer API
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl);
    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();
      if (ddgData.AbstractText) {
        results.unshift({
          title: ddgData.Heading || cleanQuery,
          snippet: ddgData.AbstractText,
          url: ddgData.AbstractURL || 'https://duckduckgo.com/?q=' + encodeURIComponent(cleanQuery)
        });
      }
      if (Array.isArray(ddgData.RelatedTopics)) {
        for (const topic of ddgData.RelatedTopics.slice(0, 2)) {
          if (topic.Text && !topic.Topics) {
            results.push({
              title: topic.FirstURL ? new URL(topic.FirstURL).hostname : 'Search Result',
              snippet: topic.Text,
              url: topic.FirstURL || ''
            });
          }
        }
      }
    }
  } catch (err) {
    // Silent fallback
  }

  return results.slice(0, 5);
}
