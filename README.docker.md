# Docker Compose Usage Guide

This project supports running both **development** and **production** modes using the same `docker-compose.yml` file.

---

## 🚀 Development Mode (Default)

Hot-reload enabled, runs `next dev`:

```bash
# Start development environment
docker-compose up

# Or with build logs
docker-compose up --build
```

---

## 🏭 Production Mode

Uses pre-built `.next` folder from your local machine, runs `next start`:

### Step 1: Build Next.js locally

```bash
pnpm build
```

This creates the optimized production build in `.next/` directory.

### Step 2: Start production environment

```bash
# Set NODE_ENV and start
NODE_ENV=production docker-compose up

# Or export it first
export NODE_ENV=production
docker-compose up
```

### Step 3: Optional - Use production env file

Create `.env.production.local` (copy from `.env.production.local.example`):

```bash
cp .env.production.local.example .env.production.local
# Edit .env.production.local with your production values
```

Then start with:

```bash
docker-compose --env-file .env.production.local up
```

---

## 📋 Quick Commands

| Command | Description |
|---------|-------------|
| `docker-compose up` | Start in **dev mode** (hot-reload) |
| `pnpm build && NODE_ENV=production docker-compose up` | Start in **prod mode** |
| `docker-compose down` | Stop all services |
| `docker-compose down -v` | Stop and remove volumes (⚠️ deletes DB data) |
| `docker-compose logs -f app` | View app logs |
| `docker-compose restart app` | Restart just the app service |

---

## 🔧 How It Works

The `app` service in `docker-compose.yml`:

- **Checks `NODE_ENV` environment variable**
- If `development` (default): runs `next dev` with hot-reload
- If `production`: runs `next start` using `.next` folder

### Mounted Volumes

**Development mode:**
- Source code (`./src`) - live changes
- `.next/` folder - generated during dev

**Production mode:**
- Pre-built `.next/` folder - from `pnpm build`
- Source code mounted (read-only)

---

## 📦 Services Included

- **libsql** - Local database (port 8080)
- **redis** - Cache & sessions (port 6379)
- **qstash** - Queue system (port 8081)
- **mailhog** - Email testing (port 8025)
- **webhook-tester** - Webhook testing (port 8082)
- **app** - Next.js app (port 3000)

---

## ⚠️ Important Notes

1. **Always run `pnpm build` before production mode**
   - Production mode requires `.next` folder to exist
   - `next start` won't work without a build

2. **Clear .next folder between mode switches**
   ```bash
   rm -rf .next
   ```
   - Dev and prod builds are different
   - Mixing them can cause issues

3. **Production checklist**
   - ✅ Update secrets in `.env.production.local`
   - ✅ Set real `BETTER_AUTH_SECRET`
   - ✅ Configure email provider (RESEND_API_KEY)
   - ✅ Set `SKIP_EMAIL_SENDING=false`

---

## 🐛 Troubleshooting

### App won't start in production mode
```bash
# Rebuild Next.js
rm -rf .next
pnpm build
NODE_ENV=production docker-compose up
```

### Permission errors with .next folder
```bash
# Fix permissions
sudo chown -R $USER:$USER .next
```

### Database changes not reflected
```bash
# Rebuild migrations
docker-compose down
docker-compose up db-migrate
docker-compose up
```

---

## 🎯 Best Practices

1. **Use dev mode for development**
   - Fast hot-reload
   - Better debugging

2. **Test prod build before deploying**
   - Catches build-time errors
   - Verifies production optimizations

3. **Keep .next in .gitignore**
   - Build locally
   - Don't commit build artifacts
