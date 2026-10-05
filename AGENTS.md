# Repository rules

- Keep this package scoped to CTF. Persona, skills and tool settings belong inside the ctf preset.
- Register only packaged skills; keep includeDefaultRoots false. Use synthetic shared-root skills in the integration test to check isolation.
- Support DeepSeek Harness 0.2.0-rc.2. Preserve the platform shell gates, scoped compaction services and configured browser resource limits.
- Retain third-party attribution, license notices and source hashes. Keep detailed topic material in guide.md and reference files; SKILL.md is the short entry point.
- Keep credentials, local paths, session logs, challenge attachments, runtime binaries and development journals out of the repository and package.
- Validate with npm test, tests/check_helpers.py, tests/check_patch_structure.py, tests/dsh-smoke.cjs and npm pack --dry-run. Use local fixtures, not competition targets.
- Desktop installation uses the Desktop-provided CLI after exiting the app. Test hosts use an isolated DSH_HOME.
- Report only checks that ran. A model fixture verifies integration, not challenge-solving accuracy.
