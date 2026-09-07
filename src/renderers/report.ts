import { sourceRequest, reportContracts, type ReadingModel, type ReadingPlan } from '../presentation/plan.js';
import { capabilityRecords, createPresentationPlan, validatePresentationPlan, overviewExplanations, functionExplanations, guideExplanations } from '../presentation/plan.js';
import type { Explanation } from '../presentation/plan.js';

export interface ReportOptions { audience?: 'engineer' | 'overview'; companion?: string; sourceNotice?: string }
export function buildReport(model: ReadingModel, capability: string, supplied?: ReadingPlan, options: ReportOptions = {}) {
  const plan = supplied ?? createPresentationPlan(model, capability);
  validatePresentationPlan(plan, model, capability);
  const { concept, claims, flow } = capabilityRecords(model, capability);
  const { proposal } = model.data;
  const request = sourceRequest(model);
  const bindings = plan.schema_version === '0.2.0' ? plan.function_bindings : [];
  const contractFunctions = model.schema_version === '0.2.0' ? bindings.map(binding => ({ ...model.data.proposal.data.functions.find(fn => fn.id === binding.function_id)!, stage_keys: binding.stage_keys })) : [];
  const contractBehaviors = model.schema_version === '0.2.0' && plan.schema_version === '0.2.0' ? model.data.proposal.data.behaviors.filter(b => plan.behavior_ids.includes(b.id)) : [];
  const implementations = model.schema_version === '0.2.0' ? model.data.request.data.callables : [];
  const functionLinks = [...(plan.functions ?? []).map(fn => ({ ...fn, link_id: `function-${fn.key}` })), ...contractFunctions.map(fn => ({ ...fn, key: fn.id, link_id: anchor(fn.id) }))];
  const claimLabels = new Map(claims.map((claim, index) => [claim.id, `C${index + 1}`]));
  const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
  const steps = new Map(flow.steps.map((step) => [step.id, step]));
  const requiredUnknowns = new Set(model.schema_version === '0.2.0' ? reportContracts(model,concept.id).unknowns.map(u=>u.id) : []);
  const unknowns = proposal.data.unknowns.map((item, index) => ({ ...item, index })).filter((item) => item.subject_id === concept.id || item.critical || ('id' in item && requiredUnknowns.has(item.id)));
  const relations = proposal.data.relations.filter((item) => item.from_id === concept.id || item.to_id === concept.id);
  const concepts = new Map(proposal.data.concepts.map((item) => [item.id, item]));
  const cited = new Set([...concept.evidence_ids, ...claims.flatMap((item) => item.evidence_ids), ...unknowns.flatMap((item) => item.evidence_ids), ...relations.flatMap((item) => item.evidence_ids), ...flow.steps.flatMap((item) => [...item.evidence_ids, ...item.next.flatMap((edge) => edge.evidence_ids)])]);
  const texts = [plan.introduction, ...plan.stages.flatMap((stage) => [stage.summary, ...stage.notes, ...stage.cautions]), ...plan.cases.flatMap((item) => item.answer), ...(plan.sequence ? [plan.sequence.assumption] : []), ...(plan.overview ? overviewExplanations(plan.overview) : []), ...(plan.functions ?? []).flatMap(functionExplanations), ...(plan.guide ? guideExplanations(plan.guide) : [])];
  plan.guide?.sections.forEach((section) => { if (section.code) cited.add(section.code.evidence_id); });
  plan.functions?.forEach((item) => item.evidence_ids.forEach((id) => cited.add(id)));
  texts.forEach((item) => item.evidence_ids?.forEach((id) => cited.add(id)));
  contractFunctions.forEach(fn => { const item = implementations.find(c => c.id === fn.implementation_id); if (item) cited.add(item.evidence_id); });
  const evidence = request.data.evidence.filter((item) => cited.has(item.id)).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : a.start_byte - b.start_byte);
  const evidenceMap = new Map(evidence.map((item) => [item.id, item]));
  const evidenceFor = (item: Explanation) => [...new Set([...(item.evidence_ids ?? []), ...item.claim_ids.flatMap((id) => claimMap.get(id)!.evidence_ids), ...item.unknown_indices.flatMap((index) => proposal.data.unknowns[index]!.evidence_ids)])];
  const entries = flow.entry_symbol_ids.map((id) => {
    const symbol = request.data.symbols.find((item) => item.id === id)!;
    return { name: symbol.name, path: request.data.files.find((file) => file.id === symbol.file_id)!.path };
  });
  return { request, contractFunctions, contractBehaviors, implementations, functionLinks, options, model, plan, concept, claims, flow, claimLabels, claimMap, steps, unknowns, relations, concepts, evidence, evidenceMap, evidenceFor, entries };
}
export type Report = ReturnType<typeof buildReport>;
export const anchor = (id: string) => id.replace(':', '-');
export const html = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
export const markdown = (text: string): string => html(text).replace(/([\\`*_[\]{}()#+.!|~\-])/g, '\\$1').replace(/\r\n|\r|\n|\u2028|\u2029/g, ' ');
export function codeFence(text: string): string {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  const separator = /[\r\n]$/.test(text) ? '' : '\n';
  return `${fence}typescript\n${text}${separator}${fence}`;
}
