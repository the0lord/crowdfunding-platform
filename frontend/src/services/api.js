const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api/v1';

const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    console.error('API Error:', response.status, error);
    throw new Error(error.error || error.message || 'Request failed');
  }
  return response.json();
};

// Campaign API
export const campaignAPI = {
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.state) queryParams.append('state', params.state);
    if (params.category) queryParams.append('category', params.category);
    if (params.search) queryParams.append('search', params.search);
    if (params.page) queryParams.append('page', params.page);
    if (params.pageSize) queryParams.append('page_size', params.pageSize);
    
    const response = await fetch(`${API_URL}/campaigns?${queryParams}`);
    return handleResponse(response);
  },

  getById: async (id) => {
    const response = await fetch(`${API_URL}/campaigns/${id}`);
    return handleResponse(response);
  },

  create: async (data) => {
    const response = await fetch(`${API_URL}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data)
    });
    return handleResponse(response);
  },

  update: async (id, data) => {
    const response = await fetch(`${API_URL}/campaigns/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data)
    });
    return handleResponse(response);
  }
};

// User API
export const userAPI = {
  getByAddress: async (address) => {
    const response = await fetch(`${API_URL}/users/${address}`);
    return handleResponse(response);
  },

  getMe: async () => {
    const response = await fetch(`${API_URL}/users/me`, {
      headers: getAuthHeader()
    });
    return handleResponse(response);
  },

  create: async (data) => {
    const response = await fetch(`${API_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data)
    });
    return handleResponse(response);
  }
};

// Contribution API
export const contributionAPI = {
  getByUser: async (address) => {
    const response = await fetch(`${API_URL}/contributions?contributor=${address}`);
    return handleResponse(response);
  },

  getByCampaign: async (campaignId) => {
    const response = await fetch(`${API_URL}/contributions?campaign_id=${campaignId}`);
    return handleResponse(response);
  },

  create: async (data) => {
    const response = await fetch(`${API_URL}/contributions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data)
    });
    return handleResponse(response);
  }
};

// Admin API
export const adminAPI = {
  getStats: async () => {
    const response = await fetch(`${API_URL}/admin/stats`, {
      headers: getAuthHeader()
    });
    return handleResponse(response);
  },

  getModerationQueue: async (page = 1) => {
    const response = await fetch(`${API_URL}/admin/pending?page=${page}`, {
      headers: getAuthHeader()
    });
    return handleResponse(response);
  },

  approveCampaign: async (id) => {
    const response = await fetch(`${API_URL}/admin/campaigns/${id}/approve`, {
      method: 'POST',
      headers: getAuthHeader()
    });
    return handleResponse(response);
  },

  rejectCampaign: async (id, reason) => {
    const response = await fetch(`${API_URL}/admin/campaigns/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ reason })
    });
    return handleResponse(response);
  },

  getBlacklist: async () => {
    const response = await fetch(`${API_URL}/admin/blacklist`, {
      headers: getAuthHeader()
    });
    return handleResponse(response);
  },

  addToBlacklist: async (address, reason) => {
    const response = await fetch(`${API_URL}/admin/blacklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify({ address, reason })
    });
    return handleResponse(response);
  },

  removeFromBlacklist: async (id) => {
    const response = await fetch(`${API_URL}/admin/blacklist/${id}`, {
      method: 'DELETE',
      headers: getAuthHeader()
    });
    return handleResponse(response);
  }
};

// Upload API
export const uploadAPI = {
  uploadImage: async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    
    const response = await fetch(`${API_URL}/uploads/campaign-image`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData
    });
    return handleResponse(response);
  }
};

// Legacy export for backward compatibility
export const api = {
  getCampaigns: campaignAPI.getAll,
  getCampaign: campaignAPI.getById,
  createCampaign: campaignAPI.create,
  getUser: userAPI.getByAddress,
  getMe: userAPI.getMe,
  getContributions: contributionAPI.getByUser,
  createContribution: contributionAPI.create,
  admin: adminAPI
};

// ─────────────────────── KGST Platform APIs ───────────────────────────────

// Bridge API (KGS <-> KGST)
export const bridgeAPI = {
  getMode: async () => {
    const response = await fetch(`${API_URL}/bridge/mode`);
    return handleResponse(response);
  },

  getRates: async () => {
    const response = await fetch(`${API_URL}/bridge/rates`);
    return handleResponse(response);
  },

  requestDeposit: async (data) => {
    const response = await fetch(`${API_URL}/bridge/deposit/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  getDepositStatus: async (txId) => {
    const response = await fetch(`${API_URL}/bridge/deposit/${txId}/status`);
    return handleResponse(response);
  },

  requestWithdraw: async (data) => {
    const response = await fetch(`${API_URL}/bridge/withdraw/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  getWithdrawStatus: async (txId) => {
    const response = await fetch(`${API_URL}/bridge/withdraw/${txId}/status`);
    return handleResponse(response);
  },

  getTransactions: async (wallet, page = 1) => {
    const response = await fetch(`${API_URL}/bridge/transactions?wallet=${wallet}&page=${page}`);
    return handleResponse(response);
  },

  // Demo-only endpoints
  demoConfirmDeposit: async (txId) => {
    const response = await fetch(`${API_URL}/bridge/demo/confirm-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_id: txId }),
    });
    return handleResponse(response);
  },

  demoConfirmWithdraw: async (txId) => {
    const response = await fetch(`${API_URL}/bridge/demo/confirm-withdraw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tx_id: txId }),
    });
    return handleResponse(response);
  },

  demoGetBalance: async (wallet) => {
    const response = await fetch(`${API_URL}/bridge/demo/balance?wallet=${wallet}`);
    return handleResponse(response);
  },

  getStats: async () => {
    const response = await fetch(`${API_URL}/bridge/stats`, {
      headers: getAuthHeader(),
    });
    return handleResponse(response);
  },
};

// KYC API
export const kycAPI = {
  getMode: async () => {
    const response = await fetch(`${API_URL}/kyc/mode`);
    return handleResponse(response);
  },

  startVerification: async (data) => {
    const response = await fetch(`${API_URL}/kyc/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  getStatus: async (wallet) => {
    const response = await fetch(`${API_URL}/kyc/status?wallet=${wallet}`);
    return handleResponse(response);
  },
};

// Wallet API
export const walletAPI = {
  register: async (data) => {
    const response = await fetch(`${API_URL}/wallets/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  getInfo: async (address) => {
    const response = await fetch(`${API_URL}/wallets/${address}`);
    return handleResponse(response);
  },

  upgradeTier: async (data) => {
    const response = await fetch(`${API_URL}/wallets/tier/upgrade`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },
};

// Governance API (DAO)
export const governanceAPI = {
  getProposals: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.type) queryParams.append('type', params.type);
    if (params.page) queryParams.append('page', params.page);
    const response = await fetch(`${API_URL}/governance/proposals?${queryParams}`);
    return handleResponse(response);
  },

  getProposal: async (id) => {
    const response = await fetch(`${API_URL}/governance/proposals/${id}`);
    return handleResponse(response);
  },

  createProposal: async (data) => {
    const response = await fetch(`${API_URL}/governance/proposals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  voteOnProposal: async (id, data) => {
    const response = await fetch(`${API_URL}/governance/proposals/${id}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(data),
    });
    return handleResponse(response);
  },

  getStats: async () => {
    const response = await fetch(`${API_URL}/governance/stats`);
    return handleResponse(response);
  },
};

export default api;
