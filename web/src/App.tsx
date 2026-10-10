import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import { contract, demoPool, publicClient, type Deployment } from './config';
import { readActivity, readSnapshot, verifyChain, type Activity, type Snapshot } from './chain';
import { displayAmount, errorText, poolId, seatFrom } from './domain';
import { useTransactions, useWallet } from './wallet';
import { Address, Coin, Detail, Icon, TxFeedback } from './components';
import { Swap } from './Swap';
import { Advanced } from './Advanced';
export default function App({ d }: { d: Deployment }) {
  const wallet = useWallet(d);
  const client = useMemo(
    () => publicClient(d, wallet.correct ? wallet.provider : undefined),
    [d, wallet.provider, wallet.correct],
  );
  const [snapshot, setSnapshot] = useState<Snapshot>(),
    [seat, setSeat] = useState<bigint>(),
    [seatInput, setSeatInput] = useState(''),
    [seatError, setSeatError] = useState('');
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [verified, setVerified] = useState(false),
    [lastRead, setLastRead] = useState(0),
    [clock, setClock] = useState(Date.now());
  const [events, setEvents] = useState<Activity[]>([]),
    [activityError, setActivityError] = useState(''),
    [eventLoading, setEventLoading] = useState(false);
  const [claimReview, setClaimReview] = useState<string>();
  const request = useRef(0),
    reading = useRef(false),
    mounted = useRef(true);
  const hook = contract(d, 'TitheHook'),
    key = demoPool(d);
  const refresh = useCallback(
    async (quiet = false) => {
      if (reading.current && quiet) return;
      const seq = ++request.current;
      reading.current = true;
      if (!quiet) setLoading(true);
      try {
        await verifyChain(client, d);
        const data = await readSnapshot(
          client,
          d,
          seat,
          wallet.correct ? wallet.account : undefined,
        );
        if (seq !== request.current || !mounted.current) return;
        setSnapshot(data);
        setVerified(true);
        setError('');
        setLastRead(Date.now());
      } catch (e) {
        if (seq === request.current && mounted.current) {
          setError(errorText(e));
          setVerified(false);
        }
      } finally {
        if (seq === request.current) {
          setLoading(false);
          reading.current = false;
        }
      }
    },
    [client, d, seat, wallet.account, wallet.correct],
  );
  const refreshEvents = useCallback(async () => {
    setEventLoading(true);
    try {
      const result = await readActivity(client, d);
      if (mounted.current) {
        setEvents(result.events);
        setActivityError('');
      }
    } catch {
      if (mounted.current)
        setActivityError(
          'Recent events are unavailable from this RPC. Refresh activity to retry. Balances are read separately.',
        );
    } finally {
      if (mounted.current) setEventLoading(false);
    }
  }, [client, d]);
  useEffect(() => {
    mounted.current = true;
    setClaimReview(undefined);
    setVerified(false);
    refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') refresh(true);
    }, 15000);
    return () => {
      mounted.current = false;
      request.current++;
      reading.current = false;
      clearInterval(interval);
    };
  }, [refresh]);
  useEffect(() => {
    refreshEvents();
  }, [refreshEvents]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const afterTx = useCallback(async () => {
    await refresh();
    await refreshEvents();
    setClaimReview(undefined);
  }, [refresh, refreshEvents]);
  const tx = useTransactions(d, client, wallet, afterTx);
  const fresh = lastRead > 0 && clock - lastRead < 45000;
  const ready = verified && fresh && !error && !loading;
  const canWrite = ready && !!wallet.account && wallet.correct;
  const selectedEvents = events.filter((e) => snapshot && e.seat === snapshot.seat);
  const chooseSeat = (value: bigint) => {
    setSeatInput(String(value));
    setClaimReview(undefined);
    if (value === (seat ?? snapshot?.seat)) {
      void refresh();
      return;
    }
    setSeat(value);
    setSnapshot(undefined);
    setVerified(false);
    setLoading(true);
  };
  function submitSeat(e: React.FormEvent) {
    e.preventDefault();
    try {
      const value = seatFrom(seatInput);
      setSeatError('');
      chooseSeat(value);
    } catch (e) {
      setSeatError(errorText(e));
    }
  }
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="site-wrap">
        <header className="site-header">
          <a href="#" className="brand" aria-label="Tithe home">
            <span className="brand-mark" aria-hidden="true">
              t
            </span>
            <span>
              tithe<span className="brand-dot">.</span>
            </span>
          </a>
          <nav aria-label="Primary">
            <a href="#seat">Seat ledger</a>
            <a href="#how-it-works">How it works</a>
            <a href="#contracts">
              Contracts <Icon name="arrow" size={14} />
            </a>
          </nav>
          <div className="header-wallet">
            <span className="network-pill">
              <span className="network-dot" />
              {d.network.name}
              {d.network.testnet ? ' testnet' : ''}
            </span>
            {wallet.account ? (
              <div className="connected-wallet">
                <Address address={wallet.account} d={d} label="Wallet" />
                <button className="text-button" onClick={wallet.disconnect} disabled={tx.busy}>
                  Disconnect
                </button>
              </div>
            ) : (
              <>
                {wallet.options.length > 1 && (
                  <label className="wallet-select">
                    Wallet
                    <select
                      value={wallet.selected}
                      onChange={(e) => wallet.setSelected(e.target.value)}
                    >
                      {wallet.options.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  className="connect-button"
                  onClick={() => wallet.connect('header')}
                  disabled={wallet.busy}
                  aria-describedby="header-wallet-feedback"
                >
                  {wallet.busy ? 'Connecting…' : 'Connect wallet'}
                  <Icon name="wallet" size={16} />
                </button>
              </>
            )}
          </div>
        </header>
        <div className="wallet-feedback" id="header-wallet-feedback" role="status">
          {wallet.errorSource === 'header' && wallet.error && (
            <p className="error-text">{wallet.error}</p>
          )}
        </div>
        <main id="main" tabIndex={-1}>
          <section className="hero" aria-labelledby="page-title">
            <div className="hero-copy">
              <h1 id="page-title">
                Pay the seat,
                <br />
                <em>not the wallet.</em>
              </h1>
              <p className="hero-description">
                A little from every swap flows to an identity.md seat.
                <br className="desktop-break" /> When its owner changes, the tithe follows.
              </p>
              <a href="#seat" className="hero-link">
                Explore the seat ledger <Icon name="arrow" />
              </a>
            </div>
            <div className="seat-illustration" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <span className="orbit-node node-one">Ξ</span>
              <span className="orbit-node node-two">t</span>
              <div className="seat-drawing">
                <svg viewBox="0 0 200 180" fill="none">
                  <path d="M62 98V51c0-24 76-24 76 0v47" />
                  <path d="M77 46v44m23-48v48m23-44v44M52 106l21-17h59l18 17v15H52zM65 121l-9 40m79-40 9 40M68 144h66" />
                  <path className="chair-secondary" d="M54 108h93M75 126h49" />
                </svg>
              </div>
              <span className="diagram-label label-top">Every swap</span>
              <span className="diagram-label label-bottom">One enduring seat</span>
            </div>
          </section>
          <div className="principles-strip">
            <span>
              <Icon name="check" size={16} />
              Immutable seat binding
            </span>
            <span>
              <Icon name="check" size={16} />
              Current owner receives
            </span>
            <span>
              <Icon name="check" size={16} />
              Anyone can trigger a claim
            </span>
          </div>
          {wallet.account && !wallet.correct && (
            <div className="network-notice" id="network-notice">
              <div>
                <strong>Your wallet is on another network.</strong>
                <p>Switch to {d.network.name} to claim, approve, or swap.</p>
              </div>
              <button onClick={wallet.switchChain} disabled={wallet.busy}>
                {wallet.busy ? 'Switching…' : `Switch to ${d.network.name}`}
              </button>
            </div>
          )}
          <div className="status-bar">
            <span className={`data-status ${ready ? 'good' : ''}`}>
              <span className="status-dot" />
              {loading
                ? 'Reading contracts…'
                : error
                  ? 'Contract reads unavailable'
                  : !fresh || !verified || !snapshot
                    ? 'Data needs refreshing'
                    : `Live state · block ${snapshot.block.toLocaleString()}`}
            </span>
            <button className="text-button" onClick={() => refresh()} disabled={loading || tx.busy}>
              <Icon name="refresh" size={14} />
              {loading ? 'Refreshing…' : 'Refresh balances'}
            </button>
          </div>
          {error && (
            <div className="notice error-notice" role="alert">
              <strong>Unable to verify current contract state.</strong>
              <p>{error}</p>
              <span>
                Amounts from an earlier read may be stale. Transaction controls are disabled until a
                successful refresh.
              </span>
            </div>
          )}
          <div className="workspace-grid">
            <section className="ledger" aria-labelledby="ledger-title" id="seat">
              <div className="section-heading">
                <div>
                  <h2 id="ledger-title">Seat ledger</h2>
                </div>
                <span className="outline-tag">Permissionless claims</span>
              </div>
              <div className="seat-toolbar">
                <div className="seat-badge">
                  <Icon name="seat" size={25} />
                  <strong>Seat {snapshot ? `#${snapshot.seat}` : '—'}</strong>
                  {snapshot?.initialized && snapshot.seat === snapshot.poolSeat && (
                    <span>Demo seat</span>
                  )}
                </div>
                <form onSubmit={submitSeat} className="seat-search">
                  <label className="sr-only" htmlFor="seat-id">
                    Seat ID
                  </label>
                  <input
                    id="seat-id"
                    name="seat"
                    inputMode="numeric"
                    placeholder="Seat ID"
                    value={seatInput}
                    onChange={(e) => setSeatInput(e.target.value)}
                    disabled={tx.busy}
                    aria-invalid={!!seatError}
                    aria-describedby="seat-error"
                  />
                  <button type="submit" disabled={tx.busy || loading}>
                    View seat <Icon name="arrow" size={15} />
                  </button>
                </form>
              </div>
              <p id="seat-error" className="error-text" role="alert">
                {seatError}
              </p>
              <div className="beneficiary">
                <div>
                  <span className="small-label">Current beneficiary</span>
                  {snapshot?.owner ? (
                    <Address address={snapshot.owner} d={d} label="Seat owner" />
                  ) : (
                    <span className="muted">
                      {loading ? 'Reading seat ownership…' : 'Owner unavailable'}
                    </span>
                  )}
                </div>
                <span className="owner-note">Resolved live when you claim.</span>
              </div>
              {snapshot?.ownerError && (
                <p className="notice">{snapshot.ownerError} Accrued credit is preserved.</p>
              )}
              <div className="balance-list">
                {(
                  snapshot?.assets ?? [
                    { address: 'eth', symbol: 'ETH', decimals: 18 },
                    { address: 'tdemo', symbol: 'TDEMO', decimals: 18 },
                  ]
                ).map((asset, index) => {
                  const a = snapshot?.assets[index],
                    id = `claim-${asset.symbol}`;
                  return (
                    <article className="balance-card" key={asset.address}>
                      <div className="balance-top">
                        <span className="token-name">
                          <Coin symbol={asset.symbol} />
                          {asset.symbol}
                          <span className="muted small-copy">
                            {index === 0 ? 'Ether' : 'Tithe Demo'}
                          </span>
                        </span>
                        <span className="small-label">Accrued tithe</span>
                      </div>
                      <div className="balance-main">
                        <div>
                          <p
                            className="balance-number"
                            title={a ? formatUnits(a.accrued, a.decimals) : undefined}
                          >
                            {displayAmount(a?.accrued, asset.decimals)}
                            <span>{asset.symbol}</span>
                          </p>
                          <p className="balance-breakdown">
                            {displayAmount(a?.liquid, asset.decimals)} liquid <span>·</span>{' '}
                            {displayAmount(a?.pending, asset.decimals)} pending backing
                          </p>
                        </div>
                        <button
                          disabled={
                            !canWrite || tx.busy || !snapshot?.owner || !a || a.accrued === 0n
                          }
                          className="claim-button"
                          onClick={() => setClaimReview(id)}
                        >
                          {tx.active === id ? 'Claiming…' : `Claim ${asset.symbol}`}
                          <Icon name="arrow" size={16} />
                        </button>
                      </div>
                      {a?.accrued === 0n && (
                        <p className="small-copy empty-copy">
                          No {asset.symbol} has accrued for this seat yet.
                        </p>
                      )}
                      {claimReview === id && a && snapshot && (
                        <div className="review-box">
                          <strong>
                            Release {formatUnits(a.accrued, a.decimals)} {a.symbol}
                          </strong>
                          <p>
                            All available {a.symbol} will go to seat #{snapshot.seat}’s owner at
                            execution time. You pay only gas. No token approval is needed.
                          </p>
                          {snapshot.owner && <Address address={snapshot.owner} d={d} full />}
                          <div className="button-row">
                            <button
                              className="primary"
                              disabled={!canWrite || tx.busy || !snapshot.owner}
                              onClick={() =>
                                tx.run(
                                  id,
                                  async (account) =>
                                    (
                                      await client.simulateContract({
                                        address: hook.address,
                                        abi: hook.abi,
                                        functionName: 'claim',
                                        args: [snapshot.seat, a.address],
                                        account,
                                      })
                                    ).request,
                                )
                              }
                            >
                              Confirm claim in wallet
                            </button>
                            <button disabled={tx.busy} onClick={() => setClaimReview(undefined)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                      <TxFeedback id={id} tx={tx} d={d} />
                    </article>
                  );
                })}
              </div>
              {!wallet.account && (
                <p className="connect-hint">
                  <Icon name="wallet" size={16} />
                  Connect a wallet to release a seat’s tithe. You don’t have to own it.
                </p>
              )}
              <p className="ledger-note">
                Pending backing is included in accrued tithe. Claiming redeems it automatically
                before paying the current seat owner. An unsuccessful claim preserves the credit.
              </p>
              <div className="activity-heading">
                <h3>Recent activity</h3>
                <button className="text-button" onClick={refreshEvents} disabled={eventLoading}>
                  <Icon name="refresh" size={14} />
                  {eventLoading ? 'Loading…' : 'Refresh activity'}
                </button>
              </div>
              <p className="small-copy muted">
                For this seat · latest 1,200 blocks · up to 30 hook events
              </p>
              {activityError ? (
                <p className="notice">{activityError}</p>
              ) : (
                <ul className="activity-list">
                  {selectedEvents.length ? (
                    selectedEvents.slice(0, 5).map((e) => (
                      <li key={`${e.hash}-${e.index}`}>
                        <span className="activity-icon">
                          <Icon name={e.event === 'TitheClaimed' ? 'arrow' : 'leaf'} size={16} />
                        </span>
                        <div>
                          <strong>
                            {
                              (
                                {
                                  TitheAccrued: 'Tithe accrued',
                                  TitheClaimed: 'Tithe claimed',
                                  TitheRedeemed: 'Backing redeemed',
                                  PoolConfigured: 'Pool bound to seat',
                                } as Record<string, string>
                              )[e.event]
                            }
                          </strong>
                          <span>
                            Block {e.block.toLocaleString()}
                            {e.deferred ? ' · pending backing' : ''}
                          </span>
                        </div>
                        <a
                          href={`${d.network.explorer}/tx/${e.hash}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {e.amount !== undefined
                            ? `${displayAmount(e.amount, snapshot?.assets.find((a) => a.address.toLowerCase() === e.token?.toLowerCase())?.decimals)} ${snapshot?.assets.find((a) => a.address.toLowerCase() === e.token?.toLowerCase())?.symbol ?? 'units'}`
                            : 'View'}{' '}
                          <Icon name="external" size={13} />
                        </a>
                      </li>
                    ))
                  ) : (
                    <li className="empty-activity">
                      {eventLoading
                        ? 'Reading recent events…'
                        : 'No activity for this seat in the recent window. Earlier tithe is still included in the balances above.'}
                    </li>
                  )}
                </ul>
              )}
              {events.some((e) => e.seat !== snapshot?.seat) && (
                <div className="discovered-seats">
                  <span className="small-copy">Other seats active in this window</span>
                  {[...new Set(events.map((e) => String(e.seat)))]
                    .filter((s) => s !== String(snapshot?.seat))
                    .slice(0, 6)
                    .map((s) => (
                      <button key={s} disabled={tx.busy} onClick={() => chooseSeat(BigInt(s))}>
                        View seat #{s}
                      </button>
                    ))}
                </div>
              )}
            </section>
            <Swap d={d} client={client} snapshot={snapshot} ready={ready} wallet={wallet} tx={tx} />
          </div>
          <section className="how-section" id="how-it-works" aria-labelledby="how-title">
            <div className="how-intro">
              <h2 id="how-title">How tithe works</h2>
            </div>
            <ol className="how-steps">
              <li>
                <span>01</span>
                <h3>A swap creates a share.</h3>
                <p>
                  The pool’s fixed tithe is taken from the input currency. ETH in earns ETH; TDEMO
                  in earns TDEMO.
                </p>
              </li>
              <li>
                <span>02</span>
                <h3>The seat holds the right.</h3>
                <p>
                  Its ID and rate are fixed at pool creation. There are no owner keys, admin
                  settings, or upgrades.
                </p>
              </li>
              <li>
                <span>03</span>
                <h3>The current owner is paid.</h3>
                <p>
                  Anyone can trigger a claim. The NFT’s owner at that moment receives the full
                  available credit.
                </p>
              </li>
            </ol>
          </section>
          <section id="contracts" className="contracts-section" aria-labelledby="contracts-title">
            <div className="section-heading">
              <div>
                <h2 id="contracts-title">Deployed contracts</h2>
              </div>
              <a
                className="text-link"
                href="./imd-deployment.json"
                target="_blank"
                rel="noreferrer"
              >
                Deployment manifest <Icon name="external" size={15} />
              </a>
            </div>
            <div className="contract-grid">
              <div>
                <h3>Application contracts</h3>
                <dl>
                  {d.contracts.map((c) => (
                    <Detail key={c.name} label={c.name}>
                      <Address address={c.address} d={d} />
                      <a
                        className="abi-link"
                        aria-label={`${c.name} ABI JSON`}
                        href={`./${c.abiPath}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        ABI JSON
                      </a>
                    </Detail>
                  ))}
                  {snapshot && (
                    <Detail label="Identity seat NFT">
                      <Address address={snapshot.seatContract} d={d} />
                    </Detail>
                  )}
                </dl>
              </div>
              <div>
                <h3>Demo pool</h3>
                <dl>
                  <Detail label="Seat binding">
                    {snapshot?.initialized
                      ? `Seat #${snapshot.poolSeat} · ${snapshot.bps / 100}% tithe`
                      : 'Awaiting verified pool data'}
                  </Detail>
                  <Detail label="Liquidity">
                    {snapshot
                      ? snapshot.liquidity > 0n
                        ? 'Active at the current tick'
                        : 'No active liquidity'
                      : '—'}
                  </Detail>
                  <Detail label="Pool fee / tick spacing">
                    {key.fee / 10000}% / {key.tickSpacing}
                  </Detail>
                  <Detail label="Pool ID">
                    <code className="break-value">{poolId(key)}</code>
                  </Detail>
                </dl>
              </div>
            </div>
            <details className="integrity-details">
              <summary>Deployment provenance, totals, and protocol addresses</summary>
              <dl>
                <Detail label="Source commit">
                  <code className="break-value">{d.sourceCommit}</code>
                </Detail>
                <Detail label="Attestation hash">
                  <code className="break-value">{d.attestationHash}</code>
                </Detail>
                <Detail label="Launch ID">
                  <code className="break-value">{d.launchId}</code>
                </Detail>
                {d.contracts.map((c) => (
                  <Detail label={`${c.name} full address`} key={c.name}>
                    <Address address={c.address} d={d} full />
                  </Detail>
                ))}
                {Object.entries(d.network.uniswapV4)
                  .filter(([, v]) => typeof v === 'string')
                  .map(([name, address]) => (
                    <Detail label={name} key={name}>
                      <Address address={address as `0x${string}`} d={d} full />
                    </Detail>
                  ))}
                {snapshot?.assets.map((a) => (
                  <Detail key={a.address} label={`All seats · ${a.symbol}`}>
                    {displayAmount(a.total, a.decimals)} accrued (
                    {displayAmount(a.totalPending, a.decimals)} pending)
                  </Detail>
                ))}
              </dl>
              <p className="small-copy">
                ABI hashes are checked against the runtime manifest. RPC chain ID, deployed code,
                and the hook’s PoolManager are checked before transactions are enabled. This is not
                an independent security audit.
              </p>
            </details>
          </section>
          <Advanced d={d} client={client} snapshot={snapshot} canWrite={canWrite} tx={tx} />
        </main>
        <footer>
          <a href="#" className="brand footer-brand">
            tithe.
          </a>
          <p>Small share. Lasting connection.</p>
          <span>Ethereum mainnet · Real assets, real gas.</span>
        </footer>
      </div>
    </>
  );
}
