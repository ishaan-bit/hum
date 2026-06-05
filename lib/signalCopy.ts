import type { SignalLabel } from "@/types/hum";

export function formatSignalTitle(signal: SignalLabel | null) {
  if (!signal) return "Learning your usual";

  const titles: Record<SignalLabel, string> = {
    "Learning your usual": "Learning your usual",
    "Close to your usual pattern": "Close to your usual pattern",
    "More activated than usual": "More activated than usual",
    "More subdued than usual": "More subdued than usual",
    "Steadier than usual": "Steadier than usual",
    "More variable than usual": "More variable than usual",
    "Flatter than usual": "Flatter than usual",
    "Less clear than usual": "Less clear than usual",
    "Signal was too weak, try again": "Signal was too weak, try again",
  };

  return titles[signal];
}

export function getSignalInterpretation(signal: SignalLabel | null) {
  if (!signal) return "A few more valid hums will help Hum learn your usual pattern.";

  const interpretation: Record<SignalLabel, string> = {
    "Learning your usual": "A few more valid hums will help Hum learn your usual pattern.",
    "Close to your usual pattern": "This sounds familiar, with no strong shift standing out.",
    "More activated than usual": "This hum carried more energy than your usual delivery.",
    "More subdued than usual": "This hum was quieter or more paused than your usual delivery.",
    "Steadier than usual": "This sounds a little steadier than your usual delivery.",
    "More variable than usual": "Your hum had more movement than usual.",
    "Flatter than usual": "This hum had less pitch movement than your usual delivery.",
    "Less clear than usual": "This hum was less tonally clear than your usual delivery.",
    "Signal was too weak, try again": "The recording was too weak to compare reliably.",
  };

  return interpretation[signal];
}
