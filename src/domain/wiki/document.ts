import { Frontmatter } from './frontmatter.js';
import { IndexEntry } from './index-entry.js';
import { Title } from './title.js';

type WikiDocumentInput = {
  title: Title;
  frontmatter: Frontmatter;
  content: string;
};

export class WikiDocument {
  private constructor(
    public readonly title: Title,
    public readonly frontmatter: Frontmatter,
    public readonly content: string,
  ) {}

  static create(input: WikiDocumentInput): WikiDocument {
    return new WikiDocument(input.title, input.frontmatter, input.content);
  }

  toIndexEntry(summary: string): IndexEntry {
    return IndexEntry.create({
      title: this.title.value,
      summary,
      sourceCount: this.frontmatter.sources.length,
    });
  }
}
