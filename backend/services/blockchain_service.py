"""
Flexible Season Management for Viticultural Edge Cases
Handles dessert wines, late harvest, multiple harvest scenarios
"""
import hashlib
import json
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, date
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, desc

from db.models.blockchain import BlockchainChain, BlockchainNode, BlockchainEvent, FruitReceived
from db.models.block import VineyardBlock

class FlexibleSeasonManager:
    
    @staticmethod
    def get_season_definitions() -> Dict[str, Dict]:
        """
        Define different season types for various wine production scenarios
        """
        return {
            "standard": {
                "name": "Standard Table Wine",
                "start_month": 3,  # March
                "typical_harvest_months": [3, 4, 5],  # Mar-May
                "expected_end_month": 2,  # February next year
                "allow_overlap": False
            },
            "dessert_late_harvest": {
                "name": "Dessert Wine - Late Harvest",
                "start_month": 3,  # March
                "typical_harvest_months": [5, 6, 7],  # May-July (late harvest)
                "expected_end_month": 8,  # August (pruning starts immediately)
                "allow_overlap": True,  # Can overlap with next season
                "max_duration_months": 18
            },
            "ice_wine": {
                "name": "Ice Wine",
                "start_month": 3,  # March
                "typical_harvest_months": [7, 8, 9],  # July-September (winter harvest)
                "expected_end_month": 10,  # October
                "allow_overlap": True,
                "max_duration_months": 20
            },
            "multi_harvest": {
                "name": "Multiple Harvest",
                "start_month": 3,  # March
                "typical_harvest_months": [3, 4, 5, 6, 7],  # Extended harvest period
                "expected_end_month": 2,  # February next year
                "allow_overlap": False,
                "allow_multiple_harvests": True
            }
        }
    
    @staticmethod
    def determine_season_type(vineyard_block_id: int, db: Session) -> str:
        """
        Determine the appropriate season type based on block characteristics
        This could be stored on the block or inferred from variety/clone
        """
        block = db.query(VineyardBlock).filter(VineyardBlock.id == vineyard_block_id).first()
        if not block:
            return "standard"
        
        # Logic to determine season type based on variety, clone, or user settings
        variety_lower = (block.variety or "").lower()
        
        if any(dessert in variety_lower for dessert in ["riesling", "gewurztraminer", "semillon"]):
            return "dessert_late_harvest"
        elif "ice" in variety_lower or block.elevation and block.elevation > 500:  # High altitude
            return "ice_wine"
        else:
            return "standard"
    
    @staticmethod
    def calculate_flexible_season(
        reference_date: date, 
        season_type: str = "standard", 
        vineyard_block_id: int = None
    ) -> Tuple[str, Dict]:
        """
        Calculate season identifier with flexible rules based on season type
        Returns (season_id, season_info)
        """
        season_defs = FlexibleSeasonManager.get_season_definitions()
        season_def = season_defs.get(season_type, season_defs["standard"])
        
        start_month = season_def["start_month"]
        
        if reference_date.month >= start_month:
            # Current season
            season_year = reference_date.year + 1  # Harvest year
        else:
            # Previous season
            season_year = reference_date.year
        
        # Create flexible season identifier
        if season_type == "standard":
            season_id = str(season_year)
        else:
            season_id = f"{season_year}-{season_type}"
        
        season_info = {
            "season_id": season_id,
            "season_type": season_type,
            "season_year": season_year,
            "definition": season_def,
            "calculated_on": reference_date.isoformat()
        }
        
        return season_id, season_info

class BlockchainService:
    
    @staticmethod
    def get_active_chain_for_block(db: Session, vineyard_block_id: int, season_id: str = None) -> Optional[BlockchainChain]:
        """Get the active blockchain chain for a block in a specific season"""
        if season_id is None:
            # Get the most recent active chain
            chain = db.query(BlockchainChain).filter(
                and_(
                    BlockchainChain.vineyard_block_id == vineyard_block_id,
                    BlockchainChain.is_active == True
                )
            ).order_by(desc(BlockchainChain.created_at)).first()
        else:
            chain = db.query(BlockchainChain).filter(
                and_(
                    BlockchainChain.vineyard_block_id == vineyard_block_id,
                    BlockchainChain.season_id == season_id,
                    BlockchainChain.is_active == True
                )
            ).first()
        
        return chain
    
    @staticmethod
    def auto_create_chain_on_assignment(
        db: Session, 
        vineyard_block_id: int, 
        company_id: int, 
        assigned_by_user_id: int,
        season_type: str = None,
        force_new_season: bool = False
    ) -> BlockchainChain:
        """
        Auto-create blockchain chain with flexible season management
        """
        # Determine season type
        if season_type is None:
            season_type = FlexibleSeasonManager.determine_season_type(vineyard_block_id, db)
        
        # Calculate current season
        season_id, season_info = FlexibleSeasonManager.calculate_flexible_season(
            date.today(), season_type, vineyard_block_id
        )
        
        # Check for existing active chains
        existing_chain = BlockchainService.get_active_chain_for_block(db, vineyard_block_id, season_id)
        
        if existing_chain and not force_new_season:
            print(f"Chain already exists for block {vineyard_block_id}, season {season_id}")
            return existing_chain
        
        # Handle overlapping seasons for dessert wines
        season_def = season_info["definition"]
        if season_def.get("allow_overlap", False):
            # Check if there's a previous season still active
            previous_chains = db.query(BlockchainChain).filter(
                and_(
                    BlockchainChain.vineyard_block_id == vineyard_block_id,
                    BlockchainChain.is_active == True,
                    BlockchainChain.season_id != season_id
                )
            ).all()
            
            for prev_chain in previous_chains:
                # Check if previous season should be archived
                if BlockchainService._should_archive_overlapping_chain(prev_chain, season_info):
                    prev_chain.is_active = False
                    prev_chain.archived_at = datetime.utcnow()
                    prev_chain.archived_by_user_id = assigned_by_user_id
                    prev_chain.archive_reason = f"Overlapped by new season {season_id}"
        
        # Get block details
        block = db.query(VineyardBlock).filter(VineyardBlock.id == vineyard_block_id).first()
        if not block:
            raise ValueError(f"Vineyard block {vineyard_block_id} not found")
        
        # Create genesis data with flexible season info
        genesis_data = {
            "type": "genesis",
            "action": "company_assignment",
            "vineyard_block_id": vineyard_block_id,
            "company_id": company_id,
            "season_info": season_info,
            "block_name": block.block_name,
            "variety": block.variety,
            "clone": block.clone,
            "season_type": season_type,
            "planted_date": block.planted_date.isoformat() if block.planted_date else None,
            "area": block.area,
            "assigned_at": datetime.utcnow().isoformat(),
            "assigned_by": assigned_by_user_id
        }
        
        genesis_hash = BlockchainService._calculate_hash(genesis_data)
        
        # Create chain with flexible season tracking
        chain = BlockchainChain(
            vineyard_block_id=vineyard_block_id,
            company_id=company_id,
            season_id=season_id,
            season_type=season_type,
            season_info=season_info,
            chain_name=f"{block.block_name} - {block.variety} ({season_id})" if block.block_name and block.variety else f"Block {vineyard_block_id} ({season_id})",
            genesis_hash=genesis_hash,
            current_head_hash=genesis_hash,
            created_by_assignment=True,
            assignment_user_id=assigned_by_user_id
        )
        
        db.add(chain)
        db.flush()
        
        # Create genesis node
        genesis_node = BlockchainNode(
            chain_id=chain.id,
            node_type="genesis",
            parent_hashes=[],
            node_hash=genesis_hash,
            blockchain_data=genesis_data,
            sequence_number=0,
            confirmed_at=datetime.utcnow(),
            confirmed_by_user_id=assigned_by_user_id
        )
        
        db.add(genesis_node)
        db.commit()
        
        print(f"Auto-created flexible blockchain chain {chain.id} for block {vineyard_block_id}, season {season_id} ({season_type})")
        
        return chain
    
    @staticmethod
    def handle_late_harvest_scenario(
        db: Session,
        vineyard_block_id: int,
        harvest_date: date,
        user_id: int
    ) -> BlockchainChain:
        """
        Handle late harvest scenarios where harvest extends beyond typical season
        """
        # Determine if this is a late harvest situation
        current_chain = BlockchainService.get_active_chain_for_block(db, vineyard_block_id)
        
        if not current_chain:
            raise ValueError(f"No active chain found for block {vineyard_block_id}")
        
        season_info = current_chain.season_info or {}
        season_def = season_info.get("definition", {})
        typical_harvest_months = season_def.get("typical_harvest_months", [3, 4, 5])
        
        # Check if harvest is outside typical months
        if harvest_date.month not in typical_harvest_months:
            # This is a late harvest - update chain to reflect this
            current_chain.season_type = "dessert_late_harvest"
            current_chain.chain_name += " (Late Harvest)"
            
            # Update season info
            updated_season_info = season_info.copy()
            updated_season_info["late_harvest_detected"] = True
            updated_season_info["actual_harvest_date"] = harvest_date.isoformat()
            current_chain.season_info = updated_season_info
            
            db.commit()
            
            print(f"Updated chain {current_chain.id} for late harvest scenario")
        
        return current_chain
    
    @staticmethod
    def create_overlapping_season_chain(
        db: Session,
        vineyard_block_id: int,
        company_id: int,
        user_id: int,
        new_season_type: str,
        reason: str = "Overlapping season required"
    ) -> BlockchainChain:
        """
        Create a new season chain while keeping the previous one active
        Used for dessert wines where pruning starts before harvest is complete
        """
        # Get current active chain
        current_chain = BlockchainService.get_active_chain_for_block(db, vineyard_block_id)
        
        # Create new season
        new_season_id, new_season_info = FlexibleSeasonManager.calculate_flexible_season(
            date.today(), new_season_type, vineyard_block_id
        )
        
        # Mark current chain as "overlapped" but keep it active
        if current_chain:
            current_chain.archive_reason = f"Overlapped by {new_season_id} - {reason}"
            current_chain.updated_at = datetime.utcnow()
        
        # Create new chain
        new_chain = BlockchainService.auto_create_chain_on_assignment(
            db, vineyard_block_id, company_id, user_id, new_season_type, force_new_season=True
        )
        
        return new_chain
    
    @staticmethod
    def _should_archive_overlapping_chain(chain: BlockchainChain, new_season_info: Dict) -> bool:
        """
        Determine if an overlapping chain should be archived
        """
        if not chain.season_info:
            return True  # Archive old chains without season info
        
        # Check duration limits
        chain_created = chain.created_at
        months_active = (datetime.utcnow() - chain_created).days / 30.44  # Average month length
        
        max_duration = new_season_info["definition"].get("max_duration_months", 12)
        
        return months_active > max_duration
    
    @staticmethod
    def _calculate_hash(data: Dict[str, Any]) -> str:
        """Calculate SHA-256 hash of data"""
        json_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.sha256(json_str.encode()).hexdigest()

# Usage examples:
"""
# Standard table wine
chain = BlockchainService.auto_create_chain_on_assignment(db, block_id, company_id, user_id)

# Dessert wine with late harvest
chain = BlockchainService.auto_create_chain_on_assignment(db, block_id, company_id, user_id, "dessert_late_harvest")

# Handle actual late harvest scenario
chain = BlockchainService.handle_late_harvest_scenario(db, block_id, harvest_date, user_id)

# Create overlapping season (pruning starts before harvest complete)
new_chain = BlockchainService.create_overlapping_season_chain(
    db, block_id, company_id, user_id, "standard", "Pruning started before dessert harvest complete"
)
"""