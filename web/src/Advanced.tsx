import { useState } from 'react';
import { encodeAbiParameters, isAddress, parseAbiParameters, type Address } from 'viem';
import { contract, demoPool, type Deployment, type ReadClient } from './config';
import { amountFrom, errorText, poolId, seatFrom } from './domain';
import type { Snapshot } from './chain';
import type { Transactions } from './wallet';
import { TxFeedback } from './components';
export function Advanced({
  d,
  client,
  snapshot,
  canWrite,
  tx,
}: {
  d: Deployment;
  client: ReadClient;
  snapshot?: Snapshot;
  canWrite: boolean;
  tx: Transactions;
}) {
  const [seat, setSeat] = useState(''),
    [rate, setRate] = useState(''),
    [fee, setFee] = useState(''),
    [spacing, setSpacing] = useState(''),
    [price, setPrice] = useState(''),
    [accept, setAccept] = useState(false),
    [error, setError] = useState('');
  const [recipient, setRecipient] = useState(''),
    [amount, setAmount] = useState(''),
    [transferError, setTransferError] = useState('');
  const hook = contract(d, 'TitheHook'),
    token = contract(d, 'TitheToken');
  function initialize() {
    setError('');
    try {
      const seatId = seatFrom(seat),
        bps = Number(rate),
        poolFee = Number(fee),
        tick = Number(spacing);
      if (!/^\d+$/.test(rate) || !Number.isInteger(bps) || bps < 1 || bps >= 10000)
        throw Error('Enter a tithe rate from 1 to 9,999 basis points.');
      if (!/^\d+$/.test(fee) || !Number.isInteger(poolFee) || poolFee < 0 || poolFee > 1000000)
        throw Error('Enter a static pool fee from 0 to 1,000,000 fee units.');
      if (!/^\d+$/.test(spacing) || !Number.isInteger(tick) || tick < 1 || tick > 32767)
        throw Error('Enter a tick spacing from 1 to 32,767.');
      if (
        !/^\d+$/.test(price) ||
        BigInt(price) < 4295128739n ||
        BigInt(price) >= 1461446703485210103287273052203988822378723970342n
      )
        throw Error('Enter a valid Uniswap v4 sqrtPriceX96, within TickMath bounds.');
      if (!accept) throw Error('Confirm that the seat and tithe rate will be permanent.');
      const key = { ...demoPool(d), fee: poolFee, tickSpacing: tick };
      tx.run('initialize', async (account) => {
        const config = (await client.readContract({
          address: hook.address,
          abi: hook.abi,
          functionName: 'poolConfig',
          args: [poolId(key)],
        })) as [bigint, number, boolean];
        if (config[2])
          throw Error('This pool already exists. Its seat and rate cannot be changed.');
        const { request } = await client.simulateContract({
          address: hook.address,
          abi: hook.abi,
          functionName: 'initializePool',
          args: [
            key,
            BigInt(price),
            encodeAbiParameters(parseAbiParameters('uint256 seatId,uint24 titheBps'), [
              seatId,
              bps,
            ]),
          ],
          account,
        });
        return request;
      });
    } catch (e) {
      setError(errorText(e));
    }
  }
  function transfer() {
    setTransferError('');
    try {
      if (!isAddress(recipient.trim()) || /^0x0{40}$/i.test(recipient.trim()))
        throw Error('Enter a valid, nonzero recipient address.');
      if (!snapshot) throw Error('Refresh token data before sending.');
      const value = amountFrom(amount, snapshot.assets[1].decimals);
      tx.run(
        'transfer',
        async (account) =>
          (
            await client.simulateContract({
              address: token.address,
              abi: token.abi,
              functionName: 'transfer',
              args: [recipient.trim() as Address, value],
              account,
            })
          ).request,
      );
    } catch (e) {
      setTransferError(errorText(e));
    }
  }
  return (
    <details className="advanced">
      <summary>
        Advanced contract actions <span>Redeem backing · send tokens · create a pool</span>
      </summary>
      <div className="advanced-content">
        <section>
          <h3>Redeem pending backing</h3>
          <p>
            Move the selected seat’s pending PoolManager claims into liquid credit. This pays no
            recipient. A normal claim redeems backing automatically; very large balances may need
            several redemptions.
          </p>
          <div className="button-row">
            {snapshot?.assets.map((a) => (
              <div key={a.address}>
                <button
                  disabled={!canWrite || tx.busy || a.pending === 0n}
                  onClick={() =>
                    tx.run(
                      `redeem-${a.symbol}`,
                      async (account) =>
                        (
                          await client.simulateContract({
                            address: hook.address,
                            abi: hook.abi,
                            functionName: 'redeemTithe',
                            args: [snapshot.seat, a.address],
                            account,
                          })
                        ).request,
                    )
                  }
                >
                  Redeem {a.symbol} backing
                </button>
                <TxFeedback id={`redeem-${a.symbol}`} tx={tx} d={d} />
              </div>
            ))}
          </div>
        </section>
        <section>
          <h3>Send TDEMO</h3>
          <p>
            Transfer tokens from your connected wallet. Double-check the full recipient before
            confirming in your wallet.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              transfer();
            }}
          >
            <fieldset disabled={!canWrite || tx.busy}>
              <div className="form-grid">
                <label>
                  Recipient address
                  <input
                    name="recipient"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="0x…"
                    required
                  />
                </label>
                <label>
                  Amount of TDEMO
                  <input
                    name="transferAmount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                  />
                </label>
              </div>
              <button type="submit">Send TDEMO</button>
            </fieldset>
            <p role="alert" className="error-text">
              {transferError}
            </p>
            <TxFeedback id="transfer" tx={tx} d={d} />
          </form>
        </section>
        <section>
          <h3>Initialize another ETH / TDEMO pool</h3>
          <p>
            This creates a separate pool attached to this hook. It does not change the demo pool or
            add liquidity. The first initializer permanently chooses the seat and rate. Use a seat
            that exists and can receive both currencies.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              initialize();
            }}
          >
            <fieldset disabled={!canWrite || tx.busy}>
              <div className="form-grid">
                <label>
                  New pool seat ID
                  <input
                    inputMode="numeric"
                    value={seat}
                    onChange={(e) => setSeat(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Tithe in basis points
                  <input
                    inputMode="numeric"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    required
                  />
                  <small>25 basis points = 0.25%</small>
                </label>
                <label>
                  LP fee in millionths
                  <input
                    inputMode="numeric"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    required
                  />
                  <small>12,500 fee units = 1.25%</small>
                </label>
                <label>
                  Tick spacing
                  <input
                    inputMode="numeric"
                    value={spacing}
                    onChange={(e) => setSpacing(e.target.value)}
                    required
                  />
                </label>
                <label className="span-2">
                  Initial sqrtPriceX96
                  <input
                    inputMode="numeric"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    required
                  />
                  <small>
                    Raw Uniswap price encoding. Token decimals and currency order affect this value.
                  </small>
                </label>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={accept}
                  onChange={(e) => setAccept(e.target.checked)}
                />
                I understand that this pool’s seat and tithe rate can never change.
              </label>
              <button type="submit">Initialize new pool</button>
            </fieldset>
            <p role="alert" className="error-text">
              {error}
            </p>
            <TxFeedback id="initialize" tx={tx} d={d} />
          </form>
        </section>
        {!canWrite && (
          <p className="notice">
            Connect on the correct network and refresh verified state to use these actions.
          </p>
        )}
      </div>
    </details>
  );
}
