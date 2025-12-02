import {
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  TransactionInstruction,
  ComputeBudgetProgram,
  Transaction,
  TransactionVersion,
} from '@solana/web3.js';
import {
  DriftClient,
  PositionDirection,
  OrderType,
  MarketType,
  getOrderParams,
  BN,
  BASE_PRECISION,
  MainnetPerpMarkets,
  initialize,
  IWallet,
} from '@drift-labs/sdk';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { TOKEN_ADDRESS, DRIFT_SPOT_MARKETS } from '../types';

// Note: Drift SDK works in browser but needs proper initialization

/**
 * Browser-compatible wallet adapter wrapper for Drift
 * This wraps the wallet adapter to work with Drift SDK
 */
export class BrowserWallet implements IWallet {
  public publicKey: PublicKey;
  // Add supportedTransactionVersions property to satisfy IWallet interface
  // Set to undefined as in some wallet adapter implementations, or explicit set to handle versions
  public supportedTransactionVersions?: ReadonlySet<TransactionVersion> = new Set(['legacy', 0]);

  private _signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  private _signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;

  constructor(
    publicKey: PublicKey,
    signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>,
    signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>
  ) {
    this.publicKey = publicKey;
    this._signTransaction = signTransaction;
    this._signAllTransactions = signAllTransactions;
  }

  async signTransaction(tx: Transaction): Promise<Transaction> {
    return this._signTransaction(tx);
  }

  async signAllTransactions(txs: Transaction[]): Promise<Transaction[]> {
    return this._signAllTransactions(txs);
  }

  async signVersionedTransaction(tx: VersionedTransaction): Promise<VersionedTransaction> {
    return this._signTransaction(tx);
  }

  async signAllVersionedTransactions(txs: VersionedTransaction[]): Promise<VersionedTransaction[]> {
    return this._signAllTransactions(txs);
  }

  // Drift SDK also expects these for some operations
  get payer() {
    return {
      publicKey: this.publicKey,
    } as any;
  }
}

/**
 * Get perp market index by name
 */
export function getPerpMarketIndex(marketName: string): number {
  const market = MainnetPerpMarkets.find((m) => m.symbol === marketName);
  if (!market) {
    throw new Error(`Market ${marketName} not found`);
  }
  return market.marketIndex;
}

/**
 * Initialize Drift client for browser
 */
export async function initializeDriftClient(
  connection: Connection,
  wallet: BrowserWallet
): Promise<DriftClient> {
  // Initialize Drift SDK (browser-safe)
  const sdkConfig = initialize({ env: 'mainnet-beta' });

  const driftClient = new DriftClient({
    connection,
    wallet,
    env: 'mainnet-beta',
    programID: new PublicKey(sdkConfig.DRIFT_PROGRAM_ID),
  });

  await driftClient.subscribe();
  
  // Wait for subscription to be ready
  // This ensures market data is available
  await new Promise((resolve) => setTimeout(resolve, 2000));
  
  return driftClient;
}

/**
 * Build USDC deposit instruction for Drift margin account
 * @param driftClient - Initialized DriftClient
 * @param usdcAmount - Amount of USDC to deposit (in human readable format, e.g., 10 for 10 USDC)
 * @param subAccountId - Sub account ID (default 0)
 * @param userInitialized - Whether the user account is already initialized (or will be initialized in the same tx)
 * @returns TransactionInstruction for deposit
 */
export async function buildDepositInstruction(
  driftClient: DriftClient,
  usdcAmount: number,
  subAccountId: number = 0,
  userInitialized: boolean = true
): Promise<TransactionInstruction> {
  // Convert to USDC precision (6 decimals)
  const amount = new BN(usdcAmount * 1e6);
  
  // USDC spot market index is 0 (QUOTE_SPOT_MARKET_INDEX)
  const spotMarketIndex = DRIFT_SPOT_MARKETS.USDC;
  
  // Get user's USDC associated token account
  const usdcMint = new PublicKey(TOKEN_ADDRESS.USDC);
  const userTokenAccount = await getAssociatedTokenAddress(
    usdcMint,
    driftClient.wallet.publicKey
  );
  
  // Get deposit instruction
  const depositIx = await driftClient.getDepositInstruction(
    amount,
    spotMarketIndex,
    userTokenAccount,
    subAccountId,
    false, // reduceOnly
    userInitialized
  );
  
  return depositIx;
}

/**
 * Build Drift short position instructions
 * Returns instructions that need to be wrapped in a transaction
 * @param driftClient - Initialized DriftClient
 * @param marketIndex - Perp market index
 * @param baseAssetAmount - Amount to short (in human readable format)
 * @param depositAmount - Optional USDC amount to deposit before opening position
 * @param subAccountId - Sub account ID (default 0)
 */
export async function buildDriftShortInstructions(
  driftClient: DriftClient,
  marketIndex: number,
  baseAssetAmount: number,
  depositAmount?: number,
  subAccountId: number = 0
): Promise<TransactionInstruction[]> {
  const instructions: TransactionInstruction[] = [];

  // Check if user account exists, if not add initialization instructions
  let userInitialized = true;
  try {
    driftClient.getUser(subAccountId);
    // User exists, no initialization needed
  } catch {
    userInitialized = false;
    // User doesn't exist, need to initialize
    const [initIxs] = await driftClient.getInitializeUserAccountIxs(subAccountId);
    instructions.push(...initIxs);
  }

  // Add deposit instruction if depositAmount is specified
  if (depositAmount && depositAmount > 0) {
    // Convert to USDC precision (6 decimals)
    const amount = new BN(depositAmount * 1e6);
    const spotMarketIndex = DRIFT_SPOT_MARKETS.USDC;
    
    // Get user's USDC associated token account
    const usdcMint = new PublicKey(TOKEN_ADDRESS.USDC);
    const userTokenAccount = await getAssociatedTokenAddress(
      usdcMint,
      driftClient.wallet.publicKey
    );
    
    const depositIx = await driftClient.getDepositInstruction(
      amount,
      spotMarketIndex,
      userTokenAccount,
      subAccountId,
      false, // reduceOnly
      userInitialized || instructions.length > 0 // user will be initialized if we added init instructions
    );
    instructions.push(depositIx);
  }

  // Convert base asset amount to proper precision
  const baseAmount = new BN(baseAssetAmount).mul(BASE_PRECISION);

  // Get oracle price for slippage protection
  const oracleData = driftClient.getOracleDataForPerpMarket(marketIndex);
  if (!oracleData || !oracleData.price) {
    throw new Error(`Unable to get oracle data for market index ${marketIndex}. Make sure DriftClient is subscribed.`);
  }
  const price = oracleData.price;

  // Build order params for market short
  // For SHORT: we want to sell, so we set a lower limit price (95% of current) for protection
  const orderParams = getOrderParams({
    orderType: OrderType.MARKET,
    marketType: MarketType.PERP,
    marketIndex,
    direction: PositionDirection.SHORT,
    baseAssetAmount: baseAmount,
    price: price.mul(new BN(95)).div(new BN(100)), // 5% slippage protection (lower bound for selling)
  });

  // Get place order instruction
  const shortIx = await driftClient.getPlacePerpOrderIx(orderParams, subAccountId);
  instructions.push(shortIx);

  return instructions;
}

/**
 * Build USDC deposit transaction (unsigned)
 */
export async function buildDriftDepositTransaction(
  connection: Connection,
  userPublicKey: PublicKey,
  driftClient: DriftClient,
  usdcAmount: number,
  subAccountId: number = 0
): Promise<VersionedTransaction> {
  const instructions: TransactionInstruction[] = [];

  // Check if user account exists, if not add initialization instructions
  let userInitialized = true;
  try {
    driftClient.getUser(subAccountId);
  } catch {
    userInitialized = false;
    const [initIxs] = await driftClient.getInitializeUserAccountIxs(subAccountId);
    instructions.push(...initIxs);
  }

  // Add deposit instruction
  // If we added init instructions, the user will be initialized when deposit executes
  const depositIx = await buildDepositInstruction(
    driftClient, 
    usdcAmount, 
    subAccountId,
    userInitialized || instructions.length > 0 // true if user exists OR if init instructions were added
  );
  instructions.push(depositIx);

  // Add compute budget
  const computeIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 400_000,
  });
  const priceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 1000,
  });

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  // Build transaction
  const messageV0 = new TransactionMessage({
    payerKey: userPublicKey,
    recentBlockhash: blockhash,
    instructions: [computeIx, priceIx, ...instructions],
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

/**
 * Build complete Drift short transaction with optional deposit (unsigned)
 * @param connection - Solana connection
 * @param userPublicKey - User's public key
 * @param driftClient - Initialized DriftClient
 * @param marketName - Market name (e.g., 'JUP-PERP')
 * @param baseAssetAmount - Amount to short
 * @param depositAmount - Optional USDC to deposit before shorting
 * @param subAccountId - Sub account ID
 */
export async function buildDriftShortTransaction(
  connection: Connection,
  userPublicKey: PublicKey,
  driftClient: DriftClient,
  marketName: string,
  baseAssetAmount: number,
  depositAmount?: number,
  subAccountId: number = 0
): Promise<VersionedTransaction> {
  const marketIndex = getPerpMarketIndex(marketName);

  // Get instructions (includes deposit if specified)
  const instructions = await buildDriftShortInstructions(
    driftClient,
    marketIndex,
    baseAssetAmount,
    depositAmount,
    subAccountId
  );

  // Add compute budget - higher if deposit is included
  const computeUnits = depositAmount ? 800_000 : 600_000;
  const computeIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: computeUnits,
  });
  const priceIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 1000, // Low priority, using Jito tip instead
  });

  // Get recent blockhash
  const { blockhash } = await connection.getLatestBlockhash('confirmed');

  // Build transaction
  const messageV0 = new TransactionMessage({
    payerKey: userPublicKey,
    recentBlockhash: blockhash,
    instructions: [computeIx, priceIx, ...instructions],
  }).compileToV0Message();

  return new VersionedTransaction(messageV0);
}

/**
 * Cleanup Drift client
 */
export async function cleanupDriftClient(driftClient: DriftClient): Promise<void> {
  await driftClient.unsubscribe();
}
