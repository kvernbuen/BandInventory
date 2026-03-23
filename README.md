# Korpsinventar

Inventarsystem for korps — self-hosted webapplikasjon med Node.js og SQLite, pakket med Docker.

## Funksjoner

- **Instrumenter** — registrering, tilstandssporing, QR-koder, servicevarsel
- **Musikanter** — oversikt, instrument-tildeling, QR-skanning
- **Servicelogg** — logg med status (Under service / Til henting / Ferdig), verksted-kobling, fakturanummer
- **Tilbehør og lager** — beholdning, minimumsgrenser, leverandørkobling, strekkodeskanning
- **Gjøremål** — oppgaveliste med status, ansvarlig og kvittering
- **Rapporter** — servicekostnad per verksted, varekostnad per kategori
- **Brukerstyring** — roller (Administrator / Bruker), per-bruker rettigheter
- **Innstillinger** — korpslogo, korpsnavn
- Eksport til CSV og Excel for alle seksjoner
- Mørk/lys tema
- PWA-støtte (kan installeres på mobil)

---

## Kom i gang

### Krav
- [Docker](https://docs.docker.com/get-docker/) og [Docker Compose](https://docs.docker.com/compose/)
- `openssl` (følger med macOS og Linux; Windows: Git Bash eller WSL)

### Start med HTTPS (nødvendig for kamera-/strekkodeskanning)

QR-kode- og strekkodeskanneren krever HTTPS. Kjør disse kommandoene én gang:

```bash
cd korpsinventar

# Steg 1: Generer selvsignert SSL-sertifikat
bash generate-cert.sh

# Steg 2: Bygg og start
docker compose up -d

# Appen er nå tilgjengelig på:
# https://localhost
```

Første gang vil nettleseren advare om sertifikatet (selvsignert). Klikk "Avansert" → "Fortsett til localhost" for å godta det.

### Uten HTTPS (enklere, men ingen kameraskanning)

```bash
docker compose -f docker-compose.simple.yml up -d

# Tilgjengelig på: http://localhost:3000
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

## Første innlogging

Ved oppstart opprettes en standard adminbruker automatisk:

| Felt       | Verdi      |
|------------|------------|
| Brukernavn | `admin`    |
| Passord    | `admin123` |

**Passordbytte kreves ved første innlogging.** Endre passordet til noe sikkert umiddelbart.

Nye brukere opprettes under **Brukere**-seksjonen (kun synlig for administratorer).

---

## Brukerstyring

Applikasjonen har to roller:

| Rolle          | Beskrivelse                                      |
|----------------|--------------------------------------------------|
| Administrator  | Full tilgang, inkl. brukere og innstillinger     |
| Bruker         | Tilgang til daglig bruk (konfigurerbart per felt)|

Rettigheter kan tilpasses per bruker uavhengig av rolle. Tilgjengelige rettigheter:

- Instrumenter: Les / Rediger / Slett
- Musikanter: Les / Rediger / Slett / Tildel instrument
- Servicelogg: Les / Rediger / Slett
- Tilbehør: Les / Rediger / Slett
- Gjøremål: Les / Rediger / Slett
- Verksteder: Admin
- Leverandører: Admin
- Rapporter: Les
- Brukere: Admin

---

## Konfigurasjon

Miljøvariabler:

| Variabel         | Standard                    | Beskrivelse                        |
|------------------|-----------------------------|------------------------------------|
| `PORT`           | `3000`                      | Port appen lytter på               |
| `DB_PATH`        | `/data/korpsinventar.db`    | Sti til SQLite-database            |
| `SESSION_SECRET` | (intern standard)           | Hemmelighet for sesjonskryptering. Sett denne eksplisitt i produksjon. |

### Sett SESSION_SECRET i produksjon

I `docker-compose.yml`:
```yaml
environment:
  - SESSION_SECRET=ditt-lange-tilfeldige-hemmelige-passord
```

### Endre port (f.eks. til 8080)
I `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"
```

---

## Sikkerhetskopiering

Databasen ligger i Docker-volumet `korpsinventar-data`. Sesjoner lagres i en separat fil i samme mappe.

```bash
# Kopier database direkte fra container
docker cp korpsinventar:/data/korpsinventar.db ./backup.db

# Eller finn volumets plassering på disk
docker volume inspect korpsinventar-data
```

---

## Manuell Docker (uten Compose)

```bash
docker build -t korpsinventar .
docker volume create korpsinventar-data
docker run -d \
  --name korpsinventar \
  -p 3000:3000 \
  -v korpsinventar-data:/data \
  -e SESSION_SECRET=ditt-hemmelige-passord \
  --restart unless-stopped \
  korpsinventar
```

---

## Kjøre lokalt uten Docker

```bash
npm install
DB_PATH=./db/korpsinventar.db node server.js
```

Krever Node.js 18+.
