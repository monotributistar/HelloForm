import { prisma } from './prisma.js';
import type { OperationType } from './costs.js';

export interface ResolvePriceInput {
  tenantId: string;
  provider: 'openai' | 'huggingface';
  model: string;
  operation: OperationType;
}

const DEFAULT_RULES: Array<{
  provider: 'openai' | 'huggingface';
  model: string;
  operation: OperationType;
  usdPer1kUnits: number;
}> = [
  { provider: 'huggingface', model: 'distilbert-base-uncased', operation: 'generate_text', usdPer1kUnits: 0.002 },
  { provider: 'huggingface', model: 'distilbert-base-uncased', operation: 'extract_structured', usdPer1kUnits: 0.0015 },
  { provider: 'huggingface', model: 'openai/whisper-small', operation: 'transcribe_audio', usdPer1kUnits: 0.003 }
];
const DEFAULT_TENANT = '__default__';

export const pricingRepo = {
  async seedDefaults() {
    for (const rule of DEFAULT_RULES) {
      await prisma.pricingRule.upsert({
        where: {
          tenantId_provider_model_operation: {
            tenantId: DEFAULT_TENANT,
            provider: rule.provider,
            model: rule.model,
            operation: rule.operation
          }
        },
        create: {
          tenantId: DEFAULT_TENANT,
          provider: rule.provider,
          model: rule.model,
          operation: rule.operation,
          usdPer1kUnits: rule.usdPer1kUnits
        },
        update: {}
      });
    }
  },

  async resolvePrice(input: ResolvePriceInput): Promise<number> {
    const tenantRule = await prisma.pricingRule.findUnique({
      where: {
        tenantId_provider_model_operation: {
          tenantId: input.tenantId,
          provider: input.provider,
          model: input.model,
          operation: input.operation
        }
      }
    });

    if (tenantRule) return tenantRule.usdPer1kUnits;

    const defaultRule = await prisma.pricingRule.findUnique({
      where: {
        tenantId_provider_model_operation: {
          tenantId: DEFAULT_TENANT,
          provider: input.provider,
          model: input.model,
          operation: input.operation
        }
      }
    });

    return defaultRule?.usdPer1kUnits ?? 0.002;
  },

  async upsertTenantRule(input: {
    tenantId: string;
    provider: 'openai' | 'huggingface';
    model: string;
    operation: OperationType;
    usdPer1kUnits: number;
  }) {
    return prisma.pricingRule.upsert({
      where: {
        tenantId_provider_model_operation: {
          tenantId: input.tenantId,
          provider: input.provider,
          model: input.model,
          operation: input.operation
        }
      },
      create: input,
      update: { usdPer1kUnits: input.usdPer1kUnits }
    });
  }
};
