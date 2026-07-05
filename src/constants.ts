export const PLUGIN_ID = "mission-control-telemetry-bridge" as const;
export const TELEMETRY_VERSION = 1 as const;
export const DEFAULT_ENDPOINT = "http://localhost:4319/events" as const;
export const DEFAULT_ENDPOINT_ENV = "MISSION_CONTROL_RECEIVER_ENDPOINT" as const;
export const DEFAULT_TOKEN_ENV = "MISSION_CONTROL_PLUGIN_TOKEN" as const;
export const DEFAULT_TOKEN_HEADER = "x-mission-control-plugin-token" as const;
