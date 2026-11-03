import { useState } from "react";
import { AttackCard } from "@/components/AttackCard";
import { Empty, SectionTitle } from "@/components/Shell";
import { LogWizard } from "./LogWizard";
import { useData, type Attack } from "@/lib/store";

export function History() {
  const d = useData();
  const [editing, setEditing] = useState<Attack | null>(null);
  const attacks = d.attacks;

  return (
    <div className="space-y-4 pt-2">
      <SectionTitle>History</SectionTitle>
      {attacks.length === 0 ? (
        <Empty
          title="Nothing logged yet"
          body="When a migraine starts, tap the button on the Today tab. Past attacks can be logged there too."
        />
      ) : (
        <div className="space-y-3">
          {attacks.map((a) => (
            <AttackCard key={a.id} attack={a} onEdit={() => setEditing(a)} />
          ))}
        </div>
      )}
      {editing && <LogWizard attack={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
