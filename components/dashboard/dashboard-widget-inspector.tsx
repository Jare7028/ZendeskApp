"use client";

import { type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, Settings2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BAR_METRIC_OPTIONS_BY_DIMENSION,
  KPI_METRIC_OPTIONS,
  LINE_METRIC_OPTIONS,
  METRIC_LABELS,
  TABLE_COLUMN_LABELS,
  TABLE_COLUMNS_BY_DATASET,
  TABLE_LIMIT_OPTIONS
} from "@/lib/dashboard-builder-metadata";
import {
  type DashboardMetricKey,
  type DashboardTableColumnKey,
  type DashboardWidget,
  type DashboardWidgetDataset,
  type DashboardWidgetType
} from "@/lib/dashboard-builder";
import { cn } from "@/lib/utils";

const WIDGET_TYPE_OPTIONS: DashboardWidgetType[] = ["kpi", "line", "bar", "table"];

const WIDGET_TYPE_LABELS: Record<DashboardWidgetType, string> = {
  kpi: "KPI",
  line: "Line",
  bar: "Bar",
  table: "Table"
};

const DIMENSION_LABELS: Record<Extract<DashboardWidget, { type: "bar" }>["config"]["dimension"], string> = {
  agent: "Agent",
  channel: "Channel",
  client: "Client"
};

const DATASET_LABELS: Record<DashboardWidgetDataset, string> = {
  agents: "Agents",
  clients: "Clients"
};

function getDatasetSortKey(dataset: DashboardWidgetDataset, currentKey: DashboardTableColumnKey): DashboardTableColumnKey {
  const supportedColumns = TABLE_COLUMNS_BY_DATASET[dataset];
  return supportedColumns.some((column) => column === currentKey)
    ? currentKey
    : ((supportedColumns.includes("tickets_created") ? "tickets_created" : supportedColumns[0]) as DashboardTableColumnKey);
}

function InspectorField({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function PillButton({
  active,
  children,
  disabled,
  onClick
}: {
  active: boolean;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-2xl border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active ? "border-foreground bg-foreground text-background" : "border-border/70 bg-background hover:bg-muted/60"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

function MultiSelectPills({
  disabled,
  onToggle,
  options,
  selected
}: {
  disabled?: boolean;
  onToggle: (value: string) => void;
  options: ReadonlyArray<{ label: string; value: string }>;
  selected: string[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option.value);

        return (
          <button
            key={option.value}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              active ? "border-foreground bg-foreground text-background" : "border-border/70 bg-background hover:bg-muted/60"
            )}
            disabled={disabled}
            onClick={() => onToggle(option.value)}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function DashboardWidgetInspector({
  onChangeWidgetType,
  disabled,
  onAddWidget,
  onDeleteWidget,
  onMoveWidget,
  onResizeWidget,
  onSelectWidget,
  onUpdateWidget,
  saveError,
  selectedWidget,
  updatedAt,
  widgets
}: {
  onChangeWidgetType: (widgetId: string, nextType: DashboardWidgetType) => void;
  disabled: boolean;
  onAddWidget: () => void;
  onDeleteWidget: (widgetId: string) => void;
  onMoveWidget: (widgetId: string, direction: "down" | "left" | "right" | "up") => void;
  onResizeWidget: (widgetId: string, dimension: "h" | "w", delta: number) => void;
  onSelectWidget: (widgetId: string) => void;
  onUpdateWidget: (widgetId: string, updater: (widget: DashboardWidget) => DashboardWidget) => void;
  saveError: string | null;
  selectedWidget: DashboardWidget | null;
  updatedAt: string;
  widgets: DashboardWidget[];
}) {
  const selectedWidgetId = selectedWidget?.id ?? "";

  return (
    <Card className="bg-muted/20">
      <CardHeader>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Inspector</p>
        <CardTitle>Widget configuration</CardTitle>
        <CardDescription>Choose what the selected widget displays and adjust its layout directly from the builder.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Widgets</p>
            <Button className="gap-2" disabled={disabled} onClick={onAddWidget} variant="outline">
              <Plus className="h-4 w-4" />
              Add widget
            </Button>
          </div>
          {widgets.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border/70 bg-background px-4 py-6 text-sm text-muted-foreground">
              Add a widget to start configuring its contents.
            </div>
          ) : (
            <div className="space-y-2">
              {widgets.map((widget, index) => {
                const active = widget.id === selectedWidgetId;

                return (
                  <button
                    key={widget.id}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      active ? "border-foreground bg-foreground text-background" : "border-border/70 bg-background hover:bg-muted/60"
                    )}
                    disabled={disabled}
                    onClick={() => onSelectWidget(widget.id)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{widget.title}</p>
                      <p className={cn("mt-1 truncate text-xs", active ? "text-background/70" : "text-muted-foreground")}>
                        Widget {index + 1}
                      </p>
                    </div>
                    <Badge
                      className={cn(
                        "rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.16em]",
                        active ? "border-background/30 bg-background/10 text-background" : "border-border/70 bg-background text-foreground"
                      )}
                    >
                      {WIDGET_TYPE_LABELS[widget.type]}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selectedWidget ? (
          <div className="space-y-4 rounded-[28px] border border-border/70 bg-background p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              {selectedWidget.title}
            </div>
            <Button
              className="w-full justify-center gap-2 border-rose-200 text-rose-700 hover:bg-rose-50"
              disabled={disabled}
              onClick={() => onDeleteWidget(selectedWidget.id)}
              variant="outline"
            >
              <Trash2 className="h-4 w-4" />
              Delete widget
            </Button>

            <InspectorField label="Widget title">
              <Input
                defaultValue={selectedWidget.title}
                disabled={disabled}
                key={`${selectedWidget.id}-title`}
                onBlur={(event) => {
                  const value = event.currentTarget.value.trim();
                  if (value && value !== selectedWidget.title) {
                    onUpdateWidget(selectedWidget.id, (widget) => ({ ...widget, title: value }));
                  }
                }}
                placeholder="Widget title"
              />
            </InspectorField>

            <InspectorField label="Description">
              <textarea
                className="min-h-[88px] w-full rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
                defaultValue={selectedWidget.description ?? ""}
                disabled={disabled}
                key={`${selectedWidget.id}-description`}
                onBlur={(event) => {
                  const value = event.currentTarget.value.trim();
                  const nextValue = value || null;
                  if (nextValue !== selectedWidget.description) {
                    onUpdateWidget(selectedWidget.id, (widget) => ({ ...widget, description: nextValue }));
                  }
                }}
                placeholder="Optional context for this widget"
              />
            </InspectorField>

            <InspectorField label="Widget type">
              <div className="grid grid-cols-2 gap-2">
                {WIDGET_TYPE_OPTIONS.map((type) => (
                  <PillButton
                    key={type}
                    active={selectedWidget.type === type}
                    disabled={disabled}
                    onClick={() => onChangeWidgetType(selectedWidget.id, type)}
                  >
                    {WIDGET_TYPE_LABELS[type]}
                  </PillButton>
                ))}
              </div>
            </InspectorField>

            <InspectorField label="Layout">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ["up", ArrowUp, "Move up"],
                    ["left", ArrowLeft, "Move left"],
                    ["right", ArrowRight, "Move right"],
                    ["down", ArrowDown, "Move down"]
                  ] as const).map(([direction, Icon, label]) => (
                    <Button
                      key={direction}
                      className="justify-start gap-2"
                      disabled={disabled}
                      onClick={() => onMoveWidget(selectedWidget.id, direction)}
                      type="button"
                      variant="outline"
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </Button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    className="justify-start gap-2"
                    disabled={disabled || selectedWidget.layout.w <= (selectedWidget.layout.minW ?? 2)}
                    onClick={() => onResizeWidget(selectedWidget.id, "w", -1)}
                    type="button"
                    variant="outline"
                  >
                    <Minus className="h-4 w-4" />
                    Narrower
                  </Button>
                  <Button
                    className="justify-start gap-2"
                    disabled={disabled || selectedWidget.layout.w >= 12}
                    onClick={() => onResizeWidget(selectedWidget.id, "w", 1)}
                    type="button"
                    variant="outline"
                  >
                    <Plus className="h-4 w-4" />
                    Wider
                  </Button>
                  <Button
                    className="justify-start gap-2"
                    disabled={disabled || selectedWidget.layout.h <= (selectedWidget.layout.minH ?? 2)}
                    onClick={() => onResizeWidget(selectedWidget.id, "h", -1)}
                    type="button"
                    variant="outline"
                  >
                    <Minus className="h-4 w-4" />
                    Shorter
                  </Button>
                  <Button
                    className="justify-start gap-2"
                    disabled={disabled || selectedWidget.layout.h >= 12}
                    onClick={() => onResizeWidget(selectedWidget.id, "h", 1)}
                    type="button"
                    variant="outline"
                  >
                    <Plus className="h-4 w-4" />
                    Taller
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Position {selectedWidget.layout.x + 1}, {selectedWidget.layout.y + 1} on a 12-column grid. Size {selectedWidget.layout.w} x {selectedWidget.layout.h}.
                </p>
              </div>
            </InspectorField>

            {selectedWidget.type === "kpi" ? (
              <>
                <InspectorField label="Metric">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {KPI_METRIC_OPTIONS.map((metricKey) => (
                      <PillButton
                        key={metricKey}
                        active={selectedWidget.config.metricKey === metricKey}
                        disabled={disabled}
                        onClick={() =>
                          onUpdateWidget(selectedWidget.id, (widget) =>
                            widget.type === "kpi"
                              ? {
                                  ...widget,
                                  config: {
                                    ...widget.config,
                                    metricKey,
                                    format: metricKey.includes("minutes")
                                      ? "minutes"
                                      : metricKey.includes("ratio") || metricKey.includes("compliance")
                                        ? "percent"
                                        : "number"
                                  }
                                }
                              : widget
                          )
                        }
                      >
                        {METRIC_LABELS[metricKey]}
                      </PillButton>
                    ))}
                  </div>
                </InspectorField>

                <InspectorField label="Comparison">
                  <div className="grid grid-cols-2 gap-2">
                    <PillButton
                      active={selectedWidget.config.comparison === "previous_period"}
                      disabled={disabled}
                      onClick={() =>
                        onUpdateWidget(selectedWidget.id, (widget) =>
                          widget.type === "kpi"
                            ? { ...widget, config: { ...widget.config, comparison: "previous_period" } }
                            : widget
                        )
                      }
                    >
                      Previous period
                    </PillButton>
                    <PillButton
                      active={selectedWidget.config.comparison === "none"}
                      disabled={disabled}
                      onClick={() =>
                        onUpdateWidget(selectedWidget.id, (widget) =>
                          widget.type === "kpi" ? { ...widget, config: { ...widget.config, comparison: "none" } } : widget
                        )
                      }
                    >
                      No comparison
                    </PillButton>
                  </div>
                </InspectorField>
              </>
            ) : null}

            {selectedWidget.type === "line" ? (
              <InspectorField label="Metrics">
                <MultiSelectPills
                  disabled={disabled}
                  onToggle={(value) =>
                    onUpdateWidget(selectedWidget.id, (widget) => {
                      if (widget.type !== "line") {
                        return widget;
                      }

                      const metricKey = value as DashboardMetricKey;
                      const nextMetricKeys = widget.config.metricKeys.includes(metricKey)
                        ? widget.config.metricKeys.filter((entry) => entry !== metricKey)
                        : [...widget.config.metricKeys, metricKey];

                      return {
                        ...widget,
                        config: {
                          ...widget.config,
                          metricKeys: nextMetricKeys.length > 0 ? nextMetricKeys : widget.config.metricKeys
                        }
                      };
                    })
                  }
                  options={LINE_METRIC_OPTIONS.map((metricKey) => ({ label: METRIC_LABELS[metricKey], value: metricKey }))}
                  selected={selectedWidget.config.metricKeys}
                />
              </InspectorField>
            ) : null}

            {selectedWidget.type === "bar" ? (
              <>
                <InspectorField label="Dimension">
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.keys(DIMENSION_LABELS) as Array<keyof typeof DIMENSION_LABELS>).map((dimension) => (
                      <PillButton
                        key={dimension}
                        active={selectedWidget.config.dimension === dimension}
                        disabled={disabled}
                        onClick={() =>
                          onUpdateWidget(selectedWidget.id, (widget) =>
                            widget.type === "bar"
                              ? {
                                  ...widget,
                                  config: {
                                    ...widget.config,
                                    dimension,
                                    metricKeys: BAR_METRIC_OPTIONS_BY_DIMENSION[dimension].slice(
                                      0,
                                      dimension === "channel" ? 1 : Math.min(2, BAR_METRIC_OPTIONS_BY_DIMENSION[dimension].length)
                                    )
                                  }
                                }
                              : widget
                          )
                        }
                      >
                        {DIMENSION_LABELS[dimension]}
                      </PillButton>
                    ))}
                  </div>
                </InspectorField>

                <InspectorField label="Metrics">
                  <MultiSelectPills
                    disabled={disabled || selectedWidget.config.dimension === "channel"}
                    onToggle={(value) =>
                      onUpdateWidget(selectedWidget.id, (widget) => {
                        if (widget.type !== "bar") {
                          return widget;
                        }

                        const metricKey = value as DashboardMetricKey;
                        const nextMetricKeys = widget.config.metricKeys.includes(metricKey)
                          ? widget.config.metricKeys.filter((entry) => entry !== metricKey)
                          : [...widget.config.metricKeys, metricKey];

                        return {
                          ...widget,
                          config: {
                            ...widget.config,
                            metricKeys: nextMetricKeys.length > 0 ? nextMetricKeys : widget.config.metricKeys
                          }
                        };
                      })
                    }
                    options={BAR_METRIC_OPTIONS_BY_DIMENSION[selectedWidget.config.dimension].map((metricKey) => ({
                      label: METRIC_LABELS[metricKey],
                      value: metricKey
                    }))}
                    selected={selectedWidget.config.metricKeys}
                  />
                  {selectedWidget.config.dimension === "channel" ? (
                    <p className="text-xs text-muted-foreground">Channel widgets currently support ticket volume only.</p>
                  ) : null}
                </InspectorField>
              </>
            ) : null}

            {selectedWidget.type === "table" ? (
              <>
                <InspectorField label="Dataset">
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(DATASET_LABELS) as DashboardWidgetDataset[]).map((dataset) => (
                      <PillButton
                        key={dataset}
                        active={selectedWidget.config.dataset === dataset}
                        disabled={disabled}
                        onClick={() =>
                          onUpdateWidget(selectedWidget.id, (widget) =>
                            widget.type === "table"
                              ? (() => {
                                  const nextColumns: DashboardTableColumnKey[] = [...TABLE_COLUMNS_BY_DATASET[dataset]];

                                  return {
                                    ...widget,
                                    config: {
                                      ...widget.config,
                                      dataset,
                                      columns: nextColumns.slice(0, 5),
                                      sort: {
                                        key: getDatasetSortKey(dataset, widget.config.sort.key),
                                        direction: widget.config.sort.direction
                                      }
                                    }
                                  };
                                })()
                              : widget
                          )
                        }
                      >
                        {DATASET_LABELS[dataset]}
                      </PillButton>
                    ))}
                  </div>
                </InspectorField>

                <InspectorField label="Columns">
                  <div className="flex flex-wrap gap-2">
                    {TABLE_COLUMNS_BY_DATASET[selectedWidget.config.dataset].map((column) => {
                      const active = selectedWidget.config.columns.includes(column);

                      return (
                        <button
                          key={column}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            active ? "border-foreground bg-foreground text-background" : "border-border/70 bg-background hover:bg-muted/60"
                          )}
                          disabled={disabled}
                          onClick={() =>
                            onUpdateWidget(selectedWidget.id, (widget) => {
                              if (widget.type !== "table") {
                                return widget;
                              }

                              const nextColumns = widget.config.columns.includes(column)
                                ? widget.config.columns.filter((entry) => entry !== column)
                                : [...widget.config.columns, column];

                              return {
                                ...widget,
                                config: {
                                  ...widget.config,
                                  columns: nextColumns.length > 0 ? nextColumns : widget.config.columns
                                }
                              };
                            })
                          }
                          type="button"
                        >
                          {TABLE_COLUMN_LABELS[column]}
                        </button>
                      );
                    })}
                  </div>
                </InspectorField>

                <InspectorField label="Sort">
                  <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2">
                    <select
                      className="h-11 rounded-2xl border border-input bg-background px-4 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(event) =>
                        onUpdateWidget(selectedWidget.id, (widget) =>
                          widget.type === "table"
                            ? {
                                ...widget,
                                config: {
                                  ...widget.config,
                                  sort: {
                                    ...widget.config.sort,
                                    key: event.currentTarget.value as DashboardTableColumnKey
                                  }
                                }
                              }
                            : widget
                        )
                      }
                      value={selectedWidget.config.sort.key}
                    >
                      {TABLE_COLUMNS_BY_DATASET[selectedWidget.config.dataset].map((column) => (
                        <option key={column} value={column}>
                          {TABLE_COLUMN_LABELS[column]}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-11 rounded-2xl border border-input bg-background px-4 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                      onChange={(event) =>
                        onUpdateWidget(selectedWidget.id, (widget) =>
                          widget.type === "table"
                            ? {
                                ...widget,
                                config: {
                                  ...widget.config,
                                  sort: {
                                    ...widget.config.sort,
                                    direction: event.currentTarget.value as "asc" | "desc"
                                  }
                                }
                              }
                            : widget
                        )
                      }
                      value={selectedWidget.config.sort.direction}
                    >
                      <option value="desc">Desc</option>
                      <option value="asc">Asc</option>
                    </select>
                  </div>
                </InspectorField>

                <InspectorField label="Row limit">
                  <div className="grid grid-cols-4 gap-2">
                    {TABLE_LIMIT_OPTIONS.map((limit) => (
                      <PillButton
                        key={limit}
                        active={selectedWidget.config.limit === limit}
                        disabled={disabled}
                        onClick={() =>
                          onUpdateWidget(selectedWidget.id, (widget) =>
                            widget.type === "table" ? { ...widget, config: { ...widget.config, limit } } : widget
                          )
                        }
                      >
                        {limit}
                      </PillButton>
                    ))}
                  </div>
                </InspectorField>
              </>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3 text-sm">
          <div className="rounded-3xl border border-border/70 bg-background px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Updated</p>
            <p className="mt-2 font-medium">{new Date(updatedAt).toLocaleString("en-GB")}</p>
          </div>
          {saveError ? <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">{saveError}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}
