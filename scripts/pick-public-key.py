"""Reads `supabase projects api-keys -o json` from stdin and writes ONLY the public
(anon / publishable) key plus the project URL into .env.local. Secret keys are
never printed or saved."""
import json
import re
import sys

env_path, ref = sys.argv[1], sys.argv[2]
raw = json.load(sys.stdin)
keys = raw if isinstance(raw, list) else raw.get("keys") or raw.get("api_keys") or list(raw.values())

def is_public(k):
    name = str(k.get("name", "")).lower()
    typ = str(k.get("type", "")).lower()
    val = str(k.get("api_key") or k.get("key") or "")
    if "secret" in typ or "service" in name or val.startswith("sb_secret_"):
        return False
    return name in ("anon", "publishable", "default") or typ == "publishable" or val.startswith("sb_publishable_")

public = [k for k in keys if isinstance(k, dict) and is_public(k)]
if not public:
    sys.exit("No public (anon/publishable) key found. Names seen: " + ", ".join(str(k.get("name")) for k in keys if isinstance(k, dict)))
# Prefer the new publishable key; fall back to the legacy anon JWT.
public.sort(key=lambda k: 0 if str(k.get("api_key") or k.get("key") or "").startswith("sb_publishable_") else 1)
value = str(public[0].get("api_key") or public[0].get("key"))

text = open(env_path).read()
for name, val in (("NEXT_PUBLIC_SUPABASE_URL", f"https://{ref}.supabase.co"), ("NEXT_PUBLIC_SUPABASE_ANON_KEY", value)):
    if re.search(rf"^{name}=.*$", text, flags=re.M):
        text = re.sub(rf"^{name}=.*$", f"{name}={val}", text, flags=re.M)
    else:
        text += f"\n{name}={val}\n"
open(env_path, "w").write(text)
print(f"   saved public key ({public[0].get('name')}, starts {value[:14]}…)")
