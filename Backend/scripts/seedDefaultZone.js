/**
 * seedDefaultZone.js
 * -------------------
 * Idempotent seed script to ensure a default delivery zone exists in MongoDB (food_zones),
 * and links Ariston Cafe (650000000000000000a15701) to it if not already linked.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';

const DEFAULT_RESTAURANT_ID = '650000000000000000a15701';
const DEFAULT_ZONE_NAME = 'Ariston Main Delivery Zone';
const DEFAULT_CITY = 'Kalaburagi';
const DEFAULT_LAT = 17.3297;
const DEFAULT_LNG = 76.8343;

function generatePolygonAroundPoint(centerLat, centerLng, radiusKm = 20, numPoints = 12) {
    const points = [];
    const earthRadiusKm = 6371;
    const rad = radiusKm / earthRadiusKm;
    const latRad = (centerLat * Math.PI) / 180;
    const lngRad = (centerLng * Math.PI) / 180;

    for (let i = 0; i < numPoints; i++) {
        const bearing = (2 * Math.PI * i) / numPoints;
        const pointLatRad = Math.asin(
            Math.sin(latRad) * Math.cos(rad) +
            Math.cos(latRad) * Math.sin(rad) * Math.cos(bearing)
        );
        const pointLngRad = lngRad + Math.atan2(
            Math.sin(bearing) * Math.sin(rad) * Math.cos(latRad),
            Math.cos(rad) - Math.sin(latRad) * Math.sin(pointLatRad)
        );
        points.push({
            latitude: Number(((pointLatRad * 180) / Math.PI).toFixed(6)),
            longitude: Number(((pointLngRad * 180) / Math.PI).toFixed(6))
        });
    }
    return points;
}

async function main() {
    if (!config.mongodbUri) {
        console.error('[seed:zone] MONGODB_URI is not set in .env');
        process.exit(1);
    }

    console.log('[seed:zone] Connecting to MongoDB...');
    await mongoose.connect(config.mongodbUri);
    console.log('[seed:zone] Connected.');

    const { FoodZone } = await import('../src/modules/food/admin/models/zone.model.js');
    const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');

    // 1. Check existing zones
    let zone = await FoodZone.findOne({ isActive: true });
    let created = false;

    if (!zone) {
        console.log(`[seed:zone] No active zones found. Creating "${DEFAULT_ZONE_NAME}"...`);
        const coordinates = generatePolygonAroundPoint(DEFAULT_LAT, DEFAULT_LNG, 20, 12);
        zone = new FoodZone({
            name: DEFAULT_ZONE_NAME,
            zoneName: DEFAULT_ZONE_NAME,
            serviceLocation: DEFAULT_CITY,
            country: 'India',
            unit: 'kilometer',
            coordinates,
            isActive: true
        });
        await zone.save();
        created = true;
        console.log(`[seed:zone] ✅ Created zone: "${zone.name}" (${zone._id})`);
    } else {
        console.log(`[seed:zone] ℹ️ Zone already exists: "${zone.name}" (${zone._id})`);
    }

    // 2. Link default restaurant to this zone if unassigned
    const restaurantId = new mongoose.Types.ObjectId(DEFAULT_RESTAURANT_ID);
    const restaurant = await FoodRestaurant.findById(restaurantId);

    if (restaurant) {
        let updated = false;
        if (!restaurant.zoneId) {
            restaurant.zoneId = zone._id;
            updated = true;
        }
        if (!restaurant.latitude || Math.abs(restaurant.latitude) < 0.0001) {
            restaurant.latitude = DEFAULT_LAT;
            restaurant.longitude = DEFAULT_LNG;
            restaurant.location = {
                latitude: DEFAULT_LAT,
                longitude: DEFAULT_LNG,
                addressLine1: 'Khaja Colony, Brahmpur',
                area: 'Brahmpur',
                city: DEFAULT_CITY,
                state: 'Karnataka',
                pincode: '585102',
                formattedAddress: 'Piaray Aashianna, Khaja Colony, Brahmpur, Kalaburagi, Karnataka 585102'
            };
            restaurant.city = DEFAULT_CITY;
            restaurant.state = 'Karnataka';
            restaurant.area = 'Brahmpur';
            restaurant.pincode = '585102';
            restaurant.formattedAddress = 'Piaray Aashianna, Khaja Colony, Brahmpur, Kalaburagi, Karnataka 585102';
            updated = true;
        }

        if (updated) {
            await restaurant.save();
            console.log(`[seed:zone] ✅ Linked Ariston Cafe to zone "${zone.name}" (${zone._id}) with default coordinates`);
        } else {
            console.log(`[seed:zone] ℹ️ Ariston Cafe already had zoneId "${restaurant.zoneId}"`);
        }
    }

    await mongoose.disconnect();
    console.log('[seed:zone] Done.');
    process.exit(0);
}

main().catch(err => {
    console.error('[seed:zone:error]', err);
    mongoose.disconnect().finally(() => process.exit(1));
});
