Work in an autonomous loop to improve the CLI.

Rules:
- Test only one hypothesis per iteration.
- Use only one skill per iteration when evaluating.
- Do not repeat skills.
- Before closing an iteration, run `node skills/skill-arena-compare/scripts/run-rust-analyzer-hook.js`.

Loop:
1. Select one skill from `http://github.com/obra/superpowers/tree/main/skills`.
2. Try to create the compare file using only the CLI.
3. If you cannot, identify how the CLI should improve to make it possible.
4. If you can, run the comparison with only 1 request.
5. If it does not work, improve the CLI wherever needed.
6. Use only one skill at a time while evolving the CLI.
7. Run `node skills/skill-arena-compare/scripts/run-rust-analyzer-hook.js`.
8. Append the result to `cli_evolve.log`.
9. Repeat.
