from typing import Tuple, List, Optional
from sqlalchemy.orm import Session
from db.models.site_risk import SiteRisk
from db.models.risk_action import RiskAction

class RiskBusinessLogic:
    """Business logic for risk management rules and validation"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def validate_residual_risk_reduction(
        self, 
        risk: SiteRisk, 
        new_residual_likelihood: int, 
        new_residual_severity: int
    ) -> Tuple[bool, str, List[str]]:
        """
        Validate if residual risk can be reduced below inherent risk.
        Returns: (is_valid, message, required_actions)
        """
        
        # Calculate new residual risk score
        new_residual_score = new_residual_likelihood * new_residual_severity
        
        # Can't reduce below inherent risk without completed actions
        if new_residual_score < risk.inherent_risk_score:
            
            # Get all actions for this risk
            actions = self.db.query(RiskAction).filter(
                RiskAction.risk_id == risk.id,
                RiskAction.status != "cancelled"
            ).all()
            
            if not actions:
                return (
                    False, 
                    "Cannot reduce residual risk below inherent risk without implementing control actions",
                    ["Create at least one risk management action"]
                )
            
            # Check for completed actions
            completed_actions = [a for a in actions if a.is_completed]
            if not completed_actions:
                incomplete_actions = [f"• {a.action_title}" for a in actions if not a.is_completed]
                return (
                    False,
                    "Cannot reduce residual risk without completing control actions",
                    incomplete_actions
                )
            
            # Check if high-priority actions are completed
            high_priority_incomplete = [
                a for a in actions 
                if a.is_high_priority and not a.is_completed
            ]
            
            if high_priority_incomplete:
                incomplete_high_priority = [f"• {a.action_title} (Priority: {a.priority})" for a in high_priority_incomplete]
                return (
                    False,
                    "High-priority actions must be completed before reducing residual risk",
                    incomplete_high_priority
                )
        
        # Additional validation: residual can't be higher than inherent
        if new_residual_score > risk.inherent_risk_score:
            return (
                False,
                "Residual risk cannot be higher than inherent risk",
                ["Review your risk assessment - residual risk should be equal to or lower than inherent risk"]
            )
        
        # Validation passed
        return (True, "Residual risk reduction is valid", [])
    
    def calculate_risk_reduction_effectiveness(self, risk: SiteRisk) -> dict:
        """Calculate how effective the implemented actions have been"""
        
        if not risk.has_residual_assessment:
            return {
                "has_assessment": False,
                "message": "No residual risk assessment available"
            }
        
        # Get completed actions
        completed_actions = self.db.query(RiskAction).filter(
            RiskAction.risk_id == risk.id,
            RiskAction.status == "completed"
        ).all()
        
        inherent_score = risk.inherent_risk_score
        residual_score = risk.residual_risk_score
        reduction = inherent_score - residual_score
        reduction_percentage = (reduction / inherent_score * 100) if inherent_score > 0 else 0
        
        # Calculate expected vs actual reduction
        expected_likelihood_reduction = sum(
            a.expected_likelihood_reduction or 0 for a in completed_actions
        )
        expected_severity_reduction = sum(
            a.expected_severity_reduction or 0 for a in completed_actions
        )
        
        actual_likelihood_reduction = risk.inherent_likelihood - (risk.residual_likelihood or risk.inherent_likelihood)
        actual_severity_reduction = risk.inherent_severity - (risk.residual_severity or risk.inherent_severity)
        
        return {
            "has_assessment": True,
            "inherent_score": inherent_score,
            "residual_score": residual_score,
            "risk_reduction": reduction,
            "reduction_percentage": round(reduction_percentage, 1),
            "completed_actions": len(completed_actions),
            "expected_likelihood_reduction": expected_likelihood_reduction,
            "expected_severity_reduction": expected_severity_reduction,
            "actual_likelihood_reduction": actual_likelihood_reduction,
            "actual_severity_reduction": actual_severity_reduction,
            "effectiveness": self._calculate_effectiveness_rating(
                expected_likelihood_reduction, actual_likelihood_reduction,
                expected_severity_reduction, actual_severity_reduction
            )
        }
    
    def get_risk_action_recommendations(self, risk: SiteRisk) -> List[dict]:
        """Get recommended actions based on risk characteristics"""
        
        recommendations = []
        
        # High/Critical risks need immediate preventive actions
        if risk.inherent_risk_level in ["high", "critical"]:
            recommendations.append({
                "action_type": "preventive",
                "control_type": "engineering",
                "priority": "critical" if risk.inherent_risk_level == "critical" else "high",
                "title": f"Implement engineering controls for {risk.risk_category} risk",
                "description": "Implement physical controls to prevent this risk from occurring"
            })
        
        # All risks should have detective controls
        recommendations.append({
            "action_type": "detective",
            "control_type": "administrative",
            "priority": "medium",
            "title": f"Establish monitoring for {risk.risk_category} risk",
            "description": "Set up regular inspections or monitoring to detect early signs"
        })
        
        # Category-specific recommendations
        if risk.risk_category == "weather":
            recommendations.append({
                "action_type": "mitigative",
                "control_type": "engineering",
                "priority": "medium",
                "title": "Install weather protection systems",
                "description": "Implement protective measures against weather events"
            })
        
        elif risk.risk_category == "pests_diseases":
            recommendations.append({
                "action_type": "preventive",
                "control_type": "administrative",
                "priority": "high",
                "title": "Develop pest/disease management plan",
                "description": "Create comprehensive prevention and treatment protocols"
            })
        
        elif risk.risk_category == "chemical":
            recommendations.append({
                "action_type": "preventive",
                "control_type": "engineering",
                "priority": "high",
                "title": "Implement chemical storage controls",
                "description": "Ensure proper storage, handling, and disposal procedures"
            })
            recommendations.append({
                "action_type": "preventive",
                "control_type": "ppe",
                "priority": "medium",
                "title": "Provide appropriate PPE",
                "description": "Ensure workers have proper protective equipment"
            })
        
        elif risk.risk_category == "personnel":
            recommendations.append({
                "action_type": "preventive",
                "control_type": "administrative",
                "priority": "high",
                "title": "Implement safety training program",
                "description": "Provide comprehensive safety training for all workers"
            })
        
        return recommendations
    
    def check_risk_review_schedule(self, company_id: int) -> List[dict]:
        """Check which risks are due for review"""
        
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        
        overdue_risks = self.db.query(SiteRisk).filter(
            SiteRisk.company_id == company_id,
            SiteRisk.next_review_due <= now,
            SiteRisk.status == "active"
        ).all()
        
        review_schedule = []
        for risk in overdue_risks:
            days_overdue = (now - risk.next_review_due).days if risk.next_review_due else 0
            
            review_schedule.append({
                "risk_id": risk.id,
                "risk_title": risk.risk_title,
                "risk_level": risk.residual_risk_level or risk.inherent_risk_level,
                "last_reviewed": risk.last_reviewed,
                "days_overdue": days_overdue,
                "review_priority": "urgent" if days_overdue > 30 else "high" if days_overdue > 7 else "medium"
            })
        
        return sorted(review_schedule, key=lambda x: x["days_overdue"], reverse=True)
    
    def validate_action_assignment(self, action: RiskAction, assigned_user_id: int) -> Tuple[bool, str]:
        """Validate if a user can be assigned to an action"""
        
        from db.models.user import User
        user = self.db.query(User).filter(User.id == assigned_user_id).first()
        
        if not user:
            return False, "User not found"
        
        if user.company_id != action.company_id:
            return False, "User must be from the same company"
        
        if not user.is_active:
            return False, "User account is not active"
        
        if user.role == "viewer":
            return False, "Viewers cannot be assigned actions"
        
        return True, "Assignment is valid"
    
    def _calculate_effectiveness_rating(
        self, 
        expected_likelihood: int, 
        actual_likelihood: int,
        expected_severity: int, 
        actual_severity: int
    ) -> dict:
        """Calculate effectiveness rating of implemented actions"""
        
        if expected_likelihood == 0 and expected_severity == 0:
            return {"rating": None, "message": "No expected reductions specified"}
        
        # Calculate effectiveness as percentage of expected vs actual
        likelihood_effectiveness = 0
        severity_effectiveness = 0
        
        if expected_likelihood > 0:
            likelihood_effectiveness = min(100, (actual_likelihood / expected_likelihood) * 100)
        
        if expected_severity > 0:
            severity_effectiveness = min(100, (actual_severity / expected_severity) * 100)
        
        overall_effectiveness = (likelihood_effectiveness + severity_effectiveness) / 2
        
        if overall_effectiveness >= 90:
            rating = "excellent"
        elif overall_effectiveness >= 75:
            rating = "good"
        elif overall_effectiveness >= 50:
            rating = "adequate"
        else:
            rating = "poor"
        
        return {
            "rating": rating,
            "percentage": round(overall_effectiveness, 1),
            "likelihood_effectiveness": round(likelihood_effectiveness, 1),
            "severity_effectiveness": round(severity_effectiveness, 1)
        }