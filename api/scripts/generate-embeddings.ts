/**
 * Generate Model Embeddings for Semantic Routing
 *
 * Pre-computes embeddings for each (model, domain) pair using Workers AI.
 * Embeddings are stored in D1 for fast retrieval during routing.
 *
 * Usage:
 *   ADMIN_TOKEN=xxx tsx generate-embeddings.ts [--dry-run] [--limit=N]
 *
 * Example:
 *   ADMIN_TOKEN=xxx tsx generate-embeddings.ts --dry-run  # Preview
 *   ADMIN_TOKEN=xxx tsx generate-embeddings.ts --limit=5  # Only 5 models
 *   ADMIN_TOKEN=xxx tsx generate-embeddings.ts            # All models
 */

import { execSync } from 'child_process';

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(arg => arg.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : null;

const API_URL = process.env.API_URL || 'https://consensus-api.janis-ellerbrock.workers.dev';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const EMBEDDING_VERSION = 'v1';
const DELAY_BETWEEN_REQUESTS_MS = 200; // Rate limiting

if (!ADMIN_TOKEN) {
  console.error('❌ Error: ADMIN_TOKEN environment variable is required');
  console.error('   Usage: ADMIN_TOKEN=xxx tsx generate-embeddings.ts');
  process.exit(1);
}

// Reference text templates for each domain
const DOMAIN_TEMPLATES: Record<string, string> = {
  code: 'Expert programmer. Advanced algorithm implementation. Code debugging and optimization. Software architecture. API design. Database queries. DevOps and deployment. Security best practices.',
  math: 'Advanced mathematics. Algebra and calculus. Linear algebra and matrices. Differential equations. Probability and statistics. Mathematical proofs. Quantitative reasoning. Numerical computation.',
  reasoning: 'Logical reasoning. Multi-step problem solving. Deductive and inductive reasoning. Pattern recognition. Critical thinking. Strategic planning. Causal analysis. Complex decision making.',
  science: 'Scientific knowledge. Physics and mechanics. Chemistry and molecular structure. Biology and genetics. Geology and earth science. Experimental design. Scientific method. Data analysis and interpretation.',
  writing: 'Professional writing. Clear communication. Content creation. Grammar and style. Persuasive and narrative writing. Document drafting. Email and correspondence. Technical and creative writing.',
  general: 'General knowledge. Instruction following. Multi-task understanding. Factual accuracy. Common sense reasoning. Wide domain coverage. Versatile capabilities. Reliable performance.',
};

interface ModelProfile {
  model_id: string;
  name: string;
  provider: string;
  domains: string[];
}

async function getModelsWithDomains(): Promise<ModelProfile[]> {
  console.log('📊 Querying D1 for models with benchmark scores...\n');

  const query = `
    SELECT DISTINCT
      cs.model_id,
      m.name,
      m.provider,
      GROUP_CONCAT(DISTINCT cs.domain) as domains
    FROM composite_scores cs
    JOIN models m ON m.id = cs.model_id
    GROUP BY cs.model_id, m.name, m.provider
    ORDER BY m.name
    ${LIMIT ? `LIMIT ${LIMIT}` : ''}
  `;

  const result = execSync(
    `npx wrangler d1 execute score-db --remote --command "${query.replace(/\n/g, ' ').replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8' }
  );

  const jsonMatch = result.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse D1 query result');
  }

  const parsed = JSON.parse(jsonMatch[0]);
  const results = parsed[0]?.results || [];

  return results.map((row: any) => ({
    model_id: row.model_id,
    name: row.name,
    provider: row.provider,
    domains: row.domains.split(','),
  }));
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${API_URL}/admin/generate-embedding`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': ADMIN_TOKEN!,
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTTP ${response.status}: ${error}`);
  }

  const data = await response.json();
  return data.embedding;
}

async function storeEmbedding(
  model_id: string,
  domain: string,
  embedding: number[],
  reference_text: string
): Promise<void> {
  if (DRY_RUN) {
    return;
  }

  // Convert array to Float32Array buffer for BLOB storage
  const float32 = new Float32Array(embedding);
  const buffer = Buffer.from(float32.buffer);

  // Escape reference_text for SQL
  const escapedText = reference_text.replace(/'/g, "''");

  const query = `
    INSERT OR REPLACE INTO model_embeddings (
      model_id, domain, embedding, embedding_version, reference_text, updated_at
    ) VALUES (
      '${model_id}',
      '${domain}',
      X'${buffer.toString('hex')}',
      '${EMBEDDING_VERSION}',
      '${escapedText}',
      datetime('now')
    )
  `;

  try {
    execSync(
      `npx wrangler d1 execute score-db --remote --command "${query.replace(/\n/g, ' ')}"`,
      { encoding: 'utf-8', stdio: 'pipe' }
    );
  } catch (err) {
    throw new Error(`Failed to store embedding: ${err instanceof Error ? err.message : err}`);
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧠 MODEL EMBEDDING GENERATOR');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE — No data will be written\n');
  }

  if (LIMIT) {
    console.log(`⚡ LIMIT: Processing only ${LIMIT} models\n`);
  }

  const models = await getModelsWithDomains();

  console.log(`✅ Found ${models.length} models with benchmark scores`);
  console.log(`📝 Will generate embeddings for ${Object.keys(DOMAIN_TEMPLATES).length} domains\n`);

  let totalAttempted = 0;
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    console.log(`\n[${i + 1}/${models.length}] ${model.name} (${model.provider})`);
    console.log(`  Domains: ${model.domains.join(', ')}`);

    for (const domain of model.domains) {
      totalAttempted++;

      // Get domain template (use parent domain if subdomain)
      const baseDomain = domain.includes('/') ? domain.split('/')[0] : domain;
      const template = DOMAIN_TEMPLATES[baseDomain];

      if (!template) {
        console.log(`  ⚠️  Skipping ${domain} (no template)`);
        continue;
      }

      const reference_text = `${template}\n\nModel: ${model.name} by ${model.provider}`;

      try {
        if (DRY_RUN) {
          console.log(`  [DRY RUN] Would generate embedding for ${domain}`);
          successCount++;
        } else {
          process.stdout.write(`  📐 Generating embedding for ${domain}...`);
          const embedding = await generateEmbedding(reference_text);
          await storeEmbedding(model.model_id, domain, embedding, reference_text);
          console.log(` ✅`);
          successCount++;

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_REQUESTS_MS));
        }
      } catch (err) {
        console.log(` ❌`);
        console.log(`     Error: ${err instanceof Error ? err.message : err}`);
        failureCount++;
      }
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log(`Models processed:       ${models.length}`);
  console.log(`Embeddings attempted:   ${totalAttempted}`);
  console.log(`✅ Successful:          ${successCount}`);
  console.log(`❌ Failed:              ${failureCount}`);
  console.log(`Success rate:           ${totalAttempted > 0 ? ((successCount / totalAttempted) * 100).toFixed(1) : 0}%\n`);

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — Run without --dry-run to actually generate embeddings\n');
  } else if (successCount > 0) {
    console.log('✅ Embeddings generated and stored in D1!');
    console.log('   Next: Deploy API with semantic routing enabled\n');
  }

  process.exit(failureCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\n❌ Script failed:', err);
  process.exit(1);
});
