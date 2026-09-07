import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';

const sections = [
  ['Architecture', 'Representations, processing paths, abstraction, and refinement.', 'architecture/system'],
  ['Semantics', 'Types, expressions, operation contracts, and observation checks.', 'semantics/values-and-expressions'],
  ['Interface reference', 'Identity, validation, context projections, API, and compatibility.', 'reference/identity-and-validation'],
  ['Guides', 'Inspect a Hono case and author a typed specification.', 'guides/check-a-case'],
  ['Development', 'Implemented capabilities, bootstrap evidence, and documentation maintenance.', 'development/status-and-roadmap'],
];

export default function Home() {
  return <HomeLayout {...baseOptions()}><main className="home-intro">
    <h1>Clearings documentation</h1>
    <p>Technical reference for the repository analysis pipeline and typed contract language. Read the semantics, inspect abstraction boundaries, and reproduce the worked examples.</p>
    <div className="home-links"><Link href="/docs/technical">Read the technical reference →</Link><Link href="/docs/technical/guides/check-a-case">Check a Hono case →</Link></div>
    <table><thead><tr><th>Section</th><th>Scope</th></tr></thead><tbody>
      {sections.map(([title, description, path]) => <tr key={path}><td><Link href={`/docs/technical/${path}`}>{title}</Link></td><td>{description}</td></tr>)}
    </tbody></table>
    <p>The reference describes the implemented v0.3.0 contract language and its relationship to the v0.1 and v0.2 models. Proposed implementation IRs and refinement checks are identified separately.</p>
  </main></HomeLayout>;
}
