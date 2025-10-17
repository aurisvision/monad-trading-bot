const { ethers } = require('ethers');
const bip39 = require('bip39');
const UnifiedSecuritySystem = require('./security/UnifiedSecuritySystem');
const RPCManager = require('./utils/RPCManager');

class WalletManager {
    constructor(redis, database) {
        // Use unified security system instead of duplicate encryption
        this.security = new UnifiedSecuritySystem(redis, database);
        
        // Initialize RPC manager with fallback support
        this.rpcManager = new RPCManager();
        
        console.log('WalletManager initialized with unified security system and RPC fallback');
    }

    // Generate a new wallet
    async generateWallet() {
        try {
            // Generate mnemonic
            const mnemonic = bip39.generateMnemonic();
            
            // Create wallet from mnemonic
            const wallet = ethers.Wallet.fromPhrase(mnemonic);
            
            // Encrypt private key using unified security system
            const encryptedPrivateKey = this.security.encrypt(wallet.privateKey, 'wallet_generation');
            
            // ✅ SECURITY: Never return unencrypted private keys or mnemonics
            const result = {
                address: wallet.address,
                encryptedPrivateKey,
                encryptedMnemonic: this.security.encrypt(mnemonic, 'wallet_generation')
                // privateKey: REMOVED for security - never expose raw private keys
                // mnemonic: REMOVED for security - never expose raw mnemonics
            };
            
            // Secure memory wipe using unified security system
            this.security.secureWipeMemory(wallet.privateKey);
            this.security.secureWipeMemory(mnemonic);
            
            return result;
        } catch (error) {
            console.error('Error generating wallet', error);
            throw new Error('Failed to generate wallet');
        }
    }

    // Import wallet from private key
    async importFromPrivateKey(privateKey) {
        try {
            if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
                throw new Error('Invalid private key format');
            }
            
            const wallet = new ethers.Wallet(privateKey);
            const encryptedPrivateKey = this.security.encrypt(wallet.privateKey, 'wallet_import');
            
            // ✅ SECURITY FIX: Never return unencrypted private keys
            const result = {
                address: wallet.address,
                encryptedPrivateKey,
                encryptedMnemonic: null // No mnemonic for private key imports
                // privateKey: REMOVED for security - never expose raw private keys
            };
            
            // Secure memory wipe using unified security system
            this.security.secureWipeMemory(wallet.privateKey);
            this.security.secureWipeMemory(privateKey);
            
            return result;
        } catch (error) {
            secureLogger.error('Error importing from private key', error);
            throw new Error('Failed to import from private key: ' + error.message);
        }
    }

    // Import wallet from mnemonic
    async importFromMnemonic(mnemonic) {
        try {
            const words = mnemonic.trim().split(' ');
            if ((words.length !== 12 && words.length !== 24) || !bip39.validateMnemonic(mnemonic)) {
                throw new Error('Invalid mnemonic phrase');
            }
            
            const wallet = ethers.Wallet.fromPhrase(mnemonic);
            const encryptedPrivateKey = this.security.encrypt(wallet.privateKey, 'wallet_import');
            const encryptedMnemonic = this.security.encrypt(mnemonic, 'wallet_import');
            
            // ✅ SECURITY FIX: Never return unencrypted private keys or mnemonics
            const result = {
                address: wallet.address,
                encryptedPrivateKey,
                encryptedMnemonic
                // privateKey: REMOVED for security - never expose raw private keys
                // mnemonic: REMOVED for security - never expose raw mnemonics
            };
            
            // Secure memory wipe of sensitive data
            this.security.secureWipeMemory(wallet.privateKey);
            this.security.secureWipeMemory(mnemonic);
            
            return result;
        } catch (error) {
            secureLogger.error('Error importing from mnemonic', error);
            throw new Error('Failed to import from mnemonic: ' + error.message);
        }
    }

    // Import wallet from private key or mnemonic
    async importWallet(input) {
        try {
            let wallet;
            
            // Check if input is a mnemonic (12 or 24 words)
            const words = input.trim().split(' ');
            if ((words.length === 12 || words.length === 24) && bip39.validateMnemonic(input)) {
                wallet = ethers.Wallet.fromPhrase(input);
            } else if (input.startsWith('0x') && input.length === 66) {
                // Private key
                wallet = new ethers.Wallet(input);
            } else {
                throw new Error('Invalid private key or mnemonic phrase');
            }

            // Encrypt private key and mnemonic if available using unified security
            const encryptedPrivateKey = this.security.encrypt(wallet.privateKey, 'wallet_import');
            const mnemonic = (words.length === 12 || words.length === 24) ? input : null;
            const encryptedMnemonic = mnemonic ? this.security.encrypt(mnemonic, 'wallet_import') : null;
            
            // ✅ SECURITY FIX: Never return unencrypted private keys or mnemonics
            const result = {
                address: wallet.address,
                encryptedPrivateKey,
                encryptedMnemonic: encryptedMnemonic
                // privateKey: REMOVED for security - never expose raw private keys
                // mnemonic: REMOVED for security - never expose raw mnemonics
            };
            
            // Secure memory wipe of sensitive data
            this.security.secureWipeMemory(wallet.privateKey);
            this.security.secureWipeMemory(mnemonic);
            
            return result;
        } catch (error) {
            secureLogger.error('Error importing wallet', error);
            throw new Error('Failed to import wallet: ' + error.message);
        }
    }

    // Get wallet instance from encrypted private key
    async getWallet(encryptedPrivateKey) {
        try {
            const privateKey = this.security.decrypt(encryptedPrivateKey, 'wallet_access');
            
            // Check if decryption failed
            if (privateKey === 'DECRYPTION_FAILED_PLEASE_REGENERATE_WALLET') {
                throw new Error('Wallet decryption failed. Please regenerate your wallet.');
            }
            
            return new ethers.Wallet(privateKey);
        } catch (error) {
            secureLogger.error('Error getting wallet', error);
            if (error.message.includes('DECRYPTION_FAILED') || error.message.includes('bad decrypt')) {
                throw new Error('Wallet decryption failed. Please regenerate your wallet.');
            }
            throw new Error('Failed to decrypt wallet');
        }
    }

    // Get wallet with provider
    async getWalletWithProvider(encryptedPrivateKey) {
        try {
            const wallet = await this.getWallet(encryptedPrivateKey);
            
            // Get provider with fallback support
            const provider = await this.rpcManager.getProvider();
            const connectedWallet = new ethers.Wallet(wallet.privateKey, provider);
            
            return connectedWallet;
        } catch (error) {
            secureLogger.error('Error getting wallet with provider', error);
            throw new Error('Failed to connect wallet to provider');
        }
    }

    // ✅ REMOVED: Encryption functions moved to UnifiedSecuritySystem to avoid duplication

    // Validate Ethereum address
    isValidAddress(address) {
        return ethers.isAddress(address);
    }

    // Get wallet balance
    async getBalance(walletAddress) {
        try {
            // Validate address format first
            if (!walletAddress || typeof walletAddress !== 'string') {
                secureLogger.warn('Invalid wallet address provided', { addressType: typeof walletAddress });
                return '0.000000';
            }

            if (!ethers.isAddress(walletAddress)) {
                secureLogger.warn('Invalid wallet address format', { address: 'REDACTED' });
                return '0.000000';
            }

            // Use RPC manager with fallback
            const balance = await this.rpcManager.executeWithFallback(
                async (provider) => {
                    return await provider.getBalance(walletAddress);
                },
                'GET_BALANCE'
            );
            
            return ethers.formatEther(balance);
        } catch (error) {
            secureLogger.error('Error getting balance', error);
            return '0.000000'; // Return 0 instead of throwing error
        }
    }

    // Send MON to another address
    async sendMON(encryptedPrivateKey, toAddress, amount) {
        try {
            const wallet = await this.getWalletWithProvider(encryptedPrivateKey);
            
            // Validate recipient address
            if (!this.isValidAddress(toAddress)) {
                throw new Error('Invalid recipient address');
            }

            // Convert amount to wei
            const amountWei = ethers.parseEther(amount.toString());

            // Get current gas price using getFeeData for ethers v6 compatibility
            const feeData = await wallet.provider.getFeeData();
            const gasPrice = feeData.gasPrice;

            // Estimate gas limit
            const gasLimit = await wallet.estimateGas({
                to: toAddress,
                value: amountWei
            });

            // Create transaction
            const tx = {
                to: toAddress,
                value: amountWei,
                gasLimit: gasLimit,
                gasPrice: gasPrice
            };

            // Send transaction
            const txResponse = await wallet.sendTransaction(tx);
            
            return {
                success: true,
                transactionHash: txResponse.hash,
                txHash: txResponse.hash,
                from: wallet.address,
                to: toAddress,
                amount: amount,
                gasLimit: gasLimit.toString(),
                gasPrice: gasPrice.toString()
            };
        } catch (error) {
            secureLogger.error('Error sending MON', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Sign transaction
    async signTransaction(encryptedPrivateKey, transaction) {
        try {
            const wallet = await this.getWallet(encryptedPrivateKey);
            return await wallet.signTransaction(transaction);
        } catch (error) {
            secureLogger.error('Error signing transaction', error);
            throw new Error('Failed to sign transaction');
        }
    }

    // Get transaction receipt
    async getTransactionReceipt(txHash) {
        try {
            // Use RPC manager with fallback for transaction receipt
            return await this.rpcManager.executeWithFallback(
                async (provider) => {
                    return await provider.getTransactionReceipt(txHash);
                },
                'GET_TRANSACTION_RECEIPT'
            );
        } catch (error) {
            secureLogger.error('Error getting transaction receipt', error);
            return null;
        }
    }

    // Wait for transaction confirmation
    async waitForTransaction(txHash, confirmations = 1) {
        try {
            // Use RPC manager with fallback for transaction waiting
            return await this.rpcManager.executeWithFallback(
                async (provider) => {
                    return await provider.waitForTransaction(txHash, confirmations);
                },
                'WAIT_FOR_TRANSACTION'
            );
        } catch (error) {
            secureLogger.error('Error waiting for transaction', error);
            throw new Error('Transaction confirmation failed');
        }
    }

    // ✅ REMOVED: secureWipeMemory moved to UnifiedSecuritySystem to avoid duplication
}

module.exports = WalletManager;
