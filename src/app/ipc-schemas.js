function createIpcSchemas(z) {
  const providerSettingsSchema = z.object({
    providers: z.object({
      claude: z.object({
        defaultProfileId: z.string().min(1),
        enabledProfileId: z.string().optional().default(''),
        profiles: z
          .array(
            z.object({
              id: z.string().min(1),
              name: z.string().min(1),
              envVars: z
                .array(z.object({ key: z.string().min(1), value: z.string() }))
                .optional()
                .default([]),
            }),
          )
          .min(1),
      }),
      codex: z.object({
        defaultProfileId: z.string().min(1),
        enabledProfileId: z.string().optional().default(''),
        profiles: z
          .array(
            z.object({
              id: z.string().min(1),
              name: z.string().min(1),
              envVars: z
                .array(z.object({ key: z.string().min(1), value: z.string() }))
                .optional()
                .default([]),
            }),
          )
          .min(1),
      }),
      gemini: z.object({
        defaultProfileId: z.string().min(1),
        enabledProfileId: z.string().optional().default(''),
        profiles: z
          .array(
            z.object({
              id: z.string().min(1),
              name: z.string().min(1),
              envVars: z
                .array(z.object({ key: z.string().min(1), value: z.string() }))
                .optional()
                .default([]),
            }),
          )
          .min(1),
      }),
    }),
  });
  const providerTestSchema = z.object({
    provider: z.string().min(1),
    profileId: z.string().min(1),
    envVars: z
      .array(z.object({ key: z.string().min(1), value: z.string().optional().default('') }))
      .optional()
      .default([]),
  });
  const providerOAuthLoginSchema = z.object({
    provider: z.string().min(1),
    profileId: z.string().min(1),
    projectId: z.string().min(1).optional(),
    cwd: z.string().optional(),
  });
  const providerOAuthProbeSchema = z.object({
    provider: z.string().min(1),
    profileId: z.string().min(1),
    envVars: z
      .array(z.object({ key: z.string().min(1), value: z.string().optional().default('') }))
      .optional()
      .default([]),
  });
  const providerOAuthLinksSchema = z.object({
    provider: z.string().min(1),
    profileId: z.string().optional(),
    sessionId: z.string().optional(),
  });
  const providerProxyTestSchema = z.object({
    provider: z.string().min(1),
    profileId: z.string().min(1),
    proxyUrl: z.string().min(1),
    envVars: z
      .array(z.object({ key: z.string().min(1), value: z.string().optional().default('') }))
      .optional()
      .default([]),
  });
  const sessionCreateSchema = z.object({
    projectId: z.string().min(1),
    cwd: z.string().optional(),
    title: z.string().optional(),
    provider: z.string().optional().default('claude'),
  });
  const sessionStartSchema = z.object({
    sessionId: z.string().min(1),
    providerSessionId: z.string().optional(),
    cwd: z.string().optional(),
    name: z.string().optional(),
    provider: z.string().optional().default('claude'),
  });
  const sessionSuggestTitleSchema = z.object({
    sessionId: z.string().min(1),
    providerSessionId: z.string().optional(),
    provider: z.string().optional().default('claude'),
  });
  const sessionReorderSchema = z.object({
    projectId: z.string().min(1),
    orderedSessions: z
      .array(
        z.object({
          provider: z.string().min(1),
          providerSessionId: z.string().min(1),
        }),
      )
      .default([]),
  });
  const sessionStatsSchema = z.object({
    provider: z.string().optional().default('claude'),
    providerSessionId: z.string().optional(),
    sessionId: z.string().optional(),
  });
  const fileTreeSchema = z.object({
    cwd: z.string().min(1),
    depth: z.number().int().min(1).max(12).optional().default(6),
  });
  const fileOpenPathSchema = z.object({
    path: z.string().min(1),
  });
  const fileAttachmentSaveSchema = z.object({
    cwd: z.string().min(1),
    sessionId: z.string().min(1),
  });
  const fileAttachmentSaveBufferSchema = z.object({
    cwd: z.string().min(1),
    sessionId: z.string().min(1),
    base64: z.string().min(1),
    mimeType: z.string().min(1),
  });
  const skillgenRunSchema = z.object({
    projectId: z.string().min(1),
    trigger: z.string().optional().default('manual'),
    rebuild: z.boolean().optional().default(false),
    focusSessionId: z.string().optional().default(''),
  });
  const sessionsDumpRunSchema = z.object({
    projectId: z.string().min(1),
    trigger: z.string().optional().default('manual'),
  });
  const tokenUsageFiltersSchema = z.object({
    range: z.enum(['7d', '30d', 'all']).optional().default('30d'),
    projectId: z.string().optional().default(''),
    provider: z.string().optional().default(''),
    modelName: z.string().optional().default(''),
  });
  const tokenUsageRefreshSchema = z.object({
    force: z.boolean().optional().default(false),
  });

  return {
    providerSettingsSchema,
    providerTestSchema,
    providerOAuthLoginSchema,
    providerOAuthProbeSchema,
    providerOAuthLinksSchema,
    providerProxyTestSchema,
    sessionCreateSchema,
    sessionStartSchema,
    sessionSuggestTitleSchema,
    sessionReorderSchema,
    sessionStatsSchema,
    fileTreeSchema,
    fileOpenPathSchema,
    fileAttachmentSaveSchema,
    fileAttachmentSaveBufferSchema,
    skillgenRunSchema,
    sessionsDumpRunSchema,
    tokenUsageFiltersSchema,
    tokenUsageRefreshSchema,
  };
}

module.exports = {
  createIpcSchemas,
};
