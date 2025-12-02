# Atomic Swap-Short-Transfer Frontend

A React frontend application that executes atomic DeFi operations via Jito bundles using wallet adapter for signing.

## Features

- 🔗 **Wallet Adapter Integration** - Connect with Phantom, Solflare, Backpack, Coinbase
- ⚡ **Atomic Execution** - All transactions succeed or fail together via Jito bundles
- 🔄 **Jupiter Swap** - SOL → JUP swap with configurable slippage
- 💰 **Drift Deposit** - Deposit USDC collateral to Drift margin account
- 📉 **Drift Short** - Open perpetual short positions on JUP-PERP
- 💸 **Token Transfer** - Send JUP to any address

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     React Frontend                              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ useJupiterSwap  │  │ useDriftShort   │  │ useTokenTransfer│ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │  useAtomicSwapShort   │                    │
│                    │  (orchestrates all)   │                    │
│                    └───────────┬───────────┘                    │
│                                │                                │
│                    ┌───────────▼───────────┐                    │
│                    │   Wallet Adapter      │                    │
│                    │  signAllTransactions  │                    │
│                    └───────────┬───────────┘                    │
└────────────────────────────────┼────────────────────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Jito JSON-RPC API     │
                    │   (sendBundle)          │
                    └────────────┬────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   Solana Validators     │
                    │   (Atomic Execution)    │
                    └─────────────────────────┘
```

## Project Structure

```
src/
├── hooks/
│   ├── useJupiterSwap.ts      # Jupiter swap transaction builder
│   ├── useDriftShort.ts       # Drift deposit + short position builder
│   ├── useTokenTransfer.ts    # SPL token transfer builder
│   ├── useJitoBundle.ts       # Jito bundle submission
│   └── useAtomicSwapShort.ts  # Orchestrates all operations
├── utils/
│   ├── jupiter.ts             # Jupiter API integration
│   ├── drift.ts               # Drift SDK integration (deposit + short)
│   ├── transfer.ts            # SPL token transfer logic
│   └── jito.ts                # Jito JSON-RPC client
├── components/
│   ├── AtomicSwapButton.tsx   # Main action button
│   ├── AtomicSwapForm.tsx     # Configuration form
│   └── WalletContextProvider.tsx
├── types/
│   └── index.ts               # TypeScript type definitions
├── App.tsx                    # Main app component
└── main.tsx                   # Entry point
```

## Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your RPC URL (recommended: use high-performance RPC)

# Start development server
npm run dev
```

## Usage

### As a Component

```tsx
import { WalletContextProvider, AtomicSwapForm } from './src/components';

function App() {
  return (
    <WalletContextProvider rpcUrl="YOUR_RPC_URL">
      <AtomicSwapForm />
    </WalletContextProvider>
  );
}
```

### Using Individual Hooks

```tsx
import { useJupiterSwap, useDriftShort, useJitoBundle } from './src/hooks';

function MyComponent() {
  const { buildSwap, quote } = useJupiterSwap();
  const { buildShort, buildDeposit } = useDriftShort();
  const { submitBundle } = useJitoBundle();

  const handleExecute = async () => {
    // Build transactions
    const swapTx = await buildSwap('SOL', 'JUP', 0.1);
    
    // Option 1: Short with deposit in same transaction
    const shortTx = await buildShort('JUP-PERP', 10, 50); // 50 USDC deposit
    
    // Option 2: Standalone deposit
    const depositTx = await buildDeposit(100); // 100 USDC

    // Submit as bundle
    const result = await submitBundle([swapTx, shortTx], 50000);
    console.log(result);
  };

  return <button onClick={handleExecute}>Execute</button>;
}
```

## Key Differences from Backend Version

| Aspect | Backend | Frontend |
|--------|---------|----------|
| **Signing** | `Keypair.sign()` | `wallet.signAllTransactions()` |
| **Jito API** | gRPC (jito-ts) | JSON-RPC (fetch) |
| **Drift** | Node SDK | Browser SDK with adapter |
| **Security** | Private key in file | Browser wallet (Phantom etc.) |

## Hooks API

### `useAtomicSwapShort()`

Main hook that orchestrates the entire atomic operation.

```tsx
const {
  execute,    // (config) => Promise<JitoBundleResult>
  progress,   // { step, message, swapExpectedOutput }
  result,     // JitoBundleResult | null
  isExecuting,// boolean
  reset,      // () => void
} = useAtomicSwapShort();

// Config includes optional depositAmount
await execute({
  solAmount: 0.1,
  shortAmount: 10,
  transferAmount: 5,
  targetAddress: '...',
  depositAmount: 50, // Optional: USDC to deposit before shorting
  slippageBps: 50,
  jitoTipLamports: 50000,
});
```

### `useJupiterSwap()`

Build Jupiter swap transactions.

```tsx
const {
  buildSwap,      // (inputToken, outputToken, amount, slippage?) => Promise<Tx>
  quote,          // JupiterQuote | null
  expectedOutput, // number | null
  state,          // { status, data, error }
} = useJupiterSwap();
```

### `useDriftShort()`

Build Drift deposit and/or short position transactions.

```tsx
const {
  buildShort,   // (marketName, amount, depositAmount?, subAccountId?) => Promise<Tx>
  buildDeposit, // (usdcAmount, subAccountId?) => Promise<Tx>
  state,        // { status, data, error }
} = useDriftShort();

// Short with deposit included in same transaction
const tx1 = await buildShort('JUP-PERP', 10, 50); // Deposit 50 USDC + Short 10 JUP

// Standalone deposit
const tx2 = await buildDeposit(100); // Deposit 100 USDC only
```

### `useJitoBundle()`

Submit transaction bundles to Jito.

```tsx
const {
  submitBundle, // (transactions, tipLamports?) => Promise<JitoBundleResult>
  state,        // { status, data, error }
} = useJitoBundle();
```

## Important Notes

### Drift Deposit and Collateral

The frontend now supports **atomic USDC deposits** to Drift. You can either:

1. **Deposit + Short atomically**: Include `depositAmount` in your config, and the USDC deposit will be included in the same transaction as the short position.

2. **Use existing collateral**: Set `depositAmount` to 0 or omit it. In this case, you must already have USDC in your Drift margin account.

3. **Standalone deposit**: Use `buildDeposit()` to create a deposit-only transaction.

### Transaction Flow

The atomic bundle executes in this order:
1. **Jupiter Swap**: SOL → JUP (creates JUP in your wallet)
2. **Drift Deposit + Short**: (Optional) Deposit USDC + Open JUP-PERP short position
3. **Transfer**: Send JUP to target address (uses JUP from step 1)

### Prerequisites

- **For deposit**: USDC in your wallet's associated token account
- **For short without deposit**: Existing USDC collateral in Drift margin account
- **For transfer**: JUP will come from the Jupiter swap output

### Jito Bundle Requirements

- **Minimum tip**: 1,000 lamports (0.000001 SOL)
- **Recommended tip**: 50,000+ lamports for faster inclusion
- **Max transactions**: 5 per bundle

### Browser Compatibility

The app uses polyfills for Node.js modules (`buffer`, `crypto`, etc.) required by Solana libraries.

### RPC Recommendations

For production, use a high-performance RPC provider:
- Helius
- QuickNode
- Triton

## License

ISC
