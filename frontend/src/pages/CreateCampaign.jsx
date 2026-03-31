import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { campaignAPI } from '../services/api';
import { getFactory, getSigner, ensureBSCChain, explorerTxUrl, CAMPAIGN_CHAIN } from '../contracts';
import toast from 'react-hot-toast';
import './CreateCampaign.css';

const categories = [
  'technology',
  'creative',
  'community',
  'education',
  'environment',
  'health',
  'other'
];

export default function CreateCampaign() {
  const { t, i18n } = useTranslation();
  const { user, isConnected, connect, provider } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    goalAmount: '',
    durationDays: 30,
    imageUrl: ''
  });

  const locale = i18n.language?.startsWith('ru') ? 'ru-RU' : 'en-US';

  const formatCategory = (value) => (value ? t(`categories.${value}`) : t('common.notProvided'));

  const getCreateErrorMessage = (error) => {
    if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
      return t('common.transactionRejected');
    }

    const message = String(error?.reason || error?.shortMessage || error?.message || '');

    if (message.includes('Goal must be > 0')) return t('createCampaign.errors.goalPositive');
    if (message.includes('Goal too high')) return t('createCampaign.errors.goalTooHigh');
    if (message.includes('Duration must be')) return t('createCampaign.errors.durationRange');
    if (message.includes('Title must be')) return t('createCampaign.errors.titleLength');
    if (message.includes('Description must be')) return t('createCampaign.errors.descriptionLength');
    if (message.includes('Image URI required')) return t('createCampaign.errors.imageRequired');
    if (message.includes('Too many pending')) return t('createCampaign.errors.tooManyPending');
    if (message.toLowerCase().includes('blacklisted')) return t('createCampaign.errors.blacklisted');

    return t('createCampaign.errors.createFailed');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateStep = (stepNum) => {
    switch (stepNum) {
      case 1:
        if (!formData.title.trim()) {
          toast.error(t('createCampaign.errors.titleRequired'));
          return false;
        }
        if (formData.title.length < 10 || formData.title.length > 200) {
          toast.error(t('createCampaign.errors.titleLength'));
          return false;
        }
        if (!formData.description.trim()) {
          toast.error(t('createCampaign.errors.descriptionRequired'));
          return false;
        }
        if (formData.description.length < 50) {
          toast.error(t('createCampaign.errors.descriptionLength'));
          return false;
        }
        if (!formData.category) {
          toast.error(t('createCampaign.errors.categoryRequired'));
          return false;
        }
        return true;
      case 2:
        if (!formData.goalAmount || parseFloat(formData.goalAmount) <= 0) {
          toast.error(t('createCampaign.errors.goalPositive'));
          return false;
        }
        if (parseFloat(formData.goalAmount) > 1000000) {
          toast.error(t('createCampaign.errors.goalLimit'));
          return false;
        }
        if (formData.durationDays < 7 || formData.durationDays > 90) {
          toast.error(t('createCampaign.errors.durationRange'));
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const prevStep = () => {
    setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!isConnected) {
      await connect();
      return;
    }

    if (!validateStep(1) || !validateStep(2)) return;

    setLoading(true);
    try {
      if (!provider) {
        toast.error(t('common.connectWalletFirst'));
        return;
      }

      // Ensure user is on BSC chain
      await ensureBSCChain(provider);

      const signer = await getSigner(provider);
      const factory = getFactory(signer);

      // Convert goal to wei
      const goalInWei = ethers.parseEther(formData.goalAmount);
      
      // Duration in days (contract expects days, not timestamp)
      const durationDays = parseInt(formData.durationDays);
      
      // Image URI (use placeholder if empty)
      const imageURI = formData.imageUrl || 'https://via.placeholder.com/400x300?text=Campaign';

      console.log('Creating campaign with:', {
        goal: goalInWei.toString(),
        durationDays,
        title: formData.title,
        description: formData.description,
        imageURI
      });

      toast.loading(t('createCampaign.toasts.creatingOnChain'), { id: 'tx' });
      
      // Call the correct function signature
      const tx = await factory.createCampaign(
        goalInWei,
        durationDays,
        formData.title,
        formData.description,
        imageURI
      );
      
      console.log('Transaction sent:', tx.hash);
      
      toast.loading(t('createCampaign.toasts.waitingConfirmation'), { id: 'tx' });
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);

      // Get campaign address from event
      let campaignAddress = '';
      for (const log of receipt.logs) {
        try {
          const parsedLog = factory.interface.parseLog(log);
          if (parsedLog?.name === 'CampaignCreated') {
            campaignAddress = parsedLog.args.campaign;
            console.log('Campaign created at:', campaignAddress);
            break;
          }
        } catch (e) {
          // Not our event, continue
        }
      }

      // Calculate the deadline timestamp for backend
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + (durationDays * 24 * 60 * 60);

      // Save to backend
      toast.loading(t('createCampaign.toasts.savingDetails'), { id: 'tx' });
      
      try {
        await campaignAPI.create({
          title: formData.title,
          description: formData.description,
          category: formData.category,
          goal_amount: goalInWei.toString(),
          deadline: new Date(deadlineTimestamp * 1000).toISOString(),
          image_url: imageURI,
          contract_address: campaignAddress,
          founder_address: user.address,
        });
        console.log('Campaign saved to backend');
      } catch (backendError) {
        console.error('Backend error (non-critical):', backendError);
        // Don't fail if backend save fails - the campaign is already on blockchain
      }

      toast.success(t('createCampaign.toasts.createdSuccess'), { id: 'tx' });
      navigate('/campaigns');
    } catch (error) {
      console.error('Error creating campaign:', error);

      toast.error(getCreateErrorMessage(error), { id: 'tx' });
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="create-campaign">
        <div className="container">
          <div className="connect-prompt">
            <div className="prompt-icon">🔐</div>
            <h2>{t('createCampaign.connectTitle')}</h2>
            <p>{t('createCampaign.connectBody')}</p>
            <button className="btn btn-primary btn-lg" onClick={connect}>
              {t('common.connectWallet')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="create-campaign">
      <div className="container">
        <div className="form-container">
          {/* Progress Steps */}
          <div className="progress-steps">
            <div className={`progress-step ${step >= 1 ? 'active' : ''}`}>
              <div className="step-number">1</div>
              <div className="step-label">{t('createCampaign.steps.details')}</div>
            </div>
            <div className="step-connector"></div>
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
              <div className="step-number">2</div>
              <div className="step-label">{t('createCampaign.steps.funding')}</div>
            </div>
            <div className="step-connector"></div>
            <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
              <div className="step-number">3</div>
              <div className="step-label">{t('createCampaign.steps.review')}</div>
            </div>
          </div>

          {/* Step 1: Campaign Details */}
          {step === 1 && (
            <div className="form-step">
              <h2>{t('createCampaign.detailsTitle')}</h2>
              <p className="step-description">{t('createCampaign.detailsBody')}</p>

              <div className="form-group">
                <label>{t('createCampaign.fields.title')} *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder={t('createCampaign.placeholders.title')}
                  maxLength={200}
                />
                <span className="char-count">{t('createCampaign.titleCount', { count: formData.title.length })}</span>
              </div>

              <div className="form-group">
                <label>{t('common.description')} *</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder={t('createCampaign.placeholders.description')}
                  rows={6}
                  maxLength={5000}
                />
                <span className="char-count">{t('createCampaign.descriptionCount', { count: formData.description.length })}</span>
              </div>

              <div className="form-group">
                <label>{t('common.category')} *</label>
                <div className="category-grid">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      className={`category-btn ${formData.category === cat ? 'selected' : ''}`}
                      onClick={() => setFormData(prev => ({ ...prev, category: cat }))}
                    >
                      {t(`categories.${cat}`)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>{t('createCampaign.fields.imageUrl')}</label>
                <input
                  type="url"
                  name="imageUrl"
                  value={formData.imageUrl}
                  onChange={handleChange}
                  placeholder={t('createCampaign.placeholders.imageUrl')}
                />
                <span className="input-hint">{t('createCampaign.imageHint')}</span>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={nextStep}>
                  {t('common.continue')} →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Funding Details */}
          {step === 2 && (
            <div className="form-step">
              <h2>{t('createCampaign.fundingTitle')}</h2>
              <p className="step-description">{t('createCampaign.fundingBody')}</p>

              <div className="form-group">
                <label>{t('createCampaign.fields.goalAmount')} *</label>
                <input
                  type="number"
                  name="goalAmount"
                  value={formData.goalAmount}
                  onChange={handleChange}
                  placeholder={t('createCampaign.placeholders.goalAmount')}
                  min="0.01"
                  max="1000"
                  step="0.01"
                />
                <span className="input-hint">{t('createCampaign.goalHint')}</span>
              </div>

              <div className="form-group">
                <label>{t('createCampaign.fields.durationDays')} *</label>
                <input
                  type="range"
                  name="durationDays"
                  value={formData.durationDays}
                  onChange={handleChange}
                  min="7"
                  max="90"
                />
                <div className="range-value">{t('createCampaign.durationValue', { count: formData.durationDays })}</div>
                <span className="input-hint">
                  {t('createCampaign.endsOn', {
                    date: new Date(Date.now() + formData.durationDays * 24 * 60 * 60 * 1000).toLocaleDateString(locale),
                  })}
                </span>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={prevStep}>
                  ← {t('common.back')}
                </button>
                <button type="button" className="btn btn-primary" onClick={nextStep}>
                  {t('common.continue')} →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="form-step">
              <h2>{t('createCampaign.reviewTitle')}</h2>
              <p className="step-description">{t('createCampaign.reviewBody')}</p>

              <div className="review-card">
                <div className="review-section">
                  <h3>{t('createCampaign.sections.campaignDetails')}</h3>
                  <div className="review-item">
                    <span className="label">{t('createCampaign.fields.title')}</span>
                    <span className="value">{formData.title}</span>
                  </div>
                  <div className="review-item">
                    <span className="label">{t('common.category')}</span>
                    <span className="value">{formatCategory(formData.category)}</span>
                  </div>
                  <div className="review-item">
                    <span className="label">{t('common.description')}</span>
                    <span className="value description">{formData.description}</span>
                  </div>
                </div>

                <div className="review-section">
                  <h3>{t('createCampaign.sections.fundingDetails')}</h3>
                  <div className="review-item">
                    <span className="label">{t('createCampaign.fields.goalAmount')}</span>
                    <span className="value">{formData.goalAmount} KGST</span>
                  </div>
                  <div className="review-item">
                    <span className="label">{t('createCampaign.fields.durationDays')}</span>
                    <span className="value">{t('createCampaign.durationValue', { count: formData.durationDays })}</span>
                  </div>
                  <div className="review-item">
                    <span className="label">{t('createCampaign.fields.endDate')}</span>
                    <span className="value">
                      {new Date(Date.now() + formData.durationDays * 24 * 60 * 60 * 1000).toLocaleDateString(locale)}
                    </span>
                  </div>
                </div>

                <div className="review-section">
                  <h3>{t('createCampaign.sections.media')}</h3>
                  <div className="review-item">
                    <span className="label">{t('createCampaign.fields.imageUrl')}</span>
                    <span className="value">{formData.imageUrl || t('common.notProvided')}</span>
                  </div>
                  {formData.imageUrl && (
                    <div className="review-image">
                      <img src={formData.imageUrl} alt={t('createCampaign.previewAlt')} />
                    </div>
                  )}
                </div>
              </div>

              <div className="notice">
                <span className="notice-icon">ℹ️</span>
                <div>
                  <strong>{t('createCampaign.noticeTitle')}</strong> {t('createCampaign.noticeBody')}
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={prevStep}>
                  ← {t('common.back')}
                </button>
                <button 
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? t('createCampaign.creating') : t('nav.createCampaign')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
