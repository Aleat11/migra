import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Download, Smartphone, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { getData, replaceAll, setSettings, useData } from "@/lib/store";
import { backupJson, downloadText, MAX_IMPORT_BYTES, mergeBackup, parseBackup } from "@/lib/backup";
import { notifySupported, requestNotify } from "@/lib/notify";
import { usePro } from "@/lib/pro";
import { openUpgrade } from "./Upgrade";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function SettingsCard() {
  const d = useData();
  const pro = usePro();
  const [open, setOpen] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    setDeferred(null);
  };

  const toggleNotify = async (on: boolean) => {
    if (!on) {
      setSettings({ notify: false });
      return;
    }
    const ok = await requestNotify();
    setSettings({ notify: ok });
    if (!ok) toast.error("Notifications were blocked by the browser.");
  };

  const exportBackup = () => {
    downloadText(`auraguard-backup-${new Date().toISOString().slice(0, 10)}.json`, backupJson(d));
    toast.success("Backup downloaded.");
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      toast.error("That file is too large to be a diary backup.");
      return;
    }
    try {
      const parsed = parseBackup(await file.text());
      const { data, added } = mergeBackup(getData(), parsed);
      replaceAll(data);
      toast.success(
        added ? `Imported ${added} new item${added === 1 ? "" : "s"}.` : "Already up to date.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not import that file.");
    }
  };

  return (
    <section aria-label="Settings and data" className="card-soft">
      <button
        className="flex w-full cursor-pointer items-center justify-between gap-3 text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <div>
          <p className="font-bold">Display, alerts & backup</p>
          <p className="text-sm text-muted-foreground">
            High contrast, reminders, and local backup.
          </p>
        </div>
        <ChevronDown
          size={18}
          className={cn("shrink-0 text-muted-foreground", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
            <span className="text-sm font-medium">High contrast</span>
            <input
              type="checkbox"
              checked={d.settings.highContrast}
              onChange={(e) => setSettings({ highContrast: e.target.checked })}
              className="h-5 w-5 accent-[var(--primary)]"
            />
          </label>

          {notifySupported() && (
            <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
              <span className="text-sm font-medium">
                <Bell size={14} className="mr-1.5 inline" />
                Medication & pressure-drop alerts
              </span>
              <input
                type="checkbox"
                checked={d.settings.notify}
                onChange={(e) => toggleNotify(e.target.checked)}
                className="h-5 w-5 accent-[var(--primary)]"
              />
            </label>
          )}

          {deferred && (
            <button className="btn btn-ghost w-full" onClick={install}>
              <Smartphone size={16} /> Install app on this device
            </button>
          )}

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button className="btn btn-ghost min-h-10 py-2 text-sm" onClick={exportBackup}>
              <Download size={15} /> Backup
            </button>
            <button
              className="btn btn-ghost min-h-10 py-2 text-sm"
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={15} /> Restore
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                importBackup(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </div>

          <button className="btn btn-ghost w-full min-h-10 py-2 text-sm" onClick={openUpgrade}>
            <Sparkles size={15} />{" "}
            {pro.licensed
              ? "Pro is active"
              : pro.trialLeft > 0
                ? `Pro trial (${pro.trialLeft}d left)`
                : "Upgrade to Pro"}
          </button>

          <p className="text-xs text-muted-foreground">
            Your diary is stored only in this browser. Back it up before clearing site data or
            switching phones. Restoring merges new entries and never deletes existing ones.
          </p>
        </div>
      )}
    </section>
  );
}
