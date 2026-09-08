'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Nav({ inbox, applied }: { inbox?: number; applied?: number }) {
  const path = usePathname();
  const tabs = [
    { href: '/', label: 'Atlas', n: undefined as number | undefined },
    { href: '/notifications', label: 'Notifications', n: inbox },
    { href: '/applied', label: 'Applied', n: applied },
  ];
  return (
    <nav className="topnav">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? 'page' : undefined}>
          {t.label}
          {t.n ? <span className="n"> {t.n}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
