export type SaveDocumentInput = {
  title: string;
  summary?: string;
  content?: string;
  tags?: string[];
  domain?: string | null;
  parentSlug?: string | null;
  forceSemanticConflicts?: boolean;
};
