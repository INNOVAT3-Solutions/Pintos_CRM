/**
 * Starting price list, imported from Pintos' services export (Aug 20, 2026).
 * Loaded into the database once, the first time the price list is opened;
 * after that Settings → Services & Prices is the source of truth.
 * Rows that looked mislabeled are imported unchanged with `needsReview` set.
 */
import type { PriceUnit, Surface } from "@/lib/db/schema";

export interface SeedService {
  name: string;
  unit: PriceUnit;
  price: number;
  minPrice: number;
  description: string;
  active: boolean;
  measureSurface: Surface | null;
  needsReview: string | null;
  sortOrder: number;
}

export const SEED_SERVICES: SeedService[] = [
  {
    "name": "Full Exterior House Wash",
    "unit": "sqft",
    "price": 0.25,
    "minPrice": 0.0,
    "description": "Our house soft washing service safely removes mold, mildew, algae, dirt, spider webs, and other organic buildup from your home’s exterior using a low-pressure cleaning process. Unlike high-pressure washing, soft washing cleans and sanitizes surfaces without the risk of damage to paint, stucco, siding, trim, or other delicate exterior materials. Service Includes: ✅ Low-pressure soft wash application ✅ Removal of mold, mildew, algae, and dirt buildup ✅ Cleaning of exterior walls, soffits, fascia, and trim ✅ Treatment of organic staining and discoloration ✅ Thorough rinse and cleanup of surrounding areas",
    "active": true,
    "measureSurface": "house",
    "needsReview": null,
    "sortOrder": 1
  },
  {
    "name": "Driveway Cleaning",
    "unit": "sqft",
    "price": 0.25,
    "minPrice": 0.0,
    "description": "Our driveway cleaning service removes dirt, algae, mold, mildew, tire marks, and surface stains to restore a clean, like-new appearance. Using professional surface cleaning equipment, we provide an even, streak-free clean that enhances curb appeal and improves the overall appearance of your property. Service Includes: ✅ Removal of dirt, algae, mold, and mildew ✅ Professional surface cleaning for a uniform finish ✅ Treatment of organic staining and discoloration ✅ Cleaning of concrete, paver, and other driveway surfaces ✅ Thorough rinse and cleanup of the work ar",
    "active": true,
    "measureSurface": "driveway",
    "needsReview": null,
    "sortOrder": 2
  },
  {
    "name": "Roof Wash",
    "unit": "sqft",
    "price": 0.31,
    "minPrice": 0.0,
    "description": "Professional soft wash system that safely treats and eliminates algae, mold, and black streaking.",
    "active": true,
    "measureSurface": "roof",
    "needsReview": null,
    "sortOrder": 3
  },
  {
    "name": "Gutter clean out",
    "unit": "sqft",
    "price": 0.35,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 4
  },
  {
    "name": "Gutter Whitening One Story Home",
    "unit": "linear_ft",
    "price": 225.0,
    "minPrice": 0.0,
    "description": "Restore the appearance of your gutters by removing black streaks, tiger striping, algae, mildew, and other organic stains from the exterior gutter surfaces. Our specialized cleaning process brightens and revitalizes the gutters, helping improve your home’s overall curb appeal. Note: Some oxidation and deep-set tiger striping may not be fully removable, but substantial improvement is typically achieved.",
    "active": true,
    "measureSurface": null,
    "needsReview": "Priced per linear ft at $225 — probably a flat $225 per home.",
    "sortOrder": 5
  },
  {
    "name": "Pool Deck/Patio cleaning",
    "unit": "sqft",
    "price": 0.25,
    "minPrice": 0.0,
    "description": "Our patio cleaning service removes dirt, algae, mold, mildew, stains, and surface buildup from your outdoor living space, restoring a clean and inviting appearance. Using professional surface cleaning equipment and soft washing techniques when needed, we safely clean concrete, pavers, travertine, and other patio surfaces. Service Includes: ✅ Removal of dirt, algae, mold, and mildew ✅ Professional surface cleaning of patio areas ✅ Treatment of organic staining and discoloration ✅ Cleaning of edges, corners, and hard-to-reach areas ✅ Thorough rinse and cleanup of the work area",
    "active": true,
    "measureSurface": "patio",
    "needsReview": null,
    "sortOrder": 6
  },
  {
    "name": "Paver Sealing",
    "unit": "sqft",
    "price": 0.75,
    "minPrice": 0.0,
    "description": "Our paver sealing process is designed to restore, protect, and extend the life of your hardscape using premium Trident products and proven installation methods. We begin by removing the existing joint sand, followed by multiple deep-cleaning treatments using professional-grade Trident cleaning products to eliminate dirt, algae, mold, mildew, stains, and contaminants. Once the pavers are thoroughly cleaned and completely dry, we install fresh joint sand to stabilize the paver system before applying a premium Trident sealer. Our high-performance sealers enhance the natural beauty of your pavers while protecting them from UV rays, color fading, stains, moisture, weed growth, insect intrusion, and joint sand erosion. The result is a durable, long-lasting finish that keeps your pavers looking their best for years to come. Our Process: * Remove existing joint sand * Deep clean the surface with Trident cleaning products * Perform multiple cleaning treatments as needed * Install fresh joint sand * Apply premium Trident sealer",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 7
  },
  {
    "name": "Gutter Whitening Two story home",
    "unit": "sqft",
    "price": 350.0,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": "Priced $350 per sq ft in the export — probably a flat $350 per home.",
    "sortOrder": 8
  },
  {
    "name": "HOA Water Catch",
    "unit": "sqft",
    "price": 0.15,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 9
  },
  {
    "name": "Walkway Cleaning",
    "unit": "sqft",
    "price": 0.25,
    "minPrice": 0.0,
    "description": "Professional surface cleaning to remove dirt, algae, and buildup, restoring a clean and safe walking surface.",
    "active": true,
    "measureSurface": null,
    "needsReview": "“Walkway Cleaning” appears twice in the export ($0.25). Keep one.",
    "sortOrder": 10
  },
  {
    "name": "Concrete Slab Cleaning",
    "unit": "sqft",
    "price": 0.25,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 11
  },
  {
    "name": "Concrete Warehouse Soft Wash",
    "unit": "sqft",
    "price": 0.21,
    "minPrice": 0.0,
    "description": "Warehouse Exterior Concrete Cleaning Commercial-grade soft wash service engineered to eliminate mildew, algae, and buildup while maintaining the professional appearance of your facility.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 12
  },
  {
    "name": "Window Cleaning",
    "unit": "each",
    "price": 10.0,
    "minPrice": 0.0,
    "description": "Our professional window cleaning service removes dirt, dust, pollen, water spots, and environmental buildup from your exterior windows, leaving them crystal clear and streak-free. We use professional-grade equipment and purified water systems to deliver a spotless finish while enhancing the appearance of your home. Service Includes: ✅ Cleaning of exterior window glass ✅ Removal of dirt, pollen, and environmental buildup ✅ Cleaning of window frames and sills (where accessible) ✅ Spot-free rinse using purified water technology ✅ Streak-free finish for improved clarity and curb appeal",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 13
  },
  {
    "name": "Paver sealer  stripping",
    "unit": "sqft",
    "price": 2.0,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 14
  },
  {
    "name": "Exterior Concrete Cleaning",
    "unit": "sqft",
    "price": 0.17,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 15
  },
  {
    "name": "Wood Deck Cleaning",
    "unit": "sqft",
    "price": 0.2,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 16
  },
  {
    "name": "Loading Dock Cleaning",
    "unit": "sqft",
    "price": 0.5,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 17
  },
  {
    "name": "Paint stripping",
    "unit": "sqft",
    "price": 3.5,
    "minPrice": 0.0,
    "description": "Failing Paint Removal (Surface Prep for Repainting) This service involves the removal of existing failing, peeling, and deteriorated paint from surfaces to properly prepare them for repainting. Areas where the coating has lost adhesion will be targeted and removed using a combination of mechanical methods and controlled cleaning techniques to ensure a stable, clean substrate. All loose and compromised paint will be stripped away to prevent future coating failure and to promote proper bonding of the new paint. The goal of this process is to create a uniform surface by eliminating flaking edges, lifting sections, and weakened coatings that would otherwise impact the longevity and appearance of the new finish. During the process, removed paint will break down into chips, flakes, and residue. These materials will be thoroughly collected and cleaned from the work area to ensure the surface is left clean, safe, and ready for the next phase of painting. Note: This service focuses on removing failing and non-adhered paint. Sound, well-bonded coatings may remain intact unless otherwise specified.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 18
  },
  {
    "name": "Basketball Court Cleaning",
    "unit": "sqft",
    "price": 0.18,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 19
  },
  {
    "name": "Oil Stain Removal",
    "unit": "sqft",
    "price": 1.0,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 20
  },
  {
    "name": "Concrete Wall Cleaning",
    "unit": "linear_ft",
    "price": 1.75,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 21
  },
  {
    "name": "Mailbox Structure Cleaning",
    "unit": "sqft",
    "price": 20.0,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": "Priced $20 per sq ft — probably $20 per mailbox.",
    "sortOrder": 22
  },
  {
    "name": "Awning Cleaning",
    "unit": "sqft",
    "price": 100.0,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": "Priced $100 per sq ft — probably $100 per awning.",
    "sortOrder": 23
  },
  {
    "name": "Walkway Cleaning",
    "unit": "sqft",
    "price": 2.0,
    "minPrice": 0.0,
    "description": "",
    "active": true,
    "measureSurface": null,
    "needsReview": "“Walkway Cleaning” appears twice in the export ($2). Keep one.",
    "sortOrder": 24
  },
  {
    "name": "Sidewalk Cleaning",
    "unit": "sqft",
    "price": 0.25,
    "minPrice": 0.0,
    "description": "Deep surface cleaning designed to eliminate embedded grime and organic growth while improving appearance and safety.",
    "active": true,
    "measureSurface": "walkway",
    "needsReview": null,
    "sortOrder": 25
  },
  {
    "name": "Pickle Ball Court Cleaning",
    "unit": "sqft",
    "price": 0.17,
    "minPrice": 0.0,
    "description": "Pickleball Court Cleaning Professional soft wash and surface cleaning to remove algae, mold, mildew, dirt, and organic buildup from pickleball courts. Restores traction, improves appearance, and helps maintain a safe playing surface without damaging the coating.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 26
  },
  {
    "name": "Pool Enclosure Cleaning",
    "unit": "sqft",
    "price": 0.35,
    "minPrice": 0.0,
    "description": "Safe, low-pressure soft wash cleaning designed to remove mold, mildew, algae, and dirt buildup from pool screen enclosures, frames, and surrounding structure. Our process uses specialized cleaning solutions that break down organic growth without damaging delicate screens or coatings. We thoroughly treat and rinse all surfaces, restoring a clean, bright appearance while protecting the integrity of the enclosure and extending its lifespan.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 27
  },
  {
    "name": "Parking Garage Cleaning",
    "unit": "sqft",
    "price": 0.16,
    "minPrice": 0.0,
    "description": "Parking Garage Cleaning (Concrete Surface Cleaning & Degreasing) Our parking garage cleaning service is designed to restore heavily used concrete surfaces by removing built-up dirt, oil stains, tire marks, and organic growth. We utilize commercial-grade pressure washing equipment combined with industrial-strength degreasers to break down and lift embedded grease, fuel residue, and grime from the concrete. High-traffic areas such as entry/exit points, parking stalls, and drive lanes receive targeted pre-treatment with degreaser to ensure deep cleaning results. Surfaces are then thoroughly pressure cleaned to flush out contaminants, leaving the garage significantly cleaner, safer, and more visually appealing. This service not only improves the overall appearance of the property but also helps reduce slip hazards and extends the life of the concrete surfaces. Note: Heavily stained areas may require multiple treatments for optimal results.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 28
  },
  {
    "name": "Gate Pillar Cleaning",
    "unit": "each",
    "price": 100.0,
    "minPrice": 0.0,
    "description": "Gate Pillar Soft Washing & Detail Cleaning Service includes a low-pressure soft wash treatment of all gate entry pillars to safely remove algae, mildew, dirt, organic buildup, and discoloration from the stucco, stone veneer, and surrounding surfaces. All decorative stone areas, pillar caps, light fixture areas, and detailed sections will be carefully cleaned using professional soft washing methods designed to restore appearance without damaging the surfaces. Surrounding landscaping and nearby areas will be pre-rinsed and protected throughout the cleaning process.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 29
  },
  {
    "name": "Paver Re-Sanding",
    "unit": "sqft",
    "price": 0.35,
    "minPrice": 0.0,
    "description": "Existing paver joints will be thoroughly cleaned and re-sanded to restore joint stability and improve the overall appearance of the surface. Fresh joint sand will be installed where needed to help reduce movement, minimize washout, and properly prepare the pavers for sealer application. This process helps ensure a cleaner finish, improved durability, and optimal long-term sealer performance.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 30
  },
  {
    "name": "Rust Removal",
    "unit": "each",
    "price": 25.0,
    "minPrice": 0.0,
    "description": "Professional rust removal service designed to safely treat and remove orange rust staining caused by irrigation systems, metal furniture, planters, battery acid, and runoff from exterior surfaces. This process helps restore the appearance of concrete, pavers, patios, pool decks, walls, and stone without relying on excessive pressure that could damage the surface. Rust stains left behind from metal patio furniture legs, tables, and decorative pieces are specially treated using professional-grade products to break down deep staining and improve the overall appearance of the area.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 31
  },
  {
    "name": "Front Entry Way Cleaning",
    "unit": "sqft",
    "price": 0.25,
    "minPrice": 0.0,
    "description": "Restore the appearance of your home’s entrance with our professional front entryway cleaning service. We safely remove dirt, algae, mildew, spider webs, stains, and built-up grime from entry steps, walkways, landings, columns, and surrounding surfaces. Using professional-grade equipment and surface-appropriate cleaning methods, we leave your front entrance looking clean, welcoming, and well-maintained while helping improve curb appeal and safety.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 32
  },
  {
    "name": "Commercial Sidewalk Cleaning",
    "unit": "sqft",
    "price": 0.14,
    "minPrice": 0.0,
    "description": "Our commercial sidewalk cleaning service is designed to restore the appearance, safety, and cleanliness of your property’s pedestrian walkways. We utilize professional-grade hot water pressure washing equipment to remove dirt, grime, algae, mildew, tire marks, and other surface contaminants while helping improve curb appeal and reduce slip hazards. Each project includes a thorough pre-treatment (when needed), professional surface cleaning, detailed edge work, and a final rinse to leave the sidewalks looking clean and uniform. We take care to protect surrounding landscaping and property throughout the cleaning process. Our goal is to help your shopping center maintain a clean, welcoming, and professional appearance for tenants and customers alike.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 33
  },
  {
    "name": "Coral Rock Wall Cleaning",
    "unit": "linear_ft",
    "price": 0.25,
    "minPrice": 0.0,
    "description": "Our coral rock wall cleaning process is designed to safely restore the natural beauty of your stone without causing damage. Unlike traditional high-pressure washing, we use a specialized soft washing method that applies professional-grade cleaning solutions to eliminate algae, mold, mildew, and organic staining deep within the porous surface. The wall is then gently rinsed using low pressure, preserving the integrity of the coral rock while delivering exceptional results. This method helps prevent chipping, erosion, and unnecessary wear, making it the safest and most effective way to clean delicate natural stone. Our goal is to restore the wall’s original appearance while protecting the material for years to come.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 34
  },
  {
    "name": "Awning Cleaning & Oxidation Restoration",
    "unit": "each",
    "price": 500.0,
    "minPrice": 0.0,
    "description": "Professional cleaning of awning panels and painted metal framework to remove organic growth, dirt, staining, and surface oxidation. Includes specialized oxidation treatment to reduce chalky residue and restore the appearance of weathered painted surfaces, followed by a thorough low-pressure rinse.",
    "active": true,
    "measureSurface": null,
    "needsReview": null,
    "sortOrder": 35
  }
];
