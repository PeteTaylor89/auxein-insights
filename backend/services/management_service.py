# services/management_service.py - Management transfer logic (Phase A, Grow V1)
import hashlib
import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from db.models.block import VineyardBlock
from db.models.blockchain import BlockchainChain, BlockchainNode
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
    5. Log a management_transfer blockchain event for each block
    6. Return the new ManagementRelationship

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
        old_company_id = block.company_id
        block.company_id = new_managing_company_id

        # 4. Log blockchain event
        _log_transfer_event(
            db=db,
            block=block,
            previous_company_id=old_company_id,
            new_company_id=new_managing_company_id,
            transfer_date=start_date,
            contract_reference=contract_reference,
            user_id=created_by_user_id,
        )

    db.commit()
    db.refresh(new_rel)

    logger.info(
        f"Management transferred for property {property_id}: "
        f"company {previous_company_id} -> {new_managing_company_id} "
        f"({len(blocks)} blocks updated)"
    )

    return new_rel


def _log_transfer_event(
    db: Session,
    block: VineyardBlock,
    previous_company_id: Optional[int],
    new_company_id: int,
    transfer_date: date,
    contract_reference: Optional[str],
    user_id: int,
):
    """Log a management_transfer event to the blockchain for a block."""
    # Find or create a chain for this block (current season)
    now = datetime.now(timezone.utc)
    season_year = now.year if now.month >= 7 else now.year - 1
    season = f"{season_year}/{str(season_year + 1)[2:]}"

    chain = db.query(BlockchainChain).filter(
        BlockchainChain.vineyard_block_id == block.id,
        BlockchainChain.season_id == season,
    ).first()

    if not chain:
        # No chain for this season — skip blockchain logging rather than create an orphan chain
        # TODO v1.x: Consider creating chain on transfer if none exists
        return

    # Get next sequence number
    max_seq = db.query(BlockchainNode.sequence_number).filter(
        BlockchainNode.chain_id == chain.id
    ).order_by(BlockchainNode.sequence_number.desc()).first()
    next_seq = (max_seq[0] + 1) if max_seq else 1

    # Build event data
    event_data = {
        "event": "management_transfer",
        "block_id": block.id,
        "previous_company_id": previous_company_id,
        "new_company_id": new_company_id,
        "transfer_date": str(transfer_date),
        "contract_reference": contract_reference,
        "timestamp": now.isoformat(),
    }

    # Compute hash
    data_str = json.dumps(event_data, sort_keys=True)
    node_hash = hashlib.sha256(data_str.encode()).hexdigest()

    node = BlockchainNode(
        chain_id=chain.id,
        node_type="management_transfer",
        reference_type="management_transfer",
        reference_id=block.property_id,
        blockchain_data=event_data,
        sequence_number=next_seq,
        node_hash=node_hash,
        confirmed_at=now,
        confirmed_by_user_id=user_id,
    )
    db.add(node)
