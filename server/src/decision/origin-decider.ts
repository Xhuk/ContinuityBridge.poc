import { readFileSync } from "fs";
import { join } from "path";
import { logger } from "../core/logger.js";
import type { CanonicalItem } from "@shared/schema";

const log = logger.child("OriginDecider");

interface Warehouse {
  id: string;
  name: string;
  location: {
    lat: number;
    lon: number;
    address: string;
    city: string;
    state: string;
  };
  sla: number;
  stock: Record<string, number>;
  costPerUnit: number;
  capacity: number;
  status: string;
}

interface DecisionResult {
  selectedWarehouse: {
    id: string;
    name: string;
    location: string;
  };
  reason: string;
  score: number;
  alternatives: Array<{
    id: string;
    name: string;
    score: number;
    reason: string;
  }>;
}

export class OriginDecider {
  private warehouses: Warehouse[];

  constructor() {
    const warehousesPath = join(process.cwd(), "server/src/data/warehouses.json");
    this.warehouses = JSON.parse(readFileSync(warehousesPath, "utf-8"));
    log.info(`Loaded ${this.warehouses.length} warehouses`);
  }

  decide(item: CanonicalItem): DecisionResult {
    const sku = item.sku;
    const destLat = item.destination.lat;
    const destLon = item.destination.lon;

    // Score each warehouse
    const scored = this.warehouses
      .filter((wh) => wh.status === "active")
      .map((wh) => {
        const stockAvailable = wh.stock[sku] || 0;
        const hasStock = stockAvailable >= item.quantity;

        // Calculate distance (simplified haversine)
        const distance =
          destLat && destLon
            ? this.calculateDistance(wh.location.lat, wh.location.lon, destLat, destLon)
            : 1000; // Default high distance if no coords

        // Scoring factors (weighted)
        const stockScore = hasStock ? 100 : 0;
        const distanceScore = Math.max(0, 100 - distance / 10);
        const slaScore = Math.max(0, 100 - wh.sla);
        const costScore = Math.max(0, 100 - wh.costPerUnit * 10);

        const totalScore =
          stockScore * 0.5 + distanceScore * 0.25 + slaScore * 0.15 + costScore * 0.1;

        return {
          warehouse: wh,
          score: totalScore,
          hasStock,
          distance,
        };
      })
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      throw new Error("No active warehouses available");
    }

    const best = scored[0];

    const decision: DecisionResult = {
      selectedWarehouse: {
        id: best.warehouse.id,
        name: best.warehouse.name,
        location: `${best.warehouse.location.city}, ${best.warehouse.location.state}`,
      },
      reason: best.hasStock
        ? `Best match: stock available (${best.warehouse.stock[sku]} units), distance ${best.distance.toFixed(0)}km, SLA ${best.warehouse.sla}h`
        : `Closest warehouse despite limited stock`,
      score: best.score,
      alternatives: scored.slice(1, 4).map((alt) => ({
        id: alt.warehouse.id,
        name: alt.warehouse.name,
        score: alt.score,
        reason: alt.hasStock
          ? `Stock: ${alt.warehouse.stock[sku]}, Distance: ${alt.distance.toFixed(0)}km`
          : "Limited stock",
      })),
    };

    log.info(`Selected warehouse ${best.warehouse.id} for SKU ${sku}`, {
      score: best.score,
    });

    return decision;
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) *
        Math.cos(this.deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }
}
