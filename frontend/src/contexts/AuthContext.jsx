import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { ethers } from 'ethers';
import { Web3Auth, WEB3AUTH_NETWORK } from '@web3auth/modal';
import { CAMPAIGN_CHAIN } from '../contracts/config';
import i18n from '../i18n';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';
const TOKEN_STORAGE_KEY = 'token';
const WALLET_SESSION_STORAGE_KEY = 'wallet_session';
const WEB3AUTH_STORAGE_PREFIXES = ['openlogin_', 'Web3Auth-'];

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

const normalizeAddress = (address) => (typeof address === 'string' ? address.trim().toLowerCase() : '');

const hasSameAddress = (left, right) => {
  const normalizedLeft = normalizeAddress(left);
  const normalizedRight = normalizeAddress(right);

  return normalizedLeft !== '' && normalizedLeft === normalizedRight;
};

const buildUserState = (userData, fallbackAddress = '') => {
  if (!userData && !fallbackAddress) {
    return null;
  }

  const address = normalizeAddress(userData?.address || userData?.wallet_address || fallbackAddress);

  return {
    ...(userData || {}),
    ...(address ? { address } : {}),
  };
};

const readStoredWalletSession = () => {
  const rawSession = localStorage.getItem(WALLET_SESSION_STORAGE_KEY);
  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(rawSession);
    if (!parsedSession?.address || !parsedSession?.walletType) {
      return null;
    }

    return {
      address: normalizeAddress(parsedSession.address),
      walletType: parsedSession.walletType,
    };
  } catch (error) {
    console.warn('Ignoring invalid stored wallet session:', error);
    return null;
  }
};

const persistWalletSession = ({ address, walletType }) => {
  if (!address || !walletType) {
    return;
  }

  localStorage.setItem(
    WALLET_SESSION_STORAGE_KEY,
    JSON.stringify({
      address: normalizeAddress(address),
      walletType,
    })
  );
};

const clearStoredWalletSession = () => {
  localStorage.removeItem(WALLET_SESSION_STORAGE_KEY);
};

const decodeTokenPayload = (token) => {
  if (!token) {
    return null;
  }

  try {
    const [, payload = ''] = token.split('.');
    if (!payload) {
      return null;
    }

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(Math.ceil(normalizedPayload.length / 4) * 4, '=');

    return JSON.parse(atob(paddedPayload));
  } catch {
    return null;
  }
};

const getTokenWalletAddress = (token) => {
  const payload = decodeTokenPayload(token);
  return normalizeAddress(payload?.wallet_address || payload?.sub);
};

const clearPersistedWeb3AuthStorage = () => {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && WEB3AUTH_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      console.warn('Clearing cached Web3Auth keys after init failure:', keysToRemove);
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
  } catch (error) {
    console.warn('Failed to clear cached Web3Auth storage:', error);
  }
};

const shouldRetryWeb3AuthInit = (error) => {
  const errorText = [error?.name, error?.message, error?.stack].filter(Boolean).join(' ');
  return errorText.includes('TorusInPageProvider');
};

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem(TOKEN_STORAGE_KEY));
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [web3auth, setWeb3auth] = useState(null);
  const [ethProvider, setEthProvider] = useState(null);
  const [walletType, setWalletType] = useState(null); // 'web3auth' | 'metamask'

  const clearTokenState = useCallback(() => {
    setToken(null);
    setIsAdmin(false);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }, []);

  const clearPersistedAuth = useCallback(() => {
    clearTokenState();
    clearStoredWalletSession();
  }, [clearTokenState]);

  const resetWalletState = useCallback(() => {
    setUser(null);
    setIsAdmin(false);
    setIsConnected(false);
    setEthProvider(null);
    setWalletType(null);
  }, []);

  const syncConnectedWallet = useCallback(({ address, provider, walletKind }) => {
    const normalizedAddress = normalizeAddress(address);

    setEthProvider(provider);
    setWalletType(walletKind);
    setUser((prev) => {
      if (hasSameAddress(prev?.address, normalizedAddress)) {
        return buildUserState(prev, normalizedAddress);
      }

      return buildUserState(null, normalizedAddress);
    });
    setIsConnected(true);
    persistWalletSession({ address: normalizedAddress, walletType: walletKind });
  }, []);

  // ─── Initialize Web3Auth on mount ───
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const createWeb3AuthClient = () => {
          const w3a = new Web3Auth({
            clientId: WEB3AUTH_CLIENT_ID,
            web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET, // Change to SAPPHIRE_MAINNET for production
            enableLogging: true, // Debug: remove in production
          });

          w3a.on('ERRORED', (error) => {
            console.error('Web3Auth ERRORED event:', error);
          });

          return w3a;
        };

        const initializeWeb3Auth = async (retryAfterReset = false) => {
          if (retryAfterReset) {
            clearPersistedWeb3AuthStorage();
          }

          const w3a = createWeb3AuthClient();
          await w3a.init();
          return w3a;
        };

        let w3a;
        try {
          w3a = await initializeWeb3Auth();
        } catch (error) {
          if (!shouldRetryWeb3AuthInit(error)) {
            throw error;
          }

          console.warn('Web3Auth init failed with cached provider state. Retrying once after cleanup.');
          w3a = await initializeWeb3Auth(true);
        }

        if (cancelled) {
          return;
        }

        console.log('Web3Auth initialized. Status:', w3a.status, 'Connected:', w3a.connected);
        setWeb3auth(w3a);

        const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
        const storedSession = readStoredWalletSession();
        const tokenAddress = getTokenWalletAddress(storedToken);

        if (storedSession && tokenAddress && !hasSameAddress(storedSession.address, tokenAddress)) {
          console.warn('Stored wallet session does not match persisted token. Clearing saved auth state.');
          clearPersistedAuth();
          resetWalletState();
          return;
        }

        const expectedAddress = storedSession?.address || tokenAddress;
        const expectedWalletType = storedSession?.walletType || null;

        if (!expectedAddress) {
          return;
        }

        const restoreWeb3AuthSession = async () => {
          if (!w3a.connected || !w3a.provider) {
            return false;
          }

          await switchProviderToBSC(w3a.provider);
          const ep = new ethers.BrowserProvider(w3a.provider);
          const signer = await ep.getSigner();
          const address = await signer.getAddress();

          if (!hasSameAddress(address, expectedAddress)) {
            return false;
          }

          if (!cancelled) {
            syncConnectedWallet({ address, provider: w3a.provider, walletKind: 'web3auth' });
          }
          return true;
        };

        const restoreMetaMaskSession = async () => {
          if (typeof window.ethereum === 'undefined') {
            return false;
          }

          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          const matchingAccount = accounts.find((account) => hasSameAddress(account, expectedAddress));

          if (!matchingAccount) {
            return false;
          }

          if (!cancelled) {
            syncConnectedWallet({ address: matchingAccount, provider: window.ethereum, walletKind: 'metamask' });
          }
          return true;
        };

        if (expectedWalletType === 'web3auth') {
          const restored = await restoreWeb3AuthSession();
          if (!restored) {
            try {
              if (w3a.connected) {
                await w3a.logout();
              }
            } catch (_) {
              // Ignore logout cleanup errors while dropping a stale session.
            }
            clearPersistedAuth();
            resetWalletState();
          }
          return;
        }

        if (expectedWalletType === 'metamask') {
          const restored = await restoreMetaMaskSession();
          if (!restored) {
            clearPersistedAuth();
            resetWalletState();
          }
          return;
        }

        if (await restoreWeb3AuthSession()) {
          return;
        }

        if (await restoreMetaMaskSession()) {
          return;
        }

        console.warn('Persisted auth could not be restored to the same wallet. Clearing saved auth state.');
        clearPersistedAuth();
        resetWalletState();
      } catch (error) {
        console.error('Web3Auth init error:', error);
        if (!cancelled) {
          clearPersistedAuth();
          resetWalletState();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, [clearPersistedAuth, resetWalletState, syncConnectedWallet]);

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
        setUser((prev) => buildUserState({ ...prev, ...data.user }, prev?.address || data.user?.wallet_address));
        setIsAdmin(data.is_admin || false);
      } else {
        clearTokenState();
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
    setLoading(false);
  };

  // ─── Login with backend (signature auth) ───
  const login = async (address, providerInstance) => {
    try {
      const nonceRes = await fetch(`${API_URL}/auth/nonce?address=${address}`);
      if (!nonceRes.ok) {
        console.warn('Auth API not available, continuing without JWT');
        return false;
      }
      const { message } = await nonceRes.json();

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
      const resolvedWalletType =
        providerInstance === window.ethereum
          ? 'metamask'
          : providerInstance === web3auth?.provider
            ? 'web3auth'
            : walletType;

      setToken(data.token);
      setUser((prev) => buildUserState({ ...prev, ...data.user }, address));
      setIsAdmin(data.is_admin || false);
      localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
      if (resolvedWalletType) {
        persistWalletSession({ address, walletType: resolvedWalletType });
      }
      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  // ─── MetaMask account change listeners ───
  useEffect(() => {
    if (typeof window.ethereum !== 'undefined' && walletType === 'metamask') {
      const onAccountsChanged = (accounts) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          syncConnectedWallet({ address: accounts[0], provider: window.ethereum, walletKind: 'metamask' });
          clearTokenState();
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
  }, [walletType, clearTokenState, syncConnectedWallet]);

  // ─── Connect via Web3Auth (social login modal) ───
  const connect = useCallback(async () => {
    if (!web3auth) {
      console.error('Web3Auth not initialized yet. Status:', web3auth);
      return false;
    }
    if (web3auth.connected) {
      try {
        console.log('Web3Auth already connected, restoring session...');
        await switchProviderToBSC(web3auth.provider);
        const ep = new ethers.BrowserProvider(web3auth.provider);
        const signer = await ep.getSigner();
        const address = await signer.getAddress();
        syncConnectedWallet({ address, provider: web3auth.provider, walletKind: 'web3auth' });
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

      const ep = new ethers.BrowserProvider(w3aProvider);
      const signer = await ep.getSigner();
      const address = await signer.getAddress();

      syncConnectedWallet({ address, provider: w3aProvider, walletKind: 'web3auth' });
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
  }, [web3auth, login, syncConnectedWallet]);

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
      syncConnectedWallet({ address, provider: window.ethereum, walletKind: 'metamask' });

      await login(address, window.ethereum);
      return true;
    } catch (error) {
      console.error('MetaMask connection error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // ─── Disconnect ───
  const disconnect = async () => {
    try {
      if (web3auth?.connected) await web3auth.logout();
    } catch (e) {
      console.error('Logout error:', e);
    }
    clearPersistedAuth();
    resetWalletState();
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