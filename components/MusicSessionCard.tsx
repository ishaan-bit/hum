import { getDemoTracksById } from "@/lib/musicCatalog";
import type { MusicSessionRecommendation } from "@/types/hum";

type MusicSessionCardProps = {
  recommendation: MusicSessionRecommendation | null;
  hasStarted: boolean;
  onStart: () => void;
};

export default function MusicSessionCard({ recommendation, hasStarted, onStart }: MusicSessionCardProps) {
  const tracks = recommendation ? getDemoTracksById(recommendation.recommendedTrackIds) : [];

  return (
    <section className="rounded-xl border border-[#d9d0c2] bg-[#fbf5eb] p-4 shadow-[0_10px_28px_rgba(37,31,24,0.05)]">
      <p className="text-sm font-medium text-[#78624a]">Sound options</p>
      <h2 className="mt-1 text-xl font-semibold leading-7 text-[#171514]">
        {recommendation?.title ?? "Your first hum sets the pattern."}
      </h2>
      {recommendation ? (
        <>
          <p className="mt-2 text-sm leading-6 text-[#45382d]">
            A {recommendation.sessionLengthMinutes}-minute local match for this read.
          </p>
          <div className="mt-4 rounded-lg bg-white/60 p-3">
            <p className="text-xs font-semibold text-[#78624a]">Why this sound fits</p>
            <p className="mt-2 text-sm leading-6 text-[#45382d]">{recommendation.reason}</p>
          </div>
          <div className="mt-4 grid gap-2">
            {tracks.map((track) => (
              <div key={track.id} className="rounded-lg border border-white/70 bg-white/60 p-3">
                <p className="text-sm font-semibold text-[#171514]">{track.title}</p>
                <p className="mt-1 text-xs text-[#78624a]">
                  {track.artist} - {track.genreTags.slice(0, 2).join(", ")}
                </p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onStart}
            className="mt-4 min-h-11 w-full rounded-lg bg-[#171514] px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-200 hover:bg-[#24211f] active:translate-y-px"
          >
            {hasStarted ? "Sound match opened" : "Open sound match"}
          </button>
          <p className="mt-3 text-xs leading-5 text-[#78624a]">{recommendation.safetyCopy}</p>
        </>
      ) : (
        <p className="mt-2 text-sm leading-6 text-[#45382d]">
          Hum naturally, and Hum will map the voice pattern to a local sound match.
        </p>
      )}
    </section>
  );
}
