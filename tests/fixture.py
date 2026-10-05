"""Create/analyze a harmless fixture, or recheck it after dsh restarts."""
import base64
import hashlib
import json
from pathlib import Path
import sys
import zlib

from Crypto.Cipher import AES
from z3 import Int, Solver, sat

mode = sys.argv[1]
assert mode in ("initial", "resumed")
proof = "CTF_LOCAL_FIXTURE_OK_中文_20260922"
payload = proof.encode("utf-8")
artifact_dir = Path.cwd() / "artifacts"
artifact_dir.mkdir(exist_ok=True)
encoded = base64.b64encode(zlib.compress(payload))
fixture = artifact_dir / "harmless-fixture.bin"
if mode == "initial":
    fixture.write_bytes(encoded)
else:
    assert fixture.read_bytes() == encoded, "Stored fixture changed after restart"
decoded = zlib.decompress(base64.b64decode(fixture.read_bytes()))
assert decoded == payload
cipher = AES.new(bytes(range(16)), AES.MODE_EAX, nonce=bytes(range(16)))
ciphertext, tag = cipher.encrypt_and_digest(decoded)
assert AES.new(bytes(range(16)), AES.MODE_EAX, nonce=bytes(range(16))).decrypt_and_verify(ciphertext, tag) == payload
x = Int("x")
solver = Solver()
solver.add(x * 7 == 294)
assert solver.check() == sat and solver.model()[x].as_long() == 42
result = {
    "marker": "CTF_PYTHON_" + mode.upper() + "_OK",
    "proof": decoded.decode("utf-8"),
    "sha256": hashlib.sha256(fixture.read_bytes()).hexdigest(),
    "bytes": len(fixture.read_bytes()),
    "python": str(Path(sys.executable).resolve()),
    "aesRoundtrip": True,
    "z3Solution": 42,
}
if mode == "initial":
    (artifact_dir / "analysis.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
else:
    saved = json.loads((artifact_dir / "analysis.json").read_text(encoding="utf-8"))
    assert saved["sha256"] == result["sha256"]
print(json.dumps(result, ensure_ascii=False))
