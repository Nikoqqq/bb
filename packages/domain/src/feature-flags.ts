import { z } from "zod";

export const featureFlagsSchema = z.object({
  placeholder: z.boolean(),
  agentInstallTelemetry: z.boolean().default(true),
  timelineWindowEventBudget: z.number().int().positive(),
});
export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export const defaultFeatureFlags: FeatureFlags = {
  placeholder: false,
  agentInstallTelemetry: true,
  timelineWindowEventBudget: 1_500,
};
