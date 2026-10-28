/**
 * Single source of truth for plans and prices (₹). Imported by the UI *and* the server
 * (server/routes/*), so a price change here is enforced everywhere.
 *
 * Paper: one A5 sheet holds exactly 2 strips, so every plan sells an even number of strips
 * and no sheet leaves the printer half empty.
 */

export interface PlanDef {
  price: number          // ₹ — also used as the plan id (ticket.planType)
  strips: number         // strips included
  sheets: number         // A5 sheets that come out of the printer
  label: string
  desc: string
  badge?: string
}

export const PLANS: PlanDef[] = [
  { price: 99,  strips: 2, sheets: 1, label: '₹99',  desc: '2 Photo Strips · 1 A5 sheet' },
  { price: 169, strips: 4, sheets: 2, label: '₹169', desc: '4 Photo Strips · 2 A5 sheets', badge: 'MOST POPULAR' },
  { price: 229, strips: 6, sheets: 3, label: '₹229', desc: '6 Photo Strips · 3 A5 sheets', badge: 'BEST VALUE' },
]

export const DEFAULT_PLAN = 169

/**
 * Add-on at the editing station: +1 A5 sheet = +2 strips.
 * Must stay ABOVE the plan step (169 − 99 = ₹70); otherwise "₹99 + add-on" undercuts the ₹169 plan
 * and nobody buys the bigger plan up front.
 */
export const EXTRA_SHEET_PRICE = 79
export const STRIPS_PER_SHEET = 2

/** Retired plans, still honoured for tickets sold before the change. */
const LEGACY_STRIP_LIMITS: Record<number, number> = { 149: 3, 179: 5 }

export const PLAN_PRICES = PLANS.map(p => p.price)

export function isValidPlan(v: unknown): v is number {
  return PLAN_PRICES.includes(Number(v))
}

export function getPlan(price: number | undefined | null): PlanDef | undefined {
  return PLANS.find(p => p.price === Number(price))
}

export function stripLimitForPlan(price: number | undefined | null): number {
  return getPlan(price)?.strips ?? LEGACY_STRIP_LIMITS[Number(price)] ?? PLANS[0].strips
}

/** Every amount a guest-facing payment may be created for: a plan price or N extra sheets. */
export function allowedChargeAmounts(): number[] {
  const upgrades = [1, 2].map(n => n * EXTRA_SHEET_PRICE)
  return [...PLAN_PRICES, ...upgrades]
}

export interface UpgradeOffer {
  extraSheets: number
  fee: number
  targetPlan: number    // plan whose strip count matches the upgraded total
  strips: number
  title: string
  desc: string
}

/** Upgrades available from a plan at the editing station (ends at the largest plan). */
export function upgradeOffersFor(planPrice: number): UpgradeOffer[] {
  const current = stripLimitForPlan(planPrice)
  const offers: UpgradeOffer[] = []
  for (const extraSheets of [1, 2]) {
    const strips = current + extraSheets * STRIPS_PER_SHEET
    const target = PLANS.find(p => p.strips === strips)
    if (!target) continue
    offers.push({
      extraSheets,
      fee: extraSheets * EXTRA_SHEET_PRICE,
      targetPlan: target.price,
      strips,
      title: `+₹${extraSheets * EXTRA_SHEET_PRICE} · ${strips} Strips total`,
      desc: `+${extraSheets * STRIPS_PER_SHEET} strips on ${extraSheets} extra A5 sheet${extraSheets > 1 ? 's' : ''}`,
    })
  }
  return offers
}
