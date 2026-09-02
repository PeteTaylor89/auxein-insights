# services/stock_costing.py — what a unit of a consumable is worth.
#
# Decided 2026-08-28: weighted average from purchase movements, stored on the
# company's cost settings so it can be changed. The method matters because
# `Asset.cost_per_unit` is a single mutable field — valuing usage from it means
# a supplier price update today silently reprices last season's spray programme.
#
# The value is resolved ONCE, at the moment of use, and snapshot onto the
# StockMovement. This module is never consulted to re-value a movement that
# already carries a price.
import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from db.models.asset import Asset, StockMovement
from db.models.costing import CompanyCostSettings

logger = logging.getLogger(__name__)

# Unit costs are Numeric(10, 4) on StockMovement; match that so a weighted
# average does not silently round to cents before it is multiplied out.
_UNIT_Q = Decimal("0.0001")
_MONEY_Q = Decimal("0.01")


def _q_unit(v: Decimal) -> Decimal:
    return Decimal(v).quantize(_UNIT_Q, rounding=ROUND_HALF_UP)


def q_money(v: Decimal) -> Decimal:
    return Decimal(v).quantize(_MONEY_Q, rounding=ROUND_HALF_UP)


def weighted_average_cost(db: Session, asset_id: int,
                          before_id: int = None) -> Optional[Decimal]:
    """Average of what was actually PAID, across purchase movements.

    Purchases are the only movements that state a real price — a usage row
    carries the value we assigned it, so averaging over usages would fold our
    own estimate back into the average and drift.

    `before_id` restricts to purchases recorded before a given movement, which
    is what a recompute of a historical usage needs: the average as it stood
    then, not as it stands now.

    Returns None when there are no priced purchases — the caller falls back
    rather than inventing a number.
    """
    q = db.query(
        func.sum(StockMovement.quantity * StockMovement.unit_cost),
        func.sum(StockMovement.quantity),
    ).filter(
        StockMovement.asset_id == asset_id,
        StockMovement.movement_type == "purchase",
        StockMovement.unit_cost.isnot(None),
        StockMovement.quantity > 0,
    )
    if before_id is not None:
        q = q.filter(StockMovement.id < before_id)

    total_value, total_qty = q.one()
    if not total_qty or Decimal(str(total_qty)) <= 0 or total_value is None:
        return None
    return _q_unit(Decimal(str(total_value)) / Decimal(str(total_qty)))


def unit_cost_for(db: Session, asset: Asset,
                  settings: Optional[CompanyCostSettings] = None,
                  before_id: int = None) -> Tuple[Optional[Decimal], str]:
    """What one unit of this consumable is worth right now, and how we know.

    Returns (unit_cost, source) where source is one of:
      weighted_average  averaged over priced purchase movements
      last_price        the product's standing cost_per_unit
      none              no price anywhere — the caller must record NULL, never
                        0.00, because an unpriced product is not a free one

    Falling back to last_price when there are no purchases is deliberate rather
    than returning nothing: a company that has entered a price on the product
    but never recorded a delivery still has a defensible figure, and today that
    describes every company on the system.
    """
    method = (settings.stock_costing_method if settings else None) or "weighted_average"

    if method == "weighted_average":
        wa = weighted_average_cost(db, asset.id, before_id=before_id)
        if wa is not None:
            return wa, "weighted_average"
        # fall through to the standing price

    if method == "fifo":
        # Not implemented: FIFO needs a per-batch quantity ledger, and
        # `batch_number` is captured on movements without one. Rather than
        # approximate it with something that is not FIFO, fall back and say so
        # in the log, so the gap is visible instead of silently wrong.
        logger.warning(
            "FIFO stock costing is configured but not implemented; "
            "falling back for asset %s", asset.id,
        )
        wa = weighted_average_cost(db, asset.id, before_id=before_id)
        if wa is not None:
            return wa, "weighted_average"

    if asset.cost_per_unit is not None:
        return _q_unit(Decimal(str(asset.cost_per_unit))), "last_price"

    return None, "none"
