// Retention is bounded by stored bytes and files, not a short edit history.
export const MAX_PUBLISHED_BYTES = 256 * 1024 * 1024;
export const MAX_PUBLISHED_FILES = 8192;
// Every revision retains index.html plus source.json, artifacts.json and
// publication.json. The mirror admits the same maximum history as hosting;
// its independent journal byte limit still applies.
export const MAX_PUBLISHED_REVISIONS = Math.floor(MAX_PUBLISHED_FILES / 4);
