'use client';
import Link from 'next/link';

export function AddClientButton() {
  return (
    <Link href="/clients/new" className="btn btn-primary text-sm px-4 py-2 whitespace-nowrap shrink-0">
      + Add client
    </Link>
  );
}
