import { VersionedTransaction, PublicKey } from '@solana/web3.js';  
import { TOKEN_ADDRESS, TokenTicker } from '../types';  
  
/**  
 * Get token decimals (hardcoded for known tokens, fetch for others)  
 */  
export function getTokenDecimals(token: TokenTicker): number {  
  const decimals: Record<TokenTicker, number> = {  
    SOL: 9,  
    USDC: 6,  
    JUP: 6,  
  };  
  return decimals[token] ?? 9;  
}  
  
/**  
 * Convert human amount to lamports/base units  
 */  
export function toBaseUnits(amount: number, token: TokenTicker): number {  
  const decimals = getTokenDecimals(token);  
  return Math.floor(amount * Math.pow(10, decimals));  
}  
  
/**  
 * Convert base units to human readable amount  
 */  
export function fromBaseUnits(amount: string | number, token: TokenTicker): number {  
  const decimals = getTokenDecimals(token);  
  return Number(amount) / Math.pow(10, decimals);  
}  
  
/**  
 * Build Jupiter swap transaction (unsigned)  
 * Returns a VersionedTransaction that needs to be signed by wallet  
 */  
export async function buildJupiterSwapTransaction(  
  userPublicKey: PublicKey,  
  inputToken: TokenTicker,  
  outputToken: TokenTicker,  
  amount: number
): Promise<{ transaction: VersionedTransaction; expectedOutput: number }> {  
  // Get quote first  
  const inputMint = TOKEN_ADDRESS[inputToken];  
  const outputMint = TOKEN_ADDRESS[outputToken];  
  const baseAmount = toBaseUnits(amount, inputToken);  

  // Get swap transaction  
  const response = 
    await fetch(
      'https://api.jup.ag/ultra/v1/order' +
      `?inputMint=${inputMint}` +
      `&outputMint=${outputMint}` +
      `&amount=${baseAmount}` +
      `&taker=${userPublicKey.toBase58()}`,
      {
        headers: {
          'x-api-key': import.meta.env.JUPITER_API_KEY,
        },
      }
    );
  
  const result = await response.json();

  const expectedOutput = fromBaseUnits(result.outAmount, outputToken);
  // Deserialize transaction (unsigned) - 修正 Buffer 處理  
  const swapTransactionBuf = Buffer.from(result.transaction, 'base64');  
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);  
  
  return { transaction, expectedOutput };  
}  