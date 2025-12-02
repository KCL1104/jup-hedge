import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { buildJupiterSwapTransaction } from '../utils/jupiter';
import { TokenTicker, JupiterQuote, OperationState } from '../types';

export interface UseJupiterSwapResult {
  buildSwap: (
    inputToken: TokenTicker,
    outputToken: TokenTicker,
    amount: number,
    slippageBps?: number
  ) => Promise<VersionedTransaction | null>;
  quote: JupiterQuote | null;
  expectedOutput: number | null;
  state: OperationState;
  reset: () => void;
}

export function useJupiterSwap(): UseJupiterSwapResult {
  const { publicKey } = useWallet();
  const [quote, setQuote] = useState<JupiterQuote | null>(null);
  const [expectedOutput, setExpectedOutput] = useState<number | null>(null);
  const [state, setState] = useState<OperationState>({ status: 'idle' });

  const reset = useCallback(() => {
    setQuote(null);
    setExpectedOutput(null);
    setState({ status: 'idle' });
  }, []);

  const buildSwap = useCallback(
    async (
      inputToken: TokenTicker,
      outputToken: TokenTicker,
      amount: number
    ): Promise<VersionedTransaction | null> => {
      if (!publicKey) {
        setState({ status: 'error', error: 'Wallet not connected' });
        return null;
      }

      setState({ status: 'loading' });

      try {
        const { transaction } = await buildJupiterSwapTransaction(
          publicKey,
          inputToken,
          outputToken,
          amount,
        );

        setState({ status: 'success', data: transaction });

        return transaction;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setState({ status: 'error', error: errorMessage });
        return null;
      }
    },
    [publicKey]
  );

  return {
    buildSwap,
    quote,
    expectedOutput,
    state,
    reset,
  };
}
