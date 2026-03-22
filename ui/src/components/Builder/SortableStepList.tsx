import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StepRow } from "./StepRow";
import { useDispatch } from "../../store";
import type { BuilderStep } from "../../types";

interface SortableStepListProps {
  scenarioId: string | null;
  steps: BuilderStep[];
  allStepDefs: { context_writes?: string[] }[];
  priorWritesFn: (idx: number) => string[];
  onStepFocus?: (stepId: string, keyword: string, text: string) => void;
  examples?: { headers: string[]; rows: string[][] };
}

function SortableStepItem({ scenarioId, step, priorWrites, onStepFocus, examples }: {
  scenarioId: string | null;
  step: BuilderStep;
  priorWrites: string[];
  onStepFocus?: (keyword: string, text: string) => void;
  examples?: { headers: string[]; rows: string[][] };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: "grab", color: "var(--text-muted)", fontSize: "0.9rem", userSelect: "none", letterSpacing: "-3px", padding: "0 4px" }}
        >
          &#8942;&#8942;
        </span>
        <div style={{ flex: 1 }}>
          <StepRow scenarioId={scenarioId} stepId={step.id} keyword={step.keyword} text={step.text} priorContextWrites={priorWrites} onStepFocus={onStepFocus} examples={examples} dataTable={step.data_table} />
        </div>
      </div>
    </div>
  );
}

export function SortableStepList({ scenarioId, steps, priorWritesFn, onStepFocus, examples }: SortableStepListProps) {
  const dispatch = useDispatch();

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = steps.findIndex((s) => s.id === active.id);
    const newIdx = steps.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = [...steps];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);

    // Check valid order: Given < When < Then
    const ORDER: Record<string, number> = { Given: 0, When: 1, Then: 2 };
    let phase = -1;
    let valid = true;
    for (const s of reordered) {
      if (s.keyword === "And" || s.keyword === "But") continue;
      const order = ORDER[s.keyword] ?? -1;
      if (order < phase) { valid = false; break; }
      phase = order;
    }

    if (!valid) return; // silently reject invalid reorder

    if (scenarioId) {
      dispatch({ type: "REORDER_STEPS", scenarioId, steps: reordered });
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        {steps.map((step, idx) => (
          <SortableStepItem
            key={step.id}
            scenarioId={scenarioId}
            step={step}
            priorWrites={priorWritesFn(idx)}
            onStepFocus={(kw, txt) => onStepFocus?.(step.id, kw, txt)}
            examples={examples}
          />
        ))}
      </SortableContext>
    </DndContext>
  );
}
