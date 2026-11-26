/**
 * Platform Mode Configuration
 * ----------------------------
 * Controls whether the backend runs as a full marketplace (many vendors)
 * or as a single-vendor app (Ariston Cafe only).
 *
 * Set PLATFORM_MODE=single_vendor in .env to enable single-vendor mode.
 * Default: marketplace  (all existing multi-vendor behaviour preserved).
 *
 * IMPORTANT: Mode checks must only live here — do NOT scatter
 * `if (mode === 'single_vendor')` through controllers.
 * Controllers import getPlatformMode / isSingleVendor from this file only.
 */

import mongoose from 'mongoose';
import { config } from './env.js';
import { getRedisClient } from './redis.js';
import { logger } from '../utils/logger.js';

const VALID_MODES = ['marketplace', 'single_vendor'];
const DEFAULT_RESTAURANT_REDIS_KEY = 'platform:default_restaurant';
const DEFAULT_RESTAURANT_REDIS_TTL = 300; // 5 minutes

// In-memory mode state that can be switched dynamically at runtime
let currentPlatformMode = null;

/**
 * Returns the current platform mode.
 * @returns {'marketplace' | 'single_vendor'}
 */
export function getPlatformMode() {
    if (currentPlatformMode && VALID_MODES.includes(currentPlatformMode)) {
        return currentPlatformMode;
    }
    const raw = String(config.platformMode || process.env.PLATFORM_MODE || 'marketplace').trim();
    if (!VALID_MODES.includes(raw)) {
        logger.warn(`Invalid PLATFORM_MODE="${raw}", falling back to "marketplace"`);
        return 'marketplace';
    }
    return raw;
}

/**
 * Sets the platform mode in-memory at runtime.
 * @param {'marketplace' | 'single_vendor'} newMode
 * @returns {'marketplace' | 'single_vendor'}
 */
export function setPlatformMode(newMode) {
    if (!VALID_MODES.includes(newMode)) {
        throw new Error(`Invalid platform mode "${newMode}". Allowed: ${VALID_MODES.join(', ')}`);
    }
    currentPlatformMode = newMode;
    logger.info(`[platformMode] Mode switched dynamically to: "${newMode}"`);
    return currentPlatformMode;
}

/**
 * Syncs the platform mode from FoodBusinessSettings in MongoDB on startup or update.
 * @returns {Promise<'marketplace' | 'single_vendor'>}
 */
export async function syncPlatformModeFromDB() {
    try {
        const { FoodBusinessSettings } = await import(
            '../modules/food/admin/models/businessSettings.model.js'
        );
        const settings = await FoodBusinessSettings.findOne().select('platformMode').lean();
        if (settings?.platformMode && VALID_MODES.includes(settings.platformMode)) {
            currentPlatformMode = settings.platformMode;
            logger.info(`[platformMode] Loaded platform mode from DB: "${currentPlatformMode}"`);
            return currentPlatformMode;
        }
    } catch (err) {
        logger.warn(`[platformMode] Failed to sync mode from DB: ${err.message}`);
    }
    return getPlatformMode();
}

/**
 * Returns true when running in single-vendor mode.
 * @returns {boolean}
 */
export function isSingleVendor() {
    return getPlatformMode() === 'single_vendor';
}

/**
 * Returns the DEFAULT_RESTAURANT_ID string.
 * Throws if mode is single_vendor and the value is missing or not a valid 24-char ObjectId.
 * @returns {string}
 */
export function getDefaultRestaurantId() {
    const raw = String(config.defaultRestaurantId || process.env.DEFAULT_RESTAURANT_ID || '').trim();
    if (isSingleVendor()) {
        if (!raw) {
            throw new Error(
                'PLATFORM_MODE=single_vendor requires DEFAULT_RESTAURANT_ID to be set in .env'
            );
        }
        if (!/^[0-9a-fA-F]{24}$/.test(raw)) {
            throw new Error(
                `DEFAULT_RESTAURANT_ID="${raw}" is not a valid 24-character MongoDB ObjectId`
            );
        }
    }
    return raw;
}

/**
 * Loads the default restaurant document from MongoDB.
 * Uses Redis cache (5-minute TTL) when Redis is available.
 * Returns null in marketplace mode (no default restaurant concept).
 *
 * @returns {Promise<object|null>}
 */
export async function getDefaultRestaurant() {
    if (!isSingleVendor()) return null;

    const id = getDefaultRestaurantId();

    // Try Redis cache first
    const redis = getRedisClient();
    if (redis && redis.isReady) {
        try {
            const cached = await redis.get(DEFAULT_RESTAURANT_REDIS_KEY);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (err) {
            logger.warn(`platformMode: Redis cache read failed — ${err.message}`);
        }
    }

    // Dynamic import to avoid circular deps at module load time
    const { FoodRestaurant } = await import(
        '../modules/food/restaurant/models/restaurant.model.js'
    );

    const doc = await FoodRestaurant.findById(new mongoose.Types.ObjectId(id)).lean();

    if (!doc) {
        logger.warn(
            `platformMode: DEFAULT_RESTAURANT_ID=${id} not found in DB. ` +
            'Run: npm run seed:default-restaurant'
        );
        return null;
    }

    // Write through to Redis cache
    if (redis && redis.isReady) {
        try {
            await redis.set(
                DEFAULT_RESTAURANT_REDIS_KEY,
                JSON.stringify(doc),
                { EX: DEFAULT_RESTAURANT_REDIS_TTL }
            );
        } catch (err) {
            logger.warn(`platformMode: Redis cache write failed — ${err.message}`);
        }
    }

    return doc;
}

/**
 * Invalidates the cached default restaurant (call after restaurant doc is updated).
 * @returns {Promise<void>}
 */
export async function invalidateDefaultRestaurantCache() {
    const redis = getRedisClient();
    if (redis && redis.isReady) {
        try {
            await redis.del(DEFAULT_RESTAURANT_REDIS_KEY);
        } catch (err) {
            logger.warn(`platformMode: cache invalidation failed — ${err.message}`);
        }
    }
}
