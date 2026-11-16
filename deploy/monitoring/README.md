# SupplyGuard monitoring (Prometheus + Grafana)

**Status: installed and running locally** (user-local, no system packages):

- `prometheus` 3.5.0 — `127.0.0.1:9090`, storage `~/.local/share/supplyguard/monitoring/prometheus-data/`, config `~/.local/share/supplyguard/monitoring/prometheus.yml`
- `grafana` 12.0.2 — `127.0.0.1:3001`, data `~/.local/share/supplyguard/monitoring/grafana/data/`, admin password: set during first login (not stored in the repo)
- Both run as `setsid` processes, survive shell exits. Official release tarballs
  (sha256-verified), kept under `~/.local/share/supplyguard/monitoring/dl/`.

Restart both with:

```sh
M=$HOME/.local/share/supplyguard/monitoring
setsid nohup "$M/prometheus/prometheus" --config.file="$M/prometheus.yml" --storage.tsdb.path="$M/prometheus-data" --web.listen-address=127.0.0.1:9090 > "$M/prometheus.log" 2>&1 < /dev/null &
GF_SERVER_HTTP_ADDR=127.0.0.1 GF_SERVER_HTTP_PORT=3001 GF_PATHS_PROVISIONING="$M/grafana-provisioning" GF_PATHS_DATA="$M/grafana/data" setsid nohup "$M/grafana/bin/grafana" server --homepath "$M/grafana" > "$M/grafana.log" 2>&1 < /dev/null &
```

The pacman route (system packages) is documented at the bottom of this file as an
alternative. SupplyGuard runs perfectly without any of this; it exposes one scrape
endpoint, `GET /metrics` on the API server (port 4000), plus the provisioned Grafana
dashboard.

## What is exposed

`GET /metrics` (outside `/api/v1`) serves Prometheus text format:

- Default Node.js process metrics (`nodejs_heap_size_*`, `nodejs_eventloop_lag_*`, GC pauses, …) from `prom-client`'s `collectDefaultMetrics`.
- `supplyguard_http_requests_total{method, route, status}` — normalized route labels (cuid/uuid-like segments become `:id`) — and `supplyguard_http_request_duration_seconds`.
- `supplyguard_scans_total{result, source}` (result `completed|failed`) and `supplyguard_scan_duration_seconds{source}` — recorded by the scan worker.
- `supplyguard_osv_checks_total{status}` and `supplyguard_license_checks_total{status}` — integration outcomes per scan (`complete|partial|unavailable|not_requested`).
- `supplyguard_reports_generated_total{format}`.
- `supplyguard_queue_depth{queue}` — pending/active jobs in the `supplyguard-scan` pg-boss queue. `-1` means the pg-boss schema is unavailable (e.g. API started but worker never initialized it).

**No findings, no scan content, no user data, no secrets are exposed.** Counters are in-memory and reset on process restart — there is no persistence or long-term storage guarantee; this is app telemetry, not an audit log.

`GET /metrics` is unauthenticated by default (typical for localhost scrape endpoints). Set `METRICS_TOKEN` in `backend/.env` to require `Authorization: Bearer <token>`, and mirror the token in `prometheus.yml` (commented example included).

## What is NOT here

- No SLO/alerting rules — the dashboard is descriptive; wire alerts yourself.
- No OSV/license/security data — Grafana cannot see findings; they live in the app database.
- No Next.js metrics — the frontend has no `/metrics` endpoint.
- No recording rules, no remote storage, no HA.

## Alternative: install (Arch, with sudo) — not the current setup

```sh
# 1. Install (you run this; the assistant cannot provide your sudo password)
sudo pacman -S prometheus grafana

# 2. Prometheus config
sudo cp deploy/monitoring/prometheus.yml /etc/prometheus/prometheus.yml
sudo systemctl enable --now prometheus
# verify: curl localhost:9090/api/v1/query?query=up

# 3. Grafana datasource + dashboard provisioning
sudo mkdir -p /var/lib/grafana/dashboards/supplyguard
sudo cp deploy/monitoring/grafana/supplyguard-overview.json /var/lib/grafana/dashboards/supplyguard/
sudo cp deploy/monitoring/grafana/provisioning/datasources/prometheus.yml /etc/grafana/provisioning/datasources/
sudo cp deploy/monitoring/grafana/provisioning/dashboards/supplyguard.yml /etc/grafana/provisioning/dashboards/
sudo systemctl enable --now grafana
# verify: curl -s localhost:3000  → then open http://localhost:3000 (Grafana) → dashboard "SupplyGuard — API & Worker"
```

Grafana's default port is 3000 — it clashes with the Next.js dev server; change
`http_port` in `/etc/grafana/grafana.ini` (e.g. `3001`) or stop Next while checking Grafana.

## Verify after install

1. `curl -s localhost:4000/metrics | grep supplyguard_` shows the custom metrics.
   The scan worker exposes the same format on `127.0.0.1:4001/metrics`.
2. Prometheus "Status → Targets" shows `supplyguard-api` **and** `supplyguard-worker` UP.
3. Grafana → dashboards → SupplyGuard → "SupplyGuard — API & Worker" (15 panels).

## Troubleshooting: every panel says "No data"

Check whether the machine clock moved backwards (common after a VM suspend/resume
when NTP is inactive — `timedatectl` reports `System clock synchronized: no`).
Prometheus keeps samples stamped with the old clock, and a query for "now" then
matches nothing, while targets still report `up`.

```sh
date -u
curl -s "http://127.0.0.1:9090/api/v1/query?query=up"   # empty → clock skew
curl -s "http://127.0.0.1:9090/api/v1/query?query=timestamp(up)"   # newest sample time
```

If the newest sample is in the future, stop Prometheus, move its storage aside
(metrics history is disposable), and start it again so it scrapes with the current
clock:

```sh
M=$HOME/.local/share/supplyguard/monitoring
pkill -f 'prometheus --config.file'
mv "$M/prometheus-data" "$M/prometheus-data.clockjump-$(date +%Y%m%d-%H%M%S)"
setsid nohup "$M/prometheus/prometheus" --config.file="$M/prometheus.yml" --storage.tsdb.path="$M/prometheus-data" --web.listen-address=127.0.0.1:9090 > "$M/prometheus.log" 2>&1 < /dev/null &
```

Rate-based panels (`rate(...[5m])`) stay "No data" for about five minutes after a
fresh start; gauge panels (heap, event-loop lag, queue depth) populate immediately.

## Known limits of the local install

- Both processes are user-session daemons — they do not auto-start on boot or survive
  a full machine reboot without the commands above.
- Grafana runs on port **3001**, not 3000 (Next.js dev server occupies 3000).
- The dashboard's scan-outcome panels show **No data** until a scan runs against the
  current API process (counters are in-memory and reset on API restart).
- Metrics are per-process and in-memory; totals do not persist across restarts.
- Docker alternative

Not tested on this machine (Docker access requires the user to be in the `docker` group).
`docker-compose.yml` documents the Postgres service; Prometheus/Grafana were deliberately
not added there because the pacman route is the supported one for this environment.
