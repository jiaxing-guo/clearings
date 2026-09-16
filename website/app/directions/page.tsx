import Link from 'next/link';
import { assetPath } from '@/lib/paths';
import { designs, type Direction } from './designs';
export default function Directions() {
  return (
    <main className="direction-review">
      <header className="review-top">
        <Link href="/">Clearings</Link>
        <span>Documentation + landing page</span>
      </header>
      <section className="review-intro">
        <p className="review-kicker">Visual review</p>
        <h1>Choose a direction.</h1>
        <p>
          Three complete treatments for the same product. Explore the landing page and its matching
          documentation surface.
        </p>
      </section>
      <div className="review-options">
        {(Object.keys(designs) as Direction[]).map((key, index) => {
          const design = designs[key];
          return (
            <section className={`review-option review-${key}`} key={key}>
              <Link className="option-art" href={`/directions/${key}`}>
                <img
                  src={assetPath(`/directions/${design.image}`)}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  width={1536}
                  height={1024}
                  alt={design.alt}
                />
              </Link>
              <div className="option-copy">
                <h2>{design.name}</h2>
                <p className="option-tag">{design.tag}</p>
                <p>{design.summary}</p>
                <p className="option-fit">{design.recommendation}</p>
                <Link className="option-link" href={`/directions/${key}`}>
                  Explore {design.name} <span aria-hidden="true">→</span>
                </Link>
              </div>
            </section>
          );
        })}
      </div>
      <footer className="review-footer">
        <p>
          These are review alternatives, not a selected redesign. The product copy describes
          implemented behavior; screenshots show a local demo.
        </p>
        <p>
          Art direction uses <a href="https://github.com/Leonxlnx/taste-skill">Taste Skill</a>.
          Concept assets were generated with ImageGen. Typography uses self-hosted Geist under its{' '}
          <a href={assetPath('/directions/font-license.txt')}>font license</a>.
        </p>
      </footer>
    </main>
  );
}
