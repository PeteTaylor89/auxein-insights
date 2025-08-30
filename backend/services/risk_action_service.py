from typing import Optional, List
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from db.models.risk_action import RiskAction
from db.models.site_risk import SiteRisk
from db.models.task import Task
from db.models.user import User
from utils.risk_permissions import RiskPermissions

class RiskActionService:
    """Service class for managing risk actions and their lifecycle"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_risk_action(
        self, 
        risk_action_data: dict, 
        created_by: User, 
        auto_create_task: bool = True
    ) -> RiskAction:
        """Create a new risk action and optionally create associated task"""
        
        # Verify permissions
        if not RiskPermissions.can_create_risk_action(created_by):
            raise PermissionError("User does not have permission to create risk actions")
        
        # Verify risk exists and belongs to user's company
        risk = self.db.query(SiteRisk).filter(
            SiteRisk.id == risk_action_data["risk_id"],
            SiteRisk.company_id == created_by.company_id
        ).first()
        
        if not risk:
            raise ValueError("Risk not found or access denied")
        
        # Create the risk action
        risk_action_data["company_id"] = created_by.company_id
        risk_action_data["created_by"] = created_by.id
        
        risk_action = RiskAction(**risk_action_data)
        self.db.add(risk_action)
        self.db.flush()  # Get the ID
        
        """
        # Create associated task if requested and assigned
        if auto_create_task and risk_action.assigned_to:
            task = self._create_task_for_action(risk_action)
            if task:
                risk_action.task_id = task.id
        """
        self.db.commit()
        self.db.refresh(risk_action)
        
        return risk_action
    
    def update_risk_action(
        self, 
        action_id: int, 
        update_data: dict, 
        updated_by: User
    ) -> RiskAction:
        """Update a risk action"""
        
        # Get the action
        action = self.db.query(RiskAction).filter(RiskAction.id == action_id).first()
        if not action:
            raise ValueError("Risk action not found")
        
        # Check permissions
        if not RiskPermissions.can_modify_risk_action(updated_by, action.company_id):
            raise PermissionError("User does not have permission to modify this risk action")
        
        # Update fields
        for field, value in update_data.items():
            if hasattr(action, field):
                setattr(action, field, value)
        
        # Handle task creation/updates
        if "assigned_to" in update_data and action.auto_create_task:
            if action.assigned_to and not action.task_id:
                # Create task if assigned and none exists
                task = self._create_task_for_action(action)
                if task:
                    action.task_id = task.id
            elif action.task_id and action.assigned_to:
                # Update existing task
                self._update_task_for_action(action)
        
        # Auto-update status based on progress
        if "progress_percentage" in update_data:
            if update_data["progress_percentage"] == 100 and action.status != "completed":
                action.status = "completed"
                action.actual_completion_date = datetime.now(timezone.utc)
            elif update_data["progress_percentage"] > 0 and action.status == "planned":
                action.status = "in_progress"
                if not action.actual_start_date:
                    action.actual_start_date = datetime.now(timezone.utc)
        
        self.db.commit()
        self.db.refresh(action)
        
        return action
    
    def complete_action(
        self, 
        action_id: int, 
        completion_data: dict, 
        completed_by: User
    ) -> RiskAction:
        """Mark an action as completed"""
        
        action = self.db.query(RiskAction).filter(RiskAction.id == action_id).first()
        if not action:
            raise ValueError("Risk action not found")
        
        # Check permissions (users can complete actions)
        if not RiskPermissions.can_complete_risk_action(completed_by, action.company_id):
            raise PermissionError("User does not have permission to complete this action")
        
        # Mark as completed
        action.mark_completed(
            completed_by.id, 
            completion_data.get("completion_notes")
        )
        
        if "actual_cost" in completion_data:
            action.actual_cost = completion_data["actual_cost"]
        
        # Update associated task
        if action.task_id:
            task = self.db.query(Task).filter(Task.id == action.task_id).first()
            if task:
                task.status = "completed"
                task.completion_date = action.actual_completion_date
        
        # Schedule next occurrence if recurring
        if action.is_recurring:
            action.schedule_next_occurrence()
            # Could auto-create next occurrence here
        
        self.db.commit()
        self.db.refresh(action)
        
        return action
    
    def verify_action(
        self, 
        action_id: int, 
        verification_data: dict,
        verified_by: User
    ) -> RiskAction:
        """Verify a completed action"""
        
        action = self.db.query(RiskAction).filter(RiskAction.id == action_id).first()
        if not action:
            raise ValueError("Risk action not found")
        
        # Check permissions (admin/manager can verify)
        if not RiskPermissions.can_modify_risk_action(verified_by, action.company_id):
            raise PermissionError("User does not have permission to verify this action")
        
        if not action.is_completed:
            raise ValueError("Action must be completed before verification")
        
        # Mark as verified
        action.verification_completed = True
        action.verification_date = datetime.now(timezone.utc)
        action.verified_by = verified_by.id
        action.verification_notes = verification_data.get("verification_notes")
        action.effectiveness_rating = verification_data.get("effectiveness_rating")
        action.effectiveness_notes = verification_data.get("effectiveness_notes")
        action.effectiveness_reviewed_by = verified_by.id
        action.effectiveness_reviewed_at = datetime.now(timezone.utc)
        
        self.db.commit()
        self.db.refresh(action)
        
        return action
    
    def check_overdue_actions(self, company_id: int) -> List[RiskAction]:
        """Get all overdue actions for a company"""
        
        now = datetime.now(timezone.utc)
        overdue_actions = self.db.query(RiskAction).filter(
            RiskAction.company_id == company_id,
            RiskAction.target_completion_date < now,
            RiskAction.status.notin_(["completed", "cancelled"])
        ).all()
        
        # Update status to overdue
        for action in overdue_actions:
            if action.status != "overdue":
                action.status = "overdue"
        
        self.db.commit()
        return overdue_actions
    
    def get_actions_by_risk(self, risk_id: int, user: User) -> List[RiskAction]:
        """Get all actions for a specific risk"""
        
        # Verify access to the risk
        risk = self.db.query(SiteRisk).filter(
            SiteRisk.id == risk_id,
            SiteRisk.company_id == user.company_id
        ).first()
        
        if not risk:
            raise ValueError("Risk not found or access denied")
        
        return self.db.query(RiskAction).filter(
            RiskAction.risk_id == risk_id
        ).order_by(RiskAction.priority.desc(), RiskAction.created_at).all()
    
    def can_reduce_residual_risk(self, risk_id: int) -> tuple[bool, str]:
        """Check if residual risk can be reduced (requires completed actions)"""
        
        actions = self.db.query(RiskAction).filter(
            RiskAction.risk_id == risk_id,
            RiskAction.status != "cancelled"
        ).all()
        
        if not actions:
            return False, "No risk management actions have been created"
        
        completed_actions = [a for a in actions if a.is_completed]
        if not completed_actions:
            return False, "No actions have been completed yet"
        
        # Check if all high-priority actions are completed
        high_priority_actions = [a for a in actions if a.is_high_priority]
        incomplete_high_priority = [a for a in high_priority_actions if not a.is_completed]
        
        if incomplete_high_priority:
            return False, f"{len(incomplete_high_priority)} high-priority actions still incomplete"
        
        return True, f"{len(completed_actions)} actions completed"
    
    def get_action_metrics(self, company_id: int, days: int = 30) -> dict:
        """Get action performance metrics for a company"""
        
        since_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        actions = self.db.query(RiskAction).filter(
            RiskAction.company_id == company_id,
            RiskAction.created_at >= since_date
        ).all()
        
        total_actions = len(actions)
        completed_actions = len([a for a in actions if a.is_completed])
        overdue_actions = len([a for a in actions if a.is_overdue])
        in_progress_actions = len([a for a in actions if a.status == "in_progress"])
        
        completion_rate = (completed_actions / total_actions * 100) if total_actions > 0 else 0
        
        # Calculate average completion time
        completed_with_duration = [a for a in actions if a.duration_days is not None]
        avg_completion_days = None
        if completed_with_duration:
            avg_completion_days = sum(a.duration_days for a in completed_with_duration) / len(completed_with_duration)
        
        # Calculate cost variance
        actions_with_costs = [a for a in actions if a.cost_variance is not None]
        cost_variance_total = sum(a.cost_variance for a in actions_with_costs) if actions_with_costs else None
        
        # Calculate average effectiveness
        actions_with_effectiveness = [a for a in actions if a.effectiveness_rating is not None]
        effectiveness_average = None
        if actions_with_effectiveness:
            effectiveness_average = sum(a.effectiveness_rating for a in actions_with_effectiveness) / len(actions_with_effectiveness)
        
        return {
            "total_actions": total_actions,
            "completed_actions": completed_actions,
            "overdue_actions": overdue_actions,
            "in_progress_actions": in_progress_actions,
            "completion_rate": round(completion_rate, 1),
            "average_completion_days": round(avg_completion_days, 1) if avg_completion_days else None,
            "cost_variance_total": float(cost_variance_total) if cost_variance_total else None,
            "effectiveness_average": round(effectiveness_average, 1) if effectiveness_average else None
        }
    
    def create_recurring_actions(self, company_id: int) -> List[RiskAction]:
        """Create new instances of recurring actions that are due"""
        
        now = datetime.now(timezone.utc)
        
        # Find recurring actions that are due
        due_recurring_actions = self.db.query(RiskAction).filter(
            RiskAction.company_id == company_id,
            RiskAction.is_recurring == True,
            RiskAction.next_due_date <= now,
            RiskAction.status == "completed"
        ).all()
        
        new_actions = []
        for action in due_recurring_actions:
            new_action = action.create_recurring_action()
            if new_action:
                new_action.company_id = company_id
                self.db.add(new_action)
                new_actions.append(new_action)
                
                # Create task if needed
                if new_action.auto_create_task and new_action.assigned_to:
                    task = self._create_task_for_action(new_action)
                    if task:
                        new_action.task_id = task.id
        
        if new_actions:
            self.db.commit()
            for action in new_actions:
                self.db.refresh(action)
        
        return new_actions
    
    def _create_task_for_action(self, action: RiskAction) -> Optional[Task]:
        """Create a task for a risk action"""
        
        if not action.assigned_to:
            return None
        
        # Get the risk title for context
        risk = self.db.query(SiteRisk).filter(SiteRisk.id == action.risk_id).first()
        risk_title = risk.risk_title if risk else "Unknown Risk"
        
        task_data = {
            "title": f"Risk Action: {action.action_title}",
            "description": f"Risk: {risk_title}\n\nAction: {action.action_description}",
            "priority": self._map_action_priority_to_task(action.priority),
            "status": "planned",
            "due_date": action.target_completion_date.date() if action.target_completion_date else None,
            "created_by": action.created_by,
            "assigned_to": action.assigned_to,
            "block_id": None  # Risk actions are company-wide
        }
        
        task = Task(**task_data)
        self.db.add(task)
        self.db.flush()  # Get the ID
        
        return task
    
    def _update_task_for_action(self, action: RiskAction):
        """Update the associated task when action changes"""
        
        if not action.task_id:
            return
        
        task = self.db.query(Task).filter(Task.id == action.task_id).first()
        if not task:
            return
        
        # Update task fields based on action
        task.title = f"Risk Action: {action.action_title}"
        task.description = f"Action: {action.action_description}"
        task.priority = self._map_action_priority_to_task(action.priority)
        task.due_date = action.target_completion_date.date() if action.target_completion_date else None
        task.assigned_to = action.assigned_to
        
        # Update task status based on action status
        if action.status == "completed":
            task.status = "completed"
            task.completion_date = action.actual_completion_date.date() if action.actual_completion_date else None
        elif action.status == "in_progress":
            task.status = "in_progress"
        elif action.status == "cancelled":
            task.status = "cancelled"
        else:
            task.status = "planned"
    
    def _map_action_priority_to_task(self, action_priority: str) -> str:
        """Map action priority to task priority"""
        priority_mapping = {
            "critical": "high",
            "high": "high",
            "medium": "medium",
            "low": "low"
        }
        return priority_mapping.get(action_priority, "medium")
    
    def delete_risk_action(self, action_id: int, deleted_by: User) -> bool:
        """Delete a risk action (admin/manager only)"""
        
        action = self.db.query(RiskAction).filter(RiskAction.id == action_id).first()
        if not action:
            raise ValueError("Risk action not found")
        
        # Check permissions (similar to risk deletion)
        if not RiskPermissions.can_modify_risk_action(deleted_by, action.company_id):
            raise PermissionError("User does not have permission to delete this action")
        
        # Additional check: only admin or creator can delete
        if deleted_by.role not in ["owner", "admin"] and action.created_by != deleted_by.id:
            raise PermissionError("Only administrators or the action creator can delete actions")
        
        # Delete associated task if exists
        if action.task_id:
            task = self.db.query(Task).filter(Task.id == action.task_id).first()
            if task:
                self.db.delete(task)
        
        self.db.delete(action)
        self.db.commit()
        
        return True