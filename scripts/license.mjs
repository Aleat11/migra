#!/usr/bin/env node
// Offline license tooling for Migra Pro.
//
//   node scripts/license.mjs keys                 -> creates .keys/license-private.jwk (KEEP SECRET)
//                                                   and prints the public JWK to paste into src/lib/pro.ts
//   node scripts/license.mjs issue <buyer-id> [days] -> prints a license key (omit days = lifetime)
//
// .keys/ is git-ignored. Back the private key up somewhere safe: losing it means
// you can't issue new keys that existing installs accept.
import { webcrypto as crypto } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const keyFile = join(root, ".keys", "license-private.jwk");
const b64url = (buf) => Buffer.from(buf).toString("base64url");

const [cmd, ...args] = process.argv.slice(2);

if (cmd === "keys") {
  if (existsSync(keyFile)) {
    console.error(
      `Refusing to overwrite existing ${keyFile}. Move it away first if you really mean it.`,
    );
    process.exit(1);
  }
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const priv = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const pub = await crypto.subtle.exportKey("jwk", pair.publicKey);
  mkdirSync(dirname(keyFile), { recursive: true });
  writeFileSync(keyFile, JSON.stringify(priv, null, 2), { mode: 0o600 });
  console.log(`Private key written to ${keyFile} (never commit or share it).`);
  console.log("Public key for src/lib/pro.ts:");
  console.log(JSON.stringify({ kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, null, 2));
} else if (cmd === "issue") {
  const [id, days] = args;
  if (!id) {
    console.error("usage: node scripts/license.mjs issue <buyer-id> [days]");
    process.exit(1);
  }
  const jwk = JSON.parse(readFileSync(keyFile, "utf8"));
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const now = Date.now();
  const payload = { app: "migra", id: String(id).slice(0, 120), iat: now };
  if (days) payload.exp = now + Number(days) * 86400000;
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, bytes);
  console.log(`${b64url(bytes)}.${b64url(sig)}`);
} else {
  console.error("usage: node scripts/license.mjs <keys|issue> ...");
  process.exit(1);
}
