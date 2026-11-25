/**
 * marketplaceOnly middleware
 * --------------------------
 * Returns HTTP 404 for any route that is only meaningful in a multi-vendor
 * marketplace (e.g. restaurant registration, vendor approval queues, KYC).
 *
 * In marketplace mode the middleware is a no-op pass-through.
 * In single_vendor mode it short-circuits with 404 so the route
 * appears to not exist — no information leak about hidden features.
 *
 * Usage:
 *   router.post('/register', marketplaceOnly, registerController);
 */

import { isSingleVendor } from '../config/platformMode.js';

/**
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export const marketplaceOnly = (req, res, next) => {
    if (isSingleVendor()) {
        return res.status(404).json({
            success: false,
            message: 'Not found',
        });
    }
    next();
};
