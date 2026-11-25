/**
 * seedDefaultRestaurant.js
 * ------------------------
 * Idempotent seed script for the Ariston Cafe default restaurant.
 *
 * Usage:
 *   node scripts/seedDefaultRestaurant.js
 *   node scripts/seedDefaultRestaurant.js --with-owner
 *
 * Environment variables (read from .env):
 *   DEFAULT_RESTAURANT_ID   = 650000000000000000a15701  (must match SINGLE-VENDOR-CONVERSION spec)
 *   SEED_OWNER_EMAIL        = owner@example.com          (required with --with-owner)
 *   SEED_OWNER_PASSWORD     = SecurePass123!             (required with --with-owner)
 *
 * Run twice — it is idempotent: second run prints "already existed" and exits 0.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config/env.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_RESTAURANT_ID = '650000000000000000a15701';
const RESTAURANT_NAME = 'Ariston Cafe';
const RESTAURANT_SLUG = 'ariston-cafe';

// ─── Mongoose model (inline to keep script self-contained) ────────────────────
// We import the real model — it already has all indexes and hooks.
// Dynamic import after DB connect to avoid running model setup before connection.

// ─── Helpers ──────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[seed] ${msg}`); }
function err(msg) { console.error(`[seed:error] ${msg}`); }

// ─── Main ─────────────────────────────────────────────────────────────────────

const withOwner = process.argv.includes('--with-owner');

async function main() {
    // 1. Validate env
    if (!config.mongodbUri) {
        err('MONGO_URI / MONGODB_URI is not set in .env');
        process.exit(1);
    }

    if (withOwner) {
        if (!process.env.SEED_OWNER_EMAIL || !process.env.SEED_OWNER_PASSWORD) {
            err('--with-owner requires SEED_OWNER_EMAIL and SEED_OWNER_PASSWORD in .env');
            process.exit(1);
        }
    }

    // 2. Connect to MongoDB
    log(`Connecting to MongoDB…`);
    await mongoose.connect(config.mongodbUri, {
        serverSelectionTimeoutMS: 15000,
    });
    log('Connected.');

    // 3. Import models after connection
    const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');

    // 4. Upsert restaurant
    const restaurantId = new mongoose.Types.ObjectId(DEFAULT_RESTAURANT_ID);

    // Check if already exists first (for clean idempotency reporting)
    const existing = await FoodRestaurant.findById(restaurantId).lean();

    const restaurantPayload = {
        restaurantName: RESTAURANT_NAME,
        slug: RESTAURANT_SLUG,
        ownerName: 'Ariston Owner',
        ownerEmail: process.env.SEED_OWNER_EMAIL || '',
        ownerPhone: '',
        pureVegRestaurant: false,
        cuisines: ['Multi-Cuisine', 'Indian', 'Continental'],
        city: 'Your City',
        state: 'Your State',
        area: 'Your Area',
        status: 'approved',
        approvedAt: new Date(),
        isAcceptingOrders: true,
        estimatedDeliveryTime: '30-45 mins',
        // Commission = 0 in single-vendor (platform owns the restaurant)
        commissionPercentage: 0,
        gstRegistered: false,
        diningSettings: { isEnabled: false, maxGuests: 6, diningType: [] },
        takeawaySettings: { isEnabled: true },
    };

    let wasCreated = false;

    if (!existing) {
        // Create with the pinned _id
        const doc = new FoodRestaurant({ _id: restaurantId, ...restaurantPayload });
        await doc.save();
        wasCreated = true;
        log(`✅ Restaurant CREATED: "${RESTAURANT_NAME}" (${DEFAULT_RESTAURANT_ID})`);
    } else {
        // Update only status/approval flags, leave editable fields untouched
        await FoodRestaurant.findByIdAndUpdate(
            restaurantId,
            {
                $set: {
                    status: 'approved',
                    approvedAt: existing.approvedAt || new Date(),
                    commissionPercentage: 0,
                },
                // $setOnInsert only runs on insert; since doc exists this is a no-op
                // but we keep the structure for reference.
            },
            { new: true }
        );
        log(`ℹ️  Restaurant ALREADY EXISTS: "${existing.restaurantName}" (${DEFAULT_RESTAURANT_ID})`);
    }

    // 5. Optional: create owner admin account
    if (withOwner) {
        const { default: AdminModel } = await import(
            '../src/core/admin/admin.model.js'
        ).catch(async () => {
            // Fallback: try named export
            return { default: null };
        });

        // Try to get Admin model from mongoose models cache (it's registered by admin.model.js)
        await import('../src/core/admin/admin.model.js');
        const Admin = mongoose.model('Admin');

        const ownerEmail = process.env.SEED_OWNER_EMAIL.toLowerCase().trim();
        const existingOwner = await Admin.findOne({ email: ownerEmail }).lean();

        if (existingOwner) {
            log(`ℹ️  Owner account ALREADY EXISTS: ${ownerEmail}`);
        } else {
            const saltRounds = config.bcryptSaltRounds || 10;
            const hashedPassword = await bcrypt.hash(process.env.SEED_OWNER_PASSWORD, saltRounds);

            await Admin.create({
                email: ownerEmail,
                password: hashedPassword,
                name: 'Ariston Owner',
                role: 'ADMIN',
                isActive: true,
                servicesAccess: ['food'],
            });

            log(`✅ Owner admin account CREATED: ${ownerEmail}`);
        }
    }

    // 6. Summary
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  Seed Summary');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Restaurant ID : ${DEFAULT_RESTAURANT_ID}`);
    console.log(`  Name          : ${RESTAURANT_NAME}`);
    console.log(`  Status        : ${wasCreated ? 'CREATED' : 'ALREADY EXISTED (no changes)'}`);
    if (withOwner) {
        console.log(`  Owner email   : ${process.env.SEED_OWNER_EMAIL}`);
    }
    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log('  Next steps:');
    console.log('  1. Set PLATFORM_MODE=single_vendor in Backend/.env');
    console.log('  2. Restart the backend: npm run dev');
    console.log('  3. Update restaurant details in the admin panel');
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    await mongoose.disconnect();
    process.exit(0);
}

main().catch((e) => {
    err(e.message);
    mongoose.disconnect().finally(() => process.exit(1));
});
