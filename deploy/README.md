# CuraPath CI/CD

```
push to qa ──► CI ──► Render (QA)            you test on QA
                                                   │
          you open a PR qa → main and merge ◄──────┘
                                                   
main ──► CI ──► Lightsail (production) ──► email: pass / fail
```

Nothing merges branches automatically. `qa` never deploys to production.

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PR into `qa`/`main`; called by the two below | Backend: checks, migration check, migrations + tests on PostgreSQL 16. Frontend: `npm ci`, lint, type-check, build, credential scan |
| `qa.yml` | push to `qa` | CI → Render deploy hook → waits until `/api/health/` reports the commit |
| `production.yml` | push to `main` | CI → deploy to Lightsail → email |
| `rollback.yml` | manual | Production back to an earlier release → email |
| `notify.yml` | called | Composes and sends the email |

## How a production deploy works

GitHub builds everything; the server only receives a tarball (no `git pull`
on the server, no Node on the server). `deploy/remote-deploy.sh` then runs on
Lightsail:

1. **Lock** — `flock` on `/srv/curapath/deploy.lock`; a second deploy waits.
2. **Unpack** into `releases/<UTC timestamp>-<sha>/`; `backend/.env` is a
   symlink to `shared/backend.env`. Required variable *names* are checked;
   values are never printed.
3. **Fresh virtualenv** for the release.
4. **Preflight** — `check --deploy`, refuse if file storage would fall back to
   the database, `check_file_storage` round-trip, `collectstatic`.
5. **Migrations** — if any are pending: `pg_dump` backup to
   `backups/db/<release>.dump`, then `migrate`. The old code is still live
   during this step, which is why migrations must be additive (see below).
   A failure here stops the deploy; the site is unchanged.
6. **Switch** — `current` symlink is replaced atomically, Gunicorn restarted
   (a few seconds of 502s), `nginx -t`.
7. **Verify** — `/api/health/` must report this commit and a working DB, and
   `https://curapath.in/` must serve this build's `index.html`.
   **Failure → automatic rollback** to the previous release.
8. **Tidy** — keeps 5 releases and 10 DB backups.

Layout on the server:

```
/srv/curapath/
  current -> releases/20261121173000-ca0422e37597
  releases/<id>/{backend/, frontend/, venv/, deploy/}
  shared/backend.env        production .env (never written by deploys)
  shared/media/             only if the server ever stored files locally
  backups/db/*.dump         pre-migration backups
  bin/rollback.sh           always the latest copy
  incoming/                 uploads in flight
```

## Migrations rule

Migrations run automatically, before the new code goes live, while the old
code still serves traffic. So every release's migrations must work with the
previous release's code:

- OK any time: new tables, new nullable columns, new columns with defaults, indexes.
- Two releases: removing/renaming a column — first ship code that stops using
  it, then a later release drops it.

The email flags migrations that remove or rename anything. Rolling back code
never rolls back the database.

## Secrets and variables

Settings → Environments → **production**

| Secret | Value |
|---|---|
| `SSH_HOST` | Lightsail static IP or hostname |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | the dedicated deploy key (below) |
| `SSH_KNOWN_HOSTS` | the server's host key line (below) |
| `SSH_PORT` | optional, default 22 |

| Variable | Value |
|---|---|
| `GUNICORN_SERVICE` | systemd unit name, e.g. `curapath-gunicorn` |
| `DEPLOY_ROOT` | optional, default `/srv/curapath` |

Settings → Environments → **qa**: secret `RENDER_DEPLOY_HOOK_BACKEND`
(optional `RENDER_DEPLOY_HOOK_FRONTEND`).

Settings → Secrets and variables → Actions (repository level)

| Name | Kind | Value |
|---|---|---|
| `PROD_DEPLOY_ENABLED` | variable | `true` to let `main` deploy |
| `PROD_DEPLOY_BOOTSTRAP` | variable | `true` for the first run only |
| `PROD_API_URL` / `PROD_WEB_URL` | variable | optional; default `https://api.curapath.in/api`, `https://curapath.in/` |
| `QA_API_URL` / `QA_WEB_URL` | variable | QA Render URLs |
| `SMTP_SERVER`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` | secret | mail account (Gmail app password, or AWS SES SMTP credentials) |
| `DEPLOY_NOTIFY_EMAILS` | variable | recipients, comma-separated |
| `DEPLOY_MAIL_FROM` | variable | sender address |

`VITE_*` build values are public by nature (they end up in the JavaScript);
they come from `PROD_API_URL`, never from secrets. The server's old
`frontend/.env.production` is no longer used.

## One-time server setup

Do these in order. Nothing here changes the live site until step 8.

1. **Deploy user**

   ```bash
   sudo adduser --disabled-password --gecos "" deploy
   sudo install -d -o deploy -g deploy /srv/curapath /srv/curapath/{shared,releases,backups,backups/db,incoming,bin}
   ```

2. **Dedicated SSH key** — on your own machine, not the server:

   ```bash
   ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f curapath_deploy
   ```

   Put `curapath_deploy.pub` into `/home/deploy/.ssh/authorized_keys` on the
   server, prefixed with `restrict ` (no forwarding, no tty):

   ```
   restrict ssh-ed25519 AAAA... github-actions-deploy
   ```

   Paste the private key file into the `SSH_PRIVATE_KEY` secret, then delete
   your local copy. Host key for `SSH_KNOWN_HOSTS`:
   `ssh-keyscan -t ed25519 <host>` — compare its fingerprint with
   `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` run on the server.

3. **SSH hardening** — `/etc/ssh/sshd_config`: `PasswordAuthentication no`,
   `PermitRootLogin no`; `sudo systemctl reload ssh`. GitHub runners have no
   fixed IPs, so port 22 stays open in the Lightsail firewall; keys only.

4. **Limited sudo** — `sudo visudo -f /etc/sudoers.d/curapath-deploy`:

   ```
   deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart <GUNICORN_SERVICE>, /usr/sbin/nginx -t
   ```

5. **Packages** — `sudo apt install python3-venv curl postgresql-client-<N>`
   where N ≥ the Lightsail database's major version (PGDG apt repo if Ubuntu
   lacks it). `pg_dump` refuses to back up a newer server, and the deploy stops
   rather than migrate without a backup.

6. **Production env** — *copy* (never move) the live backend `.env`:

   ```bash
   sudo cp <current-app>/backend/.env /srv/curapath/shared/backend.env
   sudo chown deploy:<gunicorn-group> /srv/curapath/shared/backend.env
   sudo chmod 640 /srv/curapath/shared/backend.env
   ```

   Make sure it has `MPIN_PEPPER` (never change it once set) and the object
   storage settings.

7. **Bootstrap run** — set `PROD_DEPLOY_ENABLED=true` and
   `PROD_DEPLOY_BOOTSTRAP=true`, then Actions → Production (Lightsail) → Run
   workflow on `main`. It prepares and migrates the first release and creates
   `current`, but does not restart or touch Nginx.

8. **Repoint services** (brief restart):

   - Gunicorn unit: [`curapath.service`](curapath.service) in this folder is
     the reference copy (threaded workers — see its comments for why).
     `sudo systemctl daemon-reload && sudo systemctl restart <unit>`.
   - Nginx site: `root /srv/curapath/current/frontend;` (keep everything else);
     `sudo nginx -t && sudo systemctl reload nginx`.
   - Check `https://api.curapath.in/api/health/` and `https://curapath.in/`.

   Keep the old app directory as it is until a few deploys have gone well.

9. **Delete `PROD_DEPLOY_BOOTSTRAP`.** From now on a merge into `main` deploys.

## Monitoring a deploy

- **Email** on every production deploy and rollback, pass or fail, with the
  failed stage and the last server log lines.
- **Actions tab** → the run → each step's log; the summary repeats the email.
- On the server: `journalctl -u <GUNICORN_SERVICE> -n 100`,
  `/srv/curapath/bin/rollback.sh --list` (`*` marks live),
  `curl https://api.curapath.in/api/health/`.

## When a deploy fails

The email says which stage:

| Stage | Site state | Do |
|---|---|---|
| CI | unchanged, nothing deployed | fix on `qa`, merge again |
| lock … preflight, backup, migrate | unchanged (old code live) | read the log; a failed migration is rolled back by PostgreSQL's per-migration transaction, earlier ones in the batch stay applied |
| verify-api / verify-web | rolled back automatically | `journalctl` for the new release's errors |
| "no previous release" | **may be down** | act now: `rollback.sh <id>` or fix forward |

## Rolling back

Code: Actions → **Rollback production** → Run workflow (empty = one release
back, or an id). Or on the server:

```bash
GUNICORN_SERVICE=<unit> /srv/curapath/bin/rollback.sh          # one back
GUNICORN_SERVICE=<unit> /srv/curapath/bin/rollback.sh --list
GUNICORN_SERVICE=<unit> /srv/curapath/bin/rollback.sh <release-id>
```

Database — only for a migration that destroyed something, deliberately, and
after taking a fresh backup. Prefer Lightsail's point-in-time restore to a
**new** database and copying what's needed; restoring over production
replaces everything written since the backup:

```bash
pg_restore --list /srv/curapath/backups/db/<release>.dump   # inspect first
```

## Deploying by hand (GitHub Actions unavailable)

From Git Bash / Linux on a checkout of `main`:

```bash
SHA=$(git rev-parse HEAD)
(cd frontend && npm ci && VITE_USE_PRODUCTION_API=true \
  VITE_API_BASE_URL_PROD=https://api.curapath.in/api npm run build)
rm -rf bundle && mkdir -p bundle/frontend
git archive HEAD backend deploy | tar -x -C bundle
cp -R frontend/dist/. bundle/frontend/
echo "$SHA" > bundle/backend/REVISION
tar -czf release-$SHA.tar.gz -C bundle .

scp release-$SHA.tar.gz deploy/remote-deploy.sh deploy@<host>:/srv/curapath/incoming/
ssh deploy@<host> "GUNICORN_SERVICE=<unit> bash /srv/curapath/incoming/remote-deploy.sh $SHA /srv/curapath/incoming/release-$SHA.tar.gz"
```

Run the tests first (`python manage.py test` with a local `DATABASE_URL`, never
the production one) — a manual deploy skips CI.
