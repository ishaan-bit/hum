import type { HumAction, SignalLabel } from "@/types/hum";

type ActionCardProps = {
  action: HumAction | null;
  signal: SignalLabel | null;
  pickedFromLearning: boolean;
};

export default function ActionCard({ action, pickedFromLearning }: ActionCardProps) {
  const actionLines = action ? formatActionLines(action.description) : [];

  return (
    <section className="rounded-xl border border-[#cfd9c6] bg-[#f1f7ed] p-4 shadow-[0_10px_28px_rgba(37,31,24,0.05)]">
      <p className="text-sm font-medium text-[#4f6745]">Action</p>
      <h2 className="mt-1 text-xl font-semibold leading-7 text-[#171514]">
        {action?.title ?? "Your first hum sets the pattern."}
      </h2>
      {action ? (
        <div className="mt-4 grid gap-2 text-sm leading-6 text-[#394435]">
          {actionLines.map((line) => (
            <p key={line} className="rounded-lg bg-white/50 px-3 py-2">
              {line}
            </p>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm leading-6 text-[#394435]">
          Hum or sing naturally, and Hum will pick one small, low-pressure action for the day.
        </p>
      )}
      {action ? (
        <p className="mt-3 text-xs font-medium text-[#5f7354]">
          {pickedFromLearning ? "Picked because it has helped before." : "Trying this today."}
        </p>
      ) : null}
    </section>
  );
}

function formatActionLines(description: string) {
  if (description === "Breathe in for four, pause for four, out for four. Repeat four times.") {
    return ["Breathe in for four.", "Pause for four.", "Breathe out for four.", "Repeat four times."];
  }

  if (description === "Roll your shoulders, stretch your neck, and let the next minute be slower.") {
    return ["Roll your shoulders.", "Stretch your neck.", "Let the next minute slow down."];
  }

  if (description === "Drink a glass of water, then do one tiny movement that feels easy.") {
    return ["Drink a glass of water.", "Do one tiny movement that feels easy."];
  }

  if (description === "Take a slow ten-minute walk outside, even if it is just around the block.") {
    return ["Take a slow ten-minute walk outside.", "Around the block is enough."];
  }

  if (description === "Send one kind voice note or make a small creative mark before the day speeds up.") {
    return ["Send one kind voice note.", "Or make one small creative mark."];
  }

  if (description === "Draw or write one line about the day. Keep it small enough to finish.") {
    return ["Draw or write one line about the day.", "Keep it small enough to finish."];
  }

  return description.split(". ").map((line, index, lines) => {
    const needsPeriod = index < lines.length - 1 && !line.endsWith(".");
    return needsPeriod ? `${line}.` : line;
  });
}
