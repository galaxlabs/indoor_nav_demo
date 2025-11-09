# Indoor Navigation Demo

Two builds:
1) **advanced/** — SVG floors + PWA (mobile friendly)
2) **single-file/** — no fetch/CORS; open directly

## Ubuntu VPS quick run
```bash
unzip indoor_nav_demo.zip -d /var/www
cd /var/www/indoor_nav_demo/advanced
python3 -m http.server 5500
# browse http://<server-ip>:5500
```

## Nginx
```
server {
  listen 80;
  server_name example.com;
  root /var/www/indoor_nav_demo/advanced;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
}
```

## Vercel
- Push this folder to a GitHub repo
- `vercel` from repo root (uses vercel.json to serve /advanced)

## Edit map
- advanced/building.geojson — add rooms/junctions/edges
- Keep STAIRS/LIFT aligned across floors (same x,y)

Enjoy!
