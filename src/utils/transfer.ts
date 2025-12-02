import {
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TokenAccountNotFoundError,
} from '@solana/spl-token';
import { TOKEN_ADDRESS, TokenTicker } from '../types';
import { toBaseUnits } from './jupiter';

/**
 * Build SPL token transfer transaction (unsigned)
 */
export async function buildTokenTransferTransaction(
  connection: Connection,
  senderPublicKey: PublicKey,
  token: TokenTicker,
  recipientAddress: string,
  amount: number
): Promise<VersionedTransaction> {
  const mintAddress = TOKEN_ADDRESS[token];
  if (!mintAddress) {
    throw new Error(`Unknown token: ${token}`);
  }

  const mintPubkey = new PublicKey(mintAddress);
  const recipientPubkey = new PublicKey(recipientAddress);

  // Get source and destination ATAs
  const sourceATA = await getAssociatedTokenAddress(mintPubkey, senderPublicKey);
  const destinationATA = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

  const instructions: TransactionInstruction[] = [];

  // Check if destination ATA exists
  try {
    await getAccount(connection, destinationATA);
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) {
      // Create ATA for recipient
      const createATAIx = createAssociatedTokenAccountInstruction(
        senderPublicKey, // payer
        destinationATA, // ata
        recipientPubkey, // owner
        mintPubkey // mint
      );
      instructions.push(createATAIx);
    } else {
      throw error;
    }
  }

  // Create transfer instruction
  const transferAmount = toBaseUnits(amount, token);
  const transferIx = createTransferInstruction(
    sourceATA,
    destinationATA,
    senderPublicKey,
    BigInt(transferAmount)
  );
  instructions.push(transferIx);

  // Add minimal compute budget
  const computeIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 100_000,
  });
  const priceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 1000,
  });

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  // Build transaction
  const messageV0 = new TransactionMessage({
    payerKey: senderPublicKey,
    recentBlockhash: blockhash,
    instructions: [computeIx, priceIx, ...instructions],
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}
