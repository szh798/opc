# Tencent Cloud Deployment

This folder contains the baseline assets used to deploy the OPC backend to a Tencent Cloud Ubuntu server.

## Files

- `ecosystem.config.cjs`: PM2 process definition for the NestJS backend
- `opc-backend.conf`: Nginx reverse-proxy config for `api.atreeagent.com` and `trial-api.atreeagent.com`
- `backup-postgres.sh`: local daily backup helper for the Dockerized PostgreSQL instance

## Expected server layout

```text
/srv/opc-latest
  ├─ backend/
  ├─ deploy/tencent-cloud/
  └─ ...
```

## Expected services

- Node.js 20 LTS
- PM2
- Docker Engine + Compose plugin
- Nginx

## Notes

- The mini-program frontend is uploaded through WeChat DevTools; only `backend/` runs on the server.
- WeChat production traffic requires a real HTTPS domain. IP-only deployment is useful for backend smoke tests, but not enough for official mini-program traffic.
- Before applying `opc-backend.conf`, issue certificates for both domains, for example:
  `sudo certbot certonly --nginx -d api.atreeagent.com -d trial-api.atreeagent.com`.
  The DNS A records must point to the real public server IP before requesting certificates.
- Production hardening still recommended after first deploy: lock down `.env` permissions, enable PM2 log rotation, keep `STORAGE_DIR` on persistent disk, and schedule PostgreSQL backups.
