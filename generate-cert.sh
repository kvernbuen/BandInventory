#!/bin/bash
# Kjør dette scriptet én gang for å generere et selvsignert SSL-sertifikat.
# Nettleseren vil advare om sertifikatet, men kameraet vil fungere over HTTPS.

set -e
CERT_DIR="$(dirname "$0")/nginx/certs"
mkdir -p "$CERT_DIR"

openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$CERT_DIR/key.pem" \
  -out "$CERT_DIR/cert.pem" \
  -subj "/CN=korpsinventar" \
  -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"

echo ""
echo "Sertifikat generert i $CERT_DIR"
echo "Start appen med: docker compose up -d"
echo "Åpne: https://localhost  (godta sertifikatadvarselen i nettleseren)"
