"""
Block Service with Blockchain Integration
Handles vineyard block assignments and auto-creates blockchain chains
"""
from sqlalchemy.orm import Session
from db.models.block import VineyardBlock
from services.blockchain_service import BlockchainService

class BlockService:
    
    @staticmethod
    def assign_block_to_company(
        db: Session,
        block_id: int,
        company_id: int,
        assigned_by_user_id: int,
        season: str = None
    ) -> VineyardBlock:
        """
        Assign a vineyard block to a company and auto-create blockchain chain
        """
        # Get the block
        block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
        if not block:
            raise ValueError(f"Vineyard block {block_id} not found")
        
        old_company_id = block.company_id
        
        # Update block assignment
        block.company_id = company_id
        
        # Handle blockchain chain creation/management
        if old_company_id is None:
            # First time assignment - create new chain
            BlockchainService.auto_create_chain_on_assignment(
                db, block_id, company_id, assigned_by_user_id, season
            )
        elif old_company_id != company_id:
            # Reassignment - archive old chain and create new one
            BlockchainService.handle_company_reassignment(
                db, block_id, old_company_id, company_id, assigned_by_user_id, season
            )
        # If same company, do nothing (chain already exists)
        
        db.commit()
        
        return block
    
    @staticmethod
    def unassign_block_from_company(
        db: Session,
        block_id: int,
        unassigned_by_user_id: int,
        season: str = None
    ) -> VineyardBlock:
        """
        Unassign a vineyard block from a company and archive the blockchain chain
        """
        block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
        if not block:
            raise ValueError(f"Vineyard block {block_id} not found")
        
        if block.company_id:
            # Archive the blockchain chain
            BlockchainService.archive_chain_for_season(
                db, block_id, season or BlockchainService.get_current_season(), unassigned_by_user_id
            )
        
        # Clear company assignment
        block.company_id = None
        db.commit()
        
        return block
    
    @staticmethod
    def start_new_season(
        db: Session,
        block_id: int,
        new_season: str,
        user_id: int
    ) -> VineyardBlock:
        """
        Start a new season for a block - archive old chain, create new one
        """
        block = db.query(VineyardBlock).filter(VineyardBlock.id == block_id).first()
        if not block:
            raise ValueError(f"Vineyard block {block_id} not found")
        
        if not block.company_id:
            raise ValueError(f"Block {block_id} must be assigned to a company before starting new season")
        
        # Archive previous season chain
        previous_season = str(int(new_season) - 1)
        BlockchainService.archive_chain_for_season(db, block_id, previous_season, user_id)
        
        # Create new season chain
        BlockchainService.auto_create_chain_on_assignment(
            db, block_id, block.company_id, user_id, new_season
        )
        
        return block

# Example usage in your existing block update endpoint:
"""
@router.patch("/{block_id}")
def update_block(
    block_id: int,
    block_update: BlockUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Your existing update logic...
    
    # If company_id is being changed, use the blockchain-aware service
    if hasattr(block_update, 'company_id') and block_update.company_id is not None:
        block = BlockService.assign_block_to_company(
            db, block_id, block_update.company_id, current_user.id
        )
    else:
        # Regular update without company change
        # Your existing update logic...
    
    return block
"""