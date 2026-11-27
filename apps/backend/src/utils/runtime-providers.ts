import type { MedusaContainer } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";

type ModuleConfig = {
  resolve?: string;
  options?: { providers?: { resolve?: string; id?: string; is_default?: boolean }[] };
};

export type RuntimeProviders = {
  workerMode: string | undefined;
  sessionStore: "redis" | "memory";
  eventBus: { module: string | undefined; service: string };
  workflowEngine: { module: string | undefined; service: string; storage: string | undefined };
  locking: {
    module: string | undefined;
    service: string;
    defaultProvider: string | undefined;
    providers: { resolve: string | undefined; id: string | undefined; isDefault: boolean }[];
  };
};

/**
 * Describe the providers the running application resolved for sessions, the
 * event bus, the workflow engine and locks. The report holds package names,
 * class names and provider IDs only. It never reads or returns a connection
 * string, password or option value, so it is safe to log and attach to issues.
 */
export function describeRuntimeProviders(container: MedusaContainer): RuntimeProviders {
  const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE) as {
    projectConfig: { redisUrl?: string; workerMode?: string; sessionOptions?: { dynamodbOptions?: unknown } };
    modules: Record<string, ModuleConfig | false | undefined>;
  };
  const moduleConfig = (key: string): ModuleConfig =>
    (config.modules[key] as ModuleConfig | undefined) || {};
  const service = (key: string) => container.resolve<object>(key).constructor.name;
  const locking = container.resolve<{ defaultProviderId?: string }>(Modules.LOCKING);
  // Both workflow engines use the class `WorkflowsModuleService`. Their
  // orchestrator holds the storage that tells the engines apart.
  const orchestrator = container.resolve<{ workflowOrchestratorService_?: Record<string, unknown> }>(
    Modules.WORKFLOW_ENGINE
  ).workflowOrchestratorService_;
  const storage = Object.entries(orchestrator ?? {}).find(([name]) =>
    name.endsWith("DistributedTransactionStorage_")
  )?.[1] as object | undefined;

  return {
    workerMode: config.projectConfig.workerMode,
    sessionStore: config.projectConfig.redisUrl && !config.projectConfig.sessionOptions?.dynamodbOptions
      ? "redis"
      : "memory",
    eventBus: {
      module: moduleConfig(Modules.EVENT_BUS).resolve,
      service: service(Modules.EVENT_BUS),
    },
    workflowEngine: {
      module: moduleConfig(Modules.WORKFLOW_ENGINE).resolve,
      service: service(Modules.WORKFLOW_ENGINE),
      storage: storage?.constructor.name,
    },
    locking: {
      module: moduleConfig(Modules.LOCKING).resolve,
      service: service(Modules.LOCKING),
      defaultProvider: locking.defaultProviderId,
      providers: (moduleConfig(Modules.LOCKING).options?.providers ?? []).map((provider) => ({
        resolve: provider.resolve,
        id: provider.id,
        isDefault: provider.is_default === true,
      })),
    },
  };
}
