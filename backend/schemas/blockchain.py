# app/schemas/blockchain.py
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, UUID4
from .block import Block

class BlockchainChainBase(BaseModel):
    chain_name: Optional[str] = None
    is_active: Optional[bool] = True
    vineyard_block_id: int

class BlockchainChainCreate(BlockchainChainBase):
    pass

class BlockchainChain(BlockchainChainBase):
    id: int
    chain_uuid: UUID4
    genesis_hash: str
    current_head_hash: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class BlockchainChainWithBlock(BlockchainChain):
    vineyard_block: Block

class BlockchainNodeBase(BaseModel):
    node_type: str
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    blockchain_data: Dict[str, Any]

class BlockchainNodeCreate(BlockchainNodeBase):
    chain_id: int
    confirmed_by_user_id: int

class BlockchainNode(BlockchainNodeBase):
    id: int
    node_uuid: UUID4
    chain_id: int
    parent_hashes: Optional[List[str]] = None
    node_hash: str
    sequence_number: int
    confirmed_at: datetime
    confirmed_by_user_id: Optional[int] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class BlockchainEventBase(BaseModel):
    event_type: str
    event_data: Dict[str, Any]
    privacy_level: str = 'full'
    hashed_fields: List[str]

class BlockchainEvent(BlockchainEventBase):
    id: int
    node_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class FruitReceivedBase(BaseModel):
    harvest_date: datetime
    quantity_kg: float
    brix: Optional[float] = None
    ph: Optional[float] = None
    total_acidity: Optional[float] = None
    quality_grade: Optional[str] = None
    defect_percentage: Optional[float] = None
    delivered_to: Optional[str] = None

class FruitReceivedCreate(FruitReceivedBase):
    chain_id: int
    vineyard_block_id: int
    harvest_event_id: Optional[int] = None

class FruitReceived(FruitReceivedBase):
    id: int
    fruit_uuid: UUID4
    chain_id: int
    vineyard_block_id: int
    harvest_event_id: Optional[int] = None
    blockchain_node_id: int
    provenance_hash: str
    delivery_confirmed_at: Optional[datetime] = None
    delivery_confirmed_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class ChainIntegrityResult(BaseModel):
    valid: bool
    error: Optional[str] = None
    node_count: Optional[int] = None
    genesis_hash: Optional[str] = None
    head_hash: Optional[str] = None
    node_sequence: Optional[int] = None

class ChainSummary(BaseModel):
    chain_id: int
    vineyard_block_id: int
    chain_name: Optional[str] = None
    node_count: int
    genesis_hash: str
    current_head_hash: Optional[str] = None
    fruit_received_count: int
    total_fruit_kg: float
    last_activity: Optional[datetime] = None

class ProvenanceTrace(BaseModel):
    """Complete provenance trace for a fruit batch"""
    fruit_received: FruitReceived
    chain: BlockchainChain
    vineyard_block: Block
    blockchain_nodes: List[BlockchainNode]
    key_events: List[Dict[str, Any]]  # Summarized key events
    integrity_verified: bool