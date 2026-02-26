from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.blockchain import BlockchainChain, BlockchainNode, FruitReceived
from db.models.block import VineyardBlock
from schemas.blockchain import (
    BlockchainChain as BlockchainChainSchema,
    ChainIntegrityResult,
    ChainSummary,
    ProvenanceTrace
)
from services.blockchain_service import BlockchainService
from api.deps import get_current_user
from db.models.user import User

router = APIRouter()


def _verify_block_ownership(db: Session, vineyard_block_id: int, user: User) -> VineyardBlock:
    """Verify the block belongs to the user's company"""
    block = db.query(VineyardBlock).filter(
        VineyardBlock.id == vineyard_block_id,
        VineyardBlock.company_id == user.company_id
    ).first()
    if not block:
        raise HTTPException(status_code=404, detail="Vineyard block not found")
    return block


def _verify_chain_ownership(db: Session, chain_id: int, user: User) -> BlockchainChain:
    """Verify the chain belongs to the user's company"""
    chain = db.query(BlockchainChain).filter(
        BlockchainChain.id == chain_id,
        BlockchainChain.company_id == user.company_id
    ).first()
    if not chain:
        raise HTTPException(status_code=404, detail="Blockchain chain not found")
    return chain

@router.post("/chains/create/{vineyard_block_id}", response_model=BlockchainChainSchema)
def create_chain_for_block(
    vineyard_block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Manually create a blockchain for a vineyard block (usually auto-created)"""
    _verify_block_ownership(db, vineyard_block_id, current_user)
    try:
        chain = BlockchainService.auto_create_chain_on_assignment(
            db, vineyard_block_id, current_user.company_id, current_user.id
        )
        return chain
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/chains/{chain_id}/verify", response_model=ChainIntegrityResult)
def verify_chain_integrity(
    chain_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Verify the integrity of a blockchain"""
    _verify_chain_ownership(db, chain_id, current_user)
    result = BlockchainService.verify_chain_integrity(db, chain_id)
    return result

@router.get("/chains/by-block/{vineyard_block_id}", response_model=Optional[ChainSummary])
def get_chain_by_block(
    vineyard_block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get blockchain summary for a vineyard block"""
    _verify_block_ownership(db, vineyard_block_id, current_user)
    chain = db.query(BlockchainChain).filter(
        BlockchainChain.vineyard_block_id == vineyard_block_id,
        BlockchainChain.company_id == current_user.company_id,
        BlockchainChain.is_active == True
    ).first()
    
    if not chain:
        return None
    
    # Get summary stats
    from sqlalchemy import func
    fruit_stats = db.query(
        func.count(FruitReceived.id),
        func.sum(FruitReceived.quantity_kg)
    ).filter(FruitReceived.chain_id == chain.id).first()
    
    fruit_count = fruit_stats[0] or 0
    total_kg = fruit_stats[1] or 0.0
    
    return ChainSummary(
        chain_id=chain.id,
        vineyard_block_id=chain.vineyard_block_id,
        chain_name=chain.chain_name,
        node_count=len(chain.nodes),
        genesis_hash=chain.genesis_hash,
        current_head_hash=chain.current_head_hash,
        fruit_received_count=fruit_count,
        total_fruit_kg=total_kg,
        last_activity=chain.updated_at
    )

@router.get("/provenance/{fruit_uuid}", response_model=ProvenanceTrace)
def get_provenance_trace(
    fruit_uuid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get complete provenance trace for a fruit batch"""
    fruit = db.query(FruitReceived).filter(FruitReceived.fruit_uuid == fruit_uuid).first()
    if not fruit:
        raise HTTPException(status_code=404, detail="Fruit batch not found")

    # Verify the chain belongs to user's company
    chain = fruit.chain
    if not chain or chain.company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Fruit batch not found")

    nodes = db.query(BlockchainNode).filter(
        BlockchainNode.chain_id == chain.id
    ).order_by(BlockchainNode.sequence_number).all()
    
    # Verify integrity
    integrity_result = BlockchainService.verify_chain_integrity(db, chain.id)
    
    # Summarize key events
    key_events = []
    for node in nodes:
        if node.node_type in ['task', 'observation']:
            key_events.append({
                "type": node.node_type,
                "event_type": node.blockchain_data.get("event_type", "unknown"),
                "date": node.blockchain_data.get("confirmed_at"),
                "summary": node.blockchain_data
            })
    
    return ProvenanceTrace(
        fruit_received=fruit,
        chain=chain,
        vineyard_block=chain.vineyard_block,
        blockchain_nodes=nodes,
        key_events=key_events,
        integrity_verified=integrity_result["valid"]
    )