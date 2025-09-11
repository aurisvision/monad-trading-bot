const { ethers } = require('ethers');
const bip39 = require('bip39');
const crypto = require('crypto');

class WalletManager {
    constructor() {
        const key = process.env.ENCRYPTION_KEY;
        if (!key) {
            throw new Error('ENCRYPTION_KEY environment variable is required');
        }
        
        if (typeof key !== 'string') {
            throw new Error('ENCRYPTION_KEY must be a string');
        }
        
        if (key.length !== 32) {
            throw new Error(`ENCRYPTION_KEY must be exactly 32 characters long, got ${key.length}`);
        }
        
        this.encryptionKey = key;
    }

    // Generate a new wallet
    async generateWallet() {
        try {
            // Generate mnemonic
            const mnemonic = bip39.generateMnemonic();
            
            // Create wallet from mnemonic
            const wallet = ethers.Wallet.fromPhrase(mnemonic);
            
            // Encrypt private key
            const encryptedPrivateKey = this.encrypt(wallet.privateKey);
            
            return {
                address: wallet.address,
                privateKey: wallet.privateKey,
                encryptedPrivateKey,
                mnemonic
            };
        } catch (error) {
            console.error('Error generating wallet:', error);
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
            const encryptedPrivateKey = this.encrypt(wallet.privateKey);
            
            return {
                address: wallet.address,
                privateKey: wallet.privateKey,
                encryptedPrivateKey,
                mnemonic: null,
                encryptedMnemonic: null
            };
        } catch (error) {
            console.error('Error importing from private key:', error);
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
            const encryptedPrivateKey = this.encrypt(wallet.privateKey);
            const encryptedMnemonic = this.encrypt(mnemonic);
            
            return {
                address: wallet.address,
                privateKey: wallet.privateKey,
                encryptedPrivateKey,
                mnemonic: mnemonic,
                encryptedMnemonic: encryptedMnemonic
            };
        } catch (error) {
            console.error('Error importing from mnemonic:', error);
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

            // Encrypt private key and mnemonic if available
            const encryptedPrivateKey = this.encrypt(wallet.privateKey);
            const mnemonic = (words.length === 12 || words.length === 24) ? input : null;
            const encryptedMnemonic = mnemonic ? this.encrypt(mnemonic) : null;
            
            return {
                address: wallet.address,
                privateKey: wallet.privateKey,
                encryptedPrivateKey,
                mnemonic: mnemonic,
                encryptedMnemonic: encryptedMnemonic
            };
        } catch (error) {
            console.error('Error importing wallet:', error);
            throw new Error('Failed to import wallet: ' + error.message);
        }
    }

    // Get wallet instance from encrypted private key
    async getWallet(encryptedPrivateKey) {
        try {
            const privateKey = this.decrypt(encryptedPrivateKey);
            
            // Check if decryption failed
            if (privateKey === 'DECRYPTION_FAILED_PLEASE_REGENERATE_WALLET') {
                throw new Error('Wallet decryption failed. Please regenerate your wallet.');
            }
            
            return new ethers.Wallet(privateKey);
        } catch (error) {
            console.error('Error getting wallet:', error);
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
            
            // Configure Monad testnet provider with proper network settings
            const provider = new ethers.JsonRpcProvider(
                process.env.MONAD_RPC_URL,
                {
                    chainId: parseInt(process.env.CHAIN_ID),
                    name: 'monad-testnet'
                }
            );
            
            const connectedWallet = new ethers.Wallet(wallet.privateKey, provider);
            
            // Silent connection test
            try {
                await provider.getNetwork();
            } catch (walletError) {
                console.error('Wallet connection test failed');
            }
            
            return connectedWallet;
        } catch (error) {
            console.error('Error getting wallet with provider:', error);
            throw new Error('Failed to connect wallet to provider');
        }
    }

    // Encrypt private key
    encrypt(text) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey), iv);
            let encrypted = cipher.update(text, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            return iv.toString('hex') + ':' + encrypted;
        } catch (error) {
            console.error('Error encrypting:', error);
            throw new Error('Encryption failed');
        }
    }

    // Decrypt private key
    decrypt(encryptedData) {
        try {
            // Handle both old and new encryption formats
            if (!encryptedData || typeof encryptedData !== 'string') {
                throw new Error('Invalid encrypted data');
            }

            // Check if it's the new format (iv:encrypted)
            if (encryptedData.includes(':')) {
                const parts = encryptedData.split(':');
                if (parts.length !== 2) {
                    throw new Error('Invalid encrypted data format');
                }
                
                const iv = Buffer.from(parts[0], 'hex');
                const encrypted = parts[1];
                const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.encryptionKey), iv);
                let decrypted = decipher.update(encrypted, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                return decrypted;
            } else {
                // Old format - return as is (assuming it's already decrypted or plain text)
                return encryptedData;
            }
        } catch (error) {
            console.error('Error decrypting:', error);
            // Return a placeholder for failed decryption
            return 'DECRYPTION_FAILED_PLEASE_REGENERATE_WALLET';
        }
    }

    // Validate Ethereum address
    isValidAddress(address) {
        return ethers.isAddress(address);
    }

    // Get wallet balance
    async getBalance(walletAddress) {
        try {
            // Validate address format first
            if (!walletAddress || typeof walletAddress !== 'string') {
                console.error('Invalid wallet address provided:', walletAddress);
                return '0.000000';
            }

            if (!ethers.isAddress(walletAddress)) {
                console.error('Invalid wallet address format:', walletAddress);
                return '0.000000';
            }

            const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL, {
                chainId: 10143,
                name: 'monad-testnet'
            });
            
            const balance = await provider.getBalance(walletAddress);
            return ethers.formatEther(balance);
        } catch (error) {
            console.error('Error getting balance:', error);
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

            // Get current gas price
            const gasPrice = await wallet.provider.getGasPrice();

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
                txHash: txResponse.hash,
                from: wallet.address,
                to: toAddress,
                amount: amount,
                gasLimit: gasLimit.toString(),
                gasPrice: gasPrice.toString()
            };
        } catch (error) {
            console.error('Error sending MON:', error);
            throw new Error('Failed to send MON: ' + error.message);
        }
    }

    // Sign transaction
    async signTransaction(encryptedPrivateKey, transaction) {
        try {
            const wallet = await this.getWallet(encryptedPrivateKey);
            return await wallet.signTransaction(transaction);
        } catch (error) {
            console.error('Error signing transaction:', error);
            throw new Error('Failed to sign transaction');
        }
    }

    // Get transaction receipt
    async getTransactionReceipt(txHash) {
        try {
            const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
            return await provider.getTransactionReceipt(txHash);
        } catch (error) {
            console.error('Error getting transaction receipt:', error);
            return null;
        }
    }

    // Wait for transaction confirmation
    async waitForTransaction(txHash, confirmations = 1) {
        try {
            const provider = new ethers.JsonRpcProvider(process.env.MONAD_RPC_URL);
            return await provider.waitForTransaction(txHash, confirmations);
        } catch (error) {
            console.error('Error waiting for transaction:', error);
            throw new Error('Transaction confirmation failed');
        }
    }
}

module.exports = WalletManager;
