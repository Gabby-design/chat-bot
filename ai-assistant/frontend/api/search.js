// ai-assistant/frontend/api/search.js
// Serverless search proxy supporting Tavily, Serper, and fallback web search

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const cleanQuery = query.trim().slice(0, 300);

  // 1. Tavily Search API if key is present
  if (process.env.TAVILY_API_KEY) {
    try {
      const tavilyRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: process.env.TAVILY_API_KEY,
          query: cleanQuery,
          search_depth: 'basic',
          max_results: 5
        })
      });
      if (tavilyRes.ok) {
        const data = await tavilyRes.json();
        const results = (data.results || []).map((r) => ({
          title: r.title,
          snippet: r.content,
          url: r.url
        }));
        return res.status(200).json({ results, provider: 'tavily' });
      }
    } catch (err) {
      console.warn('Tavily search failed:', err.message);
    }
  }

  // 2. Serper Search API if key is present
  if (process.env.SERPER_API_KEY) {
    try {
      const serperRes = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: {
          'X-API-KEY': process.env.SERPER_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ q: cleanQuery, num: 5 })
      });
      if (serperRes.ok) {
        const data = await serperRes.json();
        const results = (data.organic || []).map((r) => ({
          title: r.title,
          snippet: r.snippet,
          url: r.link
        }));
        return res.status(200).json({ results, provider: 'serper' });
      }
    } catch (err) {
      console.warn('Serper search failed:', err.message);
    }
  }

  // 3. Fallback: DuckDuckGo HTML parser & Wikipedia
  try {
    const ddgRes = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    if (ddgRes.ok) {
      const html = await ddgRes.text();
      const results = [];
      const snippetRegex = /class="result__snippet[^>]*>([\s\S]*?)<\/(?:a|div)>/g;

      let match;
      while ((match = snippetRegex.exec(html)) !== null && results.length < 5) {
        const clean = match[1].replace(/<[^>]+>/g, '').trim();
        if (clean) {
          results.push({
            title: cleanQuery,
            snippet: clean,
            url: `https://duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}`
          });
        }
      }
      if (results.length > 0) {
        return res.status(200).json({ results, provider: 'duckduckgo' });
      }
    }
  } catch (err) {
    console.warn('DuckDuckGo search error:', err.message);
  }

  // 4. Wikipedia Search fallback
  try {
    const wikiRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        cleanQuery
      )}&format=json&origin=*&srlimit=4`
    );
    if (wikiRes.ok) {
      const wikiData = await wikiRes.json();
      const wikiItems = wikiData.query?.search || [];
      const results = wikiItems.map((item) => ({
        title: item.title,
        snippet: (item.snippet || '').replace(/<[^>]+>/g, '').trim(),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/\s+/g, '_'))}`
      }));
      return res.status(200).json({ results, provider: 'wikipedia' });
    }
  } catch (err) {
    console.error('Wikipedia search error:', err.message);
  }

  return res.status(200).json({ results: [], provider: 'none' });
}
