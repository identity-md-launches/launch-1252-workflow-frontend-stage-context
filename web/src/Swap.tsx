import { useEffect, useRef, useState } from 'react';
import { formatUnits, zeroAddress, type Address } from 'viem';
import { contract, demoPool, protocolAbi, type Deployment, type ReadClient } from './config';
import {
  amountFrom,
  displayAmount,
  errorText,
  minimumOutput,
  slippageFrom,
  swapPayload,
} from './domain';
import type { Snapshot } from './chain';
import type { Transactions, Wallet } from './wallet';
import { Coin, Detail, Icon, TxFeedback } from './components';
type Quote = {
  amount: bigint;
  output: bigint;
  min: bigint;
  time: number;
  input: Address;
  block: bigint;
  bps: number;
};
type Allowances = { token: bigint; router: bigint; expiration: number };
export function Swap({
  d,
  client,
  snapshot,
  ready,
  wallet,
  tx,
}: {
  d: Deployment;
  client: ReadClient;
  snapshot?: Snapshot;
  ready: boolean;
  wallet: Wallet;
  tx: Transactions;
}) {
  const [sell, setSell] = useState(false),
    [amount, setAmount] = useState(''),
    [slippage, setSlippage] = useState('0.5');
  const [quote, setQuote] = useState<Quote>(),
    [quoting, setQuoting] = useState(false),
    [error, setError] = useState('');
  const [allowances, setAllowances] = useState<Allowances>(),
    [now, setNow] = useState(Date.now());
  const [review, setReview] = useState(false);
  const seq = useRef(0),
    amountRef = useRef<HTMLInputElement>(null);
  const input = snapshot?.assets[sell ? 1 : 0],
    output = snapshot?.assets[sell ? 0 : 1];
  const token = contract(d, 'TitheToken'),
    key = demoPool(d),
    uni = d.network.uniswapV4;
  const poolReady =
    ready && !!snapshot?.initialized && !!snapshot.sqrtPrice && snapshot.liquidity > 0n;
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    seq.current++;
    setQuote(undefined);
    setAllowances(undefined);
    setReview(false);
    setError('');
    setQuoting(false);
  }, [amount, slippage, sell, wallet.account, wallet.chainId]);
  const fresh = !!quote && now - quote.time < 60000;
  const readAllowances = async (owner: Address, currency: Address) => {
    if (currency === zeroAddress) return { token: 0n, router: 0n, expiration: 0 };
    const [erc, permit] = await Promise.all([
      client.readContract({
        address: currency,
        abi: token.abi,
        functionName: 'allowance',
        args: [owner, uni.permit2],
      }) as Promise<bigint>,
      client.readContract({
        address: uni.permit2,
        abi: protocolAbi.permit2,
        functionName: 'allowance',
        args: [owner, currency, uni.universalRouter],
      }),
    ]);
    return { token: erc, router: permit[0], expiration: permit[1] };
  };
  useEffect(() => {
    let dead = false;
    if (!quote || !wallet.account || !wallet.correct || !input) return;
    readAllowances(wallet.account, input.address)
      .then((a) => {
        if (!dead) setAllowances(a);
      })
      .catch((e) => {
        if (!dead) setError(errorText(e));
      });
    return () => {
      dead = true;
    };
  }, [
    quote,
    wallet.account,
    wallet.correct,
    tx.states['approve-token']?.stage,
    tx.states['approve-router']?.stage,
    snapshot?.block,
  ]);
  const getQuote = async () => {
    if (!input || !poolReady || quoting) return;
    setError('');
    setReview(false);
    setQuote(undefined);
    let amountIn: bigint, bps: number;
    try {
      amountIn = amountFrom(amount, input.decimals);
      bps = slippageFrom(slippage);
    } catch (e) {
      setError(errorText(e));
      amountRef.current?.focus();
      return;
    }
    setQuoting(true);
    const id = ++seq.current;
    try {
      const block = await client.getBlockNumber({ cacheTime: 0 });
      const { result } = await client.simulateContract({
        address: uni.quoter,
        abi: protocolAbi.quoter,
        functionName: 'quoteExactInputSingle',
        args: [
          {
            poolKey: key,
            zeroForOne: input.address.toLowerCase() === key.currency0.toLowerCase(),
            exactAmount: amountIn,
            hookData: '0x',
          },
        ],
        ...(wallet.account ? { account: wallet.account } : {}),
        blockNumber: block,
      });
      const min = minimumOutput(result[0], bps);
      if (min <= 0n) throw Error('This amount produces no usable output. Try a different amount.');
      if (id === seq.current) {
        setQuote({
          amount: amountIn,
          output: result[0],
          min,
          time: Date.now(),
          input: input.address,
          block,
          bps,
        });
        setNow(Date.now());
      }
    } catch (e) {
      if (id === seq.current) setError(errorText(e, contract(d, 'TitheHook').abi));
    } finally {
      if (id === seq.current) setQuoting(false);
    }
  };
  const needsToken =
    input?.address !== zeroAddress && quote && (!allowances || allowances.token < quote.amount);
  const needsRouter =
    input?.address !== zeroAddress &&
    quote &&
    (!allowances ||
      allowances.router < quote.amount ||
      allowances.expiration < Math.floor(now / 1000) + 300);
  const allowanceLoading = input?.address !== zeroAddress && !allowances;
  const insufficient = !!quote && input?.wallet !== undefined && input.wallet < quote.amount;
  const approve = (which: 'token' | 'router') => {
    if (!quote || !input || !fresh || !ready) return;
    tx.run(`approve-${which}`, async (account) => {
      const actual = await readAllowances(account, input.address);
      if (which === 'token' && actual.token >= quote.amount)
        throw Error('Token allowance is already sufficient. Refresh the quote.');
      if (
        which === 'router' &&
        actual.router >= quote.amount &&
        actual.expiration >= Math.floor(Date.now() / 1000) + 300
      )
        throw Error('Router allowance is already sufficient. Refresh the quote.');
      const request =
        which === 'token'
          ? await client.simulateContract({
              address: input.address,
              abi: token.abi,
              functionName: 'approve',
              args: [uni.permit2, quote.amount],
              account,
            })
          : await client.simulateContract({
              address: uni.permit2,
              abi: protocolAbi.permit2,
              functionName: 'approve',
              args: [
                input.address,
                uni.universalRouter,
                quote.amount,
                Math.floor(Date.now() / 1000) + 1800,
              ],
              account,
            });
      return request.request;
    });
  };
  const execute = () => {
    if (!quote || !input || !review || !poolReady || !fresh) return;
    tx.run('swap', async (account) => {
      if (Date.now() - quote.time >= 60000) throw Error('The quote expired. Request a new quote.');
      if (input.address !== zeroAddress) {
        const a = await readAllowances(account, input.address);
        if (
          a.token < quote.amount ||
          a.router < quote.amount ||
          a.expiration < Math.floor(Date.now() / 1000) + 300
        )
          throw Error('The allowance changed. Refresh and complete the approval step.');
      }
      const payload = swapPayload(
        key,
        input.address,
        quote.amount,
        quote.min,
        !!uni.extendedSwapParams,
      );
      const { request } = await client.simulateContract({
        address: uni.universalRouter,
        abi: [...protocolAbi.router, ...contract(d, 'TitheHook').abi],
        functionName: 'execute',
        args: [payload.commands, payload.inputs, BigInt(Math.floor(Date.now() / 1000) + 300)],
        account,
        value: input.address === zeroAddress ? quote.amount : 0n,
      });
      if (Date.now() - quote.time >= 60000)
        throw Error('The quote expired during simulation. Request a new quote.');
      return request;
    });
  };
  useEffect(() => {
    if (tx.states.swap?.stage === 'confirmed') {
      setQuote(undefined);
      setReview(false);
      setAmount('');
    }
  }, [tx.states.swap?.stage]);
  let action;
  if (!wallet.account)
    action = (
      <button
        className="primary wide"
        onClick={() => wallet.connect('swap')}
        disabled={wallet.busy}
        aria-describedby="swap-wallet-feedback"
      >
        {wallet.busy ? 'Connecting…' : 'Connect wallet'} <Icon name="wallet" />
      </button>
    );
  else if (!wallet.correct)
    action = <p className="notice">Use “Switch to {d.network.name}” above to continue.</p>;
  else if (!quote || !fresh)
    action = (
      <button
        className="primary wide"
        onClick={getQuote}
        disabled={!poolReady || quoting || tx.busy}
      >
        {quoting ? 'Getting quote…' : quote ? 'Refresh expired quote' : 'Get quote'}{' '}
        <Icon name="arrow" />
      </button>
    );
  else if (needsToken)
    action = (
      <button
        className="primary wide"
        disabled={!poolReady || tx.busy || allowanceLoading || insufficient}
        onClick={() => approve('token')}
      >
        {tx.active === 'approve-token'
          ? 'Approving token…'
          : `1. Approve ${input?.symbol} to Permit2`}
      </button>
    );
  else if (needsRouter)
    action = (
      <button
        className="primary wide"
        disabled={!poolReady || tx.busy || allowanceLoading || insufficient}
        onClick={() => approve('router')}
      >
        {tx.active === 'approve-router' ? 'Approving router…' : '2. Approve router spending'}
      </button>
    );
  else
    action = (
      <button
        className="primary wide"
        disabled={!poolReady || tx.busy || insufficient}
        onClick={() => (review ? execute() : setReview(true))}
      >
        {tx.active === 'swap' ? 'Swapping…' : review ? 'Confirm swap in wallet' : 'Review swap'}{' '}
        <Icon name="arrow" />
      </button>
    );
  return (
    <section className="swap-card" aria-labelledby="swap-title" id="swap">
      <div className="section-heading">
        <div>
          <h2 id="swap-title">Swap ETH and TDEMO</h2>
        </div>
        <span className="small-tag">Uniswap v4</span>
      </div>
      <p className="muted">
        Every swap adds to seat {snapshot?.initialized ? `#${snapshot.poolSeat}` : '—'}’s tithe.
      </p>
      <fieldset disabled={tx.busy || quoting}>
        <legend className="sr-only">Swap amount and direction</legend>
        <div className="trade-box">
          <div className="trade-label">
            <label htmlFor="swap-amount">You pay</label>
            <span>
              Balance: {wallet.correct ? displayAmount(input?.wallet, input?.decimals) : '—'}
            </span>
          </div>
          <div className="amount-row">
            <input
              ref={amountRef}
              id="swap-amount"
              name="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!error}
              aria-describedby="swap-error"
            />
            <span className="token-name">
              <Coin symbol={input?.symbol ?? (sell ? 'TDEMO' : 'ETH')} />
              {input?.symbol ?? (sell ? 'TDEMO' : 'ETH')}
            </span>
          </div>
        </div>
        <div className="direction-row">
          <button
            className="direction-button"
            onClick={() => {
              setSell(!sell);
              setAmount('');
            }}
            aria-label="Reverse swap direction"
          >
            <Icon name="swap" />
          </button>
        </div>
        <div className="trade-box receive">
          <div className="trade-label">
            <span>You receive</span>
            <span>Estimated</span>
          </div>
          <div className="amount-row">
            <output
              className="output-amount"
              title={quote && output ? formatUnits(quote.output, output.decimals) : undefined}
            >
              {displayAmount(quote?.output, output?.decimals)}
            </output>
            <span className="token-name">
              <Coin symbol={output?.symbol ?? (sell ? 'ETH' : 'TDEMO')} />
              {output?.symbol ?? (sell ? 'ETH' : 'TDEMO')}
            </span>
          </div>
        </div>
        <div className="slippage-row">
          <label htmlFor="slippage">Slippage tolerance</label>
          <span className="slippage-input">
            <input
              id="slippage"
              name="slippage"
              inputMode="decimal"
              value={slippage}
              onChange={(e) => setSlippage(e.target.value)}
              aria-describedby="slippage-help"
            />
            %
          </span>
        </div>
        <p id="slippage-help" className="sr-only">
          Between 0.01 and 5 percent. The minimum received uses this tolerance.
        </p>
      </fieldset>
      <dl className="quote-details">
        <Detail label="Seat tithe">
          {snapshot?.initialized ? `${snapshot.bps / 100}% of input` : 'Awaiting pool data'}
        </Detail>
        <Detail label="LP fee">{snapshot?.lpFee ? `${snapshot.lpFee / 10000}%` : '—'}</Detail>
        {quote && input && output && (
          <>
            <Detail label="Minimum received">
              <span title={formatUnits(quote.min, output.decimals)}>
                {displayAmount(quote.min, output.decimals)} {output.symbol}
              </span>
            </Detail>
            <Detail label="Rate">
              1 {input.symbol} ≈{' '}
              {displayAmount(
                (quote.output * 10n ** BigInt(input.decimals)) / quote.amount,
                output.decimals,
              )}{' '}
              {output.symbol}
            </Detail>
            <Detail label="Quoted at block">{quote.block.toLocaleString()}</Detail>
            <Detail label="Quote status">
              {fresh
                ? `${Math.max(0, Math.ceil((60000 - (now - quote.time)) / 1000))} seconds remaining`
                : 'Expired — refresh to continue'}
            </Detail>
          </>
        )}
      </dl>
      {review && quote && input && output && (
        <div className="review-box">
          <strong>Review your swap</strong>
          <p>
            Spend up to {formatUnits(quote.amount, input.decimals)} {input.symbol} for at least{' '}
            {formatUnits(quote.min, output.decimals)} {output.symbol}, sent to your connected
            wallet. The transaction expires after 5 minutes.
          </p>
          <button className="text-button" disabled={tx.busy} onClick={() => setReview(false)}>
            Back to quote
          </button>
        </div>
      )}
      <p id="swap-error" className="error-text" role="alert">
        {error}
      </p>
      {insufficient && (
        <p className="error-text">Your {input?.symbol} balance is below the input amount.</p>
      )}
      {snapshot && !poolReady && (
        <p className="notice">
          {!ready
            ? 'Refresh verified contract state to enable swaps.'
            : 'This pool has no active liquidity. Swaps are unavailable until liquidity is added.'}
        </p>
      )}
      {needsToken && (
        <p className="small-copy">
          Allow Permit2 to spend exactly{' '}
          {quote && input
            ? `${formatUnits(quote.amount, input.decimals)} ${input.symbol}`
            : 'the input amount'}
          . Then approve the router for 30 minutes. Each step is a separate transaction.
        </p>
      )}
      <p id="swap-wallet-feedback" className="error-text" role="status">
        {wallet.errorSource === 'swap' ? wallet.error : ''}
      </p>
      {action}
      <TxFeedback id="approve-token" tx={tx} d={d} />
      <TxFeedback id="approve-router" tx={tx} d={d} />
      <TxFeedback id="swap" tx={tx} d={d} />
      <p className="swap-footnote">
        Gas is paid in ETH. The quote includes pool and hook fees. The tithe applies to the full
        input budget, even if the pool fills only part of it. USD pricing is unavailable.
      </p>
    </section>
  );
}
