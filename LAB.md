# Lab: From Laptop to Production with Docker Compose + Caddy

A follow-along guide. You will run `django_email_app` and `noded` on your
laptop, set up a fresh VPS, put both apps on it, and serve them over HTTPS on
your own domain.

There are **two ways to get the code onto the server**. Pick one:

- **Track A — Manual upload** (Part 4): copy the files with `rsync` / `scp`.
  No GitHub needed. Do this first if you are new to deployment.
- **Track B — GitHub Actions** (Part 7): push to GitHub, the server clones the
  repo, and a workflow deploys for you. Can be followed on its own, or after
  Track A.

Everything else (server setup, Caddy, domain) is shared.

```
Laptop ──(rsync  or  git push → GitHub Actions)──► VPS
                                                    │
Visitor ─► Cloudflare DNS ─► Caddy :80/:443 ───────┤
                               ├─► 127.0.0.1:8000  django_email_app (container)
                               └─► 127.0.0.1:3000  noded            (container)
```

---

## 0. Fill these in once

Write your values down; every command below uses these placeholders.

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `<SERVER_IP>` | Public IP of your VPS | `203.0.113.10` |
| `django.example.com` | Domain for the Django app | `django.mydomain.com` |
| `node.example.com` | Domain for the Node app | `node.mydomain.com` |
| `<you>/<repo>` | Your GitHub repo (Track B only) | `bravin/gdg-deploy-lab` |

**You need:** a VPS with **AlmaLinux 9** or **Ubuntu 24.04** (1 vCPU / 1–2 GB
RAM is enough), a domain on Cloudflare, Docker Desktop on your laptop (for
Part 1), and an SSH key (`ssh-keygen -t ed25519` if you don't have one).

Commands marked **AlmaLinux 9** / **Ubuntu 24.04** differ; everything else is
the same on both. Lines starting with `laptop$` run on your computer;
`server$` runs on the VPS.

---

## Part 1 — Run it locally first

If it doesn't run on your laptop, it won't run on the server. The **same**
`docker-compose.yml` is used in both places — only `.env` changes.

### Django

```bash
laptop$ cd django_email_app
laptop$ cp .env.example .env
```

Edit `.env` for **local** use (see the [comparison table](#a3-django-env-local-vs-production)):

```env
SECRET_KEY=local-dev-only-not-secret
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CSRF_TRUSTED_ORIGINS=
DATABASE_PATH=/app/data/db.sqlite3
```

Leave the `MAIL_*` lines as they are unless you want to send real email.

```bash
laptop$ docker compose up -d --build
laptop$ docker compose ps                 # STATUS: Up
```

Open <http://localhost:8000> → you should land on the login page. Register a user.

### Node

```bash
laptop$ cd ../noded
laptop$ cp .env.example .env              # SMTP values, optional
laptop$ cp db.json.example db.json        # must exist BEFORE the first start
laptop$ docker compose up -d --build
```

Open <http://localhost:3000>.

**Stop both** when done: `docker compose down` in each folder.

> ✅ Checkpoint: both apps open in the browser on your laptop.

---

## Part 2 — Prepare the server

### 2.1 First login and a normal user

**AlmaLinux 9**

```bash
laptop$ ssh root@<SERVER_IP>
server# dnf -y update
server# dnf -y install rsync tar git curl
server# adduser deploy && passwd deploy
server# usermod -aG wheel deploy                    # wheel = sudo on AlmaLinux
server# rsync -a --chown=deploy:deploy ~/.ssh /home/deploy
```

**Ubuntu 24.04**

```bash
laptop$ ssh root@<SERVER_IP>
server# apt update && apt -y upgrade
server# adduser deploy
server# usermod -aG sudo deploy
server# rsync -a --chown=deploy:deploy ~/.ssh /home/deploy
```

Open a **new terminal** and confirm you can log in as `deploy`:

```bash
laptop$ ssh deploy@<SERVER_IP>
server$ sudo whoami                                 # prints: root
```

From here on, always log in as `deploy`.

### 2.2 Light hardening

> Keep your root session open until the new SSH settings are tested.

**SSH: keys only, no root login.**

```bash
server$ sudo vi /etc/ssh/sshd_config
```

Set:

```
PermitRootLogin no
PasswordAuthentication no
```

Some images override this in `/etc/ssh/sshd_config.d/*.conf` — check with
`grep -r PasswordAuthentication /etc/ssh/sshd_config.d/`. Then:

| AlmaLinux 9 | Ubuntu 24.04 |
| --- | --- |
| `sudo systemctl restart sshd` | `sudo systemctl restart ssh` |

Test again from a new terminal: `ssh deploy@<SERVER_IP>` must still work.

**Firewall: allow only SSH, HTTP, HTTPS.**

**AlmaLinux 9**

```bash
server$ sudo firewall-cmd --permanent --add-service={http,https}
server$ sudo firewall-cmd --reload
server$ sudo firewall-cmd --list-services           # ssh http https (+ cockpit/dhcpv6-client is fine)
```

**Ubuntu 24.04**

```bash
server$ sudo ufw allow OpenSSH
server$ sudo ufw allow 80,443/tcp
server$ sudo ufw enable
```

**Fail2ban + automatic security updates.**

**AlmaLinux 9**

```bash
server$ sudo dnf -y install epel-release
server$ sudo dnf -y install fail2ban dnf-automatic
server$ printf '[sshd]\nenabled = true\n' | sudo tee /etc/fail2ban/jail.local
server$ sudo systemctl enable --now fail2ban dnf-automatic-install.timer
server$ getenforce                                   # keep it: Enforcing
```

**Ubuntu 24.04** (unattended-upgrades is already on)

```bash
server$ sudo apt -y install fail2ban
server$ sudo systemctl enable --now fail2ban
```

> ⚠️ Docker-published ports skip firewalld/UFW. That's why both compose files
> publish on `127.0.0.1:PORT` only — the apps are reachable through Caddy, never directly.

### 2.3 Install Docker + Docker Compose

Compose comes as a Docker plugin: you type `docker compose` (with a space).

**AlmaLinux 9**

```bash
server$ sudo dnf -y remove docker docker-client docker-client-latest docker-common \
          docker-latest docker-latest-logrotate docker-logrotate docker-engine podman runc
server$ sudo dnf -y install dnf-plugins-core
server$ sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
server$ sudo dnf -y install docker-ce docker-ce-cli containerd.io \
          docker-buildx-plugin docker-compose-plugin
server$ sudo systemctl enable --now docker
```

**Ubuntu 24.04**

```bash
server$ sudo apt-get update
server$ sudo apt-get install -y ca-certificates curl
server$ sudo install -m 0755 -d /etc/apt/keyrings
server$ sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
server$ sudo chmod a+r /etc/apt/keyrings/docker.asc
server$ echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
          | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
server$ sudo apt-get update
server$ sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
          docker-buildx-plugin docker-compose-plugin
```

**Both:** let `deploy` use Docker without `sudo`, then log out and back in:

```bash
server$ sudo usermod -aG docker $USER
server$ exit
laptop$ ssh deploy@<SERVER_IP>
server$ docker run --rm hello-world                  # "Hello from Docker!"
server$ docker compose version                       # Docker Compose version v2.x
```

### 2.4 Install Caddy

**AlmaLinux 9**

```bash
server$ sudo dnf -y install 'dnf-command(copr)'
server$ sudo dnf -y copr enable @caddy/caddy
server$ sudo dnf -y install caddy
server$ sudo systemctl enable --now caddy
```

**Ubuntu 24.04**

```bash
server$ sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
server$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
          | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
server$ curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
          | sudo tee /etc/apt/sources.list.d/caddy-stable.list
server$ sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
server$ sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
server$ sudo apt update
server$ sudo apt install -y caddy
```

Check:

```bash
server$ caddy version
server$ curl -I http://localhost                     # 200 — Caddy's default page
```

> ✅ Checkpoint: `docker compose version` and `caddy version` both print a version.

---

## Part 3 — Point your domain (Cloudflare)

Do this now so DNS has time to update while you deploy.

1. In Cloudflare → your domain → **DNS → Records**, add:

   | Type | Name | Content | Proxy status |
   | --- | --- | --- | --- |
   | A | `django` | `<SERVER_IP>` | **DNS only** (grey cloud) |
   | A | `node` | `<SERVER_IP>` | **DNS only** (grey cloud) |

2. Leave them grey until Caddy has its certificates (Part 5).
3. Check from your laptop: `ping django.example.com` should show `<SERVER_IP>`.

---

## Part 4 — Track A: Upload the files manually

### 4.1 Copy the code

From the **repo root** on your laptop. Secrets, data and `node_modules` are
excluded — they never leave your laptop.

**macOS / Linux / WSL (rsync):**

```bash
laptop$ rsync -av \
  --exclude '.git' --exclude '.env' --exclude 'node_modules' \
  --exclude 'db.json' --exclude 'db.sqlite3' --exclude '__pycache__' \
  django_email_app noded deploy@<SERVER_IP>:~/lab/
```

**Windows PowerShell (tar + scp, both built in):**

```powershell
laptop> tar --exclude=.env --exclude=node_modules --exclude=db.json --exclude=db.sqlite3 --exclude=__pycache__ -czf lab.tgz django_email_app noded
laptop> scp lab.tgz deploy@<SERVER_IP>:~/
laptop> ssh deploy@<SERVER_IP> "mkdir -p ~/lab && tar -xzf ~/lab.tgz -C ~/lab && rm ~/lab.tgz"
```

Check on the server:

```bash
server$ ls ~/lab                                     # django_email_app  noded
```

### 4.2 Django: production `.env` and start

```bash
server$ cd ~/lab/django_email_app
server$ cp .env.example .env
server$ python3 -c "import secrets; print(secrets.token_urlsafe(50))"
server$ vi .env
```

Paste the generated string into `SECRET_KEY`, and set your domain. The full
file is in [A.3](#a3-django-env-local-vs-production):

```env
SECRET_KEY=<the generated string>
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=django.example.com
CSRF_TRUSTED_ORIGINS=https://django.example.com
DATABASE_PATH=/app/data/db.sqlite3
```

> `DJANGO_ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` must use the **exact same
> domain** (only add `https://` to the second). A one-letter typo here causes
> `400 Bad Request` or `403 CSRF verification failed`.

```bash
server$ chmod 600 .env
server$ mkdir -p data
server$ docker compose up -d --build                 # first build takes 1–2 minutes
server$ docker compose ps                            # STATUS: Up
server$ curl -I http://127.0.0.1:8000                # 302 → redirect to login = working
```

Migrations run automatically on start (`entrypoint.sh`). Optional admin user:

```bash
server$ docker compose exec web python manage.py createsuperuser
```

### 4.3 Node: `.env`, empty database, start

```bash
server$ cd ~/lab/noded
server$ cp .env.example .env && chmod 600 .env
server$ cp db.json.example db.json                   # must exist BEFORE the first start
server$ vi .env                                      # SMTP values (optional)
server$ docker compose up -d --build
server$ curl -I http://127.0.0.1:3000                # 200
```

> ✅ Checkpoint: both `curl` commands answer on the server. Nothing is public yet —
> that's Caddy's job.

### 4.4 Updating later (Track A)

Re-run the same `rsync` from 4.1, then on the server:

```bash
server$ cd ~/lab/django_email_app && docker compose up -d --build
server$ cd ~/lab/noded && docker compose up -d --build
```

Your server's `.env`, `data/` and `db.json` are untouched because rsync
excludes them.

---

## Part 5 — Caddy: go live on HTTPS

Replace the default Caddyfile with exactly this (swap in your domains):

```bash
server$ sudo vi /etc/caddy/Caddyfile
```

```caddy
# /etc/caddy/Caddyfile
django.example.com {
	reverse_proxy 127.0.0.1:8000
}

node.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

```bash
server$ sudo caddy fmt --overwrite /etc/caddy/Caddyfile
server$ sudo caddy validate --config /etc/caddy/Caddyfile
server$ sudo systemctl reload caddy
server$ sudo journalctl -u caddy -n 30 --no-pager   # look for "certificate obtained successfully"
```

**AlmaLinux 9 only — SELinux.** If the browser shows `502 Bad Gateway` while
`docker compose ps` says `Up`, SELinux is blocking Caddy from reaching the app:

```bash
server$ sudo setsebool -P httpd_can_network_connect 1
```

Now open:

- `https://django.example.com` → register, log in, send a test email
- `https://node.example.com`

**Finish in Cloudflare:**

1. DNS → switch both records to **Proxied** (orange cloud).
2. SSL/TLS → Overview → set mode to **Full (strict)**. Never *Flexible* — it
   causes redirect loops.

> ✅ Checkpoint: both apps load on `https://` with a valid padlock. **Track A done.**

---

## Part 6 — Day-to-day commands

Run inside an app folder on the server:

| Task | Command |
| --- | --- |
| What's running | `docker compose ps` |
| Follow logs | `docker compose logs -f` |
| Restart | `docker compose restart` |
| Rebuild after a code change | `docker compose up -d --build` |
| Stop | `docker compose down` |
| Shell in the container | `docker compose exec web sh` (noded: `app`) |
| Free disk from old images | `docker image prune -f` |
| Caddy logs | `sudo journalctl -u caddy -f` |

**Back up:** `~/lab/django_email_app/data/` and `~/lab/noded/db.json` hold all
user data. Copy them to your laptop now and then:

```bash
laptop$ scp -r deploy@<SERVER_IP>:~/lab/django_email_app/data ./backup-django-data
laptop$ scp deploy@<SERVER_IP>:~/lab/noded/db.json ./backup-noded-db.json
```

---

## Part 7 — Track B: Deploy with GitHub Actions

Complete Parts 2, 3 and 5 too — Track B only replaces Part 4.

How it works:

```
git push ─► GitHub ─► CI workflow (build + smoke test)
                  └─► Deploy workflow (you click Run) ─SSH─► server: git pull && docker compose up -d --build
```

### 7.1 Push the repo to GitHub (laptop)

Create an empty repo on GitHub (no README), then from the repo root:

```bash
laptop$ git init -b main
laptop$ git add .
laptop$ git ls-files | grep -E '(^|/)\.env$|db\.json$|db\.sqlite3$'   # must print NOTHING
laptop$ git commit -m "Deploy lab"
laptop$ git remote add origin git@github.com:<you>/<repo>.git
laptop$ git push -u origin main
```

`.gitignore` keeps `.env`, `db.json`, `data/db.sqlite3` and `node_modules` out.

Open the **Actions** tab: the **CI** workflow runs automatically and should go
green — it builds each app with Docker Compose and checks it answers.

### 7.2 Let the server read the repo

**Public repo:** skip to 7.3 and clone with `https://github.com/<you>/<repo>.git`.

**Private repo:** give the server a read-only *deploy key*.

```bash
server$ ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "deploy@vps"
server$ cat ~/.ssh/github_deploy.pub
```

GitHub → repo → **Settings → Deploy keys → Add deploy key** → paste it, leave
"Allow write access" **off**. Then tell SSH to use it:

```bash
server$ cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
server$ chmod 600 ~/.ssh/config
server$ ssh -T git@github.com                        # "successfully authenticated"
```

### 7.3 Clone on the server

**Coming from Track A?** Move the manual copy aside first and keep its secrets and data:

```bash
server$ mv ~/lab ~/lab-manual
```

Clone (Ubuntu has git; on AlmaLinux it was installed in 2.1):

```bash
server$ git clone git@github.com:<you>/<repo>.git ~/lab   # or the https URL for a public repo
```

**From Track A** — bring back the server-only files:

```bash
server$ cp ~/lab-manual/django_email_app/.env ~/lab/django_email_app/
server$ cp -a ~/lab-manual/django_email_app/data/. ~/lab/django_email_app/data/
server$ cp ~/lab-manual/noded/.env ~/lab-manual/noded/db.json ~/lab/noded/
```

**Fresh start** — create them as in [4.2](#42-django-production-env-and-start)
and [4.3](#43-node-env-empty-database-start) (`.env` files, `db.json`), then
start each app once:

```bash
server$ cd ~/lab/django_email_app && docker compose up -d --build
server$ cd ~/lab/noded && docker compose up -d --build
```

### 7.4 A key for GitHub Actions to log in

Make a separate key just for GitHub (on your laptop, no passphrase):

```bash
laptop$ ssh-keygen -t ed25519 -f ~/.ssh/gh_actions_deploy -N "" -C "github-actions"
laptop$ ssh-copy-id -i ~/.ssh/gh_actions_deploy.pub deploy@<SERVER_IP>
laptop$ ssh -i ~/.ssh/gh_actions_deploy deploy@<SERVER_IP> "echo ok"   # ok
```

> No `ssh-copy-id` (Windows)? Append the contents of `gh_actions_deploy.pub` to
> `~/.ssh/authorized_keys` on the server.

### 7.5 Add repository secrets

GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Name | Value |
| --- | --- |
| `VPS_HOST` | `<SERVER_IP>` |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | the whole content of `~/.ssh/gh_actions_deploy` (the **private** key, including the `-----BEGIN` / `-----END` lines) |
| `APP_DIR` | `/home/deploy/lab` |

### 7.6 Deploy

GitHub → **Actions → Deploy → Run workflow** → pick `django_email_app` → **Run**.
Repeat for `noded`. The log ends with `docker compose ps` showing `Up`.

### 7.7 The full loop

1. Change something small, e.g. a heading in `django_email_app/templates/`.
2. `git commit -am "Change heading" && git push`
3. Wait for **CI** to go green.
4. **Actions → Deploy → Run workflow → django_email_app**.
5. Refresh `https://django.example.com` — your change is live.

> ✅ Checkpoint: a push + one click updates production. **Track B done.**

**Want it fully automatic?** In `.github/workflows/deploy.yml`, CI and deploy
are separate on purpose so you choose when production changes. Once you trust
your tests, you can add a `push` trigger — but keep the manual one while learning.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `permission denied ... docker.sock` | Log out and back in after `usermod -aG docker $USER`. |
| `502 Bad Gateway` | `docker compose ps` — is the app `Up`? Port in Caddyfile right? On AlmaLinux: `sudo setsebool -P httpd_can_network_connect 1`. |
| Django `400 Bad Request` | Domain missing or misspelled in `DJANGO_ALLOWED_HOSTS`. Fix `.env`, then `docker compose up -d`. |
| Django `403 CSRF verification failed` | `CSRF_TRUSTED_ORIGINS` must be `https://` + the exact domain. |
| Too many redirects | Cloudflare SSL mode is Flexible → set **Full (strict)**. |
| No certificate | DNS not pointing at the server yet, or Cloudflare proxy was orange before the first certificate. Set grey, `sudo systemctl reload caddy`, check `sudo journalctl -u caddy`. |
| noded: `db.json` is a folder | Started before `db.json` existed: `docker compose down && rm -rf db.json && cp db.json.example db.json && docker compose up -d --build`. |
| Deploy workflow: `ssh: handshake failed` | Wrong `VPS_SSH_KEY` (must be the private key) or its `.pub` isn't in `~/.ssh/authorized_keys`. |
| Deploy workflow: `git pull` fails | Server can't read the repo — redo 7.2, test with `ssh -T git@github.com`. |
| `.env` changes not applied | `docker compose up -d` re-creates the container with the new values (`restart` does not). |

---

## Appendix A — The exact configuration files

These are the files in the repo. **They are identical on your laptop and the
server**; only `.env` (and the Caddyfile, which only exists on the server) differ.

### A.1 `django_email_app/docker-compose.yml`

```yaml
services:
  web:
    build: .
    container_name: django_email_app
    restart: unless-stopped

    env_file:
      - .env

    volumes:
      - ./data:/app/data

    ports:
      - "127.0.0.1:8000:8000"
```

- `build: .` — build the image from the `Dockerfile` in this folder.
- `env_file` — every line of `.env` becomes an environment variable in the container.
- `./data:/app/data` — the SQLite database lives on the host, so it survives rebuilds.
- `127.0.0.1:8000:8000` — only reachable from the server itself (Caddy).

### A.2 `django_email_app/.env.example`

```env
# Copy this file to .env and fill in real values. .env is gitignored.

SECRET_KEY=replace-with-a-long-random-string
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=yourdomain.com
CSRF_TRUSTED_ORIGINS=https://yourdomain.com
DATABASE_PATH=/app/data/db.sqlite3

MAIL_SERVER=smtp.example.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USE_SSL=false
MAIL_USERNAME=you@example.com
MAIL_PASSWORD=your-smtp-password
MAIL_DEFAULT_SENDER=you@example.com
```

### A.3 Django `.env`: local vs production

| Variable | `.env.example` (committed) | Local `.env` (laptop) | Production `.env` (server) | Why |
| --- | --- | --- | --- | --- |
| `SECRET_KEY` | placeholder | anything, e.g. `local-dev-only-not-secret` | long random string from `secrets.token_urlsafe(50)` | Signs sessions and password resets. Leaked = anyone can forge logins. |
| `DJANGO_DEBUG` | `false` | `true` | **`false`** | Debug pages leak settings and code. |
| `DJANGO_ALLOWED_HOSTS` | `yourdomain.com` | `localhost,127.0.0.1` | `django.example.com` | Django rejects other `Host` headers with 400. |
| `CSRF_TRUSTED_ORIGINS` | `https://yourdomain.com` | *(empty)* | `https://django.example.com` | Forms posted via HTTPS behind Caddy need it, or 403. |
| `DATABASE_PATH` | `/app/data/db.sqlite3` | same | same | Path **inside** the container; `./data` is mounted there. |
| `MAIL_SERVER` | `smtp.example.com` | test SMTP or leave | your SMTP host | |
| `MAIL_PORT` | `587` | `587` | `587` (STARTTLS) or `465` (SSL) | |
| `MAIL_USE_TLS` | `true` | `true` | `true` for 587 | Use **one** of TLS / SSL. |
| `MAIL_USE_SSL` | `false` | `false` | `true` only for 465 | |
| `MAIL_USERNAME` | placeholder | — | your mailbox | |
| `MAIL_PASSWORD` | placeholder | — | app password | Never commit. |
| `MAIL_DEFAULT_SENDER` | placeholder | — | same mailbox as username | Many servers reject other senders. |

**Production `.env` — complete example:**

```env
SECRET_KEY=Zt0x...paste-your-own-50-char-random-string...q9
DJANGO_DEBUG=false
DJANGO_ALLOWED_HOSTS=django.example.com
CSRF_TRUSTED_ORIGINS=https://django.example.com
DATABASE_PATH=/app/data/db.sqlite3

MAIL_SERVER=mail.example.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USE_SSL=false
MAIL_USERNAME=noreply@example.com
MAIL_PASSWORD=your-smtp-app-password
MAIL_DEFAULT_SENDER=noreply@example.com
```

### A.4 `noded/docker-compose.yml`

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: noded-app
    restart: unless-stopped

    ports:
      - "127.0.0.1:3000:3000"

    volumes:
      - ./db.json:/usr/src/app/db.json

    environment:
      PORT: 3000
      SMTP_HOST: ${SMTP_HOST:-smtp.example.com}
      SMTP_PORT: ${SMTP_PORT:-587}
      SMTP_SECURE: ${SMTP_SECURE:-false}
      SMTP_USER: ${SMTP_USER:-username}
      SMTP_PASS: ${SMTP_PASS:-password}
      SMTP_FROM: ${SMTP_FROM:-"noded Portal <noreply@noded.local>"}
```

Different style from Django: instead of `env_file`, Compose reads `.env` in
this folder and substitutes `${VAR:-default}` — the value after `:-` is used
when `.env` doesn't set it. Check what Compose will actually use with
`docker compose config`.

### A.5 `noded/.env.example`

```env
# Copy this file to .env and fill in real values. .env is gitignored.
# docker-compose.yml reads these; anything left out falls back to its default.

SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@example.com
SMTP_PASS=your-smtp-password
SMTP_FROM="noded Portal <noreply@yourdomain.com>"
```

`SMTP_SECURE=true` only with port `465`. Local and production differ only in
real SMTP credentials.

### A.6 `noded/db.json.example`

```json
{"users": []}
```

Copied to `db.json` on each machine. The real `db.json` holds users and
password hashes, so it is gitignored and excluded from uploads.

### A.7 `/etc/caddy/Caddyfile` (server only)

```caddy
django.example.com {
	reverse_proxy 127.0.0.1:8000
}

node.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

That's the whole web server config: Caddy gets and renews the HTTPS
certificates, redirects HTTP → HTTPS, and sets `X-Forwarded-Proto` so Django
knows the visitor used HTTPS.

### A.8 `.github/workflows/deploy.yml` (Track B)

```yaml
name: Deploy

on:
  workflow_dispatch:
    inputs:
      app:
        description: App folder to deploy
        type: choice
        options:
          - django_email_app
          - noded
          - dotnet_email_app

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Pull and restart on the server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          envs: APP
          script: |
            set -e
            cd "${{ secrets.APP_DIR }}"
            git pull --ff-only
            cd "$APP"
            docker compose up -d --build
            docker compose ps
        env:
          APP: ${{ inputs.app }}
```

The CI workflow (`.github/workflows/ci.yml`) runs the same `docker compose up`
on GitHub's machine with a throwaway `.env` and checks each app answers.

---

## Appendix B — Where each file lives

```
Laptop (repo)                         Server (~/lab)                     In git?
─────────────────────────────────     ──────────────────────────────     ───────
django_email_app/docker-compose.yml   same                               yes
django_email_app/.env.example         same                               yes
django_email_app/.env   (local)       django_email_app/.env (prod)       NO
django_email_app/data/db.sqlite3      django_email_app/data/db.sqlite3   NO
noded/docker-compose.yml              same                               yes
noded/.env.example, db.json.example   same                               yes
noded/.env, noded/db.json             own copies                         NO
—                                     /etc/caddy/Caddyfile               no (server only)
.github/workflows/*.yml               —  (runs on GitHub)                yes
```
