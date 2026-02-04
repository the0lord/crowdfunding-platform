import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ethers } from 'ethers';
import { useAuth } from '../contexts/AuthContext';
import { campaignAPI } from '../services/api';
import toast from 'react-hot-toast';
import './CreateCampaign.css';

const FACTORY_ADDRESS = '0x94B09c15E4E8f96D23883E1b24fD872EA6e06EF0';
const FACTORY_ABI = [
  "function createCampaign(uint256 _goalAmount, uint256 _durationDays, string memory _title, string memory _description, string memory_imageURI) external returns (address)",
  "event CampaignCreated(address indexed campaign, address indexed founder, uint256 goalAmount, uint256 deadline, uint256 campaignId)"
];

const categories = [
  'Technology',
  'Creative',
  'Community',
  'Education',
  'Environment',
  'Health',
  'Other'
];

export default function CreateCampaign() {
  const { user, isConnected, connect } = useAuth();
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateStep = (stepNum) => {
    switch (stepNum) {
      case 1:
        if (!formData.title.trim()) {
          toast.error('Title is required');
          return false;
        }
        if (formData.title.length < 10 || formData.title.length > 200) {
          toast.error('Title must be 10-200 characters');
          return false;
        }
        if (!formData.description.trim()) {
          toast.error('Description is required');
          return false;
        }
        if (formData.description.length < 50) {
          toast.error('Description must be at least 50 characters');
          return false;
        }
        if (!formData.category) {
          toast.error('Please select a category');
          return false;
        }
        return true;
      case 2:
        if (!formData.goalAmount || parseFloat(formData.goalAmount) <= 0) {
          toast.error('Goal amount must be greater than 0');
          return false;
        }
        if (parseFloat(formData.goalAmount) > 1000) {
          toast.error('Goal amount cannot exceed 1000 POL');
          return false;
        }
        if (formData.durationDays < 7 || formData.durationDays > 90) {
          toast.error('Duration must be between 7 and 90 days');
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
      // Check if MetaMask is available
      if (!window.ethereum) {
        toast.error('Please install MetaMask to create a campaign');
        return;
      }

      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, signer);

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

      toast.loading('Creating campaign on blockchain...', { id: 'tx' });
      
      // Call the correct function signature
      const tx = await factory.createCampaign(
        goalInWei,
        durationDays,
        formData.title,
        formData.description,
        imageURI
      );
      
      console.log('Transaction sent:', tx.hash);
      
      toast.loading('Waiting for confirmation...', { id: 'tx' });
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
      toast.loading('Saving campaign details...', { id: 'tx' });
      
      try {
        await campaignAPI.create({
          title: formData.title,
          description: formData.description,
          category: formData.category.toLowerCase(),
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

      toast.success('Campaign created successfully!', { id: 'tx' });
      navigate('/campaigns');
    } catch (error) {
      console.error('Error creating campaign:', error);
      
      // Parse error message
      let errorMessage = 'Failed to create campaign';
      if (error.code === 'ACTION_REJECTED' || error.code === 4001) {
        errorMessage = 'Transaction was rejected';
      } else if (error.reason) {
        errorMessage = error.reason;
      } else if (error.message) {
        // Extract meaningful part of error
        if (error.message.includes('Goal must be > 0')) {
          errorMessage = 'Goal amount must be greater than 0';
        } else if (error.message.includes('Goal too high')) {
          errorMessage = 'Goal amount is too high (max 1000 POL)';
        } else if (error.message.includes('Duration must be')) {
          errorMessage = 'Duration must be between 7 and 90 days';
        } else if (error.message.includes('Title must be')) {
          errorMessage = 'Title must be 10-200 characters';
        } else if (error.message.includes('Description must be')) {
          errorMessage = 'Description must be at least 50 characters';
        } else if (error.message.includes('Image URI required')) {
          errorMessage = 'Image URL is required';
        } else if (error.message.includes('Too many pending')) {
          errorMessage = 'You have too many pending campaigns (max 3)';
        } else if (error.message.includes('blacklisted')) {
          errorMessage = 'Your address has been blacklisted';
        } else {
          errorMessage = error.message.substring(0, 100);
        }
      }
      
      toast.error(errorMessage, { id: 'tx' });
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
            <h2>Connect Your Wallet</h2>
            <p>You need to connect your wallet to create a campaign</p>
            <button className="btn btn-primary btn-lg" onClick={connect}>
              Connect Wallet
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
              <div className="step-label">Details</div>
            </div>
            <div className="step-connector"></div>
            <div className={`progress-step ${step >= 2 ? 'active' : ''}`}>
              <div className="step-number">2</div>
              <div className="step-label">Funding</div>
            </div>
            <div className="step-connector"></div>
            <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
              <div className="step-number">3</div>
              <div className="step-label">Review</div>
            </div>
          </div>

          {/* Step 1: Campaign Details */}
          {step === 1 && (
            <div className="form-step">
              <h2>Campaign Details</h2>
              <p className="step-description">
                Tell us about your campaign. Make it compelling!
              </p>

              <div className="form-group">
                <label>Campaign Title *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleChange}
                  placeholder="Enter a catchy title for your campaign"
                  maxLength={200}
                />
                <span className="char-count">{formData.title.length}/200 (min 10)</span>
              </div>

              <div className="form-group">
                <label>Description *</label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe your campaign in detail. What are you building? Why should people contribute?"
                  rows={6}
                  maxLength={5000}
                />
                <span className="char-count">{formData.description.length}/5000 (min 50)</span>
              </div>

              <div className="form-group">
                <label>Category *</label>
                <div className="category-grid">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      className={`category-btn ${formData.category === cat ? 'selected' : ''}`}
                      onClick={() => setFormData(prev => ({ ...prev, category: cat }))}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Campaign Image URL *</label>
                <input
                  type="url"
                  name="imageUrl"
                  value={formData.imageUrl}
                  onChange={handleChange}
                  placeholder="https://example.com/image.jpg"
                />
                <span className="input-hint">Required - URL to your campaign's cover image</span>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-primary" onClick={nextStep}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Funding Details */}
          {step === 2 && (
            <div className="form-step">
              <h2>Funding Details</h2>
              <p className="step-description">
                Set your funding goal and campaign duration
              </p>

              <div className="form-group">
                <label>Funding Goal (POL) *</label>
                <input
                  type="number"
                  name="goalAmount"
                  value={formData.goalAmount}
                  onChange={handleChange}
                  placeholder="10"
                  min="0.01"
                  max="1000"
                  step="0.01"
                />
                <span className="input-hint">Range: 0.01 - 1000 POL</span>
              </div>

              <div className="form-group">
                <label>Campaign Duration (Days) *</label>
                <input
                  type="range"
                  name="durationDays"
                  value={formData.durationDays}
                  onChange={handleChange}
                  min="7"
                  max="90"
                />
                <div className="range-value">{formData.durationDays} days</div>
                <span className="input-hint">
                  Campaign will end on: {new Date(Date.now() + formData.durationDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                </span>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={prevStep}>
                  ← Back
                </button>
                <button type="button" className="btn btn-primary" onClick={nextStep}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="form-step">
              <h2>Review Your Campaign</h2>
              <p className="step-description">
                Make sure everything looks good before creating
              </p>

              <div className="review-card">
                <div className="review-section">
                  <h3>Campaign Details</h3>
                  <div className="review-item">
                    <span className="label">Title</span>
                    <span className="value">{formData.title}</span>
                  </div>
                  <div className="review-item">
                    <span className="label">Category</span>
                    <span className="value">{formData.category}</span>
                  </div>
                  <div className="review-item">
                    <span className="label">Description</span>
                    <span className="value description">{formData.description}</span>
                  </div>
                </div>

                <div className="review-section">
                  <h3>Funding Details</h3>
                  <div className="review-item">
                    <span className="label">Goal Amount</span>
                    <span className="value">{formData.goalAmount} POL</span>
                  </div>
                  <div className="review-item">
                    <span className="label">Duration</span>
                    <span className="value">{formData.durationDays} days</span>
                  </div>
                  <div className="review-item">
                    <span className="label">End Date</span>
                    <span className="value">
                      {new Date(Date.now() + formData.durationDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="review-section">
                  <h3>Media</h3>
                  <div className="review-item">
                    <span className="label">Image URL</span>
                    <span className="value">{formData.imageUrl || 'Not provided'}</span>
                  </div>
                  {formData.imageUrl && (
                    <div className="review-image">
                      <img src={formData.imageUrl} alt="Campaign preview" />
                    </div>
                  )}
                </div>
              </div>

              <div className="notice">
                <span className="notice-icon">ℹ️</span>
                <div>
                  <strong>Please note:</strong> Your campaign will need to be approved by moderators before going live.
                  This usually takes 24-48 hours.
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={prevStep}>
                  ← Back
                </button>
                <button 
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={loading}
                >
                  {loading ? 'Creating...' : 'Create Campaign'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
