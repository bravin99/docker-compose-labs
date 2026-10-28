# noded — Express Auth Demo App

Simple user portal built with Express:

- Sign up / log in / log out (bcrypt-hashed passwords, session cookie)
- User directory
- Emails sent through SMTP with Nodemailer
- Users stored in `db.json` on a host bind mount — survives rebuilds
- Listens on `127.0.0.1:3000`, designed to sit behind Caddy on the host

## Run it

```bash
cp .env.example .env          # SMTP settings (optional)
cp db.json.example db.json    # must exist before the first start
docker compose up -d --build
curl -I http://127.0.0.1:3000
```

Then add a Caddy site block and reload Caddy:

```
node.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

Full server setup (AlmaLinux 9 / Ubuntu 24.04, Docker, Caddy, Cloudflare) is in
the [repository README](../README.md).

## Notes

- `db.json` is gitignored because it holds real users and password hashes.
- The session secret is hard-coded in `server.js`. Before using this beyond a
  demo, read it from an environment variable instead.
- `Caddyfile` in this folder is for running Caddy as a container next to the
  app (`reverse_proxy app:3000`). The repository guide runs Caddy on the host.
