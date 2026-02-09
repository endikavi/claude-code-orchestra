export interface FuzzyResult {
  score: number;
  indices: number[];
}

export function fuzzyMatch(query: string, text: string): FuzzyResult | null {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  let queryIdx = 0;
  const indices: number[] = [];
  let score = 0;
  let lastMatchIdx = -1;

  for (let i = 0; i < textLower.length && queryIdx < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIdx]) {
      indices.push(i);

      // Consecutive match bonus
      if (lastMatchIdx === i - 1) score += 5;

      // Word boundary bonus (after /, ., -, _)
      if (i === 0 || '/.-_'.includes(text[i - 1])) score += 10;

      // Start of string bonus
      if (i === 0) score += 3;

      score += 1;
      lastMatchIdx = i;
      queryIdx++;
    }
  }

  if (queryIdx !== queryLower.length) return null;

  // Penalty for longer strings (prefer shorter matches)
  score -= text.length * 0.1;

  return { score, indices };
}

export function fuzzySort<T>(
  items: T[],
  query: string,
  getText: (item: T) => string
): Array<{ item: T; score: number; indices: number[] }> {
  if (!query) return items.map((item) => ({ item, score: 0, indices: [] }));

  const results: Array<{ item: T; score: number; indices: number[] }> = [];

  for (const item of items) {
    const result = fuzzyMatch(query, getText(item));
    if (result) {
      results.push({ item, score: result.score, indices: result.indices });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
