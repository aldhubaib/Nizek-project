"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  saveEquityPitchProse,
  saveEquityPitchSection,
  updateEquityLiveDate,
  updateEquityProjectDescription,
  type EquityPortfolioDTO,
} from "@/actions/equity";
import { LIVE_STATUS, formatLiveStatus, liveStatus } from "@/lib/equity-math";
import { CollapsibleCard } from "@/components/equity/collapsible-card";
import { GrowingTextarea } from "@/components/equity/growing-textarea";
import {
  Blank,
  EditButton,
  FormButtons,
  PITCH_SECTIONS,
  PitchRowsEditor,
  PitchRowsView,
  draftsToItems,
  emptyItem,
  inputCls,
  itemToDraft,
  textareaCls,
  type ItemDraft,
} from "@/components/equity/pitch-section";

type OpportunityDTO = EquityPortfolioDTO["opportunity"];

/**
 * The opening of the pitch: when it ships, what it does, what's broken, what we
 * do about it, and what stops anyone else doing the same.
 *
 * The rest of the deck — the product, validation, market size, business model,
 * adoption, competition, team — are modules of their own now. What's left here
 * is the argument itself, which is written rather than tabulated.
 */

const ADVANTAGE = PITCH_SECTIONS.ADVANTAGE;

const PROSE = [
  {
    key: "problem",
    title: "The problem",
    description: "What is broken today, from the customer's side.",
    placeholder: "Price is an important concern for customers booking travel online…",
  },
  {
    key: "solution",
    title: "The solution",
    description: "What we do about it, in plain terms.",
    placeholder: "A web platform where users can rent out their space to host travellers…",
  },
] as const;

/** The launch badge, which follows the date rather than a switch of its own. */
function LaunchBadge({ liveDate }: { liveDate: string | null }) {
  const status = liveStatus(liveDate);
  return (
    <span
      className={cn(
        "px-2 py-0.5 rounded-full text-xs font-medium",
        status === "LIVE"
          ? "bg-emerald-500/10 text-emerald-400"
          : status === "SCHEDULED"
            ? "bg-amber-500/10 text-amber-400"
            : "bg-muted text-muted-foreground",
      )}
    >
      {LIVE_STATUS[status]}
    </span>
  );
}

export function OpportunitySection({
  portfolioId,
  opportunity,
  description,
  liveDate,
}: {
  portfolioId: string;
  opportunity: OpportunityDTO;
  /** The project's own description, which opens the pitch. */
  description: string | null;
  /** When the product shipped, or is due to. */
  liveDate: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const advantages = (opportunity?.items ?? []).filter(
    (i) => i.section === ADVANTAGE.id,
  );
  const filled =
    advantages.length > 0 ||
    !!description ||
    !!liveDate ||
    !!(opportunity?.problem || opportunity?.solution);

  const parts =
    (description ? 1 : 0) +
    (liveDate ? 1 : 0) +
    PROSE.filter((p) => opportunity?.[p.key]).length +
    (advantages.length > 0 ? 1 : 0);
  const total = 2 + PROSE.length + 1;

  return (
    <CollapsibleCard
      icon={Lightbulb}
      title="Opportunity"
      summary={filled ? `${parts} of ${total} filled in` : "Nothing here yet"}
      description="The case for this startup: when it ships, what it does, the problem it answers and what keeps it defensible."
      forceOpen={editing}
      actions={!editing && <EditButton filled={filled} onClick={() => setEditing(true)} />}
    >
      {editing ? (
        <OpportunityForm
          portfolioId={portfolioId}
          opportunity={opportunity}
          advantages={advantages}
          description={description}
          liveDate={liveDate}
          busy={busy}
          setBusy={setBusy}
          onDone={() => {
            setEditing(false);
            router.refresh();
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className="text-s font-semibold text-foreground">Launch</h3>
              <LaunchBadge liveDate={liveDate} />
            </div>
            <p className="text-s text-foreground px-3 py-2 rounded-lg border border-border bg-muted/30">
              {formatLiveStatus(liveDate)}
            </p>
          </div>

          <div>
            <h3 className="text-s font-semibold text-foreground">
              Description
            </h3>
            <p className="text-xs text-muted-foreground mb-1.5">
              Shared with the project — editing it here updates the project page
              too.
            </p>
            {description ? (
              <p className="text-s text-foreground whitespace-pre-wrap px-3 py-2 rounded-lg border border-border bg-muted/30">
                {description}
              </p>
            ) : (
              <Blank>No description yet.</Blank>
            )}
          </div>

          {PROSE.map(({ key, title, description: hint }) => (
            <div key={key}>
              <h3 className="text-s font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground mb-1.5">{hint}</p>
              {opportunity?.[key] ? (
                <p className="text-s text-foreground whitespace-pre-wrap px-3 py-2 rounded-lg border border-border bg-muted/30">
                  {opportunity[key]}
                </p>
              ) : (
                <Blank>Nothing written yet.</Blank>
              )}
            </div>
          ))}

          <div>
            <h3 className="text-s font-semibold text-foreground">
              {ADVANTAGE.title}
            </h3>
            <p className="text-xs text-muted-foreground mb-1.5">
              {ADVANTAGE.description}
            </p>
            <PitchRowsView spec={ADVANTAGE} rows={advantages} />
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}

function OpportunityForm({
  portfolioId,
  opportunity,
  advantages,
  description: storedDescription,
  liveDate: storedLiveDate,
  busy,
  setBusy,
  onDone,
  onCancel,
}: {
  portfolioId: string;
  opportunity: OpportunityDTO;
  advantages: NonNullable<OpportunityDTO>["items"];
  description: string | null;
  liveDate: string | null;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  // The date input wants YYYY-MM-DD, and slicing the ISO string keeps the
  // stored UTC day rather than shifting it into the viewer's timezone.
  const storedDay = storedLiveDate?.slice(0, 10) ?? "";
  const [liveDate, setLiveDate] = useState(storedDay);
  const [description, setDescription] = useState(storedDescription ?? "");
  const [problem, setProblem] = useState(opportunity?.problem ?? "");
  const [solution, setSolution] = useState(opportunity?.solution ?? "");
  const [rows, setRows] = useState<ItemDraft[]>(() =>
    advantages.length > 0 ? advantages.map(itemToDraft) : [emptyItem()],
  );

  const prose = { problem, solution };
  const setProse = { problem: setProblem, solution: setSolution };

  async function save() {
    setBusy(true);
    try {
      // The description and the launch date belong to the project and the
      // portfolio rather than the pitch, so they go back through their own
      // actions — and only when they actually changed.
      if (description.trim() !== (storedDescription ?? "").trim()) {
        await updateEquityProjectDescription(portfolioId, description);
      }
      if (liveDate !== storedDay) {
        await updateEquityLiveDate(portfolioId, liveDate || null);
      }
      await saveEquityPitchProse(portfolioId, "OPPORTUNITY", {
        problem,
        solution,
      });
      await saveEquityPitchSection(
        portfolioId,
        ADVANTAGE.id,
        draftsToItems(ADVANTAGE.id, rows),
      );
      onDone();
    } catch (err) {
      alert((err as Error).message || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-s font-semibold text-foreground">Launch</h3>
          <LaunchBadge liveDate={liveDate || null} />
        </div>
        <p className="text-xs text-muted-foreground mb-1.5">
          The status follows the date, so there&apos;s nothing else to update
          when it goes live.
        </p>
        <input
          type="date"
          value={liveDate}
          onChange={(e) => setLiveDate(e.target.value)}
          className={cn(inputCls, "max-w-[220px]")}
        />
      </div>

      <div>
        <h3 className="text-s font-semibold text-foreground">Description</h3>
        <p className="text-xs text-muted-foreground mb-1.5">
          Shared with the project — editing it here updates the project page too.
        </p>
        <GrowingTextarea
          value={description}
          onChange={setDescription}
          placeholder="What the company does, in a paragraph."
          className={textareaCls}
        />
      </div>

      {PROSE.map((p) => (
        <div key={p.key}>
          <h3 className="text-s font-semibold text-foreground">{p.title}</h3>
          <p className="text-xs text-muted-foreground mb-1.5">
            {p.description}
          </p>
          <GrowingTextarea
            value={prose[p.key]}
            onChange={setProse[p.key]}
            placeholder={p.placeholder}
            className={textareaCls}
          />
        </div>
      ))}

      <div>
        <h3 className="text-s font-semibold text-foreground">
          {ADVANTAGE.title}
        </h3>
        <p className="text-xs text-muted-foreground mb-1.5">
          {ADVANTAGE.description}
        </p>
        <PitchRowsEditor spec={ADVANTAGE} rows={rows} setRows={setRows} />
      </div>

      <FormButtons busy={busy} onCancel={onCancel} onSave={save} />
    </div>
  );
}
