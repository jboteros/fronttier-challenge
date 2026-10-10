import { emit } from "./core/log";
import { createApp } from "./core/server";
import { loadProfile } from "./profile";

const profile = loadProfile(process.env["PROFILE"] ?? "blackbox", process.env);
const port = Number(process.env["PORT"] ?? 8080);
const server = createApp(profile).listen(port, "0.0.0.0", () => emit("boot", { profile: profile.name, port }));

process.on("SIGTERM", () => server.close(() => process.exit(0)));
