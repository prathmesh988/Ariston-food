/**
 * createAdmin.js
 * --------------
 * Creates or updates an admin user in MongoDB.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';
import { FoodAdmin } from '../src/core/admin/admin.model.js';

const ADMIN_EMAIL = 'AristontheOasis1@gmail.com';
const ADMIN_PASSWORD = 'Aristoncafe@2026';
const ADMIN_NAME = 'Ariston Admin';

async function main() {
    if (!config.mongodbUri) {
        console.error('[createAdmin] MONGO_URI / MONGODB_URI not found in env');
        process.exit(1);
    }

    console.log('[createAdmin] Connecting to MongoDB…');
    await mongoose.connect(config.mongodbUri, {
        serverSelectionTimeoutMS: 15000,
    });
    console.log('[createAdmin] Connected to MongoDB.');

    const normalizedEmail = ADMIN_EMAIL.trim().toLowerCase();
    let admin = await FoodAdmin.findOne({ email: normalizedEmail });

    if (admin) {
        console.log(`[createAdmin] Admin "${normalizedEmail}" already exists. Updating password and permissions…`);
        admin.password = ADMIN_PASSWORD;
        admin.name = ADMIN_NAME;
        admin.role = 'ADMIN';
        admin.isActive = true;
        admin.servicesAccess = ['food', 'quickCommerce', 'taxi'];
        await admin.save();
        console.log(`[createAdmin] ✅ Admin "${normalizedEmail}" updated successfully.`);
    } else {
        console.log(`[createAdmin] Creating new admin "${normalizedEmail}"…`);
        admin = new FoodAdmin({
            email: normalizedEmail,
            password: ADMIN_PASSWORD,
            name: ADMIN_NAME,
            role: 'ADMIN',
            isActive: true,
            servicesAccess: ['food', 'quickCommerce', 'taxi'],
        });
        await admin.save();
        console.log(`[createAdmin] ✅ Admin "${normalizedEmail}" created successfully.`);
    }

    // Verify password comparison
    const isMatch = await admin.comparePassword(ADMIN_PASSWORD);
    console.log(`[createAdmin] Verification: comparePassword("${ADMIN_PASSWORD}") ->`, isMatch);

    await mongoose.disconnect();
    console.log('[createAdmin] Disconnected from MongoDB. Done!');
}

main().catch((err) => {
    console.error('[createAdmin] Error:', err);
    process.exit(1);
});
