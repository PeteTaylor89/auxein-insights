# services/management_service.py - Management transfer logic (Phase A, Grow V1)
import logging
from datetime import date, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from db.models.block import VineyardBlock
from db.models.company import Company
from db.models.management_relationship import ManagementRelationship
from db.models.property import Property

logger = logging.getLogger(__name__)


def transfer_management(
    db: Session,
    property_id: int,
    new_managing_company_id: int,
    start_date: date,
    contract_reference: Optional[str],
    created_by_user_id: int,
) -> ManagementRelationship:
    """
    Atomically transfers active management of a property to a new company.

    Steps (all in one transaction):
    1. Validate property and new company exist
    2. Deactivate current active ManagementRelationship (set is_active=False, end_date)
    3. Create new ManagementRelationship (is_active=True)
    4. Update company_id on all VineyardBlocks in this property to new_managing_company_id
    5. Return the new ManagementRelationship

    Raises ValueError if property or company not found.
    """
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise ValueError(f"Property {property_id} not found")

    new_company = db.query(Company).filter(Company.id == new_managing_company_id).first()
    if not new_company:
        raise ValueError(f"Company {new_managing_company_id} not found")

    # 1. Deactivate current active relationship(s)
    previous_company_id = None
    active_rels = db.query(ManagementRelationship).filter(
        ManagementRelationship.property_id == property_id,
        ManagementRelationship.is_active == True
    ).all()

    for rel in active_rels:
        previous_company_id = rel.managing_company_id
        rel.is_active = False
        rel.end_date = start_date - timedelta(days=1)

    # 2. Create new relationship
    new_rel = ManagementRelationship(
        property_id=property_id,
        managing_company_id=new_managing_company_id,
        start_date=start_date,
        is_active=True,
        contract_reference=contract_reference,
        created_by_user_id=created_by_user_id,
    )
    db.add(new_rel)

    # 3. Sync company_id on all blocks (R5 — denormalised sync)
    blocks = db.query(VineyardBlock).filter(
        VineyardBlock.property_id == property_id
    ).all()

    for block in blocks:
        block.company_id = new_managing_company_id

    db.commit()
    db.refresh(new_rel)

    logger.info(
        f"Management transferred for property {property_id}: "
        f"company {previous_company_id} -> {new_managing_company_id} "
        f"({len(blocks)} blocks updated)"
    )

    return new_rel
