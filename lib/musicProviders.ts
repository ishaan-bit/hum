import { demoMusicCatalog } from "@/lib/musicCatalog";
import type { MusicProviderId, MusicTrack, RegulationTarget } from "@/types/hum";

export interface MusicProvider {
  id: MusicProviderId;
  name: string;
  isAvailable(): boolean;
  getTracks(target?: RegulationTarget): MusicTrack[];
  openTrack(track: MusicTrack): void;
}

export class LocalCatalogProvider implements MusicProvider {
  id = "local" as const;
  name = "Hum demo catalogue";

  isAvailable() {
    return true;
  }

  getTracks(target?: RegulationTarget) {
    if (!target) return demoMusicCatalog;
    return demoMusicCatalog.filter((track) => track.regulationTargets.includes(target));
  }

  openTrack(track: MusicTrack) {
    if (!track.url || typeof window === "undefined") return;
    window.open(track.url, "_blank", "noopener,noreferrer");
  }
}

export class SpotifyProvider implements MusicProvider {
  id = "spotify" as const;
  name = "Spotify";

  isAvailable() {
    return false;
  }

  getTracks() {
    return [];
  }

  openTrack(track: MusicTrack) {
    if (!track.url || typeof window === "undefined") return;
    window.open(track.url, "_blank", "noopener,noreferrer");
  }
}

export class YouTubeProvider implements MusicProvider {
  id = "youtube" as const;
  name = "YouTube";

  isAvailable() {
    return false;
  }

  getTracks() {
    return [];
  }

  openTrack(track: MusicTrack) {
    if (!track.url || typeof window === "undefined") return;
    window.open(track.url, "_blank", "noopener,noreferrer");
  }
}

export function getMusicProviders(): MusicProvider[] {
  return [new LocalCatalogProvider(), new SpotifyProvider(), new YouTubeProvider()];
}
