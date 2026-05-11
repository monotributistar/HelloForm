export type OperationType = 'generate_text' | 'extract_structured' | 'transcribe_audio';

export const estimateCostUsdWithUnitPrice = (units: number, usdPer1kUnits: number): number => {
  const base = (units / 1000) * usdPer1kUnits;
  return Number(base.toFixed(8));
};
