#!/bin/bash

# Script to generate self-signed SSL certificates for development/testing
# DO NOT use these certificates in production!

set -e

# Configuration
CERT_DIR="../certs"
CERT_FILE="$CERT_DIR/server.pem"
KEY_FILE="$CERT_DIR/server.key"
DAYS_VALID=365
COUNTRY="US"
STATE="California"
CITY="San Francisco"
ORGANIZATION="Development"
COMMON_NAME="localhost"

# Create certificate directory if it doesn't exist
mkdir -p "$CERT_DIR"

echo "Generating self-signed SSL certificate for development..."
echo "Certificate will be valid for $DAYS_VALID days"
echo ""

# Generate private key and certificate in one command
openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "$KEY_FILE.orig" \
    -out "$CERT_FILE" \
    -days "$DAYS_VALID" \
    -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORGANIZATION/CN=$COMMON_NAME"

# Convert private key to PKCS#8 format for better compatibility
echo "Converting private key to PKCS#8 format..."
openssl pkcs8 -topk8 -nocrypt -in "$KEY_FILE.orig" -out "$KEY_FILE"
rm "$KEY_FILE.orig" # Remove the original pre-conversion key

echo ""
echo "Certificate generated successfully!"
echo "Certificate: $CERT_FILE"
echo "Private Key: $KEY_FILE"
echo ""
echo "To use these certificates, update your config file:"
echo "  ssl_enabled = true"
echo "  ssl_cert_path = \"$CERT_FILE\""
echo "  ssl_key_path = \"$KEY_FILE\""
echo ""
echo "WARNING: This is a self-signed certificate for development only!"
echo "Do not use in production environments!" 