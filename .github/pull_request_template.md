## Summary

Describe the Harbor skill, evidence contract, study, or documentation change.

## Evidence impact

- [ ] No tracked evolution evidence changed.
- [ ] Any evidence change is append-only and records new provenance.
- [ ] Development and holdout remain separate.
- [ ] Root `package.json` and `package-lock.json` remain byte-identical.
- [ ] No ignored native job or private evidence is included.

## Validation

```text
npm run docs:check
npm run skills:check
npm test
```

List any bundle-specific `--dry-run`, `--doctor`, or artifact verification.
