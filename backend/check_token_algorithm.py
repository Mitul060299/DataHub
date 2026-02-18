"""
Quick script to decode JWT token and check algorithm.
Run this in browser console, then paste the output here:

localStorage.getItem('datahub_token')

Paste the token below and run: python check_token_algorithm.py
"""

import base64
import json
import sys

def decode_token_parts(token: str):
    """Decode JWT token to see header and payload without verification"""
    try:
        parts = token.split('.')
        if len(parts) != 3:
            print(f"ERROR: Token has {len(parts)} parts, expected 3")
            return
        
        # Decode header
        header = parts[0]
        header += '=' * (4 - len(header) % 4)  # Add padding
        header_decoded = base64.urlsafe_b64decode(header)
        header_data = json.loads(header_decoded)
        
        # Decode payload
        payload = parts[1]
        payload += '=' * (4 - len(payload) % 4)  # Add padding
        payload_decoded = base64.urlsafe_b64decode(payload)
        payload_data = json.loads(payload_decoded)
        
        print("=" * 60)
        print("JWT TOKEN ANALYSIS")
        print("=" * 60)
        print("\n📋 HEADER:")
        print(json.dumps(header_data, indent=2))
        print(f"\n🔐 Algorithm: {header_data.get('alg', 'UNKNOWN')}")
        print(f"🔑 Key ID (kid): {header_data.get('kid', 'NONE')}")
        
        print("\n📦 PAYLOAD (sample fields):")
        print(f"  - User ID (sub): {payload_data.get('sub', 'NONE')}")
        print(f"  - Email: {payload_data.get('email', 'NONE')}")
        print(f"  - Role: {payload_data.get('role', 'NONE')}")
        print(f"  - Audience (aud): {payload_data.get('aud', 'NONE')}")
        print(f"  - Issuer (iss): {payload_data.get('iss', 'NONE')}")
        print(f"  - Issued at (iat): {payload_data.get('iat', 'NONE')}")
        print(f"  - Expires (exp): {payload_data.get('exp', 'NONE')}")
        
        print("\n" + "=" * 60)
        print("🎯 VERIFICATION APPROACH:")
        print("=" * 60)
        
        alg = header_data.get('alg', '')
        if alg.startswith('HS'):
            print(f"✅ Token uses {alg} (symmetric HMAC)")
            print("   → Use SUPABASE_JWT_SECRET directly")
            print("   → No JWKS needed")
            print("   → Algorithm: ['HS256']")
        elif alg.startswith('RS'):
            print(f"⚠️  Token uses {alg} (asymmetric RSA)")
            print("   → Need to fetch public key from JWKS")
            print("   → Endpoint: /auth/v1/.well-known/jwks.json")
        elif alg.startswith('ES'):
            print(f"⚠️  Token uses {alg} (asymmetric Elliptic Curve)")
            print("   → Need to fetch public key from JWKS")
            print("   → Endpoint: /auth/v1/.well-known/jwks.json")
        else:
            print(f"❌ Unknown algorithm: {alg}")
        
        print("\n")
        
    except Exception as e:
        print(f"ERROR decoding token: {type(e).__name__}: {e}")

if __name__ == "__main__":
    print("Paste your JWT token from localStorage.getItem('datahub_token'):")
    print("(Press Enter when done)")
    
    token = input().strip()
    
    if not token:
        print("No token provided. Exiting...")
        sys.exit(1)
    
    decode_token_parts(token)
