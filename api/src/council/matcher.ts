export class ConsensusMatcher {
  /**
   * Simple character-level overlap for fast edge-side similarity checking
   */
  static getSimilarityScore(a: string, b: string): number {
    const s1 = this.normalize(a);
    const s2 = this.normalize(b);
    
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0;

    // Jaccard Similarity of words
    const words1 = new Set(s1.split(/\s+/));
    const words2 = new Set(s2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private static normalize(text: string): string {
    return text.toLowerCase().replace(/[^\w\s]/g, "").trim();
  }

  /**
   * Groups responses that are semantically similar (> 0.8)
   */
  static groupSimilarResponses(votes: { model: string; answer: string }[]): Array<{
    answer: string;
    models: string[];
    count: number;
    score: number;
  }> {
    const groups: Array<{ answer: string; models: string[]; count: number; score: number }> = [];

    votes.forEach(vote => {
      let found = false;
      for (const group of groups) {
        if (this.getSimilarityScore(vote.answer, group.answer) > 0.8) {
          group.models.push(vote.model);
          group.count++;
          found = true;
          break;
        }
      }

      if (!found) {
        groups.push({
          answer: vote.answer,
          models: [vote.model],
          count: 1,
          score: 1.0
        });
      }
    });

    return groups.sort((a, b) => b.count - a.count);
  }
}
