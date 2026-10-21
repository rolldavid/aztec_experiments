# Independent review: persistent service supervision

/root/funding_investigation approved immutable future-start staging and kernel ownership after the legacy cgroup exits. Node ExecStop preserves stopped-container reentry. No healthy restart is needed.

/root/ux_review reviewed reporting-only monitoring and drop-ins. Its startup integrity finding was fixed by calling attest(check=True) directly inside a non-destructive exception boundary; the legacy dispatcher is never invoked. Seven focused checks cover the result.

/root/publication_prepare approved publisher 3915530ba5c9ffcc8c8827c1af1c15b50164b9defe48b2f378369afca3413212 after correcting reload ambiguity, timer rollback and exact prior mask restoration. Immutable releases preserve service permissions, PID/cwd preservation is asserted, and non-main bootstrap imports do not execute deployment. No remaining blocking finding. Reviewers performed no service mutations.
