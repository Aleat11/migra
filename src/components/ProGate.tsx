import type { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { usePro } from "@/lib/pro";
import { openUpgrade } from "./Upgrade";

/** Shows children for Pro/trial users; a calm teaser + upgrade button otherwise. */
export function ProGate({
  feature,
  teaser,
  children,
}: {
  feature: string;
  teaser: string;
  children: ReactNode;
}) {
  const pro = usePro();
  if (pro.isPro) return <>{children}</>;
  return (
    <div className="card-soft text-center">
      <span
        className="grad-dot mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-2xl text-white"
        aria-hidden="true"
      >
        <Lock size={18} />
      </span>
      <p className="font-bold">{feature}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{teaser}</p>
      <button className="btn mt-4" onClick={openUpgrade}>
        <Sparkles size={16} /> Unlock with Pro
      </button>
    </div>
  );
}

export function ProBadge() {
  const pro = usePro();
  if (pro.licensed) return null;
  if (pro.trialLeft > 0) {
    return (
      <button
        className="chip text-xs"
        onClick={openUpgrade}
        aria-label={`Pro trial: ${pro.trialLeft} days left`}
      >
        <Sparkles size={13} className="mr-1" /> Trial · {pro.trialLeft}d
      </button>
    );
  }
  return (
    <button className="chip text-xs" onClick={openUpgrade}>
      <Sparkles size={13} className="mr-1" /> Pro
    </button>
  );
}
