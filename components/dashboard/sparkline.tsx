export function Sparkline({
  values,
  stroke = "#0f766e"
}: {
  values: number[];
  stroke?: string;
}) {
  const width = 100;
  const height = 28;

  if (values.length === 0) {
    return <span className="text-xs text-muted-foreground">No trend</span>;
  }

  const maxValue = Math.max(...values, 1);
  const path = values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - (value / maxValue) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg className="h-8 w-24" viewBox={`0 0 ${width} ${height}`} role="img">
      <path d={path} fill="none" stroke={stroke} strokeLinecap="round" strokeWidth="3" />
    </svg>
  );
}
