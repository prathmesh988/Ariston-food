import 'dotenv/config';
import mongoose from 'mongoose';
import { config } from '../src/config/env.js';

function generatePolygonAroundPoint(centerLat, centerLng, radiusKm = 35, numPoints = 16) {
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

const isPointInPolygon = (plat, plng, polygon) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].longitude;
        const yi = polygon[i].latitude;
        const xj = polygon[j].longitude;
        const yj = polygon[j].latitude;
        const intersect =
            yi > plat !== yj > plat &&
            plng < ((xj - xi) * (plat - yi)) / (yj - yi + 0.0) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
};

async function sync() {
    await mongoose.connect(config.mongodbUri);
    const { FoodZone } = await import('../src/modules/food/admin/models/zone.model.js');
    const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');

    const restaurant = await FoodRestaurant.findById('650000000000000000a15701');
    if (!restaurant) {
        console.error('Restaurant not found');
        process.exit(1);
    }

    const lat = Number(restaurant.location?.latitude || restaurant.latitude || 22.71756);
    const lng = Number(restaurant.location?.longitude || restaurant.longitude || 75.871741);
    const city = restaurant.location?.city || restaurant.city || 'Indore';

    restaurant.latitude = lat;
    restaurant.longitude = lng;
    await restaurant.save();

    const coords = generatePolygonAroundPoint(lat, lng, 35, 16);

    let zone = null;
    if (restaurant.zoneId) {
        zone = await FoodZone.findById(restaurant.zoneId);
    }
    if (!zone) {
        zone = await FoodZone.findOne({ isActive: true });
    }

    if (zone) {
        zone.name = `Ariston ${city} Delivery Zone`;
        zone.zoneName = `Ariston ${city} Delivery Zone`;
        zone.serviceLocation = city;
        zone.coordinates = coords;
        zone.isActive = true;
        await zone.save();
        console.log(`[syncZone] Updated existing zone ${zone._id} to center at (${lat}, ${lng}) with 35km radius.`);
    } else {
        zone = new FoodZone({
            name: `Ariston ${city} Delivery Zone`,
            zoneName: `Ariston ${city} Delivery Zone`,
            serviceLocation: city,
            country: 'India',
            unit: 'kilometer',
            coordinates: coords,
            isActive: true
        });
        await zone.save();
        restaurant.zoneId = zone._id;
        await restaurant.save();
        console.log(`[syncZone] Created new zone ${zone._id} centered at (${lat}, ${lng}) with 35km radius.`);
    }

    console.log('[syncZone] Testing test coordinates against new zone:');
    console.log(' - Restaurant location (South Tukoganj, Indore):', isPointInPolygon(lat, lng, coords));
    console.log(' - Vijay Nagar (22.7533, 75.8937):', isPointInPolygon(22.7533, 75.8937, coords));
    console.log(' - Palasia (22.7244, 75.8839):', isPointInPolygon(22.7244, 75.8839, coords));
    console.log(' - Bhawar Kuan (22.6931, 75.8672):', isPointInPolygon(22.6931, 75.8672, coords));

    await mongoose.disconnect();
    console.log('[syncZone] Done.');
    process.exit(0);
}

sync().catch(err => {
    console.error(err);
    process.exit(1);
});
