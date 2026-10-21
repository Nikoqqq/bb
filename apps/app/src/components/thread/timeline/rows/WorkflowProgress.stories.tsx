import {
  WorkflowPhaseStrip,
  WorkflowProgress,
  type WorkflowProgressSnapshot,
} from "@bb/shared-ui/workflow-progress";

export default { title: "thread/timeline/rows/Workflow progress widths" };

const PROGRESS: WorkflowProgressSnapshot = {
  phases: [
    { index: 1, title: "Review" },
    { index: 2, title: "Combine" },
  ],
  agents: [
    {
      index: 1,
      label:
        "review:apps/app/src/components/thread/timeline/WorkflowWorkRowBody.tsx",
      state: "done",
      model: "claude-haiku-5-5",
      attempt: 1,
      cached: false,
      lastProgressAt: 1,
      phaseIndex: 1,
      agentType: "code-reviewer",
      tokens: 42_300,
      toolCalls: 12,
      durationMs: 41_000,
    },
    {
      index: 2,
      label:
        "review:packages/shared-ui/src/components/ui/workflow-progress.tsx",
      state: "running",
      model: "claude-sonnet-5-5",
      attempt: 2,
      cached: false,
      lastProgressAt: 2,
      phaseIndex: 1,
      tokens: 18_900,
      toolCalls: 4,
      durationMs: 12_000,
    },
    {
      index: 3,
      label: "review:plugins/provider-claude-code/src/task-translation.ts",
      state: "failed",
      model: "claude-haiku-5-5",
      attempt: 1,
      cached: false,
      lastProgressAt: 3,
      phaseIndex: 1,
      error: "StructuredOutput did not match the schema",
      durationMs: 3_000,
    },
    {
      index: 4,
      label: "review:docs",
      state: "done",
      model: "claude-haiku-5-5",
      attempt: 1,
      cached: true,
      lastProgressAt: 4,
      phaseIndex: 1,
      durationMs: 0,
    },
    {
      index: 5,
      label: "combine",
      state: "queued",
      model: "claude-opus-5-5",
      attempt: 1,
      cached: false,
      lastProgressAt: 5,
      phaseIndex: 2,
    },
  ],
};

function Sample({ collapsiblePhases }: { collapsiblePhases: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <WorkflowPhaseStrip progress={PROGRESS} settled={false} />
      <WorkflowProgress
        progress={PROGRESS}
        settled={false}
        collapsiblePhases={collapsiblePhases}
      />
    </div>
  );
}

export function Widths() {
  return (
    <main className="flex flex-col gap-6 p-4">
      {[340, 640].map((width) => (
        <section key={width} style={{ width }}>
          <h2 className="mb-1 text-xs text-muted-foreground">{width}px</h2>
          <div className="flex flex-col gap-4 rounded-md border border-border-seam p-2">
            <Sample collapsiblePhases={false} />
            <Sample collapsiblePhases />
          </div>
        </section>
      ))}
    </main>
  );
}
