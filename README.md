# Korpsinventar

Inventory management system for marching bands and other bands — self-hosted web application built with Node.js and SQLite, packaged with Docker.

## Features

- **Instruments** — registration, condition tracking, QR codes, service alerts
- **Musicians** — overview, instrument assignment, QR scanning
- **Service log** — log with status (In service / Ready for pickup / Done), workshop linking, invoice numbers
- **Accessories & stock** — inventory, minimum levels, supplier linking, barcode scanning
- **To-do list** — task list with status, assignee, and sign-off
- **Reports** — service cost per workshop, item cost per category
- **User management** — roles (Administrator / User), per-user permissions
- **Settings** — corps logo, corps name, currency
- Export to CSV and Excel for all sections
- Dark/light theme
- English/Norwegian language toggle
- PWA support (installable on mobile)

---

## Getting started

### Requirements
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/)
- `openssl` (included on macOS and Linux; Windows: Git Bash or WSL)

### Start with HTTPS (required for camera/barcode scanning)

The QR code and barcode scanner require HTTPS. Run these commands once:

```bash
cd korpsinventar

# Step 1: Generate a self-signed SSL certificate
bash generate-cert.sh

# Step 2: Build and start
docker compose up -d

# The app is now available at:
# https://localhost
```

The first time, your browser will warn about the certificate (self-signed). Click "Advanced" → "Proceed to localhost" to accept it.

### Without HTTPS (simpler, but no camera scanning)

```bash
docker compose -f docker-compose.simple.yml up -d

# Available at: http://localhost:3000
```

### Stop the app
```bash
docker compose down
```

### Update to a new version
```bash
docker compose down
docker compose up -d --build
```

---

## First login

A default admin user is created automatically on startup:

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

**A password change is required on first login.** Change it to something secure immediately.

New users are created under the **Users** section (visible to administrators only).

---

## User management

The application has two roles:

| Role          | Description                                         |
|---------------|-----------------------------------------------------|
| Administrator | Full access, including users and settings           |
| User          | Access to daily use features (configurable per field)|

Permissions can be customised per user regardless of role. Available permissions:

- Instruments: Read / Edit / Delete
- Musicians: Read / Edit / Delete / Assign instrument
- Service log: Read / Edit / Delete
- Accessories: Read / Edit / Delete
- To-do list: Read / Edit / Delete
- Workshops: Admin
- Suppliers: Admin
- Reports: Read
- Users: Admin

---

## Configuration

Environment variables:

| Variable         | Default                   | Description                                    |
|------------------|---------------------------|------------------------------------------------|
| `PORT`           | `3000`                    | Port the app listens on                        |
| `DB_PATH`        | `/data/korpsinventar.db`  | Path to the SQLite database                    |
| `SESSION_SECRET` | (internal default)        | Secret for session encryption. Set this explicitly in production. |

### Set SESSION_SECRET in production

In `docker-compose.yml`:
```yaml
environment:
  - SESSION_SECRET=your-long-random-secret
```

### Change port (e.g. to 8080)
In `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"
```

---

## Backup

The database is stored in the Docker volume `korpsinventar-data`. Sessions are stored in a separate file in the same directory.

```bash
# Copy the database directly from the container
docker cp korpsinventar:/data/korpsinventar.db ./backup.db

# Or find the volume location on disk
docker volume inspect korpsinventar-data
```

---

## Manual Docker (without Compose)

```bash
docker build -t korpsinventar .
docker volume create korpsinventar-data
docker run -d \
  --name korpsinventar \
  -p 3000:3000 \
  -v korpsinventar-data:/data \
  -e SESSION_SECRET=your-secret \
  --restart unless-stopped \
  korpsinventar
```

---

## Running locally without Docker

```bash
npm install
DB_PATH=./db/korpsinventar.db node server.js
```

Requires Node.js 18+.
