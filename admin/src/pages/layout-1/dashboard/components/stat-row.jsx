// One line of a card's small print: an icon, what is being counted, and the
// figure at the far end.
export default function StatRow({ icon: Icon, label, value, title }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-1.5">
        <Icon className="size-4.5 text-muted-foreground" />
        <span className="text-sm font-normal text-mono">{label}</span>
      </div>
      <span
        className="ms-auto text-right text-sm font-medium text-foreground tabular-nums"
        title={title}
      >
        {value}
      </span>
    </div>
  );
}
