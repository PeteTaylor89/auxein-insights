"""
Blockchain DAG Models for Vineyard Traceability

@author: Peter Taylor
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, JSON, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from db.base_class import Base
import uuid
from datetime import datetime

class BlockchainChain(Base):
    """
    Represents a blockchain for a specific vineyard block in a specific season
    Each vineyard block gets its own chain per season (DAG source)
    """
    __tablename__ = "blockchain_chains"
    
    id = Column(Integer, primary_key=True, index=True)
    chain_uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, index=True)
    vineyard_block_id = Column(Integer, ForeignKey("vineyard_blocks.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    
    # Season management (flexible)
    season_id = Column(String, nullable=False)  # e.g., "2025" or "2025-dessert_late_harvest"
    season_type = Column(String, nullable=False, default="standard")  # "standard", "dessert_late_harvest", "ice_wine", etc.
    season_info = Column(JSON, nullable=True)  # Flexible season metadata
    
    chain_name = Column(String, nullable=True)  # e.g. "Block 12A - Pinot Noir (2025)"
    
    # Chain metadata
    genesis_hash = Column(String, nullable=False)  # Hash of the initial block state
    current_head_hash = Column(String, nullable=True)  # Latest node hash
    is_active = Column(Boolean, default=True)
    
    # Creation tracking
    created_by_assignment = Column(Boolean, default=False)  # Auto-created vs manual
    assignment_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Archive tracking
    archived_at = Column(DateTime, nullable=True)
    archived_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    archive_reason = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    vineyard_block = relationship("VineyardBlock", back_populates="blockchain_chains")
    #company = relationship("Company", back_populates="blockchain_chains")
    assignment_user = relationship("User", foreign_keys=[assignment_user_id])
    archived_by_user = relationship("User", foreign_keys=[archived_by_user_id])
    nodes = relationship("BlockchainNode", back_populates="chain", cascade="all, delete-orphan")
    
    # Unique constraint: one active chain per block per season_id
    __table_args__ = (
        Index('idx_block_season_active', 'vineyard_block_id', 'season_id', 'is_active'),
        Index('idx_season_type', 'season_type'),
    )

class BlockchainNode(Base):
    """
    Individual nodes in the DAG
    Each represents a confirmed task, observation, or milestone
    """
    __tablename__ = "blockchain_nodes"
    
    id = Column(Integer, primary_key=True, index=True)
    node_uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, index=True)
    chain_id = Column(Integer, ForeignKey("blockchain_chains.id"), nullable=False)
    
    # Node type and reference
    node_type = Column(String, nullable=False)  # 'genesis', 'task', 'observation', 'fruit_received'
    reference_type = Column(String, nullable=True)  # 'task', 'observation', 'harvest_event'
    reference_id = Column(Integer, nullable=True)  # ID of the referenced object
    
    # DAG structure
    parent_hashes = Column(JSON, nullable=True)  # Array of parent node hashes (for DAG)
    node_hash = Column(String, nullable=False, unique=True, index=True)
    
    # Blockchain data (what gets hashed)
    blockchain_data = Column(JSON, nullable=False)  # Key data that goes into hash
    
    # Metadata
    sequence_number = Column(Integer, nullable=False)  # Sequential within chain
    confirmed_at = Column(DateTime, nullable=False)
    confirmed_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    chain = relationship("BlockchainChain", back_populates="nodes")
    confirmed_by = relationship("User")
    
    # Indexes for performance
    __table_args__ = (
        Index('idx_chain_sequence', 'chain_id', 'sequence_number'),
        Index('idx_reference', 'reference_type', 'reference_id'),
        Index('idx_node_type_chain', 'node_type', 'chain_id'),
    )

class BlockchainEvent(Base):
    """
    Links blockchain nodes to specific events (tasks/observations)
    Allows querying full event data from blockchain references
    """
    __tablename__ = "blockchain_events"
    
    id = Column(Integer, primary_key=True, index=True)
    node_id = Column(Integer, ForeignKey("blockchain_nodes.id"), nullable=False)
    
    # Event details
    event_type = Column(String, nullable=False)  # 'spray_application', 'phenology_observation', etc.
    event_data = Column(JSON, nullable=False)  # Full event data snapshot
    privacy_level = Column(String, default='full')  # 'full', 'summary', 'hash_only'
    
    # What went into the hash vs full data
    hashed_fields = Column(JSON, nullable=False)  # Which fields were included in blockchain_data
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    node = relationship("BlockchainNode")

class FruitReceived(Base):
    """
    Terminal nodes for vineyard phase - represents fruit delivery to winery
    This becomes the bridge to winery operations in V2
    """
    __tablename__ = "fruit_received"
    
    id = Column(Integer, primary_key=True, index=True)
    fruit_uuid = Column(UUID(as_uuid=True), default=uuid.uuid4, unique=True, index=True)
    
    # Source information
    chain_id = Column(Integer, ForeignKey("blockchain_chains.id"), nullable=False)
    vineyard_block_id = Column(Integer, ForeignKey("vineyard_blocks.id"), nullable=False)
    harvest_event_id = Column(Integer, ForeignKey("harvest_events.id"), nullable=True)
    
    # Blockchain reference
    blockchain_node_id = Column(Integer, ForeignKey("blockchain_nodes.id"), nullable=False)
    
    # Fruit details
    harvest_date = Column(DateTime, nullable=False)
    quantity_kg = Column(Float, nullable=False)
    brix = Column(Float, nullable=True)
    ph = Column(Float, nullable=True)
    total_acidity = Column(Float, nullable=True)
    
    # Quality metrics that might affect pricing/handling
    quality_grade = Column(String, nullable=True)  # A, B, C grade
    defect_percentage = Column(Float, nullable=True)
    
    # Traceability hash - summarizes entire vineyard blockchain
    provenance_hash = Column(String, nullable=False, index=True)
    
    # Delivery information
    delivered_to = Column(String, nullable=True)  # Winery/facility name
    delivery_confirmed_at = Column(DateTime, nullable=True)
    delivery_confirmed_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    chain = relationship("BlockchainChain")
    vineyard_block = relationship("VineyardBlock")
    # harvest_event = relationship("HarvestEvent")  # TODO: Add when HarvestEvent model exists
    blockchain_node = relationship("BlockchainNode")
    delivery_confirmed_by_user = relationship("User")