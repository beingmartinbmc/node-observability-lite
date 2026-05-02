declare namespace observability {
  type PresetName = 'production' | 'development' | 'minimal';

  interface AuthRequest {
    method?: string;
    url?: string;
    path?: string;
    headers?: Record<string, string | string[] | undefined>;
    get?(name: string): string | undefined;
  }

  interface ObservabilityOptions {
    /** Built-in preset to start from. Defaults to `'production'`. */
    preset?: PresetName;
    /** Override the actuator base path. Defaults to `'/actuator'`. */
    basePath?: string;
    /**
     * Authentication guard for `/actuator/*` and `/trace/*` paths. Required
     * when the resolved preset has `requireAuth: true` (e.g. `'production'`).
     */
    auth?: (req: AuthRequest) => boolean | Promise<boolean>;
    /** Force-enable or disable the auth guard regardless of the preset. */
    requireAuth?: boolean;
    /** Disable the auto-added `eventLoop` health indicator if undesired. */
    includeEventLoopHealthIndicator?: boolean;
    /** Overrides for `node-actuator-lite` options. */
    actuator?: Record<string, unknown>;
    /** Overrides for `node-eventloop-watchdog` options. */
    watchdog?: Record<string, unknown> & { enabled?: boolean };
    /** Overrides for `node-request-trace` init options. */
    trace?: Record<string, unknown> & { enabled?: boolean };
  }

  interface ObservabilityHandle {
    /** The bundled `node-actuator-lite` instance. */
    actuator: any;
    /** The bundled `node-eventloop-watchdog` singleton, or null if disabled. */
    watchdog: any | null;
    /** The bundled `node-request-trace` singleton, or null if disabled. */
    trace: any | null;
  }

  interface ResolvedObservabilityOptions {
    preset: string;
    basePath: string;
    actuator: Record<string, unknown>;
    watchdog: Record<string, unknown> & { enabled?: boolean };
    trace: Record<string, unknown> & { enabled?: boolean };
    auth: ((req: AuthRequest) => boolean | Promise<boolean>) | null;
    requireAuth: boolean;
    includeEventLoopHealthIndicator: boolean;
  }
}

declare const observability: {
  express(app: any, options?: observability.ObservabilityOptions, deps?: any): observability.ObservabilityHandle;
  fastify(app: any, options?: observability.ObservabilityOptions, deps?: any): Promise<observability.ObservabilityHandle>;
  koa(app: any, options?: observability.ObservabilityOptions, deps?: any): observability.ObservabilityHandle;
  resolveOptions(options?: observability.ObservabilityOptions): observability.ResolvedObservabilityOptions;
  listPresets(): observability.PresetName[];
};

export = observability;
