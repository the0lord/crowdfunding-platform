import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { ethers } from 'ethers';
import { Web3Auth, WEB3AUTH_NETWORK } from '@web3auth/modal';
import { CAMPAIGN_CHAIN } from '../contracts/config';
import i18n from '../i18n';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

// Replace with your actual Web3Auth Client ID from https://dashboard.web3auth.io
const WEB3AUTH_CLIENT_ID =
  import.meta.env.VITE_WEB3AUTH_CLIENT_ID ||
  'BPFT1o2h7o-g0rliYHl22UW319l6wkKjowUa2ijm1cVNnNypTy3SpUMeLv6dGkZHm_G7abrvLqIpPKqLSy0Xdgk';

// ─── BSC Testnet chain details (for switching after login) ───
const BSC_TESTNET_CHAIN = {
  chainId: CAMPAIGN_CHAIN.chainIdHex,             // '0x61'
  chainName: CAMPAIGN_CHAIN.name,                  // 'BNB Smart Chain Testnet'
  nativeCurrency: CAMPAIGN_CHAIN.currency,         // { name: 'tBNB', symbol: 'tBNB', decimals: 18 }
  rpcUrls: ['https://bsc-testnet-rpc.publicnode.com', CAMPAIGN_CHAIN.rpc],
  blockExplorerUrls: [CAMPAIGN_CHAIN.explorer],    // 'https://testnet.bscscan.com'
};

/**
 * Switch a Web3Auth provider to BSC Testnet after login.
 * v10 handles chains via dashboard; this is a fallback for programmatic switching.
 */
const switchProviderToBSC = async (provider) => {
  if (!provider?.request) return;
  try {
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [BSC_TESTNET_CHAIN],
    });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CAMPAIGN_CHAIN.chainIdHex }],
    });
  } catch (err) {
    console.warn('Chain switch to BSC testnet skipped:', err?.message || err);
  }
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [web3auth, setWeb3auth] = useState(null);
  const [ethProvider, setEthProvider] = useState(null);
  const [walletType, setWalletType] = useState(null); // 'web3auth' | 'metamask'

  // ─── Initialize Web3Auth on mount ───
  useEffect(() => {
    const init = async () => {
      try {
        // Clear any stale/corrupted Web3Auth state from previous sessions
        // that can cause TorusInPageProvider errors
        try {
          const keysToRemove = [];
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('openlogin_') || key.startsWith('Web3Auth-'))) {
              keysToRemove.push(key);
            }
          }
          if (keysToRemove.length > 0) {
            console.log('Clearing stale Web3Auth keys:', keysToRemove);
            keysToRemove.forEach((k) => localStorage.removeItem(k));
          }
        } catch (_) { /* ignore */ }

        const w3a = new Web3Auth({
          clientId: WEB3AUTH_CLIENT_ID,
          web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET, // Change to SAPPHIRE_MAINNET for production
          enableLogging: true, // Debug: remove in production
        });

        // Listen for errors from the Web3Auth SDK
        w3a.on('ERRORED', (error) => {
          console.error('Web3Auth ERRORED event:', error);
        });

        await w3a.init();
        console.log('Web3Auth initialized. Status:', w3a.status, 'Connected:', w3a.connected);
        setWeb3auth(w3a);

        // Reconnect if Web3Auth was already connected
        if (w3a.connected && w3a.provider) {
          await switchProviderToBSC(w3a.provider);
          setEthProvider(w3a.provider);
          setWalletType('web3auth');
          const ep = new ethers.BrowserProvider(w3a.provider);
          const signer = await ep.getSigner();
          const address = await signer.getAddress();
          setUser({ address });
          setIsConnected(true);
        }
        // Or check MetaMask
        else if (typeof window.ethereum !== 'undefined') {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts.length > 0) {
            setEthProvider(window.ethereum);
            setWalletType('metamask');
            setUser({ address: accounts[0] });
            setIsConnected(true);
          }
        }
      } catch (error) {
        console.error('Web3Auth init error:', error);
      }
      setLoading(false);
    };
    init();
  }, []);

  // ─── Fetch user from backend ───
  useEffect(() => {
    if (token) {
      fetchMe();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchMe = async () => {
    try {
      const response = await fetch(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUser((prev) => ({ ...prev, ...data.user }));
        setIsAdmin(data.is_admin || false);
      } else {
        setToken(null);
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
    setLoading(false);
  };

  // ─── MetaMask account change listeners ───
  useEffect(() => {
    if (typeof window.ethereum !== 'undefined' && walletType === 'metamask') {
      const onAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          setUser({ address: accounts[0] });
          setIsConnected(true);
          setToken(null);
          localStorage.removeItem('token');
        }
      };
      const onChainChanged = () => window.location.reload();

      window.ethereum.on('accountsChanged', onAccountsChanged);
      window.ethereum.on('chainChanged', onChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', onAccountsChanged);
        window.ethereum.removeListener('chainChanged', onChainChanged);
      };
    }
  }, [walletType]);

  // ─── Connect via Web3Auth (social login modal) ───
  const connect = useCallback(async () => {
    if (!web3auth) {
      console.error('Web3Auth not initialized yet. Status:', web3auth);
      return false;
    }
    if (web3auth.connected) {
      // Already connected, just restore session
      try {
        console.log('Web3Auth already connected, restoring session...');
        await switchProviderToBSC(web3auth.provider);
        const ep = new ethers.BrowserProvider(web3auth.provider);
        const signer = await ep.getSigner();
        const address = await signer.getAddress();
        setEthProvider(web3auth.provider);
        setWalletType('web3auth');
        setUser({ address });
        setIsConnected(true);
        await login(address, web3auth.provider);
        return true;
      } catch (err) {
        console.error('Failed to restore Web3Auth session:', err);
        try { await web3auth.logout(); } catch (_) {}
      }
    }
    setLoading(true);
    try {
      console.log('Web3Auth connect starting... Status:', web3auth.status);
      const w3aProvider = await web3auth.connect();
      console.log('Web3Auth connect returned provider:', !!w3aProvider);
      if (!w3aProvider) {
        console.error('Web3Auth connect returned null provider');
        setLoading(false);
        return false;
      }

      // Switch to BSC Testnet after social login completes
      // (Web3Auth may have connected on the dashboard-configured chain like Sepolia)
      try {
        await switchProviderToBSC(w3aProvider);
      } catch (switchErr) {
        console.warn('Post-login chain switch failed, continuing on current chain:', switchErr);
      }

      setEthProvider(w3aProvider);
      setWalletType('web3auth');

      const ep = new ethers.BrowserProvider(w3aProvider);
      const signer = await ep.getSigner();
      const address = await signer.getAddress();

      setUser({ address });
      setIsConnected(true);
      await login(address, w3aProvider);
      return true;
    } catch (error) {
      console.error('Web3Auth connect error:', error);
      // If the user closed the modal, don't show an error
      if (error?.message?.includes('User closed') || error?.code === 5000) {
        console.log('User cancelled Web3Auth login');
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, [web3auth]);

  // ─── Connect via MetaMask ───
  const connectMetaMask = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert(i18n.t('auth.installMetaMask'));
      return false;
    }
    setLoading(true);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

      // Switch to BSC Testnet (campaign chain)
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: CAMPAIGN_CHAIN.chainIdHex }],
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: CAMPAIGN_CHAIN.chainIdHex,
                chainName: CAMPAIGN_CHAIN.name,
                nativeCurrency: CAMPAIGN_CHAIN.currency,
                rpcUrls: [CAMPAIGN_CHAIN.rpc],
                blockExplorerUrls: [CAMPAIGN_CHAIN.explorer],
              },
            ],
          });
        }
      }

      const address = accounts[0];
      setUser({ address });
      setIsConnected(true);
      setEthProvider(window.ethereum);
      setWalletType('metamask');

      await login(address, window.ethereum);
      return true;
    } catch (error) {
      console.error('MetaMask connection error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ─── Login with backend (signature auth) ───
  const login = async (address, providerInstance) => {
    try {
      const nonceRes = await fetch(`${API_URL}/auth/nonce?address=${address}`);
      if (!nonceRes.ok) {
        console.warn('Auth API not available, continuing without JWT');
        return false;
      }
      const { nonce, message } = await nonceRes.json();

      const ep = new ethers.BrowserProvider(providerInstance || ethProvider);
      const signer = await ep.getSigner();
      const signature = await signer.signMessage(message);

      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature }),
      });
      if (!loginRes.ok) throw new Error('Login failed');

      const data = await loginRes.json();
      setToken(data.token);
      setUser((prev) => ({ ...prev, ...data.user }));
      setIsAdmin(data.is_admin || false);
      localStorage.setItem('token', data.token);
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  // ─── Disconnect ───
  const disconnect = async () => {
    try {
      if (web3auth?.connected) await web3auth.logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    setToken(null);
    setUser(null);
    setIsAdmin(false);
    setIsConnected(false);
    setEthProvider(null);
    setWalletType(null);
    localStorage.removeItem('token');
  };

  // ─── Get Web3Auth User Info (email, name etc.) ───
  const getUserInfo = async () => {
    if (!web3auth?.connected) return null;
    try {
      return await web3auth.getUserInfo();
    } catch {
      return null;
    }
  };

  const value = {
    user,
    token,
    isAdmin,
    isConnected,
    loading,
    walletType,
    provider: ethProvider,
    connect,           // Default: opens Web3Auth modal
    connectMetaMask,   // Direct MetaMask
    disconnect,
    login,
    getUserInfo,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
