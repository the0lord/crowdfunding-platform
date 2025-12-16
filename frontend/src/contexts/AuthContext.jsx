import { useState, useEffect, createContext, useContext } from 'react';
import { ethers } from 'ethers';

const API_URL = 'http://localhost:8080/api/v1';
const RPC_URL = 'https://rpc-amoy.polygon.technology/';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [isAdmin, setIsAdmin] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConnection();
  }, []);

  useEffect(() => {
    if (token) {
      fetchMe();
    } else {
      setLoading(false);
    }
  }, [token]);

  // Check if wallet is already connected
  const checkConnection = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          setUser({ address: accounts[0] });
          setIsConnected(true);
          
          // If we have a token, verify it belongs to this address
          if (token) {
            fetchMe();
          }
        }
      } catch (error) {
        console.error('Error checking connection:', error);
      }
    }
    setLoading(false);
  };

  // Listen for account changes
  useEffect(() => {
    if (typeof window.ethereum !== 'undefined') {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
          disconnect();
        } else {
          setUser({ address: accounts[0] });
          setIsConnected(true);
          // Clear token as the address changed
          setToken(null);
          localStorage.removeItem('token');
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }

    return () => {
      if (typeof window.ethereum !== 'undefined') {
        window.ethereum.removeAllListeners('accountsChanged');
        window.ethereum.removeAllListeners('chainChanged');
      }
    };
  }, []);

  const fetchMe = async () => {
    try {
      const response = await fetch(`${API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(prev => ({ ...prev, ...data.user }));
        setIsAdmin(data.is_admin || false);
      } else {
        // Token invalid, keep wallet connected but clear token
        setToken(null);
        localStorage.removeItem('token');
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
    setLoading(false);
  };

  const connect = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('Please install MetaMask!');
      return false;
    }

    setLoading(true);
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });
      
      // Switch to Polygon Amoy
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: '0x13882' }], // 80002 in hex
        });
      } catch (switchError) {
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x13882',
              chainName: 'Polygon Amoy Testnet',
              nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
              rpcUrls: [RPC_URL],
              blockExplorerUrls: ['https://amoy.polygonscan.com/']
            }]
          });
        }
      }

      const address = accounts[0];
      setUser({ address });
      setIsConnected(true);

      // Try to login with signature
      await login(address);
      
      return true;
    } catch (error) {
      console.error('Error connecting wallet:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const login = async (address) => {
    try {
      // Get nonce
      const nonceRes = await fetch(`${API_URL}/auth/nonce?address=${address}`);
      if (!nonceRes.ok) {
        console.warn('Auth API not available, continuing without JWT');
        return false;
      }
      
      const { nonce, message } = await nonceRes.json();

      // Sign message with MetaMask
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const signature = await signer.signMessage(message);

      // Login with signature
      const loginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, signature })
      });

      if (!loginRes.ok) {
        throw new Error('Login failed');
      }

      const data = await loginRes.json();
      setToken(data.token);
      setUser(prev => ({ ...prev, ...data.user }));
      setIsAdmin(data.is_admin || false);
      localStorage.setItem('token', data.token);

      return true;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const disconnect = () => {
    setToken(null);
    setUser(null);
    setIsAdmin(false);
    setIsConnected(false);
    localStorage.removeItem('token');
  };

  const value = {
    user,
    token,
    isAdmin,
    isConnected,
    loading,
    connect,
    disconnect,
    login
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
