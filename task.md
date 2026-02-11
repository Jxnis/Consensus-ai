# ConsensusCloud Tasks

## Phase 1: Foundation (Current)
- [x] Define Multi-Repo Structure (`api/`, `sdk/`, `web/`)
- [x] Initial API Draft with Council Logic
- [x] Basic Landing Page UI (Glassmorphic Dark Mode)
- [x] Project Git Initialization
- [x] **Deployment Setup** (Wrangler config fixed)

## Phase 2: API & SDK Connectivity
- [ ] Fix `agrees` logic in `ConsensusMatcher` (Semantic similarity thresholding)
- [ ] Implement `sdk/src/index.ts` to expose `ConsensusClient`
- [x] Link `web` to use the `sdk` for the terminal demo (Real API fetch added)
- [x] Add `Hono` middleware for CORS and API Key validation (Local bypass added)

## Phase 3: Production Polishing
- [x] Create `CONSENSUS_CACHE` KV namespace on Cloudflare (Done: 91b5ba295f774396812f197398b2921f)
- [ ] Implement Stripe/x402 payment integration in `api/src/payments`
- [ ] Dashboard for viewing usage stats
- [ ] "Model Comparison" page showing consensus vs single-model results

## Phase 4: Launch
- [ ] Final Deployment to `consensus.cloud` (via Cloudflare Pages & Workers)
- [ ] Documentation for SDK usage
- [ ] OpenRouter "Verified Router" status request
