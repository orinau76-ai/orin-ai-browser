function inline(text: string, key: number) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[\d+\])/g);
  return (
    <span key={key}>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <code key={i} className="rounded bg-white/70 px-1 py-0.5 text-[0.85em]">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (/^\[\d+\]$/.test(part)) {
          return (
            <sup key={i} className="ml-0.5 text-primary">
              {part}
            </sup>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

/** Small, dependency-free markdown renderer for Orin answers. */
export function OrinMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let table: string[] = [];

  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="my-2 list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={i}>{inline(item, i)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  const flushTable = () => {
    if (!table.length) return;
    const rows = table
      .filter((row) => !/^\|[\s|:-]+\|$/.test(row.trim()))
      .map((row) =>
        row
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((cell) => cell.trim()),
      );
    const [head, ...body] = rows;
    blocks.push(
      <div key={`t${blocks.length}`} className="my-3 overflow-x-auto rounded-2xl bg-white/60">
        <table className="w-full text-left text-sm">
          {head ? (
            <thead className="border-b border-border">
              <tr>
                {head.map((cell, i) => (
                  <th key={i} className="px-3 py-2 font-semibold">
                    {inline(cell, i)}
                  </th>
                ))}
              </tr>
            </thead>
          ) : null}
          <tbody>
            {body.map((row, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 align-top">
                    {inline(cell, j)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    if (line.trim().startsWith("|")) {
      flushList();
      table.push(line);
      return;
    }
    flushTable();
    if (/^\s*[-*]\s+/.test(line)) {
      list.push(line.replace(/^\s*[-*]\s+/, ""));
      return;
    }
    flushList();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      blocks.push(
        <p
          key={index}
          className={
            level <= 2
              ? "mt-4 text-base font-semibold"
              : "mt-3 text-sm font-semibold text-foreground/90"
          }
        >
          {inline(heading[2]!, index)}
        </p>,
      );
      return;
    }
    if (!line.trim()) return;
    blocks.push(
      <p key={index} className="my-1.5 leading-relaxed">
        {inline(line, index)}
      </p>,
    );
  });

  flushList();
  flushTable();

  return <div className="text-sm text-foreground/90">{blocks}</div>;
}
