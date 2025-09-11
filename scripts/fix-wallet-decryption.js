const { Client } = require('pg');
const WalletManager = require('../src/wallet');
require('dotenv').config();

async function fixWalletDecryption() {
    const client = new Client({
        host: process.env.POSTGRES_HOST,
        port: process.env.POSTGRES_PORT,
        database: process.env.POSTGRES_DB_NAME,
        user: process.env.POSTGRES_USER,
        password: process.env.POSTGRES_PASSWORD,
    });

    const walletManager = new WalletManager();

    try {
        await client.connect();
        console.log('Connected to database');

        // Get all users with encrypted wallets
        const result = await client.query('SELECT telegram_id, encrypted_private_key, wallet_address FROM users');
        
        console.log(`Found ${result.rows.length} users to check`);

        for (const user of result.rows) {
            console.log(`\nChecking user ${user.telegram_id}...`);
            
            try {
                // Try to decrypt the wallet
                const wallet = await walletManager.getWallet(user.encrypted_private_key);
                console.log(`✅ User ${user.telegram_id}: Wallet decryption successful`);
                
                // Verify the address matches
                if (wallet.address.toLowerCase() !== user.wallet_address.toLowerCase()) {
                    console.log(`⚠️  User ${user.telegram_id}: Address mismatch!`);
                    console.log(`   DB Address: ${user.wallet_address}`);
                    console.log(`   Wallet Address: ${wallet.address}`);
                }
                
            } catch (error) {
                console.log(`❌ User ${user.telegram_id}: Decryption failed - ${error.message}`);
                
                // Generate new wallet for this user
                console.log(`🔄 Generating new wallet for user ${user.telegram_id}...`);
                
                const newWallet = await walletManager.generateWallet();
                
                // Update database with new wallet
                await client.query(
                    'UPDATE users SET wallet_address = $1, encrypted_private_key = $2, encrypted_mnemonic = $3 WHERE telegram_id = $4',
                    [newWallet.address, newWallet.encryptedPrivateKey, walletManager.encrypt(newWallet.mnemonic), user.telegram_id]
                );
                
                console.log(`✅ User ${user.telegram_id}: New wallet generated`);
                console.log(`   New Address: ${newWallet.address}`);
                console.log(`   Mnemonic: ${newWallet.mnemonic}`);
                console.log(`   ⚠️  User will need to transfer funds to new address!`);
            }
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await client.end();
    }
}

// Run the fix
fixWalletDecryption().catch(console.error);
