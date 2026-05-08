{
  "review": {
    "security_score": "B+",
    "quality_score": "B+",
    "ready_for_mainnet": false,
    "ready_for_devnet": true,
    "lastReviewedAt": "2026-05-08",
    "audit_feature_review_2026_05_08": {
      "status": "DEVNET SEALED",
      "scope": "Final review post 3 commits (176aaad Sprint A, 461a1b9 follow-up, 2ec76d7 devnet gaps). 49 files across frontend, 7 API routes, 3 libs, core crypto, on-chain revoke handler, schema, seed, tests, docs.",
      "report_artifact": ".superstack/reviews/audit-feature-2026-05-08.html",
      "scores": {
        "security": "B",
        "correctness": "A-",
        "error_handling": "B+",
        "testing": "B+",
        "code_organization": "A-",
        "documentation": "A"
      },
      "ready_for_devnet": true,
      "ready_for_mainnet": false,
      "verification": {
        "web_typecheck": "pass",
        "core_typecheck": "pass",
        "vitest_unit": "pass (18 files, 167 tests, +9 audit-data regression cases)",
        "f3_audit_integration": "pass (6/6, header drift sentinel active)",
        "git_status": "clean, 3 commits ahead of origin/master"
      },
      "what_sealed": [
        "Mock-data fallback removed from public viewer",
        "Payroll batches expand to one row per recipient (no 'payroll:N' aggregation)",
        "Cluster filter applied at every loadAuditTransactions query",
        "VaultIncome + StealthInvoice + SwapDraft surfaced (proof-of-reserves reconcilable)",
        "Canonical /api/audit/[linkId]/transactions endpoint replaces ad-hoc client merge",
        "expiresAt validated server-side: must be future + <= 365 days",
        "time_ranged scope server-side requires both startDate and endDate",
        "SQL date filter (no in-memory truncation of historical windows)",
        "Viewer endDate fallback anchors to expiresAt (no Date.now() drift)",
        "On-chain Cofre.MAX_REVOKED surfaced in admin UI with warn at >=80%, danger at >=95%",
        "Seed script writes correct cluster + amountHint (was Prisma-rejecting at runtime)",
        "9 vitest cases pin Sprint A behaviours: cluster, payroll fan-out, multi-source agg, scope filters",
        "CSV header drift sentinel in f3-audit.test.ts"
      ],
      "high_severity_remaining_for_mainnet": [
        "Replay on /api/audit-links POST: signed message lacks scopeParams + nonce + signature TTL",
        "/api/audit/[linkId]/transactions and /export public endpoints have no rate limit",
        "validateAuditFragment ignores linkId arg — any 32-byte string passes",
        "Revoke flow deletes DB row before on-chain proposal lands; crash window leaves on-chain link valid",
        "audit-sign Ed25519 seed still falls back to JWT_SIGNING_SECRET (planned Sprint 2.1)"
      ],
      "next_sprint": "Sprint B — close 5 HIGH items above. Estimated 3-4 dev days. Mainnet gate."
    },
    "verification": {
      "typecheck": "pass",
      "next_build": "pass",
      "cargo_check": "pass (warnings: deprecated realloc, cfg flags)",
      "vitest": "pass (16 files, 111 tests)",
      "biome": "199 cosmetic issues (formatting/import-sort)"
    },
    "fixed_in_session": [
      "Audit-links GET requires vault membership (was IDOR)",
      "Bearer invoice claim is now atomic via updateMany WHERE status='pending'",
      "Invoice memo is encrypted at rest via field-crypto AES-256-GCM",
      "Audit-export signature now uses domain-separated, length-prefixed message + sha256 of canonical JSON data",
      "Auth /api/auth/login has IP rate-limit + login-nonce reservation (no replay within 5min window)",
      "v2 wallet-auth now requires nonce header (no replay within window)",
      "Jupiter/Raydium quote+swap proxies require wallet auth + rate-limit (was open swap-API proxy)",
      "/api/proposals/[multisig]/init-status rate-limited (5/min) — was unbounded RPC fan-out",
      "Vault metadata routes no longer leak Prisma error codes/messages to client",
      "Membership cache TTL 60s -> 15s; new POST /api/vaults/[multisig]/refresh-membership",
      "Payroll CSV strips UTF-8 BOM and accepts CRLF",
      "vault-income-parser rejects txs without blockTime instead of fabricating Date.now()",
      "Sub-vaults GET requires vault membership (was leaking sub-vault labels publicly)",
      "Income ?debug=true requires vault membership (was leaking sync diagnostics publicly)",
      "/api/circuits/[...path] and /api/cloak-relay/[...path] reject traversal segments (.., /, \\, ctrl-chars)"
    ],
    "findings": [
      {
        "severity": "high",
        "category": "deploy",
        "description": "Prisma schema still on SQLite; not safe for serverless or multi-instance prod.",
        "fix": "Move DATABASE_URL to managed Postgres before production deploy."
      },
      {
        "severity": "high",
        "category": "secrets",
        "description": "JWT_SIGNING_SECRET is the SHA-256 source for three independent purposes: session HMAC, field-crypto AES-GCM key, and audit-export Ed25519 seed. A leak compromises sessions, encrypted PII, and signatures simultaneously.",
        "fix": "Introduce SESSION_HMAC_KEY, FIELD_CRYPTO_KEY, AUDIT_EXPORT_SIGN_KEY (last already supported as override). Migrate with dual-read window."
      },
      {
        "severity": "high",
        "category": "ops",
        "description": "Rate-limiter falls back to in-memory when REDIS_URL is unset in production (logs warn but continues). Multi-instance deploys silently lose rate limiting.",
        "fix": "Throw at boot in NODE_ENV=production when REDIS_URL is missing."
      },
      {
        "severity": "medium",
        "category": "auth",
        "description": "ALLOW_LEGACY_AUTH=true by default. v1 signatures (no method/path/body binding) still accepted. Comment says deadline 7 days post 2026-05-05.",
        "fix": "Flip env to 'false' on or before 2026-05-12 in production."
      },
      {
        "severity": "medium",
        "category": "ops",
        "description": "vault-membership cache is in-process Map (now 15s). Two pods serve different views of membership, and removed members keep API access until either pod expires the entry.",
        "fix": "Move cache to Redis (Upstash) keyed by multisig address with TTL 60s and explicit invalidation hook on the new /refresh-membership endpoint."
      },
      {
        "severity": "medium",
        "category": "anchor",
        "description": "Programs/cloak-gatekeeper hardcodes vault_index = 0 in init_cofre, set_operator, init_view_distribution, add_signer_view, remove_signer_view. Sub-vaults cannot run private ops.",
        "fix": "Parametrize vault_index across these 5 handlers (deferred spec already drafted)."
      },
      {
        "severity": "medium",
        "category": "anchor",
        "description": "AccountInfo::realloc deprecated by anchor-lang; cargo emits warnings. Will break on future anchor-lang upgrade.",
        "fix": "Replace with AccountInfo::resize() in revoke_audit / remove_signer_view."
      },
      {
        "severity": "medium",
        "category": "privacy",
        "description": "stealthInvoice memo is now encrypted with the server's field-crypto key (server CAN read). True privacy requires ECIES with stealthPubkey using existing memoCiphertext/memoNonce/memoEphemeralPk fields.",
        "fix": "Migrate to encryptMemo(memo, stealthPubkey) from @cloak-squads/core/memo-crypto. Decrypt client-side at claim time using the URL-fragment box secret."
      },
      {
        "severity": "low",
        "category": "ops",
        "description": "/api/cloak-relay/[...path] and /api/circuits/[...path] are unrestricted reverse proxies (no rate-limit, no origin check). Project pays egress for any internet caller.",
        "fix": "Add per-IP rate-limit + Origin allowlist; or move clients to call the upstream relay directly with their own throttling."
      },
      {
        "severity": "low",
        "category": "operator",
        "description": "Operator authority is dynamic per cofre on-chain, but execution is self-service and requires the registered operator wallet to manually open the operator page.",
        "fix": "Acceptable for Vercel MVP; revisit a managed relayer if automated execution is required."
      }
    ]
  }
}
