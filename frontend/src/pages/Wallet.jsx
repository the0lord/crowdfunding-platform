import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { walletAPI, kycAPI } from '../services/api';
import toast from 'react-hot-toast';
import './Wallet.css';

const TIER_INFO = {
  1: { key: 'starter', icon: '🥉', color: '#cd7f32' },
  2: { key: 'standard', icon: '🥈', color: '#c0c0c0' },
  3: { key: 'premium', icon: '🥇', color: '#ffd700' },
};

const KYC_LEVELS = {
  0: { key: 'none', badge: '⚪', requirements: [] },
  1: { key: 'basic', badge: '🟢', requirements: ['email', 'phone'] },
  2: { key: 'enhanced', badge: '🔵', requirements: ['full_name', 'document_type', 'document_id'] },
  3: { key: 'full', badge: '🟣', requirements: ['full_name', 'document_type', 'document_id', 'date_of_birth', 'address', 'selfie_confirm'] },
};

function getTierInfo(t, tier) {
  const meta = TIER_INFO[tier] || TIER_INFO[1];

  return {
    ...meta,
    name: t(`wallet.tiers.${meta.key}.name`),
    limit: t(`wallet.tiers.${meta.key}.limit`),
  };
}

function getKycInfo(t, level) {
  const meta = KYC_LEVELS[level] || KYC_LEVELS[0];

  return {
    ...meta,
    name: t(`wallet.kycLevels.${meta.key}.name`),
    description: t(`wallet.kycLevels.${meta.key}.description`),
  };
}

export default function WalletPage() {
  const { t, i18n } = useTranslation();
  const { user, isConnected, walletType } = useAuth();
  const [walletInfo, setWalletInfo] = useState(null);
  const [kycStatus, setKycStatus] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showKYC, setShowKYC] = useState(false);
  const [kycLevel, setKycLevel] = useState(1);

  // KYC Form
  const [kycForm, setKycForm] = useState({
    email: '', phone: '', full_name: '', document_type: 'passport',
    document_id: '', date_of_birth: '', address: '', selfie_confirm: false,
  });

  const locale = i18n.language?.startsWith('ru') ? 'ru-RU' : 'en-US';

  useEffect(() => {
    if (user?.address) loadData();
  }, [user?.address]);

  const loadData = async () => {
    try {
      const modeRes = await kycAPI.getMode().catch(() => ({ demo_mode: true }));
      setDemoMode(modeRes.demo_mode);

      const [walletRes, kycRes] = await Promise.all([
        walletAPI.getInfo(user.address).catch(() => null),
        kycAPI.getStatus(user.address).catch(() => null),
      ]);

      if (walletRes?.wallet) {
        setWalletInfo(walletRes.wallet);
      }
      if (kycRes?.kyc) {
        setKycStatus(kycRes.kyc);
      }
    } catch (error) {
      console.error('Failed to load wallet data:', error);
    }
  };

  const handleRegisterWallet = async () => {
    if (!user?.address) return;
    setLoading(true);
    try {
      const res = await walletAPI.register({
        wallet_address: user.address,
        wallet_type: walletType || 'web3auth',
        web3auth_id: '',
      });
      setWalletInfo(res.wallet);
      toast.success(t('wallet.toasts.registerSuccess'));
      await loadData();
    } catch (error) {
      toast.error(t('wallet.toasts.registerFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleKYCSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await kycAPI.startVerification({
        wallet_address: user.address,
        level: kycLevel,
        ...kycForm,
      });
      toast.success(t('wallet.toasts.kycVerified', { level: kycLevel }));
      setShowKYC(false);
      await loadData();
    } catch (error) {
      toast.error(t('wallet.toasts.kycFailed'));
    } finally {
      setLoading(false);
    }
  };

  const formatVolume = (value) => (Number.parseFloat(value || 0) || 0).toLocaleString(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  if (!isConnected) {
    return (
      <div className="wallet-page">
        <div className="wallet-connect-prompt">
          <h2>{t('wallet.title')}</h2>
          <p>{t('wallet.connectBody')}</p>
        </div>
      </div>
    );
  }

  const currentTier = walletInfo?.wallet_tier || 1;
  const currentKYC = kycStatus?.kyc_level || walletInfo?.kyc_level || 0;
  const currentKycInfo = getKycInfo(t, currentKYC);

  return (
    <div className="wallet-page">
      {demoMode && (
        <div className="demo-banner">
          <span className="demo-badge">{t('wallet.demoBadge')}</span>
          <p>{t('wallet.demoBody')}</p>
        </div>
      )}

      <div className="wallet-header">
        <h1>{t('wallet.title')}</h1>
        <p className="wallet-address-display">
          <code>{user?.address}</code>
          <span className="wallet-type-tag">
            {walletType === 'web3auth'
              ? `🔑 ${t('wallet.walletTypes.web3auth')}`
              : `🦊 ${t('wallet.walletTypes.metamask')}`}
          </span>
        </p>
      </div>

      {!walletInfo ? (
        <div className="register-section">
          <div className="register-card">
            <h2>{t('wallet.registerTitle')}</h2>
            <p>{t('wallet.registerBody')}</p>
            <button className="btn btn-primary btn-lg" onClick={handleRegisterWallet} disabled={loading}>
              {loading ? t('wallet.registering') : t('wallet.registerButton')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* ─── Tier Display ─── */}
          <div className="tier-section">
            <h3>{t('wallet.tierTitle')}</h3>
            <div className="tier-cards">
              {[1, 2, 3].map((tier) => (
                (() => {
                  const tierInfo = getTierInfo(t, tier);

                  return (
                    <div
                      key={tier}
                      className={`tier-card ${tier === currentTier ? 'current' : ''} ${tier < currentTier ? 'completed' : ''}`}
                      style={tier === currentTier ? { borderColor: tierInfo.color } : {}}
                    >
                      <div className="tier-icon">{tierInfo.icon}</div>
                      <div className="tier-name">{t('wallet.tierLabel', { count: tier })}: {tierInfo.name}</div>
                      <div className="tier-limit">{tierInfo.limit}</div>
                      {tier === currentTier && <div className="tier-current-badge">{t('wallet.currentBadge')}</div>}
                      {tier <= currentTier && tier > 1 && <div className="tier-check">✅</div>}
                    </div>
                  );
                })()
              ))}
            </div>

            {walletInfo && (
              <div className="wallet-stats">
                <div className="stat">
                  <span className="stat-label">{t('wallet.monthlyLimit')}</span>
                  <span className="stat-value">{walletInfo.monthly_limit === 'unlimited' ? `♾️ ${t('wallet.unlimited')}` : `${Number.parseInt(walletInfo.monthly_limit, 10).toLocaleString(locale)} KGST`}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">{t('wallet.monthlyVolume')}</span>
                  <span className="stat-value">{formatVolume(walletInfo.monthly_volume)} KGST</span>
                </div>
                <div className="stat">
                  <span className="stat-label">{t('wallet.remaining')}</span>
                  <span className="stat-value">{walletInfo.remaining_volume === 'unlimited' ? `♾️ ${t('wallet.unlimited')}` : `${formatVolume(walletInfo.remaining_volume)} KGST`}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">{t('wallet.gasSubsidy')}</span>
                  <span className="stat-value">{walletInfo.gas_sponsored ? `${walletInfo.gas_subsidy_pct}%` : t('wallet.none')}</span>
                </div>
              </div>
            )}
          </div>

          {/* ─── KYC Section ─── */}
          <div className="kyc-section">
            <div className="kyc-header">
              <h3>{t('wallet.kycTitle')}</h3>
              <span className="kyc-current">
                {currentKycInfo.badge} {t('wallet.levelLabel', { count: currentKYC })}: {currentKycInfo.name}
              </span>
            </div>

            <div className="kyc-levels">
              {[1, 2, 3].map((level) => (
                (() => {
                  const levelInfo = getKycInfo(t, level);

                  return (
                    <div
                      key={level}
                      className={`kyc-level-card ${level <= currentKYC ? 'verified' : ''} ${level === currentKYC + 1 ? 'next' : ''}`}
                    >
                      <div className="kyc-level-header">
                        <span>{levelInfo.badge} {t('wallet.levelLabel', { count: level })}</span>
                        <span className="kyc-level-name">{levelInfo.name}</span>
                      </div>
                      <p className="kyc-level-desc">{levelInfo.description}</p>
                      {level <= currentKYC ? (
                        <span className="kyc-verified-badge">✅ {t('wallet.verifiedBadge')}</span>
                      ) : level === currentKYC + 1 ? (
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setKycLevel(level);
                            setShowKYC(true);
                          }}
                        >
                          {t('wallet.verifyNow')}
                        </button>
                      ) : (
                        <span className="kyc-locked">🔒 {t('wallet.completeLevelFirst', { count: level - 1 })}</span>
                      )}
                    </div>
                  );
                })()
              ))}
            </div>
          </div>

          {/* ─── KYC Form Modal ─── */}
          {showKYC && (
            <div className="kyc-modal-overlay" onClick={() => setShowKYC(false)}>
              <div className="kyc-modal" onClick={(e) => e.stopPropagation()}>
                <div className="kyc-modal-header">
                  <h3>{getKycInfo(t, kycLevel).badge} {t('wallet.modalTitle', { count: kycLevel })}</h3>
                  <button className="close-btn" onClick={() => setShowKYC(false)}>✕</button>
                </div>

                {demoMode && (
                  <div className="demo-banner-small">
                    {t('wallet.modalDemoBody')}
                  </div>
                )}

                <form onSubmit={handleKYCSubmit} className="kyc-form">
                  {kycLevel >= 1 && (
                    <>
                      <div className="form-group">
                        <label>{t('common.email')}</label>
                        <input
                          type="email"
                          value={kycForm.email}
                          onChange={(e) => setKycForm({ ...kycForm, email: e.target.value })}
                          placeholder={t('wallet.placeholders.email')}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>{t('wallet.fields.phoneNumber')}</label>
                        <div className="phone-input-group">
                          <div className="phone-prefix">
                            <span className="phone-flag">🇰🇬</span>
                            <span className="phone-code">+996</span>
                          </div>
                          <input
                            type="tel"
                            value={kycForm.phone.replace(/^\+996\s?/, '')}
                            onChange={(e) => {
                              const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
                              const formatted = digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3').trim();
                              setKycForm({ ...kycForm, phone: '+996 ' + formatted });
                            }}
                            placeholder={t('wallet.placeholders.phone')}
                            maxLength={11}
                            required
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {kycLevel >= 2 && (
                    <>
                      <div className="form-group">
                        <label>{t('wallet.fields.fullName')}</label>
                        <input
                          type="text"
                          value={kycForm.full_name}
                          onChange={(e) => setKycForm({ ...kycForm, full_name: e.target.value })}
                          placeholder={t('wallet.placeholders.fullName')}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>{t('wallet.fields.documentType')}</label>
                        <select
                          value={kycForm.document_type}
                          onChange={(e) => setKycForm({ ...kycForm, document_type: e.target.value })}
                        >
                          <option value="passport">{t('wallet.documentTypes.passport')}</option>
                          <option value="id_card">{t('wallet.documentTypes.idCard')}</option>
                          <option value="drivers_license">{t('wallet.documentTypes.driversLicense')}</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>{t('wallet.fields.documentId')}</label>
                        <input
                          type="text"
                          value={kycForm.document_id}
                          onChange={(e) => setKycForm({ ...kycForm, document_id: e.target.value })}
                          placeholder={t('wallet.placeholders.documentId')}
                          required
                        />
                      </div>
                    </>
                  )}

                  {kycLevel >= 3 && (
                    <>
                      <div className="form-group">
                        <label>{t('wallet.fields.dateOfBirth')}</label>
                        <input
                          type="date"
                          value={kycForm.date_of_birth}
                          onChange={(e) => setKycForm({ ...kycForm, date_of_birth: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>{t('wallet.fields.address')}</label>
                        <input
                          type="text"
                          value={kycForm.address}
                          onChange={(e) => setKycForm({ ...kycForm, address: e.target.value })}
                          placeholder={t('wallet.placeholders.address')}
                          required
                        />
                      </div>
                      <div className="form-group checkbox-group">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={kycForm.selfie_confirm}
                            onChange={(e) => setKycForm({ ...kycForm, selfie_confirm: e.target.checked })}
                            required
                          />
                          <span>{t('wallet.fields.selfieConfirm')}</span>
                        </label>
                      </div>
                    </>
                  )}

                  <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                    {loading ? t('wallet.verifying') : t('wallet.verifyLevel', { count: kycLevel })}
                  </button>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
