import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { bridgeAPI } from '../services/api';
import toast from 'react-hot-toast';
import './Bridge.css';

const PAYMENT_METHODS = [
  { id: 'bank_transfer', icon: '🏦' },
  { id: 'mbank_qr', icon: '📱' },
  { id: 'elsom', icon: '💳' },
  { id: 'odengi', icon: '📲' },
];

const BANK_OPTIONS = ['Bakai Bank', 'Optima Bank', 'RSK Bank', 'Demir Bank', 'KICB'];

export default function Bridge() {
  const { t, i18n } = useTranslation();
  const { user, isConnected } = useAuth();
  const [tab, setTab] = useState('deposit'); // 'deposit' | 'withdraw'
  const [rates, setRates] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);

  // Deposit form
  const [depositAmount, setDepositAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [depositResult, setDepositResult] = useState(null);

  // Withdraw form
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankName, setBankName] = useState('Bakai Bank');
  const [withdrawResult, setWithdrawResult] = useState(null);

  const locale = i18n.language?.startsWith('ru') ? 'ru-RU' : 'en-US';
  const paymentMethods = PAYMENT_METHODS.map((method) => ({
    ...method,
    name: t(`bridge.paymentMethods.${method.id}.name`),
    description: t(`bridge.paymentMethods.${method.id}.description`),
  }));

  useEffect(() => {
    loadBridgeData();
  }, [user?.address]);

  const loadBridgeData = async () => {
    try {
      const [modeRes, ratesRes] = await Promise.all([
        bridgeAPI.getMode(),
        bridgeAPI.getRates(),
      ]);
      setDemoMode(modeRes.demo_mode);
      setRates(ratesRes.rates);

      if (user?.address) {
        const [txRes, balRes] = await Promise.all([
          bridgeAPI.getTransactions(user.address).catch(() => ({ transactions: [], total: 0 })),
          bridgeAPI.demoGetBalance(user.address).catch(() => ({ balance: { kgst_balance: '0.00' } })),
        ]);
        setTransactions(txRes.transactions || []);
        setBalance(balRes.balance);
      }
    } catch (error) {
      console.error('Failed to load bridge data:', error);
    }
  };

  const handleDeposit = async (e) => {
    e.preventDefault();
    if (!user?.address) return;
    setLoading(true);
    try {
      const res = await bridgeAPI.requestDeposit({
        wallet_address: user.address,
        fiat_amount: parseFloat(depositAmount),
        payment_method: paymentMethod,
      });
      setDepositResult(res.deposit);
      toast.success(t('bridge.toasts.depositCreated'));
    } catch (error) {
      toast.error(t('bridge.toasts.depositFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoConfirmDeposit = async () => {
    if (!depositResult) return;
    setLoading(true);
    try {
      await bridgeAPI.demoConfirmDeposit(depositResult.tx_id);
      toast.success(t('bridge.toasts.depositConfirmed'));
      setDepositResult(null);
      setDepositAmount('');
      await loadBridgeData();
    } catch (error) {
      toast.error(t('bridge.toasts.depositConfirmFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (e) => {
    e.preventDefault();
    if (!user?.address) return;
    setLoading(true);
    try {
      const res = await bridgeAPI.requestWithdraw({
        wallet_address: user.address,
        token_amount: parseFloat(withdrawAmount),
        bank_account_number: bankAccount,
        bank_name: bankName,
      });
      setWithdrawResult(res.withdrawal);
      toast.success(t('bridge.toasts.withdrawCreated'));
    } catch (error) {
      toast.error(t('bridge.toasts.withdrawFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoConfirmWithdraw = async () => {
    if (!withdrawResult) return;
    setLoading(true);
    try {
      await bridgeAPI.demoConfirmWithdraw(withdrawResult.tx_id);
      toast.success(t('bridge.toasts.withdrawConfirmed'));
      setWithdrawResult(null);
      setWithdrawAmount('');
      setBankAccount('');
      await loadBridgeData();
    } catch (error) {
      toast.error(t('bridge.toasts.withdrawConfirmFailed'));
    } finally {
      setLoading(false);
    }
  };

  const calcFee = (amount, feePercent) => {
    const a = parseFloat(amount) || 0;
    return (a * feePercent / 100).toFixed(2);
  };

  const calcReceive = (amount, feePercent) => {
    const a = parseFloat(amount) || 0;
    return (a - a * feePercent / 100).toFixed(2);
  };

  const formatNumber = (value) => (Number.parseFloat(value || 0) || 0).toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  const formatDate = (value) => new Date(value).toLocaleDateString(locale);

  const getStatusLabel = (status) => t(`bridge.statuses.${status}`, { defaultValue: status });

  const getDirectionLabel = (direction) => t(`bridge.directions.${direction}`, { defaultValue: direction });

  if (!isConnected) {
    return (
      <div className="bridge-page">
        <div className="bridge-connect-prompt">
          <h2>{t('bridge.title')}</h2>
          <p>{t('bridge.connectBody')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bridge-page">
      {demoMode && (
        <div className="demo-banner">
          <span className="demo-badge">{t('bridge.demoBadge')}</span>
          <p>{t('bridge.demoBody')}</p>
        </div>
      )}

      <div className="bridge-header">
        <h1>{t('bridge.title')}</h1>
        <p className="bridge-subtitle">{t('bridge.subtitle')}</p>
        {balance && (
          <div className="balance-card">
            <span className="balance-label">{t('bridge.balanceLabel')}</span>
            <span className="balance-amount">{formatNumber(balance.kgst_balance)} KGST</span>
            <span className="balance-equiv">{t('bridge.balanceEquivalent', { amount: formatNumber(balance.kgs_equivalent) })}</span>
          </div>
        )}
      </div>

      <div className="bridge-tabs">
        <button className={`tab ${tab === 'deposit' ? 'active' : ''}`} onClick={() => setTab('deposit')}>
          {t('bridge.tabs.deposit')}
        </button>
        <button className={`tab ${tab === 'withdraw' ? 'active' : ''}`} onClick={() => setTab('withdraw')}>
          {t('bridge.tabs.withdraw')}
        </button>
      </div>

      <div className="bridge-content">
        {/* ─── Deposit Tab ─── */}
        {tab === 'deposit' && (
          <div className="bridge-form-section">
            {!depositResult ? (
              <form onSubmit={handleDeposit} className="bridge-form">
                <div className="form-group">
                  <label>{t('bridge.deposit.amountLabel')}</label>
                  <div className="amount-input-wrapper">
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      placeholder={t('bridge.deposit.amountPlaceholder')}
                      min={rates?.min_deposit || 100}
                      max={rates?.max_deposit || 1000000}
                      required
                    />
                    <span className="currency-label">KGS</span>
                  </div>
                  {rates && (
                    <div className="fee-details">
                      <span>{t('bridge.deposit.feeSummary', { amount: calcFee(depositAmount, rates.deposit_fee_percent), percent: rates.deposit_fee_percent })}</span>
                      <span>{t('bridge.deposit.receiveSummary', { amount: calcReceive(depositAmount, rates.deposit_fee_percent) })}</span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>{t('bridge.deposit.paymentMethodLabel')}</label>
                  <div className="payment-methods">
                    {paymentMethods.map((method) => (
                      <label
                        key={method.id}
                        className={`payment-method-card ${paymentMethod === method.id ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="payment_method"
                          value={method.id}
                          checked={paymentMethod === method.id}
                          onChange={(e) => setPaymentMethod(e.target.value)}
                        />
                        <span className="pm-icon">{method.icon}</span>
                        <span className="pm-copy">
                          <span className="pm-name">{method.name}</span>
                          <span className="pm-desc">{method.description}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <button type="submit" className="btn btn-primary btn-lg" disabled={loading || !depositAmount}>
                  {loading ? t('common.processing') : t('bridge.deposit.requestButton')}
                </button>
              </form>
            ) : (
              <div className="deposit-result">
                <div className="result-card">
                  <div className="result-header success">
                    <span>{t('bridge.deposit.resultTitle')}</span>
                  </div>
                  <div className="result-details">
                    <div className="detail-row">
                      <span>{t('bridge.fields.transactionId')}</span>
                      <code>{depositResult.tx_id.slice(0, 8)}...</code>
                    </div>
                    <div className="detail-row">
                      <span>{t('common.amount')}</span>
                      <span>{depositResult.fiat_amount} KGS</span>
                    </div>
                    <div className="detail-row">
                      <span>{t('bridge.fields.fee')}</span>
                      <span>{depositResult.fee_amount} KGS</span>
                    </div>
                    <div className="detail-row highlight">
                      <span>{t('bridge.fields.youReceive')}</span>
                      <span>{depositResult.token_amount} KGST</span>
                    </div>
                    {depositResult.payment_details?.bank_name && (
                      <>
                        <div className="detail-row">
                          <span>{t('bridge.fields.bank')}</span>
                          <span>{depositResult.payment_details.bank_name}</span>
                        </div>
                        <div className="detail-row">
                          <span>{t('bridge.fields.account')}</span>
                          <code>{depositResult.payment_details.account_number}</code>
                        </div>
                        <div className="detail-row">
                          <span>{t('bridge.fields.reference')}</span>
                          <code>{depositResult.payment_details.reference}</code>
                        </div>
                      </>
                    )}
                    {depositResult.payment_details?.qr_data && (
                      <div className="qr-section">
                        <p className="qr-label">{t('bridge.deposit.scanQr')}</p>
                        <div className="qr-placeholder">
                          <span>{t('bridge.deposit.qrCodeLabel')}</span>
                          <code>{depositResult.payment_details.qr_data}</code>
                        </div>
                      </div>
                    )}
                  </div>

                  {demoMode && (
                    <div className="demo-actions">
                      <p className="demo-hint">{t('bridge.deposit.demoHint')}</p>
                      <button
                        className="btn btn-success btn-lg"
                        onClick={handleDemoConfirmDeposit}
                        disabled={loading}
                      >
                        {loading ? t('bridge.demoConfirming') : t('bridge.deposit.demoConfirmButton')}
                      </button>
                    </div>
                  )}

                  <button className="btn btn-outline" onClick={() => setDepositResult(null)}>
                    {t('bridge.deposit.newRequestButton')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Withdraw Tab ─── */}
        {tab === 'withdraw' && (
          <div className="bridge-form-section">
            {!withdrawResult ? (
              <form onSubmit={handleWithdraw} className="bridge-form">
                <div className="form-group">
                  <label>{t('bridge.withdraw.amountLabel')}</label>
                  <div className="amount-input-wrapper">
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder={t('bridge.withdraw.amountPlaceholder')}
                      min={rates?.min_withdraw || 100}
                      max={rates?.max_withdraw || 1000000}
                      required
                    />
                    <span className="currency-label">KGST</span>
                  </div>
                  {rates && (
                    <div className="fee-details">
                      <span>{t('bridge.withdraw.feeSummary', { amount: calcFee(withdrawAmount, rates.withdraw_fee_percent), percent: rates.withdraw_fee_percent })}</span>
                      <span>{t('bridge.withdraw.receiveSummary', { amount: calcReceive(withdrawAmount, rates.withdraw_fee_percent) })}</span>
                    </div>
                  )}
                </div>

                <div className="form-group">
                  <label>{t('bridge.withdraw.bankNameLabel')}</label>
                  <select value={bankName} onChange={(e) => setBankName(e.target.value)}>
                    {BANK_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>{t('bridge.withdraw.bankAccountLabel')}</label>
                  <input
                    type="text"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                    placeholder={t('bridge.withdraw.bankAccountPlaceholder')}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-lg" disabled={loading || !withdrawAmount || !bankAccount}>
                  {loading ? t('common.processing') : t('bridge.withdraw.requestButton')}
                </button>
              </form>
            ) : (
              <div className="withdraw-result">
                <div className="result-card">
                  <div className="result-header success">
                    <span>{t('bridge.withdraw.resultTitle')}</span>
                  </div>
                  <div className="result-details">
                    <div className="detail-row">
                      <span>{t('bridge.fields.transactionId')}</span>
                      <code>{withdrawResult.tx_id.slice(0, 8)}...</code>
                    </div>
                    <div className="detail-row">
                      <span>{t('bridge.fields.tokenAmount')}</span>
                      <span>{withdrawResult.token_amount} KGST</span>
                    </div>
                    <div className="detail-row">
                      <span>{t('bridge.fields.fee')}</span>
                      <span>{withdrawResult.fee_amount} KGST</span>
                    </div>
                    <div className="detail-row highlight">
                      <span>{t('bridge.fields.youReceive')}</span>
                      <span>{withdrawResult.fiat_amount} KGS</span>
                    </div>
                    <div className="detail-row">
                      <span>{t('bridge.fields.bank')}</span>
                      <span>{withdrawResult.bank_name}</span>
                    </div>
                    <div className="detail-row">
                      <span>{t('bridge.fields.account')}</span>
                      <code>{withdrawResult.bank_account_number}</code>
                    </div>
                    <div className="detail-row">
                      <span>{t('bridge.fields.eta')}</span>
                      <span>{withdrawResult.estimated_arrival}</span>
                    </div>
                  </div>

                  {demoMode && (
                    <div className="demo-actions">
                      <p className="demo-hint">{t('bridge.withdraw.demoHint')}</p>
                      <button
                        className="btn btn-success btn-lg"
                        onClick={handleDemoConfirmWithdraw}
                        disabled={loading}
                      >
                        {loading ? t('bridge.demoConfirming') : t('bridge.withdraw.demoConfirmButton')}
                      </button>
                    </div>
                  )}

                  <button className="btn btn-outline" onClick={() => setWithdrawResult(null)}>
                    {t('bridge.withdraw.newRequestButton')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Transaction History ─── */}
      {transactions.length > 0 && (
        <div className="bridge-history">
          <h3>{t('bridge.history.title')}</h3>
          <div className="tx-table">
            <div className="tx-header">
              <span>{t('common.type')}</span>
              <span>{t('common.amount')}</span>
              <span>{t('common.status')}</span>
              <span>{t('common.date')}</span>
            </div>
            {transactions.map((tx) => (
              <div key={tx.tx_id || tx.ID} className={`tx-row ${tx.status}`}>
                <span className="tx-type">
                  {getDirectionLabel(tx.direction)}
                </span>
                <span className="tx-amount">
                  {tx.direction === 'deposit'
                    ? `${tx.fiat_amount} KGS → ${tx.token_amount} KGST`
                    : `${tx.token_amount} KGST → ${tx.fiat_amount} KGS`}
                </span>
                <span className={`tx-status status-${tx.status}`}>
                  {tx.status === 'completed' ? '✅' : tx.status === 'pending' ? '⏳' : tx.status === 'expired' ? '⏰' : '❌'}
                  {' '}{getStatusLabel(tx.status)}
                </span>
                <span className="tx-date">{formatDate(tx.CreatedAt || tx.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
