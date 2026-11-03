import { useState, useSyncExternalStore } from "react";
import { Check, ExternalLink, KeyRound, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { setSettings } from "@/lib/store";
import { CHECKOUT_URL, PRO_PRICE, TRIAL_DAYS, usePro, verifyLicense } from "@/lib/pro";
import { APP_NAME } from "@/lib/brand";

let open = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((s) => s());
export function openUpgrade() {
  open = true;
  emit();
}
function closeUpgrade() {
  open = false;
  emit();
}
function useOpen() {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => open,
  );
}

const PERKS = [
  [
    "Smart Insights",
    "Your personal trigger odds from daily check-ins: sleep, stress, food, cycle, weather.",
  ],
  ["48-hour pressure forecast", "See pressure drops coming and get a heads-up before they hit."],
  [
    "Full clinician report",
    "Attack log, headache days, medication days, triggers and med effectiveness in one PDF, plus CSV export.",
  ],
  [
    "Supports independent development",
    "No ads, no data selling, ever. Your diary never leaves your device.",
  ],
];

const safeCheckout = /^https:\/\/[^\s"'<>]+$/.test(CHECKOUT_URL) ? CHECKOUT_URL : "";

export function UpgradeDialog() {
  const isOpen = useOpen();
  const pro = usePro();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  if (!isOpen) return null;

  const activate = async () => {
    setBusy(true);
    const info = await verifyLicense(key);
    setBusy(false);
    if (!info) {
      toast.error("That key isn't valid. Check for missing characters, or contact support.");
      return;
    }
    setSettings({ license: key.trim() });
    setKey("");
    toast.success("Pro unlocked. Thank you!");
    closeUpgrade();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={`${APP_NAME} Pro`}
    >
      <div className="mx-auto max-w-xl px-4 pt-4 pb-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">{APP_NAME} Pro</h2>
          <button className="chip" onClick={closeUpgrade} aria-label="Close">
            <X size={15} /> Close
          </button>
        </div>

        <section className="grad-hero rounded-3xl p-5">
          <Sparkles size={26} />
          <p className="mt-2 text-2xl font-bold">Understand your migraines, not just log them.</p>
          <p className="mt-1 text-sm text-white/85">
            {pro.licensed
              ? "Pro is active on this device. Thank you for supporting the app."
              : pro.trialLeft > 0
                ? `Your free ${TRIAL_DAYS}-day trial has ${pro.trialLeft} day${pro.trialLeft === 1 ? "" : "s"} left. Everything stays unlocked until then.`
                : "Your trial has ended. Logging, history, basic insights and the summary PDF stay free forever."}
          </p>
        </section>

        <ul className="mt-5 space-y-3">
          {PERKS.map(([t, body]) => (
            <li key={t} className="card-soft flex gap-3 !p-4">
              <Check size={18} className="mt-0.5 shrink-0 text-primary" />
              <div>
                <p className="font-bold">{t}</p>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>

        {!pro.licensed && (
          <>
            {safeCheckout ? (
              <a
                className="btn mt-6 w-full"
                href={safeCheckout}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get Pro · {PRO_PRICE} <ExternalLink size={15} />
              </a>
            ) : (
              <p className="card-soft mt-6 text-center text-sm text-muted-foreground">
                Pro purchases open soon. Already have a key? Enter it below.
              </p>
            )}
            <section className="card-soft mt-4">
              <label className="field-label" htmlFor="lic">
                <KeyRound size={14} className="mr-1 inline" /> License key
              </label>
              <textarea
                id="lic"
                rows={3}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="w-full font-mono text-xs"
                placeholder="Paste the key from your purchase email"
                spellCheck={false}
                autoComplete="off"
              />
              <button className="btn mt-2 w-full" onClick={activate} disabled={busy || !key.trim()}>
                {busy ? "Checking..." : "Activate"}
              </button>
              <p className="mt-2 text-xs text-muted-foreground">
                Keys are checked on your device. Nothing is sent anywhere.
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
