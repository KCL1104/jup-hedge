import { WalletContextProvider } from './components/WalletContextProvider';
import { AtomicSwapForm } from './components/AtomicSwapForm';

// Your RPC URL - use a high-performance RPC for better results
const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://api.mainnet-beta.solana.com';

function App() {
  return (
    <WalletContextProvider rpcUrl={RPC_URL}>
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#020617',
          padding: '40px 20px',
        }}
      >
        <header style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h1
            style={{
              fontSize: '2.5rem',
              fontWeight: 'bold',
              background: 'linear-gradient(to right, #3b82f6, #8b5cf6)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              marginBottom: '8px',
            }}
          >
            Atomic DeFi Operations
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem' }}>
            Swap • Short • Transfer — All in One Atomic Bundle
          </p>
        </header>

        <main>
          <AtomicSwapForm />
        </main>

        <footer
          style={{
            marginTop: '60px',
            textAlign: 'center',
            color: '#64748b',
            fontSize: '14px',
          }}
        >
          <p>Powered by Jupiter, Drift Protocol & Jito</p>
          <p style={{ marginTop: '8px' }}>
            <a
              href="https://jito.wtf"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#6366f1' }}
            >
              Learn about Jito Bundles
            </a>
          </p>
        </footer>
      </div>
    </WalletContextProvider>
  );
}

export default App;
