# ASP.NET Core Auth Demo App

Same functionality as the Flask, Django, and Laravel versions, built on
ASP.NET Core Identity (hand-wired Razor Pages, no scaffolded default UI —
kept intentionally simple and styled to match the others):

- Register / Login / Logout
- Password reset via emailed link (Identity's built-in token generator)
- Dashboard listing all registered users
- "Send test email to myself" button on the dashboard
- SQLite storage **and** auth cookie keys on a host bind mount (`./data`) —
  both survive `docker compose down -v`
- Designed to sit behind your existing Caddy instance

## 1. Configure credentials

```bash
cp .env.example .env
```

Edit `.env` with your SMTP details:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_ENABLE_SSL=true
SMTP_USERNAME=you@example.com
SMTP_PASSWORD=your-smtp-password
SMTP_FROM_ADDRESS=you@example.com
SMTP_FROM_NAME=MyApp
```

This uses .NET's built-in `System.Net.Mail` client (no extra NuGet
package). It works well with STARTTLS on port 587 (`SMTP_ENABLE_SSL=true`).
Implicit TLS on port 465 isn't reliably supported by `System.Net.Mail` — if
you need that, the fix is swapping in MailKit (see note at the bottom).

## 2. Build and run

```bash
docker compose up -d --build
```

The database and tables are created automatically on first start (see
`Program.cs` — `EnsureCreated()`, no migration files to manage). The app
listens on `127.0.0.1:8081` on the host — not exposed publicly. (8081,
to avoid clashing with the Flask/Django/Laravel versions if you're running
more than one of these on the same box.)

Data persists in `./data/app.db` (SQLite) and `./data/keys/` (auth cookie
encryption keys) on the host — both bind mounts, so they survive
`docker compose down -v`.

## 3. Point Caddy at it

See `Caddyfile.example` for a sample site block:

```
yourdomain.com {
    reverse_proxy 127.0.0.1:8081
}
```

```bash
sudo systemctl reload caddy
```

## 4. Use the app

1. `https://yourdomain.com/register` — create an account (name, email, password).
2. `/login` — log in with email + password.
3. `/dashboard` — lists all registered users.
4. "Send Test Email to Myself" — verifies your SMTP config.
5. "Forgot password?" on the login page — tests the reset-password email flow.
6. "Logout" — ends the session.

## A note on how this was built

.NET's package manager (NuGet) pulls dependencies from nuget.org, which
this sandbox's network doesn't have access to — same situation as the
Laravel/Composer build. What I could do here, unlike Laravel:

- The .NET SDK itself installs via Ubuntu's own package archive, so I had a
  real, working `dotnet` CLI available.
- I scaffolded the project with `dotnet new webapp --auth Individual`
  (offline — templates ship with the SDK, no network needed) to get an
  accurate, current ASP.NET Core 8 skeleton, then replaced the default
  Bootstrap-heavy Identity UI with hand-written pages styled to match the
  other three apps.
- I verified every file's braces balance and cross-checked the trickier
  Identity APIs (password reset token generation/encoding, in particular)
  against current documentation and real-world examples rather than
  relying on memory alone.
- I could **not** run `dotnet restore` or actually boot the app, since that
  needs nuget.org. `docker compose build` will do that for real on your
  server, where network access is normal.

If anything doesn't boot cleanly on first run, send me the error output
from `docker compose up` and I'll fix it directly.

## Notes / production hardening ideas

- Password reset always redirects to the same "check your email" outcome
  whether or not the address is registered, avoiding leaking which emails
  exist.
- Consider rate limiting (ASP.NET Core's built-in `Microsoft.AspNetCore.RateLimiting`
  middleware) on login, register, and password-reset routes if this will
  be internet-facing.
- `System.Net.Mail.SmtpClient` is fine for STARTTLS (port 587) but is a
  legacy API with known limitations on implicit TLS (port 465). For more
  robust mail delivery, swap in the `MailKit` NuGet package and update
  `Services/SmtpEmailSender.cs` accordingly.
- Consider switching the EF Core provider (`Microsoft.EntityFrameworkCore.Sqlite`
  → `Npgsql.EntityFrameworkCore.PostgreSQL` or similar) if you expect
  concurrent writes beyond what SQLite comfortably handles.
- This app uses `EnsureCreated()` rather than EF Core Migrations for
  simplicity. If you evolve the `ApplicationUser` model later, switch to
  real migrations (`dotnet ef migrations add ...`) so existing data isn't
  affected.
