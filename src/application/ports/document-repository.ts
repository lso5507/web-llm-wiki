import { Title } from '../../domain/wiki/title.js';
import { WikiDocument } from '../../domain/wiki/document.js';

export interface DocumentRepository {
  save(document: WikiDocument): Promise<void>;
  findByTitle(title: Title): Promise<WikiDocument | null>;
}
