/**
 * resolveRestaurantContext middleware
 * ------------------------------------
 * Attaches `req.restaurantId` (string) for every authenticated restaurant-owner request.
 *
 * Marketplace mode  → restaurantId comes from the JWT payload (existing behaviour).
 * Single-vendor mode → restaurantId is always the server-side DEFAULT_RESTAURANT_ID.
 *                      Client-supplied restaurantId is IGNORED for security.
 *
 * Usage: apply AFTER the auth middleware that sets req.user.
 */

import { isSingleVendor, getDefaultRestaurantId } from '../config/platformMode.js';

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const resolveRestaurantContext = (req, res, next) => {
    if (isSingleVendor()) {
        const defaultId = getDefaultRestaurantId();

        // Reject any attempt to act on a restaurant other than the default one (403)
        const targetId = req.params?.restaurantId || req.params?.id || req.body?.restaurantId || req.query?.restaurantId;
        if (targetId && /^[0-9a-fA-F]{24}$/.test(String(targetId)) && String(targetId) !== defaultId) {
            return res.status(403).json({
                success: false,
                message: 'Access denied: Cannot act on another restaurant in single-vendor mode'
            });
        }

        // Always use the server-authoritative default restaurant id.
        req.restaurantId = defaultId;

        if (req.user) {
            req.user.restaurantId = defaultId;
            // Allow admin/sub-admin acting as restaurant owner to pass controller checks looking for userId
            if (req.user.role === 'ADMIN' || req.user.role === 'SUB_ADMIN') {
                req.user.adminUserId = req.user.userId;
                req.user.userId = defaultId;
            }
        }
    } else {
        // Marketplace: restaurantId comes from the authenticated token.
        req.restaurantId =
            req.restaurantId ||          // already set upstream
            req.user?.restaurantId ||    // JWT claim
            (req.user?.role === 'RESTAURANT' ? req.user?.userId : null) ||
            req.params?.restaurantId ||  // path param (admin routes)
            req.params?.id ||
            null;
    }
    next();
};
