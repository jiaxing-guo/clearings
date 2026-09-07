import Link from 'next/link';
import { HomeLayout } from 'fumadocs-ui/layouts/home';
import { baseOptions } from '@/lib/layout.shared';
export default function Home() {
  return <HomeLayout {...baseOptions()}><main className="home-intro"><h1>Internal representation<br />for AI coding.</h1><p>Clearings connects code to behavior. Inspect the conditions, state changes, and failure paths behind an explanation. Give a coding agent the records it needs for a specific question.</p><div className="home-links"><Link href="/docs">Get started →</Link><Link href="/docs/demos">Explore the three demos →</Link></div><table><thead><tr><th>Start with your question</th><th>Choose a view</th></tr></thead><tbody><tr><td>What does this part of the system do?</td><td>Overview report</td></tr><tr><td>How does it behave under these conditions?</td><td>Engineer guide</td></tr><tr><td>Which rules and source should my agent use?</td><td>Semantic records</td></tr></tbody></table><p>Review prototype. The Hono example covers two capabilities. Claims need independent support review. The library has no built-in model endpoint.</p></main></HomeLayout>;
}
