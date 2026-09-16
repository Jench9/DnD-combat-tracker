# Combat Tracker

A single-page D&D combat tracker (initiative, HP, conditions, death saves). No
backend, no database, no build step — it's one self-contained `index.html`
file, which is why Dockerizing it is just "serve this file."

## Run with Docker

```bash
docker compose up --build
```

Then open **http://localhost:8080**

To stop it: `docker compose down`

### Without docker-compose

```bash
docker build -t combat-tracker .
docker run -d -p 8080:80 --name combat-tracker combat-tracker
```

### Changing the port

Edit `docker-compose.yml` and change the left side of `"8080:80"` to
whatever port you want, e.g. `"3000:80"`.

## Updating the app

Edit `app/index.html`, then rebuild:

```bash
docker compose up --build
```

## Data / saving

Combat state is saved in the browser's `localStorage`, per browser/device —
there's no server-side storage. That means:
- Refreshing the page keeps your combat going.
- It does **not** sync across devices (each player/laptop has its own copy).
- Clearing browser data wipes it.

If you want everyone at the table to see the same live combat state on their
own phones, that needs a small backend (e.g. a shared store or WebSocket
server) — let me know if you want that built out next.

## Deploying so it's reachable outside your machine

The `docker compose up` above only serves on your own machine (`localhost`).
To make it reachable by others:

- **Your home network / LAN**: run it on a machine that stays on (an old
  laptop, a Raspberry Pi, a home server) and connect from other devices using
  that machine's local IP, e.g. `http://192.168.1.50:8080`.
- **A VPS** (DigitalOcean, Linode, Hetzner, a cheap cloud box): copy this
  folder over, run the same `docker compose up -d --build`, and open the
  matching port in the firewall. Put it behind a reverse proxy (Caddy or
  nginx + Let's Encrypt) if you want a real domain and HTTPS.
- **Free static hosts, no Docker needed** — since this is just static HTML,
  you can skip Docker entirely and drag-and-drop `app/index.html` into:
  - [Netlify Drop](https://app.netlify.com/drop)
  - [Vercel](https://vercel.com) or [Cloudflare Pages](https://pages.dev)
  - **GitHub Pages**: push this repo, enable Pages on the `app/` folder (or
    move `index.html` to the repo root), done — free HTTPS URL.

For a home game with your friends, GitHub Pages or Netlify Drop is honestly
the least fuss: no server to maintain, free, and you get a shareable link in
under a minute. Docker is the better call if you want to self-host on your
own hardware or bundle this alongside other services later.

## Project structure

```
combat-tracker-app/
├── app/
│   └── index.html      # the whole app
├── Dockerfile
├── docker-compose.yml
└── README.md
```