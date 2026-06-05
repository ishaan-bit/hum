import type { HumSession, RegulationFeedbackValue, TasteFeedbackValue } from "@/types/hum";

type FeedbackPanelProps = {
  session: HumSession | null;
  onFeedback: (feedback: RegulationFeedbackValue, tasteFeedback: TasteFeedbackValue[]) => void;
};

const feedbackOptions: RegulationFeedbackValue[] = [
  "calmer",
  "clearer",
  "more_steady",
  "same",
  "heavier",
  "not_for_me",
  "skipped",
];

export default function FeedbackPanel({ session, onFeedback }: FeedbackPanelProps) {
  if (!session) {
    return (
      <section className="rounded-xl border border-[#ded8cb] bg-white p-4 shadow-[0_10px_28px_rgba(37,31,24,0.05)]">
        <p className="text-sm font-medium text-[#625c54]">Feedback</p>
          <h2 className="mt-1 text-xl font-semibold leading-7 text-[#171514]">Ready after listening</h2>
        <p className="mt-2 text-sm leading-6 text-[#625c54]">
          Finish today&apos;s hum and start a session to record how it landed.
        </p>
      </section>
    );
  }

  const musicFeedback = session.musicSession?.feedback?.regulationOutcome ?? null;
  const hasStarted = Boolean(session.musicSession?.listening?.startedAt);

  return (
    <section className="rounded-xl border border-[#ded8cb] bg-white p-4 shadow-[0_10px_28px_rgba(37,31,24,0.05)]">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#625c54]">Feedback</p>
          <h2 className="mt-1 text-xl font-semibold leading-7 text-[#171514]">
            {musicFeedback ? "Feedback saved" : "How did that land?"}
          </h2>
        </div>
        {musicFeedback ? (
          <span className="rounded-full bg-[#f6f3ee] px-3 py-1 text-sm font-medium text-[#4d4740]">
            {formatFeedback(musicFeedback)}
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {feedbackOptions.map((option) => {
          const isSelected = musicFeedback === option;

          return (
            <button
              key={option}
              type="button"
              onClick={() => onFeedback(option, [])}
              aria-pressed={isSelected}
              disabled={!hasStarted}
              className={`min-h-12 rounded-lg border px-3 text-sm font-semibold transition-[transform,background-color,border-color,box-shadow] duration-200 hover:-translate-y-0.5 active:translate-y-px ${
                isSelected
                  ? "border-[#171514] bg-[#171514] text-white shadow-[0_8px_18px_rgba(23,21,20,0.16)]"
                  : "border-[#ded8cb] bg-[#f8f5ef] text-[#171514] shadow-[0_3px_10px_rgba(37,31,24,0.04)] hover:border-[#c8bda9] hover:bg-white"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {formatFeedback(option)}
            </button>
          );
        })}
      </div>

      <p className="mt-4 text-xs leading-5 text-[#716a62]">
        Feedback stays local and updates future music recommendations.
      </p>
    </section>
  );
}

function formatFeedback(feedback: RegulationFeedbackValue) {
  const labels: Record<RegulationFeedbackValue, string> = {
    calmer: "Calmer",
    clearer: "Clearer",
    more_steady: "More steady",
    same: "Same",
    heavier: "Heavier",
    not_for_me: "Not for me",
    skipped: "Skipped",
  };

  return labels[feedback];
}
