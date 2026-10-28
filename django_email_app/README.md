# Django Auth Demo App

Same functionality as the Flask version, built with Django's built-in auth
system:

- Register / Login (username **or** email) / Logout
- Password reset via emailed link (Django's built-in token flow)
- Dashboard listing all registered users
- "Send test email to myself" button on the dashboard (uses `django.core.mail`)
- SQLite storage on a host bind mount (`./data`) — survives `docker compose down -v`
- Designed to sit behind your existing Caddy instance

## 1. Configure credentials

```bash
cp .env.example .env
```

Edit `.env` and fill in your real values:

```
SECRET_KEY=<generate one, see below>
DJANGO_ALLOWED_HOSTS=yourdomain.com
CSRF_TRUSTED_ORIGINS=https://yourdomain.com

MAIL_SERVER=smtp.example.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USE_SSL=false
MAIL_USERNAME=you@example.com
MAIL_PASSWORD=your-smtp-password
MAIL_DEFAULT_SENDER=you@example.com
```

Generate a secret key:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(50))"
```

`.env` is loaded automatically by Docker Compose since it sits next to
`docker-compose.yml` — no extra config needed. It's already in `.gitignore`.

## 2. Build and run

```bash
docker compose up -d --build
```

Migrations run automatically on container start (see `entrypoint.sh`). The
app listens on `127.0.0.1:8000` on the host — not exposed publicly.

Data persists in `./data/db.sqlite3` on the host, so `docker compose down`
(without `-v`) — or even `down -v`, since this is a bind mount, not a named
volume — won't wipe it.

## 3. Point Caddy at it

See `Caddyfile.example` for a sample site block:

```
yourdomain.com {
    reverse_proxy 127.0.0.1:8000
}
```

```bash
sudo systemctl reload caddy
```

## 4. Use the app

1. `https://yourdomain.com/register/` — create an account.
2. `/accounts/login/` — log in with your username or email.
3. `/dashboard/` — lists all registered users.
4. "Send Test Email to Myself" — verifies your SMTP config.
5. "Forgot password?" on the login page — tests the reset-password email flow.
6. "Logout" — ends the session.

## Admin site

Django's built-in admin is enabled at `/admin/`. Create a superuser to use it:

```bash
docker compose exec web python manage.py createsuperuser
```

## Notes / production hardening ideas

- Password reset always shows the same "check your email" message whether
  or not the address is registered, avoiding leaking which emails exist.
- Consider adding rate limiting (e.g. `django-ratelimit`) on login, register,
  and password-reset views if this will be internet-facing.
- Consider switching `DATABASES` in `config/settings.py` to Postgres if you
  expect concurrent writes beyond what SQLite comfortably handles.
- `DEBUG` defaults to `false`; only set `DJANGO_DEBUG=true` in `.env` for
  local troubleshooting, never in production.
