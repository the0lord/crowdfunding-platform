-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    wallet_address VARCHAR(42) NOT NULL UNIQUE,
    username VARCHAR(255),
    email VARCHAR(255),
    bio TEXT,
    avatar_url TEXT,
    
    kyc_verified BOOLEAN DEFAULT FALSE,
    kyc_provider VARCHAR(100),
    kyc_verified_at TIMESTAMP WITH TIME ZONE,
    
    reputation_score INTEGER DEFAULT 0
);

CREATE INDEX idx_users_wallet_address ON users(wallet_address);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_deleted_at ON users(deleted_at);

-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    contract_address VARCHAR(42) NOT NULL UNIQUE,
    founder_address VARCHAR(42) NOT NULL,
    
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT,
    goal_amount VARCHAR(78) NOT NULL,
    deadline TIMESTAMP WITH TIME ZONE NOT NULL,
    
    state VARCHAR(50) DEFAULT 'Active',
    total_raised VARCHAR(78) DEFAULT '0',
    contributor_count INTEGER DEFAULT 0,
    
    moderation_status VARCHAR(50) DEFAULT 'pending',
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by VARCHAR(42),
    rejection_reason TEXT,
    flag_count INTEGER DEFAULT 0,
    
    category VARCHAR(100),
    tags TEXT
);

CREATE INDEX idx_campaigns_contract_address ON campaigns(contract_address);
CREATE INDEX idx_campaigns_founder_address ON campaigns(founder_address);
CREATE INDEX idx_campaigns_state ON campaigns(state);
CREATE INDEX idx_campaigns_moderation_status ON campaigns(moderation_status);
CREATE INDEX idx_campaigns_category ON campaigns(category);
CREATE INDEX idx_campaigns_deleted_at ON campaigns(deleted_at);

-- Create contributions table
CREATE TABLE IF NOT EXISTS contributions (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    transaction_hash VARCHAR(66) NOT NULL UNIQUE,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    contributor_address VARCHAR(42) NOT NULL,
    
    amount VARCHAR(78) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    refunded BOOLEAN DEFAULT FALSE,
    refunded_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_contributions_transaction_hash ON contributions(transaction_hash);
CREATE INDEX idx_contributions_campaign_id ON contributions(campaign_id);
CREATE INDEX idx_contributions_contributor_address ON contributions(contributor_address);
CREATE INDEX idx_contributions_deleted_at ON contributions(deleted_at);

-- Create campaign_updates table
CREATE TABLE IF NOT EXISTS campaign_updates (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL
);

CREATE INDEX idx_campaign_updates_campaign_id ON campaign_updates(campaign_id);
CREATE INDEX idx_campaign_updates_deleted_at ON campaign_updates(deleted_at);

-- Create moderation_logs table
CREATE TABLE IF NOT EXISTS moderation_logs (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    moderator_address VARCHAR(42) NOT NULL,
    action VARCHAR(50) NOT NULL,
    reason TEXT
);

CREATE INDEX idx_moderation_logs_campaign_id ON moderation_logs(campaign_id);
CREATE INDEX idx_moderation_logs_moderator_address ON moderation_logs(moderator_address);

-- Create blacklisted_addresses table
CREATE TABLE IF NOT EXISTS blacklisted_addresses (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    address VARCHAR(42) NOT NULL UNIQUE,
    reason TEXT NOT NULL,
    blacklisted_by VARCHAR(42) NOT NULL
);

CREATE INDEX idx_blacklisted_addresses_address ON blacklisted_addresses(address);
CREATE INDEX idx_blacklisted_addresses_deleted_at ON blacklisted_addresses(deleted_at);
