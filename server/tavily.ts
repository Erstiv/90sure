const TAVILY_API_KEY = process.env.TAVILY_API_KEY;

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilyResponse {
  results: TavilySearchResult[];
  answer?: string;
}

export async function searchCategoryFacts(category: string, difficulty: string): Promise<{ facts: string[]; sources: { title: string; url: string }[] }> {
  if (!TAVILY_API_KEY) {
    console.log("No Tavily API key found, skipping web search");
    return { facts: [], sources: [] };
  }

  try {
    const searchQuery = `${category} interesting facts statistics numbers data ${difficulty === 'expert' ? 'obscure' : ''}`;
    
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: searchQuery,
        search_depth: 'advanced',
        max_results: 8,
        include_answer: true,
      }),
    });

    if (!response.ok) {
      console.error("Tavily search failed:", response.status, response.statusText);
      return { facts: [], sources: [] };
    }

    const data: TavilyResponse = await response.json();
    
    const facts = data.results.map(r => r.content).filter(Boolean);
    const sources = data.results.map(r => ({ title: r.title, url: r.url })).filter(s => s.url);
    
    if (data.answer) {
      facts.unshift(data.answer);
    }

    console.log(`Tavily search for "${category}" returned ${facts.length} facts from ${sources.length} sources`);
    
    return { facts, sources };
  } catch (error) {
    console.error("Tavily search error:", error);
    return { facts: [], sources: [] };
  }
}
