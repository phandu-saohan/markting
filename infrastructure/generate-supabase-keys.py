#!/usr/bin/env python3
"""
Script tạo Supabase JWT Keys cho self-hosted
Chạy trên VPS: python3 generate-supabase-keys.py
"""

import hmac
import hashlib
import base64
import json
import time
import os
import secrets

def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode()

def make_jwt(payload: dict, secret: str) -> str:
    header = b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(',', ':')).encode())
    body   = b64url_encode(json.dumps(payload, separators=(',', ':')).encode())
    signing_input = f"{header}.{body}".encode()
    sig = b64url_encode(hmac.new(secret.encode(), signing_input, hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"

now     = int(time.time())
exp_far = now + 315_360_000  # 10 năm

jwt_secret        = secrets.token_hex(32)          # 64 ký tự hex
anon_key          = make_jwt({"role": "anon",         "iss": "supabase", "iat": now, "exp": exp_far}, jwt_secret)
service_role_key  = make_jwt({"role": "service_role", "iss": "supabase", "iat": now, "exp": exp_far}, jwt_secret)
postgres_password = secrets.token_urlsafe(24)
dashboard_pass    = secrets.token_urlsafe(16)
secret_key_base   = secrets.token_hex(64)
vault_enc_key     = secrets.token_hex(16)

output = f"""
# ═══════════════════════════════════════════════════════════
# Supabase Self-Hosted — Generated Keys
# Tạo lúc: {time.strftime('%Y-%m-%d %H:%M:%S')}
# QUAN TRỌNG: Lưu file này ở nơi an toàn, KHÔNG commit lên git!
# ═══════════════════════════════════════════════════════════

JWT_SECRET={jwt_secret}
ANON_KEY={anon_key}
SERVICE_ROLE_KEY={service_role_key}

POSTGRES_PASSWORD={postgres_password}
DASHBOARD_PASSWORD={dashboard_pass}
SECRET_KEY_BASE={secret_key_base}
VAULT_ENC_KEY={vault_enc_key}

# ── Paste những giá trị trên vào Dokploy Environment tab ──
"""

print(output)

# Lưu ra file để tiện copy
with open("supabase-keys.env", "w") as f:
    f.write(output.strip())

print("✅ Đã lưu vào: supabase-keys.env")
print("⚠️  XÓA file này sau khi đã điền vào Dokploy!")
