export type GenerateDocumentSummaryInput = {
  title: string;
  content: string;
  tags?: string[];
};

export interface DocumentSummaryGenerator {
  generate(input: GenerateDocumentSummaryInput): Promise<string>;
}
