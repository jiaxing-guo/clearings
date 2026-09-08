import type { ReadingModel, ReadingPlan } from '../presentation/plan.js';
import { ClearingsError } from '../model/types.js';
import {
  renderOverviewHtml,
  renderOverviewMarkdown,
  renderEngineerHtml,
  renderEngineerMarkdown,
} from './audiences.js';
import type { ReportOptions } from './report.js';
import { buildReport } from './report.js';
import { renderHtml } from './html.js';
import { renderMarkdown } from './markdown.js';

export interface RenderCapabilityOptions extends ReportOptions {
  format?: 'markdown' | 'html';
  presentation?: ReadingPlan;
}
/** Human projection only. Both formats consume the same version-bound presentation plan. */
export function renderCapability(
  model: ReadingModel,
  capability: string,
  options: RenderCapabilityOptions = {},
): string {
  const format = options.format ?? 'markdown';
  if (format !== 'markdown' && format !== 'html')
    throw new ClearingsError(
      'INVALID_ARGUMENTS',
      'Supported report formats are markdown and html.',
    );
  const audience = options.audience ?? 'engineer';
  if (audience !== 'engineer' && audience !== 'overview')
    throw new ClearingsError('INVALID_ARGUMENTS', 'Supported audiences are engineer and overview.');
  if (
    options.companion &&
    (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.(html|md)$/.test(options.companion) ||
      options.companion.includes('..'))
  )
    throw new ClearingsError(
      'INVALID_ARGUMENTS',
      'A companion link must be a local report filename.',
    );
  const report = buildReport(model, capability, options.presentation, { ...options, audience });
  if (audience === 'overview') {
    if (!report.plan.overview)
      throw new ClearingsError(
        'OVERVIEW_REQUIRED',
        'Overview output requires an authored overview in the presentation plan.',
      );
    return format === 'html' ? renderOverviewHtml(report) : renderOverviewMarkdown(report);
  }
  if (report.plan.guide)
    return format === 'html' ? renderEngineerHtml(report) : renderEngineerMarkdown(report);
  return format === 'html' ? renderHtml(report) : renderMarkdown(report);
}
