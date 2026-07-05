type HookRecord = Record<string, any>;

export type OpenClawPluginApi = {
  pluginConfig?: unknown;
  logger: {
    info(message: string): void;
    warn(message: string): void;
  };
  on(hookName: string, handler: (event?: any, context?: any) => void): void;
};

export type OpenClawPluginEntry = {
  id: string;
  name: string;
  description: string;
  register(api: OpenClawPluginApi): void;
};

export type PluginHookAgentContext = HookRecord;
export type PluginHookGatewayContext = HookRecord;
export type PluginHookMessageContext = HookRecord;
export type PluginHookSessionContext = HookRecord;
export type PluginHookSubagentContext = HookRecord;
export type PluginHookToolContext = HookRecord;

export type PluginHookAfterToolCallEvent = HookRecord;
export type PluginHookAgentEndEvent = HookRecord;
export type PluginHookLlmOutputEvent = HookRecord;
export type PluginHookMessageReceivedEvent = HookRecord;
export type PluginHookMessageSentEvent = HookRecord;
export type PluginHookModelCallEndedEvent = HookRecord;
export type PluginHookModelCallStartedEvent = HookRecord;
export type PluginHookSessionEndEvent = HookRecord;
export type PluginHookSessionStartEvent = HookRecord;
export type PluginHookSubagentEndedEvent = HookRecord;
export type PluginHookSubagentSpawnedEvent = HookRecord;
