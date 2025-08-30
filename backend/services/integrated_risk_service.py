from typing import List, Dict, Optional, Tuple
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from db.models.site_risk import SiteRisk
from db.models.risk_action import RiskAction
from db.models.incident import Incident
from db.models.user import User
from db.models.task import Task

from services.risk_action_service import RiskActionService
from services.risk_logic import RiskBusinessLogic

class IntegratedRiskService:
    """
    Comprehensive service for integrated risk management across 
    site risks, actions, incidents, and tasks
    """
    
    def __init__(self, db: Session):
        self.db = db
        self.action_service = RiskActionService(db)
        self.risk_logic = RiskBusinessLogic(db)
    
    def create_risk_from_incident(
        self, 
        incident: Incident, 
        risk_data: dict,
        created_by: User
    ) -> SiteRisk:
        """Create a new risk based on an incident"""
        
        # Enrich risk data with incident context
        risk_data.update({
            "company_id": incident.company_id,
            "created_by": created_by.id,
            "risk_title": f"Risk identified from incident: {incident.incident_title}",
            "risk_description": f"Based on incident {incident.incident_number}: {incident.incident_description}",
            "location": incident.location,
            "location_description": incident.location_description,
            "custom_fields": {
                "source": "incident",
                "source_incident_id": incident.id,
                "source_incident_number": incident.incident_number
            }
        })
        
        # Create the risk
        risk = SiteRisk(**risk_data)
        risk.update_inherent_risk(risk_data["inherent_likelihood"], risk_data["inherent_severity"])
        risk.set_next_review_date()
        
        self.db.add(risk)
        self.db.flush()
        
        # Link incident to risk
        incident.related_risk_id = risk.id
        incident.new_risk_created = True
        
        # Create initial preventive action
        action_data = {
            "risk_id": risk.id,
            "action_title": f"Preventive measures for {risk.risk_category} risk",
            "action_description": f"Implement controls to prevent recurrence of incident {incident.incident_number}",
            "action_type": "preventive",
            "control_type": "administrative",
            "priority": "high" if incident.is_serious_incident else "medium",
            "urgency": "high",
            "auto_create_task": True,
            "requires_verification": incident.is_serious_incident
        }
        
        self.action_service.create_risk_action(action_data, created_by)
        
        self.db.commit()
        self.db.refresh(risk)
        
        return risk
    
    def get_company_risk_dashboard(self, company_id: int) -> dict:
        """Get comprehensive risk dashboard data for a company"""
        
        # Risk statistics
        risks = self.db.query(SiteRisk).filter(SiteRisk.company_id == company_id).all()
        
        risk_stats = {
            "total_risks": len(risks),
            "active_risks": len([r for r in risks if r.status == "active"]),
            "high_critical_risks": len([r for r in risks if r.is_high_risk]),
            "overdue_reviews": len([r for r in risks if r.is_review_overdue]),
            "risks_by_type": {},
            "risks_by_level": {}
        }
        
        # Group risks
        for risk in risks:
            risk_stats["risks_by_type"][risk.risk_type] = risk_stats["risks_by_type"].get(risk.risk_type, 0) + 1
            current_level = risk.residual_risk_level or risk.inherent_risk_level
            risk_stats["risks_by_level"][current_level] = risk_stats["risks_by_level"].get(current_level, 0) + 1
        
        open_risks = [r for r in risks if r.status == "active"]

        open_risk_stats = {
            "total_open_risks": len(open_risks),
            "high_critical_risks": len([r for r in open_risks if r.is_high_risk]),
            "overdue_reviews": len([r for r in open_risks if r.is_review_overdue]),
            "risks_by_type": {},
            "risks_by_level": {}
        }

        for risk in open_risks:
            open_risk_stats["risks_by_type"][risk.risk_type] = open_risk_stats["risks_by_type"].get(risk.risk_type, 0) + 1
            level = risk.residual_risk_level or risk.inherent_risk_level
            open_risk_stats["risks_by_level"][level] = open_risk_stats["risks_by_level"].get(level, 0) + 1



        # Action statistics
        actions = self.db.query(RiskAction).filter(RiskAction.company_id == company_id).all()
        
        action_stats = {
            "total_actions": len(actions),
            "completed_actions": len([a for a in actions if a.is_completed]),
            "overdue_actions": len([a for a in actions if a.is_overdue]),
            "high_priority_actions": len([a for a in actions if a.is_high_priority]),
            "completion_rate": 0,
            "actions_by_status": {}
        }
        
        if action_stats["total_actions"] > 0:
            action_stats["completion_rate"] = round(
                action_stats["completed_actions"] / action_stats["total_actions"] * 100, 1
            )
        
        for action in actions:
            action_stats["actions_by_status"][action.status] = action_stats["actions_by_status"].get(action.status, 0) + 1
        
        # Incident statistics (last 30 days)
        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        recent_incidents = self.db.query(Incident).filter(
            Incident.company_id == company_id,
            Incident.incident_date >= thirty_days_ago
        ).all()
        
        open_incidents = self.db.query(Incident).filter(
            Incident.company_id == company_id,
            Incident.status == "open"
        ).all()
        
        incident_stats = {
            "total_incidents_30d": len(recent_incidents),
            "notifiable_incidents_30d": len([i for i in recent_incidents if i.is_notifiable]),
            "serious_incidents_30d": len([i for i in recent_incidents if i.is_serious_incident]),
            "overdue_investigations": len([i for i in recent_incidents if i.is_overdue_investigation]),
            "incidents_by_type": {},
            "incidents_by_severity": {}
        }
        
        for incident in recent_incidents:
            incident_stats["incidents_by_type"][incident.incident_type] = incident_stats["incidents_by_type"].get(incident.incident_type, 0) + 1
            incident_stats["incidents_by_severity"][incident.severity] = incident_stats["incidents_by_severity"].get(incident.severity, 0) + 1
        

        open_incident_stats = {
            "total_open_incidents": len(open_incidents),
            "notifiable_open_incidents": len([i for i in open_incidents if i.is_notifiable]),
            "serious_open_incidents": len([i for i in open_incidents if i.is_serious_incident]),
            "overdue_investigations": len([i for i in open_incidents if i.is_overdue_investigation]),
            "incidents_by_type": {},
            "incidents_by_severity": {}
        }

        for incident in open_incidents:
            open_incident_stats["incidents_by_type"][incident.incident_type] = \
                open_incident_stats["incidents_by_type"].get(incident.incident_type, 0) + 1
            open_incident_stats["incidents_by_severity"][incident.severity] = \
                open_incident_stats["incidents_by_severity"].get(incident.severity, 0) + 1


        # Integration metrics
        integration_stats = {
            "risks_with_actions": len([r for r in risks if any(a.risk_id == r.id for a in actions)]),
            "incidents_linked_to_risks": self.db.query(func.count(Incident.id)).filter(
                Incident.company_id == company_id,
                Incident.related_risk_id.isnot(None)
            ).scalar() or 0,
            "new_risks_from_incidents": self.db.query(func.count(Incident.id)).filter(
                Incident.company_id == company_id,
                Incident.new_risk_created == True
            ).scalar() or 0
        }
        
        return {
            "risks": risk_stats,
            "actions": action_stats,
            "incidents": incident_stats,
            "integration": integration_stats,
            "generated_at": datetime.now(timezone.utc)
        }
    
    def get_overdue_items(self, company_id: int) -> dict:
        """Get all overdue items requiring attention"""
        
        now = datetime.now(timezone.utc)
        
        # Overdue risk reviews
        overdue_reviews = self.db.query(SiteRisk).filter(
            SiteRisk.company_id == company_id,
            SiteRisk.next_review_due <= now,
            SiteRisk.status == "active"
        ).all()
        
        # Overdue actions
        overdue_actions = self.db.query(RiskAction).filter(
            RiskAction.company_id == company_id,
            RiskAction.target_completion_date <= now,
            RiskAction.status.notin_(["completed", "cancelled"])
        ).all()
        
        # Overdue investigations
        overdue_investigations = self.db.query(Incident).filter(
            Incident.company_id == company_id,
            Incident.investigation_due_date <= now,
            Incident.investigation_status != "completed"
        ).all()
        
        # Notifiable incidents not yet notified
        unnotified_incidents = self.db.query(Incident).filter(
            Incident.company_id == company_id,
            Incident.is_notifiable == True,
            Incident.worksafe_notified == False
        ).all()
        
        return {
            "overdue_reviews": [
                {
                    "id": r.id,
                    "title": r.risk_title,
                    "level": r.residual_risk_level or r.inherent_risk_level,
                    "days_overdue": (now - r.next_review_due).days if r.next_review_due else 0,
                    "type": "risk_review"
                }
                for r in overdue_reviews
            ],
            "overdue_actions": [
                {
                    "id": a.id,
                    "title": a.action_title,
                    "priority": a.priority,
                    "days_overdue": (now - a.target_completion_date).days if a.target_completion_date else 0,
                    "assigned_to": a.assigned_to,
                    "type": "risk_action"
                }
                for a in overdue_actions
            ],
            "overdue_investigations": [
                {
                    "id": i.id,
                    "incident_number": i.incident_number,
                    "title": i.incident_title,
                    "severity": i.severity,
                    "days_overdue": (now - i.investigation_due_date).days if i.investigation_due_date else 0,
                    "type": "incident_investigation"
                }
                for i in overdue_investigations
            ],
            "unnotified_incidents": [
                {
                    "id": i.id,
                    "incident_number": i.incident_number,
                    "title": i.incident_title,
                    "severity": i.severity,
                    "notifiable_type": i.notifiable_type,
                    "days_since_incident": i.days_since_incident,
                    "type": "worksafe_notification"
                }
                for i in unnotified_incidents
            ]
        }
    
    def get_user_assigned_items(self, user_id: int) -> dict:
        """Get all items assigned to a specific user"""
        
        # Actions assigned to user
        assigned_actions = self.db.query(RiskAction).filter(
            RiskAction.assigned_to == user_id,
            RiskAction.status.notin_(["completed", "cancelled"])
        ).all()
        
        # Tasks assigned to user (including risk action tasks)
        assigned_tasks = self.db.query(Task).filter(
            Task.assigned_to == user_id,
            Task.status.notin_(["completed", "cancelled"])
        ).all()
        
        # Investigations assigned to user
        assigned_investigations = self.db.query(Incident).filter(
            Incident.investigator_id == user_id,
            Incident.investigation_status.in_(["pending", "in_progress"])
        ).all()
        
        return {
            "assigned_actions": [
                {
                    "id": a.id,
                    "title": a.action_title,
                    "priority": a.priority,
                    "due_date": a.target_completion_date,
                    "progress": a.progress_percentage,
                    "is_overdue": a.is_overdue,
                    "type": "risk_action"
                }
                for a in assigned_actions
            ],
            "assigned_tasks": [
                {
                    "id": t.id,
                    "title": t.title,
                    "priority": t.priority,
                    "due_date": t.due_date,
                    "type": "task"
                }
                for t in assigned_tasks
            ],
            "assigned_investigations": [
                {
                    "id": i.id,
                    "incident_number": i.incident_number,
                    "title": i.incident_title,
                    "severity": i.severity,
                    "due_date": i.investigation_due_date,
                    "is_overdue": i.is_overdue_investigation,
                    "type": "incident_investigation"
                }
                for i in assigned_investigations
            ]
        }
    
    def generate_risk_report(self, company_id: int, report_type: str = "monthly") -> dict:
        """Generate comprehensive risk management report"""
        
        # Determine date range
        now = datetime.now(timezone.utc)
        if report_type == "weekly":
            start_date = now - timedelta(days=7)
        elif report_type == "monthly":
            start_date = now - timedelta(days=30)
        elif report_type == "quarterly":
            start_date = now - timedelta(days=90)
        else:
            start_date = now - timedelta(days=365)
        
        # Get all data for the period
        risks = self.db.query(SiteRisk).filter(
            SiteRisk.company_id == company_id,
            SiteRisk.created_at >= start_date
        ).all()
        
        actions = self.db.query(RiskAction).filter(
            RiskAction.company_id == company_id,
            RiskAction.created_at >= start_date
        ).all()
        
        incidents = self.db.query(Incident).filter(
            Incident.company_id == company_id,
            Incident.incident_date >= start_date
        ).all()
        
        # Risk analysis
        new_risks = len(risks)
        high_critical_risks = len([r for r in risks if r.is_high_risk])
        risks_with_actions = len([r for r in risks if any(a.risk_id == r.id for a in actions)])
        
        # Action effectiveness
        completed_actions = [a for a in actions if a.is_completed]
        action_completion_rate = (len(completed_actions) / len(actions) * 100) if actions else 0
        
        # Incident trends
        serious_incidents = len([i for i in incidents if i.is_serious_incident])
        notifiable_incidents = len([i for i in incidents if i.is_notifiable])
        incidents_with_risks = len([i for i in incidents if i.related_risk_id])
        
        # Key metrics
        metrics = {
            "period": {
                "type": report_type,
                "start_date": start_date,
                "end_date": now
            },
            "risks": {
                "new_risks": new_risks,
                "high_critical_risks": high_critical_risks,
                "risks_with_actions": risks_with_actions,
                "risk_coverage": (risks_with_actions / new_risks * 100) if new_risks else 0
            },
            "actions": {
                "total_actions": len(actions),
                "completed_actions": len(completed_actions),
                "completion_rate": round(action_completion_rate, 1),
                "overdue_actions": len([a for a in actions if a.is_overdue])
            },
            "incidents": {
                "total_incidents": len(incidents),
                "serious_incidents": serious_incidents,
                "notifiable_incidents": notifiable_incidents,
                "incidents_linked_to_risks": incidents_with_risks,
                "risk_linkage_rate": (incidents_with_risks / len(incidents) * 100) if incidents else 0
            },
            "effectiveness": {
                "risks_reduced": len([r for r in risks if r.risk_reduced]),
                "average_action_effectiveness": self._calculate_average_effectiveness(completed_actions),
                "incident_recurrence_rate": self._calculate_recurrence_rate(incidents)
            }
        }
        
        return {
            "report_type": report_type,
            "generated_at": now,
            "company_id": company_id,
            "metrics": metrics,
            "recommendations": self._generate_recommendations(metrics),
            "top_risks": self._get_top_risks(company_id),
            "recent_incidents": self._get_recent_serious_incidents(incidents)
        }
    
    def perform_risk_health_check(self, company_id: int) -> dict:
        """Perform comprehensive health check of risk management system"""
        
        issues = []
        recommendations = []
        
        # Check for risks without actions
        risks_without_actions = self.db.query(SiteRisk).filter(
            SiteRisk.company_id == company_id,
            SiteRisk.status == "active",
            ~SiteRisk.id.in_(
                self.db.query(RiskAction.risk_id).filter(
                    RiskAction.company_id == company_id,
                    RiskAction.status != "cancelled"
                )
            )
        ).all()
        
        if risks_without_actions:
            issues.append({
                "type": "risks_without_actions",
                "severity": "medium",
                "count": len(risks_without_actions),
                "message": f"{len(risks_without_actions)} active risks have no management actions"
            })
            recommendations.append("Create action plans for all active risks")
        
        # Check for overdue items
        overdue_data = self.get_overdue_items(company_id)
        
        if overdue_data["overdue_reviews"]:
            issues.append({
                "type": "overdue_reviews",
                "severity": "high",
                "count": len(overdue_data["overdue_reviews"]),
                "message": f"{len(overdue_data['overdue_reviews'])} risks are overdue for review"
            })
            recommendations.append("Schedule and complete overdue risk reviews")
        
        if overdue_data["overdue_actions"]:
            issues.append({
                "type": "overdue_actions",
                "severity": "high",
                "count": len(overdue_data["overdue_actions"]),
                "message": f"{len(overdue_data['overdue_actions'])} risk actions are overdue"
            })
            recommendations.append("Complete or reschedule overdue risk actions")
        
        if overdue_data["unnotified_incidents"]:
            issues.append({
                "type": "unnotified_incidents",
                "severity": "critical",
                "count": len(overdue_data["unnotified_incidents"]),
                "message": f"{len(overdue_data['unnotified_incidents'])} notifiable incidents require WorkSafe notification"
            })
            recommendations.append("Immediately notify WorkSafe of notifiable incidents")
        
        # Check for high risks without recent actions
        high_risks = self.db.query(SiteRisk).filter(
            SiteRisk.company_id == company_id,
            or_(
                SiteRisk.inherent_risk_level.in_(["high", "critical"]),
                SiteRisk.residual_risk_level.in_(["high", "critical"])
            ),
            SiteRisk.status == "active"
        ).all()
        
        high_risks_without_recent_actions = []
        for risk in high_risks:
            recent_actions = self.db.query(RiskAction).filter(
                RiskAction.risk_id == risk.id,
                RiskAction.created_at >= datetime.now(timezone.utc) - timedelta(days=30)
            ).count()
            
            if recent_actions == 0:
                high_risks_without_recent_actions.append(risk)
        
        if high_risks_without_recent_actions:
            issues.append({
                "type": "stale_high_risks",
                "severity": "medium",
                "count": len(high_risks_without_recent_actions),
                "message": f"{len(high_risks_without_recent_actions)} high/critical risks have no recent actions"
            })
            recommendations.append("Review and update action plans for high-risk items")
        
        # Calculate overall health score
        total_possible_issues = 4  # Number of checks performed
        health_score = max(0, 100 - (len(issues) / total_possible_issues * 100))
        
        health_rating = "excellent" if health_score >= 90 else \
                       "good" if health_score >= 75 else \
                       "fair" if health_score >= 50 else "poor"
        
        return {
            "health_score": round(health_score, 1),
            "health_rating": health_rating,
            "issues_found": len(issues),
            "critical_issues": len([i for i in issues if i["severity"] == "critical"]),
            "issues": issues,
            "recommendations": recommendations,
            "checked_at": datetime.now(timezone.utc)
        }
    
    def _calculate_average_effectiveness(self, completed_actions: List[RiskAction]) -> Optional[float]:
        """Calculate average effectiveness rating of completed actions"""
        ratings = [a.effectiveness_rating for a in completed_actions if a.effectiveness_rating]
        return sum(ratings) / len(ratings) if ratings else None
    
    def _calculate_recurrence_rate(self, incidents: List[Incident]) -> float:
        """Calculate incident recurrence rate"""
        # Simplified calculation - would need more sophisticated logic
        total_incidents = len(incidents)
        if total_incidents == 0:
            return 0.0
        
        # Count incidents with similar categories (simplified)
        categories = {}
        for incident in incidents:
            categories[incident.category] = categories.get(incident.category, 0) + 1
        
        recurring_incidents = sum(count - 1 for count in categories.values() if count > 1)
        return (recurring_incidents / total_incidents * 100) if total_incidents else 0
    
    def _generate_recommendations(self, metrics: dict) -> List[str]:
        """Generate recommendations based on metrics"""
        recommendations = []
        
        if metrics["risks"]["risk_coverage"] < 80:
            recommendations.append("Increase risk coverage by creating action plans for more risks")
        
        if metrics["actions"]["completion_rate"] < 70:
            recommendations.append("Focus on improving action completion rates")
        
        if metrics["incidents"]["risk_linkage_rate"] < 60:
            recommendations.append("Improve incident investigation to identify related risks")
        
        if metrics["actions"]["overdue_actions"] > 5:
            recommendations.append("Address overdue actions to maintain risk control effectiveness")
        
        return recommendations
    
    def _get_top_risks(self, company_id: int, limit: int = 5) -> List[dict]:
        """Get top risks by score and priority"""
        risks = self.db.query(SiteRisk).filter(
            SiteRisk.company_id == company_id,
            SiteRisk.status == "active"
        ).order_by(
            SiteRisk.inherent_risk_score.desc(),
            SiteRisk.residual_risk_score.desc()
        ).limit(limit).all()
        
        return [
            {
                "id": r.id,
                "title": r.risk_title,
                "type": r.risk_type,
                "category": r.risk_category,
                "inherent_level": r.inherent_risk_level,
                "residual_level": r.residual_risk_level,
                "has_actions": self.db.query(RiskAction).filter(RiskAction.risk_id == r.id).count() > 0
            }
            for r in risks
        ]
    
    def _get_recent_serious_incidents(self, incidents: List[Incident], limit: int = 5) -> List[dict]:
        """Get recent serious incidents"""
        serious_incidents = [i for i in incidents if i.is_serious_incident]
        serious_incidents.sort(key=lambda x: x.incident_date, reverse=True)
        
        return [
            {
                "id": i.id,
                "incident_number": i.incident_number,
                "title": i.incident_title,
                "type": i.incident_type,
                "severity": i.severity,
                "date": i.incident_date,
                "is_notifiable": i.is_notifiable,
                "investigation_completed": i.investigation_status == "completed"
            }
            for i in serious_incidents[:limit]
        ]