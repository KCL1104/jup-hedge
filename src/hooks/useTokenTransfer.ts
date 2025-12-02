import { useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { buildTokenTransferTransaction } from '../utils/transfer';
import { TokenTicker, OperationState } from '../types';

export interface UseTokenTransferResult {
  buildTransfer: (
    token: TokenTicker,
    recipient: string,
    amount: number
  ) => Promise<VersionedTransaction | null>;
  state: OperationState;
  reset: () => void;
}

export function useTokenTransfer(): UseTokenTransferResult {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const [state, setState] = useState<OperationState>({ status: 'idle' });

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const buildTransfer = useCallback(
    async (
      token: TokenTicker,
      recipient: string,
      amount: number
    ): Promise<VersionedTransaction | null> => {
      if (!publicKey) {
        setState({ status: 'error', error: 'Wallet not connected' });
        return null;
      }

      setState({ status: 'loading' });

      try {
        const transaction = await buildTokenTransferTransaction(
          connection,
          publicKey,
          token,
          recipient,
          amount
        );

        setState({ status: 'success', data: transaction });
        return transaction;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setState({ status: 'error', error: errorMessage });
        return null;
      }
    },
    [connection, publicKey]
  );

  return {
    buildTransfer,
    state,
    reset,
  };
}
