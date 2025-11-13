#!/usr/bin/env node

/**
 * Setup script for smart contracts
 * Run with: node scripts/setup.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up smart contracts...\n');

// Check if .env exists
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env file from template...');
  fs.copyFileSync(envExamplePath, envPath);
  console.log('✅ .env file created');
  console.log('⚠️  Please edit .env and add your private key and API keys!\n');
} else {
  console.log('✅ .env file already exists\n');
}

// Create deployments directory
const deploymentsDir = path.join(__dirname, '..', 'deployments');
if (!fs.existsSync(deploymentsDir)) {
  console.log('📁 Creating deployments directory...');
  fs.mkdirSync(deploymentsDir, { recursive: true });
  fs.mkdirSync(path.join(deploymentsDir, 'abi'), { recursive: true });
  console.log('✅ Deployments directory created\n');
}

// Check if node_modules exists
const nodeModulesPath = path.join(__dirname, '..', 'node_modules');
if (!fs.existsSync(nodeModulesPath)) {
  console.log('📦 Installing dependencies...');
  console.log('This may take a few minutes...\n');
  
  try {
    execSync('npm install', { 
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    console.log('\n✅ Dependencies installed\n');
  } catch (error) {
    console.error('❌ Failed to install dependencies');
    console.error('Please run: npm install');
    process.exit(1);
  }
} else {
  console.log('✅ Dependencies already installed\n');
}

// Compile contracts
console.log('🔨 Compiling contracts...');
try {
  execSync('npx hardhat compile', { 
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
  console.log('✅ Contracts compiled successfully\n');
} catch (error) {
  console.error('❌ Failed to compile contracts');
  process.exit(1);
}

// Print next steps
console.log('✨ Setup complete!\n');
console.log('Next steps:');
console.log('1. Edit .env and add your PRIVATE_KEY and API keys');
console.log('2. Get testnet tokens:');
console.log('   - Polygon Amoy: https://faucet.polygon.technology/');
console.log('   - opBNB Testnet: https://opbnb-testnet-bridge.bnbchain.org/');
console.log('3. Run tests: npm test');
console.log('4. Deploy to testnet: npm run deploy:mumbai');
console.log('\n📚 Check README.md for more information');
