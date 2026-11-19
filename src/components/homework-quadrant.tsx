"use client";
import { QUADRANTS, quadrant } from "@/lib/utils";
export function HomeworkQuadrant({ important, urgent, onChange, disabled = false }: { important: boolean; urgent: boolean; onChange: (important: boolean, urgent: boolean) => void; disabled?: boolean }) {
  const selected = quadrant({ important, urgent });
  return <fieldset className="learning-task-placement" disabled={disabled}><legend>ช่องใน Eisenhower Matrix</legend><div className="priority-picks">{QUADRANTS.map((q, i) => <button type="button" key={q.name} aria-pressed={selected === i} className={`priority-pick ${q.color} ${selected === i ? "selected" : ""}`} onClick={() => onChange(i < 2, i === 0 || i === 2)}><span className="priority-dot" />{q.name}<small>{q.subtitle}</small></button>)}</div></fieldset>;
}
