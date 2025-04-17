export interface Diff {
  id: string;
  content: string;
  filename: string;
  patch?: string;
  tags: string[];
  priority: 'high' | 'low' | 'unknown';
}

export interface TaggedDiffs {
  [tag: string]: Diff[];
}