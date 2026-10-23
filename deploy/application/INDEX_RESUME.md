# Service-owned public index restart

The hosted Bok worker and public-server factory open their private SQLite index
with `serviceOwned: true`. The directory must be owned by the effective service
UID with mode 0700; the database and existing WAL/SHM files must have that owner,
mode 0600, and no symlinks or additional hard links. Insecure existing modes are
rejected before they can be normalized. An owning service account is trusted to
maintain its database; this does not defend against that account rewriting it.

After complete canonical ingestion, the same database records provenance bound
to `OWNED_RESUME_VERSION`, schema, network/contract scope, deployment anchor, and
generation. Bump `OWNED_RESUME_VERSION` when decoder/reducer semantics or the
durable projection format change. A matching restart retains its checkpoint and
partial transaction cursor. It still checks network, class, deployment and
canonical anchors, rolls back proven forks, and catches up before serving views.
Status reports `cacheComparison: service-owned` for this path.

Missing or incompatible provenance uses the existing full authentication path.
The default store remains untrusted even if it contains service-owned provenance;
imported caches must use that default. Provenance is a local ownership decision,
not a signature or proof that arbitrary imported rows match the blockchain.

For an already running deployment, an explicit one-time operator transition can
record the just-authenticated service database after draining/stopping its owner.
Bind the exact old decoder/reducer source, scope, deployment, control and canonical
checkpoint before calling `recordOwnedPublication`. Do not infer this authority
from a database merely existing. Otherwise allow one full authentication pass.
