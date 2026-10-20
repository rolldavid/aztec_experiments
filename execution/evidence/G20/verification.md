# G20 visible account setup

Creating an account previously left the password form visible and emitted small muted status text. Creation/sign-in now immediately replaces the form with a prominent progress screen: clear title,44px animated spinner,19px actual-stage message and a keep-open explanation. Existing initialization callbacks drive the text. No fake percentages, new operation timers, transaction changes or retries. Reduced-motion disables animation. Existing busy controls prevent duplicate submission. Completion/failure removes progress and reveals the next screen/error.

Five focused Chromium155 browser checks pass: mobile/desktop onboarding plus immediate held-creation state, actual sync event, reduced motion, operation completion and failure. Labelled account/session doubles exercise the real panel; no account/network transaction test was necessary for this presentation change. Mobile screenshot visually inspected. Existing unrelated 'joining from a post' test searches for Write a post on a fee-needed overview that offers Set up posting. It fails identically with the pre-G20 HEAD panel; baseline reproduction is retained, test unchanged.

Root implements/publishes; /root/ux_review independently reviews product/harness; /root/publication_prepare prepares exact two-file publisher. No SDK rebuild or contract changes.
