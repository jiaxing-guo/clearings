import Link from 'next/link';

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Clearings home">
      <span className="brand-glyph" aria-hidden="true">
        c/
      </span>
      clearings
    </Link>
  );
}
