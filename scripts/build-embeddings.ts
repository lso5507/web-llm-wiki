import { loadEnvConfig } from '../src/infrastructure/config/env.js';
import { FileSystemIndexCatalog } from '../src/infrastructure/persistence/filesystem/file-system-index-catalog.js';
import { InMemoryIndexCatalog } from '../src/infrastructure/persistence/in-memory/in-memory-index-catalog.js';
import { LocalEmbeddingGenerator } from '../src/infrastructure/llm/local-embedding-generator.js';
import { InMemoryEmbeddingStore } from '../src/infrastructure/persistence/in-memory/in-memory-embedding-store.js';

const main = async () => {
  const config = loadEnvConfig();
  const indexCatalog = config.useFileStorage
    ? new FileSystemIndexCatalog(config.dataRoot)
    : new InMemoryIndexCatalog();

  const embeddingGenerator = new LocalEmbeddingGenerator();
  const embeddingStore = new InMemoryEmbeddingStore();

  console.log('🔍 Fetching documents from index catalog...');
  const entries = await indexCatalog.list();
  console.log(`📚 Found ${entries.length} documents to process`);

  if (entries.length === 0) {
    console.log('⚠️  No documents found. Save some documents first.');
    return;
  }

  console.log('\n🧠 Generating embeddings...');
  let processed = 0;
  const startTime = Date.now();

  for (const entry of entries) {
    const slug = entry.title.toLowerCase().replace(/\s+/g, '-');
    const text = `${entry.title}\n${entry.summary}`;
    
    try {
      const vector = await embeddingGenerator.embed(text);
      await embeddingStore.put(slug, vector, embeddingGenerator.modelId);
      processed++;
      
      const percent = Math.round((processed / entries.length) * 100);
      process.stdout.write(`\r  Progress: ${processed}/${entries.length} (${percent}%) - ${entry.title}`);
    } catch (error) {
      console.error(`\n❌ Failed to generate embedding for "${entry.title}":`, error);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n\n✅ Completed in ${duration}s`);
  console.log(`📊 Model: ${embeddingGenerator.modelId}`);
  console.log(`📐 Dimensions: ${embeddingGenerator.dimensions}`);
  console.log('\n⚠️  Note: Embeddings are currently stored in memory only.');
  console.log('   Set EMBEDDING_PROVIDER=local in .env to enable semantic search.');
};

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
