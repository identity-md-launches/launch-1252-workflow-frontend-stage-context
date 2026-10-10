import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createWalletClient,
  custom,
  getAddress,
  numberToHex,
  type Address,
  type EIP1193Provider,
  type Hex,
} from 'viem';
import { chainFor, type Deployment, type ReadClient } from './config';
import { errorText } from './domain';
export type Provider = EIP1193Provider & {
  on?: (event: string, fn: (...args: any[]) => void) => void;
  removeListener?: (event: string, fn: (...args: any[]) => void) => void;
};
type WalletOption = { id: string; name: string; provider: Provider };
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export async function switchNetwork(provider: Provider, d: Deployment) {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: numberToHex(d.chainId) }],
    });
  } catch (e) {
    const err = e as {
      code?: number;
      message?: string;
      data?: { originalError?: { code?: number } };
    };
    if (
      err.code !== 4902 &&
      err.data?.originalError?.code !== 4902 &&
      !/unknown chain|unrecognized chain|not added|not configured/i.test(err.message ?? '')
    )
      throw e;
    if (!d.walletAddChain)
      throw Error(
        'This wallet does not know the network, and no vetted add-chain settings are available.',
      );
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [d.walletAddChain as any],
    });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: numberToHex(d.chainId) }],
    });
  }
}
export function useWallet(d: Deployment) {
  const [options, setOptions] = useState<WalletOption[]>([]);
  const [selected, setSelected] = useState('');
  const [provider, setProvider] = useState<Provider>();
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const announce = (e: Event) => {
      const { info, provider } = (e as CustomEvent).detail;
      setOptions((old) =>
        old.some((w) => w.provider === provider)
          ? old
          : [
              ...old.filter((w) => w.id !== 'injected'),
              { id: info.uuid, name: info.name, provider },
            ],
      );
    };
    window.addEventListener('eip6963:announceProvider', announce);
    if (window.ethereum)
      setOptions([{ id: 'injected', name: 'Browser wallet', provider: window.ethereum }]);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () => window.removeEventListener('eip6963:announceProvider', announce);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const accounts = (a: string[]) => {
      setAccount(a[0] ? getAddress(a[0]) : undefined);
      setError('');
    };
    const chain = (id: string) => {
      setChainId(Number(id));
      setError('');
    };
    const disconnect = () => {
      setAccount(undefined);
      setChainId(undefined);
    };
    provider.on?.('accountsChanged', accounts);
    provider.on?.('chainChanged', chain);
    provider.on?.('disconnect', disconnect);
    return () => {
      provider.removeListener?.('accountsChanged', accounts);
      provider.removeListener?.('chainChanged', chain);
      provider.removeListener?.('disconnect', disconnect);
    };
  }, [provider]);
  const connect = useCallback(async () => {
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      const option = options.find((w) => w.id === selected) ?? options[0];
      if (!option)
        throw Error(
          'No browser wallet found. Open this page in an Ethereum wallet’s browser or install a browser wallet, then reload.',
        );
      const accounts = await option.provider.request({ method: 'eth_requestAccounts' });
      if (!accounts[0]) throw Error('Your wallet did not share an account. Try connecting again.');
      const id = await option.provider.request({ method: 'eth_chainId' });
      setProvider(option.provider);
      setAccount(getAddress(accounts[0]));
      setChainId(Number(id));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [options, selected, busy]);
  const switchChain = async () => {
    if (!provider || busy) return;
    setBusy(true);
    setError('');
    try {
      await switchNetwork(provider, d);
      setChainId(Number(await provider.request({ method: 'eth_chainId' })));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return {
    options,
    selected,
    setSelected,
    provider,
    account,
    chainId,
    busy,
    error,
    connect,
    switchChain,
    disconnect: () => {
      setAccount(undefined);
      setProvider(undefined);
      setChainId(undefined);
    },
    correct: chainId === d.chainId,
  };
}
export type Wallet = ReturnType<typeof useWallet>;
export type TxState = {
  stage: 'simulating' | 'wallet' | 'confirming' | 'confirmed' | 'error' | 'unknown';
  text: string;
  hash?: Hex;
};
export function useTransactions(
  d: Deployment,
  client: ReadClient,
  wallet: Wallet,
  onConfirmed: () => Promise<void>,
) {
  const [states, setStates] = useState<Record<string, TxState>>({});
  const [active, setActive] = useState<string>();
  const lock = useRef(false);
  const current = useRef(wallet);
  current.current = wallet;
  const confirmedCallback = useRef(onConfirmed);
  confirmedCallback.current = onConfirmed;
  const set = (id: string, value: TxState) => setStates((s) => ({ ...s, [id]: value }));
  const run = async (id: string, prepare: (account: Address) => Promise<any>) => {
    if (lock.current) return;
    lock.current = true;
    setActive(id);
    let hash: Hex | undefined;
    let finalized = false;
    try {
      const { provider, account } = current.current;
      if (!provider || !account) throw Error('Connect a wallet to continue.');
      const check = async () => {
        const [chain, accounts] = await Promise.all([
          provider.request({ method: 'eth_chainId' }),
          provider.request({ method: 'eth_accounts' }),
        ]);
        if (Number(chain) !== d.chainId) throw Error(`Switch your wallet to ${d.network.name}.`);
        if (
          accounts[0]?.toLowerCase() !== account.toLowerCase() ||
          current.current.account !== account ||
          current.current.provider !== provider
        )
          throw Error('Your wallet account changed. Review the action and try again.');
      };
      await check();
      set(id, { stage: 'simulating', text: 'Checking the transaction…' });
      const request = await prepare(account);
      await check();
      set(id, { stage: 'wallet', text: 'Confirm this action in your wallet.' });
      hash = await createWalletClient({
        account,
        chain: chainFor(d),
        transport: custom(provider),
      }).writeContract(request);
      set(id, {
        stage: 'confirming',
        text: 'Transaction submitted. Waiting for confirmation…',
        hash,
      });
      let cancelled = false;
      const receipt = await client.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 120000,
        onReplaced: (r) => {
          hash = r.transaction.hash;
          cancelled = r.reason !== 'repriced';
          set(id, { stage: 'confirming', text: 'Following the replacement transaction…', hash });
        },
      });
      finalized = true;
      if (cancelled)
        throw Error(
          'The original action was cancelled or replaced with a different transaction. Check its explorer receipt.',
        );
      if (receipt.status !== 'success')
        throw Error(
          'The transaction reverted. No action was completed. Refresh before trying again.',
        );
      set(id, { stage: 'confirmed', text: 'Confirmed onchain. Refreshing balances…', hash });
      await confirmedCallback.current();
      set(id, { stage: 'confirmed', text: 'Confirmed onchain.', hash });
    } catch (e) {
      const unresolved = !!hash && !finalized;
      set(id, {
        stage: unresolved ? 'unknown' : 'error',
        text: unresolved
          ? 'The transaction is not confirmed. Check its status before submitting another action.'
          : errorText(
              e,
              d.contracts.flatMap((c) => c.abi ?? []),
            ),
        hash,
      });
    } finally {
      // Do not release an unconfirmed transaction when receipt polling fails.
      if (!hash || finalized) {
        lock.current = false;
        setActive(undefined);
      }
    }
  };
  const checkReceipt = async (id: string) => {
    const state = states[id];
    if (!state?.hash) return;
    try {
      const receipt = await client.getTransactionReceipt({ hash: state.hash });
      set(id, {
        ...state,
        stage: receipt.status === 'success' ? 'confirmed' : 'error',
        text: receipt.status === 'success' ? 'Confirmed onchain.' : 'The transaction reverted.',
      });
      await confirmedCallback.current();
      lock.current = false;
      setActive(undefined);
    } catch {
      set(id, {
        ...state,
        stage: 'unknown',
        text: 'No receipt yet. Check the explorer, then check confirmation again.',
      });
    }
  };
  return { states, active, run, checkReceipt, busy: !!active };
}
export type Transactions = ReturnType<typeof useTransactions>;
