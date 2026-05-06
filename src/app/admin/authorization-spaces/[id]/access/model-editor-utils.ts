type SpaceModelDefinition = {
  relations: Record<string, unknown>;
  permissions: Record<string, { relation: string; policyEngine?: "lua"; policy?: string }>;
};

export function buildSpaceModelEditorJson(models: Array<{
  entityType: string;
  definition: SpaceModelDefinition;
}>): string {
  const types = Object.fromEntries(
    models.map((model) => {
      const modelKey = model.entityType.includes(":")
        ? model.entityType.slice(model.entityType.indexOf(":") + 1)
        : model.entityType;
      return [modelKey, model.definition];
    })
  );

  return JSON.stringify({ types }, null, 2);
}
