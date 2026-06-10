#!/bin/bash
# 生成自签 SSL 证书，供 Docker 构建使用
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SSL_DIR="$SCRIPT_DIR/../ssl"

mkdir -p "$SSL_DIR"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$SSL_DIR/key.pem" \
  -out "$SSL_DIR/cert.pem" \
  -subj "/CN=localhost/O=KooTerm/C=CN"

echo "SSL 证书已生成: $SSL_DIR/"
