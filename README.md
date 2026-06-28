# nucbox-g3-docker

Docker homelab for the GMKtec NucBox G3 Plus (Intel N150, 16 GB, Ubuntu 24.04).
Each service lives in its own directory with a single `docker-compose.yml` and is
started independently:

```bash
cd <service> && docker compose --env-file ../.env up -d
```

See [`.claude/CLAUDE.md`](.claude/CLAUDE.md) for the full machine, networking,
storage, and per-service reference.

## Secrets & git-crypt

All secrets live in a single root **`.env`** (referenced by every compose file as
`${VAR}`). That file is **committed to this repo, but encrypted at rest** with
[git-crypt](https://github.com/AGWA/git-crypt) — so the repo carries the real
secrets safely, and there is no separate `.env` to drift out of sync.

### What's encrypted

Encryption is driven by [`.gitattributes`](.gitattributes):

| Pattern | |
|---|---|
| `**/.env` | the secrets file |
| `**/*.pem`, `**/*.key`, `**/*.p12`, `**/*.pfx` | any keys/certs, if present |

Matched files are transparently encrypted on `git add` (clean filter) and
decrypted on checkout (smudge filter). Everything else is committed in plaintext
as normal. Verify what's encrypted with:

```bash
git-crypt status
```

> Note: `.env` is **not** gitignored (see the note in `.gitignore`). git-crypt only
> encrypts files git *tracks*, so ignoring it would silently disable encryption.
> Plaintext backups (`.env.bak.*`) **are** ignored and must never be committed.

### Access is granted via a GPG key

The repo's git-crypt key is wrapped with an authorized collaborator's **GPG public
key** and stored in `.git-crypt/keys/`. Anyone holding the matching GPG **private
key** can unlock the repo. Add a new collaborator with:

```bash
git-crypt add-gpg-user --trusted <GPG_KEY_ID>   # creates a commit
```

### Unlocking a fresh clone

```bash
git clone <repo>
cd nucbox-g3-docker
gpg --import /path/to/your-gpg-private.asc   # one-time, if not already in your keyring
git-crypt unlock                              # decrypts .env in place
```

After unlocking, `.env` is plaintext in your working tree (never re-committed in
plaintext — the clean filter re-encrypts it automatically).

### ⚠️ Back up the GPG key

The encrypted `.env` is only recoverable with the GPG **private** key. Keep an
off-box backup of that private key (e.g. in a password manager); if every copy of
the private key is lost, the committed secrets become unrecoverable. The public
key and the git-crypt `.gpg` wrapper in the repo are **not** sufficient to decrypt
on their own and are safe to publish.
