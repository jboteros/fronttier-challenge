import type { Profile } from "../core/types";
import { createBlackboxProfile } from "./blackbox";

export function loadProfile(name: string, env: NodeJS.ProcessEnv): Profile<any> {
  switch (name) {
    case "blackbox": {
      const teamToken = env["TEAM_TOKEN"];
      if (!teamToken) throw new Error("TEAM_TOKEN is required for the blackbox profile");
      return createBlackboxProfile({ teamToken });
    }
    default:
      throw new Error(`unknown PROFILE: ${name}`);
  }
}
