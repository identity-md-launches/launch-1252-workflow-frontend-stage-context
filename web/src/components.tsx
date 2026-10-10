import { useState, type ReactNode } from 'react';
import { getAddress, type Address as AddressType } from 'viem';
import type { Deployment } from './config';
import type { Transactions } from './wallet';
export function Icon({
  name,
  size = 18,
}: {
  name: 'arrow' | 'copy' | 'refresh' | 'external' | 'wallet' | 'check' | 'swap' | 'seat' | 'leaf';
  size?: number;
}) {
  const paths = {
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M16 8V4H4v12h4" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 10a8 8 0 1 0-2 8M20 4v6h-6" />
      </>
    ),
    external: (
      <>
        <path d="M14 4h6v6m0-6L10 14M10 4H4v16h16v-6" />
      </>
    ),
    wallet: (
      <>
        <path d="M20 8H4V5l13-2v5M4 8v12h16V8M16 12h6v5h-6z" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    swap: (
      <>
        <path d="M7 3v18m-4-4 4 4 4-4M17 21V3m-4 4 4-4 4 4" />
      </>
    ),
    seat: (
      <>
        <path d="M7 13V5a5 5 0 0 1 10 0v8M4 13h16v4H4zM7 17v5m10-5v5M10 5h4" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 3C9 3 3 7 5 14s14 5 15-11ZM4 21 15 10" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Address({
  address,
  d,
  label,
  full = false,
}: {
  address: AddressType;
  d: Deployment;
  label?: string;
  full?: boolean;
}) {
  const [message, setMessage] = useState('');
  const checksum = getAddress(address);
  return (
    <span className={`address ${full ? 'full-address' : ''}`}>
      <a
        href={`${d.network.explorer}/address/${checksum}`}
        target="_blank"
        rel="noreferrer"
        title={checksum}
        aria-label={`${label ?? 'Address'} ${checksum} on explorer`}
      >
        {label && <span>{label} </span>}
        <span className="mono">
          {full ? checksum : `${checksum.slice(0, 6)}…${checksum.slice(-4)}`}
        </span>
        <Icon name="external" size={13} />
      </a>
      <button
        className="icon-button"
        title={`Copy ${label ?? 'address'}`}
        aria-label={`Copy ${label ?? 'address'}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(checksum);
            setMessage('Address copied');
          } catch {
            setMessage('Copy unavailable. Select the full address in contract details.');
          }
        }}
      >
        <Icon name={message === 'Address copied' ? 'check' : 'copy'} size={14} />
      </button>
      <span role="status" className="sr-only">
        {message}
      </span>
    </span>
  );
}
export function TxFeedback({ id, tx, d }: { id: string; tx: Transactions; d: Deployment }) {
  const s = tx.states[id];
  return (
    <div
      className={`tx-feedback ${s?.stage === 'error' || s?.stage === 'unknown' ? 'error-text' : ''}`}
      role="status"
      aria-live="polite"
    >
      {s && (
        <>
          <span>{s.text}</span>
          {s.hash && (
            <a target="_blank" rel="noreferrer" href={`${d.network.explorer}/tx/${s.hash}`}>
              View transaction <Icon name="external" size={13} />
            </a>
          )}
          {s.stage === 'unknown' && (
            <button className="text-button" onClick={() => tx.checkReceipt(id)}>
              Check confirmation
            </button>
          )}
        </>
      )}
    </div>
  );
}
export function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="detail-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
export function Coin({ symbol }: { symbol: string }) {
  return (
    <span className={`coin ${symbol === 'ETH' ? 'eth' : ''}`} aria-hidden="true">
      {symbol === 'ETH' ? 'Ξ' : 't'}
    </span>
  );
}
