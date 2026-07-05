"use client";

import { useActionState, useState } from "react";
import { Badge, Card, FieldError, FieldLabel, Input, Select } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  archiveStageAction,
  createStageAction,
  updateStageAction,
  type StageResult,
} from "@/app/actions/stages";
import type { LeadStageRow, PipelineRow } from "@/lib/database.types";

const initial: StageResult = {};

export function StagesManager({
  stages,
  pipelines,
}: {
  stages: LeadStageRow[];
  pipelines: PipelineRow[];
}) {
  const [state, formAction, isPending] = useActionState(createStageAction, initial);

  const stagesByPipeline = pipelines.map((p) => ({
    pipeline: p,
    stages: stages.filter((s) => s.pipeline_id === p.id),
  }));

  return (
    <div className="grid grid-cols-[380px_1fr] gap-6 items-start">
      <Card className="p-6">
        <h2 className="text-[15px] font-bold text-brand-charcoal mb-4">Add a stage</h2>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="s-pipeline">Pipeline</FieldLabel>
            <Select id="s-pipeline" name="pipeline_id" defaultValue={pipelines[0]?.id ?? ""}>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="s-name">Name</FieldLabel>
            <Input id="s-name" name="name" required />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="s-color">Color</FieldLabel>
            <input
              id="s-color"
              type="color"
              name="color"
              defaultValue="#F37335"
              className="w-full h-[48px] rounded-[10px] border border-brand-border bg-brand-bg cursor-pointer"
            />
          </div>
          <div className="flex flex-col gap-[7px]">
            <FieldLabel htmlFor="s-kind">Kind</FieldLabel>
            <Select id="s-kind" name="kind" defaultValue="open">
              <option value="open">Open (active pipeline)</option>
              <option value="won">Won (terminal)</option>
              <option value="lost">Lost (terminal)</option>
            </Select>
          </div>
          {state.error && (
            <div className="bg-[#FFF4EF] border border-[#FFD5C2] rounded-[10px] px-4 py-3">
              <FieldError>{state.error}</FieldError>
            </div>
          )}
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? "Adding..." : "Add stage"}
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-4">
        {stagesByPipeline.map(({ pipeline, stages: rows }) => (
          <Card key={pipeline.id} className="p-0 overflow-hidden">
            <div className="p-4 border-b border-brand-border flex items-center justify-between">
              <h3 className="text-[14px] font-bold text-brand-charcoal">{pipeline.name}</h3>
              <span className="text-[11px] text-brand-dark-text uppercase tracking-[0.5px]">
                {rows.length} stage{rows.length === 1 ? "" : "s"}
              </span>
            </div>
            {rows.length === 0 ? (
              <div className="px-6 py-4 text-[13px] text-brand-dark-text">
                No stages in this pipeline yet.
              </div>
            ) : (
              <ul>
                {rows.map((s) => (
                  <StageRow key={s.id} stage={s} />
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

function StageRow({ stage }: { stage: LeadStageRow }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="border-b border-brand-border last:border-none px-6 py-4">
        <form
          action={async (fd) => {
            await updateStageAction(stage.id, fd);
            setEditing(false);
          }}
          className="flex items-center gap-3 flex-wrap"
        >
          <input
            type="color"
            name="color"
            defaultValue={stage.color}
            className="w-9 h-9 rounded-[8px] border border-brand-border cursor-pointer shrink-0"
          />
          <Input
            name="name"
            defaultValue={stage.name}
            required
            className="flex-1 min-w-[160px] !py-2"
          />
          <Select name="kind" defaultValue={stage.kind} className="!py-2 w-[140px]">
            <option value="open">Open</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </Select>
          <Button type="submit" size="sm">
            Save
          </Button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-[12px] font-bold text-brand-dark-text hover:text-brand-charcoal"
          >
            Cancel
          </button>
        </form>
      </li>
    );
  }
  return (
    <li className="border-b border-brand-border last:border-none px-6 py-4 flex items-center gap-4">
      <span
        className="inline-block w-3 h-3 rounded-full"
        style={{ background: stage.color }}
      />
      <span className="font-semibold flex-1">{stage.name}</span>
      <Badge
        color={stage.kind === "won" ? "green" : stage.kind === "lost" ? "red" : "slate"}
      >
        {stage.kind}
      </Badge>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[13px] font-bold text-brand-orange hover:text-brand-orange-dark"
      >
        Edit
      </button>
      <form action={archiveStageAction.bind(null, stage.id)}>
        <button
          type="submit"
          className="text-[13px] font-bold text-red-500 hover:text-red-600"
        >
          Archive
        </button>
      </form>
    </li>
  );
}
