# Instant Photo Family Demo

One page that exercises the whole family:

- `<instant-photo selfie>`: tap the lens for a fisheye selfie inside the lens (the selfie lens is opt-in; the demo turns it on), or print one of three sample photos or an upload; includes a fisheye toggle and editable caption
- `<instant-camera>`: live viewfinder with a front/back camera switch
- QR via URL: open `?spot=lake`, `?spot=sunset` or `?spot=night`
- a "taken photos" tray fed by the `taken` event; tap a photo there to save it
- sound and fast-develop toggles

On phones the two cameras sit behind an Instant Photo / Instant Camera switch. On wide screens they are shown side by side.

## Run

From the repository root:

~~~sh
python3 -m http.server 8000
# open http://localhost:8000/demos/instant-photo-family/
~~~

ES modules need an HTTP server; opening `index.html` as a file won't work.

### On a phone

- **Instant Photo** works over plain LAN HTTP: open `http://<your-computer-ip>:8000/demos/instant-photo-family/`.
- **Instant Camera** needs HTTPS on a phone. Without it the screen shows `Camera requires HTTPS`, and `Choose photo` still works. Any HTTPS host will do, for example:
  - GitHub Pages for this repo;
  - a tunnel such as `npx localtunnel --port 8000` or `cloudflared tunnel --url http://localhost:8000`.

## Acceptance tests

`tests/acceptance.cjs` drives the demo with Playwright (desktop + iPhone 13 emulation, fake camera) and checks the V1 acceptance list:

~~~sh
npm install --no-save playwright && npx playwright install chromium   # once
python3 -m http.server 8765 &
node demos/instant-photo-family/tests/acceptance.cjs
~~~

Screenshots of each state are written to `tests/shots/`.
