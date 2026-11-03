import { useEffect, useState } from "react";
import { useData } from "./store";

/**
 * Pro licensing — offline, no server, no account.
 *
 * A license key is `base64url(payloadJSON).base64url(ECDSA-P256-SHA256 signature)`.
 * Keys are issued with `npm run license:issue -- <buyer-id>` using the private key
 * that stays on the seller's machine (.keys/, git-ignored). The app only holds the
 * public key, so keys can't be forged from the published code.
 *
 * Honest caveat: like any client-only paywall, someone editing the app's code
 * can bypass the check. This stops casual key sharing/forging, not determined
 * tampering, which is the normal trade-off for a privacy-first offline app.
 */

// Public half of the key pair from `npm run license:keys`. Safe to publish.
export const LICENSE_PUBLIC_JWK: JsonWebKey = {
  kty: "EC",
  crv: "P-256",
  x: "cvQpT1IO6T8xv0rk-eE83og4sffO8qww9DTiEDSGklc",
  y: "jE8pP0DSVo_NCxhnmc8f5picCjX41IzNndktn_BNuDM",
};

export const TRIAL_DAYS = 14;
export const CHECKOUT_URL: string = (import.meta.env.VITE_CHECKOUT_URL as string | undefined) ?? "";
export const PRO_PRICE: string =
  (import.meta.env.VITE_PRO_PRICE as string | undefined) ?? "$4.99/mo or $29/yr";

export interface LicenseInfo {
  id: string; // buyer id / email hash, whatever the seller used
  issued: number;
  expires: number | null;
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let keyPromise: Promise<CryptoKey> | null = null;
function publicKey(jwk: JsonWebKey): Promise<CryptoKey> {
  if (jwk !== LICENSE_PUBLIC_JWK) {
    return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
      "verify",
    ]);
  }
  keyPromise ??= crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  return keyPromise;
}

export async function verifyLicense(
  key: string,
  jwk: JsonWebKey = LICENSE_PUBLIC_JWK,
  now = Date.now(),
): Promise<LicenseInfo | null> {
  try {
    const trimmed = key.trim();
    if (trimmed.length > 1000 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(trimmed)) return null;
    const [p, s] = trimmed.split(".");
    const payloadBytes = b64urlToBytes(p);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      await publicKey(jwk),
      b64urlToBytes(s),
      payloadBytes,
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as {
      id?: unknown;
      iat?: unknown;
      exp?: unknown;
      app?: unknown;
    };
    if (
      payload.app !== "migra" ||
      typeof payload.id !== "string" ||
      typeof payload.iat !== "number"
    )
      return null;
    const expires = typeof payload.exp === "number" ? payload.exp : null;
    if (expires != null && expires < now) return null;
    return { id: payload.id, issued: payload.iat, expires };
  } catch {
    return null;
  }
}

export function trialDaysLeft(firstUse: number | null, now = Date.now()): number {
  if (firstUse == null) return TRIAL_DAYS;
  const left = TRIAL_DAYS - Math.floor((now - firstUse) / 86400000);
  return Math.max(0, Math.min(TRIAL_DAYS, left));
}

export interface ProState {
  isPro: boolean;
  licensed: LicenseInfo | null;
  trialLeft: number;
  checking: boolean;
}

/** Pro if a valid license is stored, or the free trial is still running. */
export function usePro(): ProState {
  const d = useData();
  const { license, firstUse } = d.settings;
  const [licensed, setLicensed] = useState<LicenseInfo | null>(null);
  const [checking, setChecking] = useState(!!license);

  useEffect(() => {
    let live = true;
    if (!license) {
      setLicensed(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    verifyLicense(license).then((info) => {
      if (!live) return;
      setLicensed(info);
      setChecking(false);
    });
    return () => {
      live = false;
    };
  }, [license]);

  const trialLeft = trialDaysLeft(firstUse);
  return { isPro: !!licensed || trialLeft > 0, licensed, trialLeft, checking };
}
