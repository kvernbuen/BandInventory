# Korpsinventar

Inventarsystem for korps — self-hosted med Docker.

## Kom i gang

### Krav
- [Docker](https://docs.docker.com/get-docker/) og [Docker Compose](https://docs.docker.com/compose/)

### Start med Docker Compose (anbefalt)

```bash
# Klon / kopier filene til en mappe, gå inn i mappen
cd korpsinventar

# Bygg og start
docker compose up -d

# Appen er nå tilgjengelig på:
# http://localhost:3000
```

### Stopp appen
```bash
docker compose down
```

### Oppdater til ny versjon
```bash
docker compose down
docker compose up -d --build
```

---

## Manuell Docker (uten Compose)

```bash
# Bygg image
docker build -t korpsinventar .

# Opprett et volume for databasen
docker volume create korpsinventar-data

# Start container
docker run -d \
  --name korpsinventar \
  -p 3000:3000 \
  -v korpsinventar-data:/data \
  --restart unless-stopped \
  korpsinventar
```

---

## Konfigurasjon

Miljøvariabler:

| Variabel   | Standard                    | Beskrivelse          |
|------------|-----------------------------|----------------------|
| `PORT`     | `3000`                      | Port appen lytter på |
| `DB_PATH`  | `/data/korpsinventar.db`    | Sti til SQLite-database |

### Endre port (f.eks. til 8080)
I `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"
```

---

## Sikkerhetskopiering

Databasen ligger i Docker-volumet `korpsinventar-data`. Kopier den ut:

```bash
# Finn volumets plassering
docker volume inspect korpsinventar-data

# Eller kopier direkte fra container
docker cp korpsinventar:/data/korpsinventar.db ./backup.db
```

---

## Kjøre lokalt uten Docker

```bash
npm install
DB_PATH=./db/korpsinventar.db node server.js
```

Krever Node.js 18+.
