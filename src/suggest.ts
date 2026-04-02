/**
 * Simple Levenshtein distance implementation for command suggestions
 */
export function getLevenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

export function findBestMatch(input: string, choices: string[]) {
  let bestMatch = { target: '', rating: 0 };
  let minDistance = Number.MAX_VALUE;

  for (const choice of choices) {
    const distance = getLevenshteinDistance(input, choice);
    const maxLength = Math.max(input.length, choice.length);
    const rating = 1 - distance / maxLength;

    if (distance < minDistance) {
      minDistance = distance;
      bestMatch = { target: choice, rating };
    }
  }

  return { bestMatch };
}
