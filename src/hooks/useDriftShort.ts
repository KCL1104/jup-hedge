import { useState, useCallback, useRef } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { VersionedTransaction } from '@solana/web3.js';
import { DriftClient } from '@drift-labs/sdk';
import {
  BrowserWallet,
  initializeDriftClient,
  buildDriftShortTransaction,
  buildDriftDepositTransaction,
  cleanupDriftClient,
} from '../utils/drift';
import { OperationState } from '../types';

export interface UseDriftShortResult {
  /**
   * Build a short position transaction with optional deposit
   * @param marketName - Market name (e.g., 'JUP-PERP')
   * @param baseAssetAmount - Amount to short
   * @param depositAmount - Optional USDC to deposit before shorting (will be included in same tx)
   * @param subAccountId - Sub account ID (default 0)
   */
  buildShort: (
    marketName: string,
    baseAssetAmount: number,
    depositAmount?: number,
    subAccountId?: number
  ) => Promise<VersionedTransaction | null>;
  
  /**
   * Build a standalone deposit transaction
   * @param usdcAmount - Amount of USDC to deposit
   * @param subAccountId - Sub account ID (default 0)
   */
  buildDeposit: (
    usdcAmount: number,
    subAccountId?: number
  ) => Promise<VersionedTransaction | null>;
  
  state: OperationState;
  reset: () => void;
}

export function useDriftShort(): UseDriftShortResult {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const [state, setState] = useState<OperationState>({ status: 'idle' });
  const driftClientRef = useRef<DriftClient | null>(null);

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  const buildShort = useCallback(
    async (
      marketName: string,
      baseAssetAmount: number,
      depositAmount?: number,
      subAccountId: number = 0
    ): Promise<VersionedTransaction | null> => {
      if (!publicKey || !signTransaction || !signAllTransactions) {
        setState({ status: 'error', error: 'Wallet not connected' });
        return null;
      }

      setState({ status: 'loading' });

      try {
        // Create browser wallet adapter
        const browserWallet = new BrowserWallet(
          publicKey,
          signTransaction,
          signAllTransactions
        );

        // Initialize Drift client
        const driftClient = await initializeDriftClient(connection, browserWallet);
        driftClientRef.current = driftClient;

        // Build the transaction (includes deposit if specified)
        const transaction = await buildDriftShortTransaction(
          connection,
          publicKey,
          driftClient,
          marketName,
          baseAssetAmount,
          depositAmount,
          subAccountId
        );

        // Cleanup Drift client
        await cleanupDriftClient(driftClient);
        driftClientRef.current = null;

        setState({ status: 'success', data: transaction });
        return transaction;
      } catch (error) {
        // Cleanup on error
        if (driftClientRef.current) {
          await cleanupDriftClient(driftClientRef.current);
          driftClientRef.current = null;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        setState({ status: 'error', error: errorMessage });
        return null;
      }
    },
    [connection, publicKey, signTransaction, signAllTransactions]
  );

  const buildDeposit = useCallback(
    async (
      usdcAmount: number,
      subAccountId: number = 0
    ): Promise<VersionedTransaction | null> => {
      if (!publicKey || !signTransaction || !signAllTransactions) {
        setState({ status: 'error', error: 'Wallet not connected' });
        return null;
      }

      setState({ status: 'loading' });

      try {
        // Create browser wallet adapter
        const browserWallet = new BrowserWallet(
          publicKey,
          signTransaction,
          signAllTransactions
        );

        // Initialize Drift client
        const driftClient = await initializeDriftClient(connection, browserWallet);
        driftClientRef.current = driftClient;

        // Build the deposit transaction
        const transaction = await buildDriftDepositTransaction(
          connection,
          publicKey,
          driftClient,
          usdcAmount,
          subAccountId
        );

        // Cleanup Drift client
        await cleanupDriftClient(driftClient);
        driftClientRef.current = null;

        setState({ status: 'success', data: transaction });
        return transaction;
      } catch (error) {
        // Cleanup on error
        if (driftClientRef.current) {
          await cleanupDriftClient(driftClientRef.current);
          driftClientRef.current = null;
        }

        const errorMessage = error instanceof Error ? error.message : String(error);
        setState({ status: 'error', error: errorMessage });
        return null;
      }
    },
    [connection, publicKey, signTransaction, signAllTransactions]
  );

  return {
    buildShort,
    buildDeposit,
    state,
    reset,
  };
}
