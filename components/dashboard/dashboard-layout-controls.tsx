"use client";

import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type DashboardWidgetLayout } from "@/lib/dashboard-builder";

type EditableLayoutKey = "h" | "w" | "x" | "y";

function clampLayoutValue(key: EditableLayoutKey, value: number, layout: DashboardWidgetLayout, gridColumns: number) {
  switch (key) {
    case "x":
      return Math.max(0, Math.min(value, Math.max(0, gridColumns - layout.w)));
    case "y":
      return Math.max(0, value);
    case "w":
      return Math.max(layout.minW ?? 2, Math.min(value, gridColumns));
    case "h":
      return Math.max(layout.minH ?? 2, Math.min(value, 12));
    default:
      return value;
  }
}

function LayoutField({
  disabled,
  gridColumns,
  id,
  label,
  layout,
  layoutKey,
  onChange
}: {
  disabled?: boolean;
  gridColumns: number;
  id: string;
  label: string;
  layout: DashboardWidgetLayout;
  layoutKey: EditableLayoutKey;
  onChange: (nextValue: number) => void;
}) {
  const currentValue = layoutKey === "x" || layoutKey === "y" ? layout[layoutKey] + 1 : layout[layoutKey];
  const minValue = layoutKey === "x" || layoutKey === "y" ? 1 : layoutKey === "w" ? (layout.minW ?? 2) : (layout.minH ?? 2);
  const maxValue =
    layoutKey === "x"
      ? Math.max(1, gridColumns - layout.w + 1)
      : layoutKey === "w"
        ? gridColumns
        : layoutKey === "h"
          ? 12
          : undefined;

  function commit(rawValue: number) {
    if (!Number.isFinite(rawValue)) {
      return;
    }

    const normalizedValue = Math.round(rawValue);
    const storedValue = layoutKey === "x" || layoutKey === "y" ? normalizedValue - 1 : normalizedValue;
    const clampedValue = clampLayoutValue(layoutKey, storedValue, layout, gridColumns);

    if (clampedValue !== layout[layoutKey]) {
      onChange(clampedValue);
    }
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground" htmlFor={id}>
        {label}
      </Label>
      <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] gap-2">
        <Button
          disabled={disabled || currentValue <= minValue}
          onClick={() => commit(currentValue - 1)}
          type="button"
          variant="outline"
        >
          <Minus className="h-4 w-4" />
        </Button>
        <Input
          className="text-center"
          defaultValue={String(currentValue)}
          disabled={disabled}
          id={id}
          key={`${id}-${currentValue}-${maxValue}`}
          max={maxValue}
          min={minValue}
          onBlur={(event) => {
            commit(Number(event.currentTarget.value));
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          type="number"
        />
        <Button
          disabled={disabled || (typeof maxValue === "number" && currentValue >= maxValue)}
          onClick={() => commit(currentValue + 1)}
          type="button"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function DashboardLayoutControls({
  disabled,
  gridColumns = 12,
  idPrefix,
  layout,
  onUpdateLayout
}: {
  disabled?: boolean;
  gridColumns?: number;
  idPrefix: string;
  layout: DashboardWidgetLayout;
  onUpdateLayout: (nextLayout: Partial<Pick<DashboardWidgetLayout, EditableLayoutKey>>) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <LayoutField
          disabled={disabled}
          gridColumns={gridColumns}
          id={`${idPrefix}-column`}
          label="Column"
          layout={layout}
          layoutKey="x"
          onChange={(value) => onUpdateLayout({ x: value })}
        />
        <LayoutField
          disabled={disabled}
          gridColumns={gridColumns}
          id={`${idPrefix}-row`}
          label="Row"
          layout={layout}
          layoutKey="y"
          onChange={(value) => onUpdateLayout({ y: value })}
        />
        <LayoutField
          disabled={disabled}
          gridColumns={gridColumns}
          id={`${idPrefix}-width`}
          label="Width"
          layout={layout}
          layoutKey="w"
          onChange={(value) => onUpdateLayout({ w: value })}
        />
        <LayoutField
          disabled={disabled}
          gridColumns={gridColumns}
          id={`${idPrefix}-height`}
          label="Height"
          layout={layout}
          layoutKey="h"
          onChange={(value) => onUpdateLayout({ h: value })}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Columns and rows are 1-based. Width and height are grid spans. Overlapping widgets automatically flow downward.
      </p>
    </div>
  );
}
