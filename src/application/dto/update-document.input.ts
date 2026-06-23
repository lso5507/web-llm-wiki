export type UpdateDocumentInput = {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  status?: string;
  domain?: string | null;
  parentSlug?: string | null;
};
