# GDG Deploy Lab — Docker Compose on a VPS

Three small apps, each deployable with Docker Compose behind Caddy, on
**AlmaLinux 9** or **Ubuntu 24.04**. Companion repo for the GDG session
“Ship it: deploying apps with Docker Compose on a VPS”.

| App | Stack | Port on the server | Example domain |
| --- | --- | --- | --- |
| [`django_email_app`](django_email_app/) | Django + Gunicorn, SQLite | `127.0.0.1:8000` | `app.example.com` |
| [`noded`](noded/) | Express + Nodemailer, JSON file | `127.0.0.1:3000` | `node.example.com` |
| [`dotnet_email_app`](dotnet_email_app/) | ASP.NET Core 8, SQLite | `127.0.0.1:8081` | `dotnet.example.com` |

Every app listens on `127.0.0.1` only. **Caddy** runs on the server, is the only
thing exposed on ports 80/443, gets HTTPS certificates automatically, and
forwards each domain to its app.

```
Visitor ──► Cloudflare (DNS, optional proxy) ──► Caddy :80/:443 ──► 127.0.0.1:8000  django_email_app
                                                                 ├► 127.0.0.1:3000  noded
                                                                 └► 127.0.0.1:8081  dotnet_email_app
```

## Contents

1. [Prepare the server](#1-prepare-the-server)
2. [Light hardening](#2-light-hardening)
3. [Install Docker and Docker Compose](#3-install-docker-and-docker-compose)
4. [Install Caddy](#4-install-caddy)
5. [Deploy the apps](#5-deploy-the-apps)
6. [Point your domain (Cloudflare)](#6-point-your-domain-cloudflare)
7. [Configure Caddy and go live](#7-configure-caddy-and-go-live)
8. [Updating and day-to-day commands](#8-updating-and-day-to-day-commands)
9. [GitHub Actions](#9-github-actions)
10. [Troubleshooting](#10-troubleshooting)
11. [Learning resources](#11-learning-resources)

Commands marked **AlmaLinux 9** and **Ubuntu 24.04** differ; everything else is
the same on both.

---

## 1. Prepare the server

Create a VPS (1–2 vCPUs and 2 GB RAM is plenty) with AlmaLinux 9 or
Ubuntu 24.04, and add your SSH public key when creating it. No key yet? On your
laptop: `ssh-keygen -t ed25519`, then paste `~/.ssh/id_ed25519.pub` into the
provider’s dashboard.

Log in as root, update, and create a normal user called `deploy`:

**AlmaLinux 9**

```bash
ssh root@<server-ip>
dnf -y update
adduser deploy && passwd deploy
usermod -aG wheel deploy                       # wheel = sudo group on AlmaLinux
rsync -a --chown=deploy:deploy ~/.ssh /home/deploy
```

**Ubuntu 24.04**

```bash
ssh root@<server-ip>
apt update && apt -y upgrade
adduser deploy
usermod -aG sudo deploy
rsync -a --chown=deploy:deploy ~/.ssh /home/deploy
```

From now on, log in as `deploy`: `ssh deploy@<server-ip>`.

## 2. Light hardening

> Before disabling passwords, open a **second terminal** and confirm
> `ssh deploy@<server-ip>` works with your key. Otherwise you can lock yourself out.

**SSH: keys only, no root login.** Edit `/etc/ssh/sshd_config` and set:

```
PermitRootLogin no
PasswordAuthentication no
```

Also check `/etc/ssh/sshd_config.d/` — some cloud images override
`PasswordAuthentication` there. Then restart SSH:

| AlmaLinux 9 | Ubuntu 24.04 |
| --- | --- |
| `sudo systemctl restart sshd` | `sudo systemctl restart ssh` |

**Firewall: only SSH, HTTP and HTTPS.**

**AlmaLinux 9** (firewalld; SSH is already allowed)

```bash
sudo firewall-cmd --permanent --add-service={http,https}
sudo firewall-cmd --reload
```

**Ubuntu 24.04** (UFW — allow SSH *before* enabling)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable
```

**Fail2ban and automatic security updates.**

**AlmaLinux 9**

```bash
sudo dnf -y install epel-release
sudo dnf -y install fail2ban dnf-automatic
printf '[sshd]\nenabled = true\n' | sudo tee /etc/fail2ban/jail.local
sudo systemctl enable --now fail2ban dnf-automatic-install.timer
```

Keep SELinux enforcing (`getenforce` should print `Enforcing`).

**Ubuntu 24.04** (unattended-upgrades is on by default)

```bash
sudo apt -y install fail2ban
sudo systemctl enable --now fail2ban
```

> **Docker bypasses the firewall.** Ports published by Docker are reachable
> even if firewalld/UFW blocks them. That is why every `docker-compose.yml` here
> binds to `127.0.0.1:PORT:PORT`. Never publish a database port.

## 3. Install Docker and Docker Compose

Docker Compose is installed as a Docker plugin and used as `docker compose`
(with a space). The old `docker-compose` binary is not needed.

**AlmaLinux 9**

```bash
# Remove podman/buildah if present — they conflict with Docker
sudo dnf -y remove docker docker-client docker-client-latest docker-common \
  docker-latest docker-latest-logrotate docker-logrotate docker-engine podman runc

sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
sudo dnf -y install docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

**Ubuntu 24.04**

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

**Both:** let `deploy` run Docker without sudo, then log out and back in:

```bash
sudo usermod -aG docker $USER
exit
```

Check it worked:

```bash
docker run --rm hello-world
docker compose version
```

## 4. Install Caddy

**AlmaLinux 9**

```bash
sudo dnf -y install 'dnf-command(copr)'
sudo dnf -y copr enable @caddy/caddy
sudo dnf -y install caddy
sudo systemctl enable --now caddy
```

**Ubuntu 24.04**

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Check: `caddy version`. Caddy now serves a default page on port 80; we
configure it in step 7.

## 5. Deploy the apps

Clone the repo (for a private repo, add a read-only
[deploy key](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys)
to the repo and clone over SSH):

```bash
git clone <repo-url> ~/lab
cd ~/lab
```

Deploy only the apps you need. Each one follows the same pattern: create
`.env`, run `docker compose up -d --build`, check it answers on `127.0.0.1`.

### django_email_app → 127.0.0.1:8000

```bash
cd ~/lab/django_email_app
cp .env.example .env
python3 -c "import secrets; print(secrets.token_urlsafe(50))"   # copy into SECRET_KEY
vi .env
```

Required values in `.env`:

```
SECRET_KEY=<the random string>
DJANGO_ALLOWED_HOSTS=app.example.com
CSRF_TRUSTED_ORIGINS=https://app.example.com
```

Fill in the `MAIL_*` values to send email (optional). Then:

```bash
docker compose up -d --build
curl -I http://127.0.0.1:8000        # 200 or 302 = running
```

Migrations run automatically on start. Optional admin user:
`docker compose exec web python manage.py createsuperuser`.

### noded → 127.0.0.1:3000

```bash
cd ~/lab/noded
cp .env.example .env              # SMTP settings (optional)
cp db.json.example db.json        # empty user database — must exist before the first start
vi .env
docker compose up -d --build
curl -I http://127.0.0.1:3000
```

### dotnet_email_app → 127.0.0.1:8081

```bash
cd ~/lab/dotnet_email_app
cp .env.example .env              # SMTP settings
mkdir -p data
vi .env
docker compose up -d --build
curl -I http://127.0.0.1:8081
```

### Two ways to get the image

Each `docker-compose.yml` here uses `build: .` — the server builds the image from
the source files. You can instead publish an image to a registry and have the
server pull it:

```yaml
services:
  web:
    image: ghcr.io/<you>/django-email-app:1.0   # or <you>/django-email-app:1.0 on Docker Hub
```

```bash
docker compose pull && docker compose up -d
```

To publish: keep both `build: .` and `image:` on the service, then
`docker login ghcr.io` (or `docker login` for Docker Hub),
`docker compose build` and `docker compose push`.

## 6. Point your domain (Cloudflare)

1. Add your domain to Cloudflare (free plan) and, at your registrar, replace the
   nameservers with the two Cloudflare gives you.
2. Under **DNS → Records**, add one `A` record per app pointing to the server IP.
   Leave them **DNS only (grey cloud)** until Caddy has its certificates.

   | Type | Name | Content | Proxy |
   | --- | --- | --- | --- |
   | A | `app` | `<server-ip>` | DNS only |
   | A | `node` | `<server-ip>` | DNS only |
   | A | `dotnet` | `<server-ip>` | DNS only |

3. Under **SSL/TLS → Overview**, set the mode to **Full (strict)**. Do not use
   Flexible — it causes redirect loops with Caddy.

No Cloudflare? Create the same `A` records at your DNS provider; the rest is
identical.

## 7. Configure Caddy and go live

Replace `/etc/caddy/Caddyfile` with the blocks for your apps — see
[`Caddyfile.example`](Caddyfile.example):

```
app.example.com {
	reverse_proxy 127.0.0.1:8000
}

node.example.com {
	reverse_proxy 127.0.0.1:3000
}

dotnet.example.com {
	reverse_proxy 127.0.0.1:8081
}
```

```bash
sudo vi /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Within a few seconds Caddy obtains certificates. Open
`https://app.example.com/register/`, create an account and send a test email.

Finally, switch the Cloudflare records to **Proxied (orange cloud)**.

**AlmaLinux 9 / SELinux:** if Caddy returns `502` while the container is
running, check for a denial and allow Caddy to connect to the app ports:

```bash
sudo ausearch -m avc -ts recent
sudo setsebool -P httpd_can_network_connect 1
```

## 8. Updating and day-to-day commands

Run these inside an app folder:

| Task | Command |
| --- | --- |
| Deploy a new version | `git pull && docker compose up -d --build` |
| What’s running | `docker compose ps` |
| Follow logs | `docker compose logs -f` |
| Restart | `docker compose restart` |
| Stop | `docker compose down` |
| Shell inside the container | `docker compose exec web sh` (noded: `app`) |
| Clean old images | `docker image prune -f` |
| Caddy logs | `sudo journalctl -u caddy -f` |

**Back up the data:** `django_email_app/data/`, `noded/db.json` and
`dotnet_email_app/data/` hold all user data. They are bind mounts, so
`docker compose down -v` does not delete them. Copy them off the server
regularly.

## 9. GitHub Actions

- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and
  pull request. For each app it builds with Docker Compose, starts the
  container, and checks it answers on its port. The Django job also runs
  `manage.py check`, and the noded job runs `npm ci` and a syntax check.
- [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) is a manual
  deploy: **Actions → Deploy → Run workflow**, pick an app. It connects over SSH
  and runs `git pull && docker compose up -d --build`. Add these repository
  secrets first (**Settings → Secrets and variables → Actions**):

  | Secret | Example |
  | --- | --- |
  | `VPS_HOST` | `203.0.113.10` |
  | `VPS_USER` | `deploy` |
  | `VPS_SSH_KEY` | a private key generated for deploys; its `.pub` goes in `~/.ssh/authorized_keys` on the server |
  | `APP_DIR` | `/home/deploy/lab` |

## 10. Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `permission denied ... docker.sock` | Log out and back in after `usermod -aG docker $USER`. |
| Caddy `502 Bad Gateway` | App not running (`docker compose ps`), wrong port in the Caddyfile, or SELinux (see step 7). |
| Django `400 Bad Request` | Domain missing from `DJANGO_ALLOWED_HOSTS`. |
| Django `403 CSRF verification failed` | Set `CSRF_TRUSTED_ORIGINS=https://<your domain>`. |
| Too many redirects | Cloudflare SSL mode is Flexible — set Full (strict). |
| No certificate / TLS error | DNS not pointing at the server yet, ports 80/443 closed, or Cloudflare proxy on before the first certificate. Check `sudo journalctl -u caddy`. |
| noded fails at start, `db.json` is a folder | It was started before `db.json` existed. Run `docker compose down && rm -rf db.json && cp db.json.example db.json`, then start again. |
| Emails don’t send | Check the SMTP values in `.env`, then `docker compose logs`. Many providers need an app password. |

## 11. Learning resources

- Docker: [Get started](https://docs.docker.com/get-started/) ·
  [Install on RHEL/AlmaLinux](https://docs.docker.com/engine/install/rhel/) ·
  [Install on Ubuntu](https://docs.docker.com/engine/install/ubuntu/) ·
  [Linux post-install](https://docs.docker.com/engine/install/linux-postinstall/)
- Docker Compose: [Overview](https://docs.docker.com/compose/) ·
  [Install the plugin](https://docs.docker.com/compose/install/linux/) ·
  [Compose file reference](https://docs.docker.com/reference/compose-file/)
- Registries: [Docker Hub](https://docs.docker.com/docker-hub/) ·
  [GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
- Caddy: [Install](https://caddyserver.com/docs/install) ·
  [Reverse proxy quick start](https://caddyserver.com/docs/quick-starts/reverse-proxy)
- Cloudflare: [Add your domain](https://developers.cloudflare.com/dns/zone-setups/full-setup/) ·
  [SSL/TLS modes](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/)
- GitHub Actions: [Documentation](https://docs.github.com/en/actions)
- Roadmaps: [roadmap.sh/docker](https://roadmap.sh/docker) ·
  [roadmap.sh/devops](https://roadmap.sh/devops)
