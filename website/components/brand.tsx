import Link from 'next/link';
import { assetPath } from '@/lib/paths';

export function BrandMark({ className = '' }: { className?: string }) {
  return (
    <img
      className={`brand-mark ${className}`}
      src={assetPath('/brand/mark.svg')}
      width={260}
      height={234}
      alt=""
      aria-hidden="true"
    />
  );
}

export function Brand() {
  return (
    <Link className="brand" href="/" aria-label="Clearings home">
      <BrandMark />
      <span>clearings</span>
    </Link>
  );
}
