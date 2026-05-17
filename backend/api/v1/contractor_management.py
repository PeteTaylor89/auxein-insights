# api/v1/contractor_management.py - Contractor management endpoints (Phase B, Grow V1)
import logging
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from db.session import get_db
from db.models.user import User
from db.models.contractor import Contractor
from db.models.contractor_relationship import ContractorRelationship
from db.models.contractor_assignment import ContractorAssignment
from db.models.contractor_movement import ContractorMovement
from db.models.contractor_training import ContractorTraining
from api.deps import get_current_user, get_current_user_or_contractor
from schemas.contractor import (
    ContractorRelationshipCreate, ContractorRelationshipUpdate,
    ContractorAssignmentCreate, ContractorAssignmentUpdate,
    ContractorCheckIn, ContractorCheckOut,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== B1: CONTRACTOR MANAGEMENT ====================

@router.get("/contractors")
def list_contractors(
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List contractors with active relationships to the current user's company."""
    if not current_user.has_permission("contractors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    query = db.query(Contractor).join(
        ContractorRelationship,
        ContractorRelationship.contractor_id == Contractor.id
    ).filter(
        ContractorRelationship.company_id == current_user.company_id
    )

    if status_filter:
        query = query.filter(ContractorRelationship.status == status_filter)

    contractors = query.all()

    # Enrich with relationship info
    result = []
    for c in contractors:
        rel = db.query(ContractorRelationship).filter(
            ContractorRelationship.contractor_id == c.id,
            ContractorRelationship.company_id == current_user.company_id
        ).first()

        result.append({
            "id": c.id,
            "business_name": c.business_name,
            "contact_person": c.contact_person,
            "email": c.email,
            "phone": c.phone,
            "contractor_type": c.contractor_type,
            "specializations": c.specializations or [],
            "verification_level": c.verification_level,
            "is_verified": c.is_verified,
            "total_jobs_completed": c.total_jobs_completed,
            "average_rating": c.average_rating,
            "last_active_date": str(c.last_active_date) if c.last_active_date else None,
            "insurance_status": c.insurance_status,
            "biosecurity_risk_level": c.biosecurity_risk_level,
            "relationship": {
                "id": rel.id,
                "status": rel.status,
                "relationship_type": rel.relationship_type,
                "hourly_rate": float(rel.hourly_rate) if rel.hourly_rate else None,
                "daily_rate": float(rel.daily_rate) if rel.daily_rate else None,
                "jobs_completed_for_company": rel.jobs_completed_for_company,
                "company_rating": float(rel.company_rating) if rel.company_rating else None,
                "contract_start": str(rel.contract_start) if rel.contract_start else None,
                "contract_end": str(rel.contract_end) if rel.contract_end else None,
            } if rel else None,
        })

    return result


@router.get("/contractors/directory")
def list_contractor_directory(
    search: Optional[str] = Query(None, max_length=200),
    specialization: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all Auxein-provisioned contractors so an admin can pick one to engage.

    Marks contractors the caller's company already has a live relationship with via
    `existing_relationship_status`. Returns only public-ish fields (no contact details
    beyond business name / contact person, no insurance amounts).
    """
    if not current_user.has_permission("contractors", "create"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    query = db.query(Contractor).filter(Contractor.is_active == True)

    if search:
        like = f"%{search.strip()}%"
        query = query.filter(
            (Contractor.business_name.ilike(like)) |
            (Contractor.contact_person.ilike(like)) |
            (Contractor.email.ilike(like))
        )

    contractors = query.order_by(Contractor.business_name.asc()).limit(500).all()

    # Pull existing relationships for this company in one shot
    contractor_ids = [c.id for c in contractors]
    existing = {}
    if contractor_ids:
        rels = db.query(ContractorRelationship).filter(
            ContractorRelationship.contractor_id.in_(contractor_ids),
            ContractorRelationship.company_id == current_user.company_id,
            ContractorRelationship.status.in_(["active", "suspended", "inactive", "pending"]),
        ).all()
        existing = {r.contractor_id: r.status for r in rels}

    result = []
    for c in contractors:
        specs = c.specializations or []
        if specialization and specialization not in specs:
            continue
        result.append({
            "id": c.id,
            "business_name": c.business_name,
            "contact_person": c.contact_person,
            "contractor_type": c.contractor_type,
            "specializations": specs,
            "is_verified": c.is_verified,
            "verification_level": c.verification_level,
            "insurance_status": c.insurance_status,
            "existing_relationship_status": existing.get(c.id),
        })
    return result


@router.get("/contractors/lookup")
def lookup_contractor_by_email(
    email: str = Query(..., min_length=3),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Look up an existing contractor by email so an admin can create a relationship.

    Returns a minimal summary if found (regardless of whether a relationship already
    exists with the caller's company — the create endpoint enforces the no-duplicate rule).
    Returns 404 if no contractor exists with that email — V1 has no self-signup, so the
    admin would need to contact Auxein to provision the account.
    """
    if not current_user.has_permission("contractors", "create"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    contractor = db.query(Contractor).filter(
        Contractor.email == email.strip().lower()
    ).first()
    if not contractor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No contractor account found with that email. Ask Auxein to provision one.",
        )

    existing_rel = db.query(ContractorRelationship).filter(
        ContractorRelationship.contractor_id == contractor.id,
        ContractorRelationship.company_id == current_user.company_id,
        ContractorRelationship.status.in_(["active", "suspended"]),
    ).first()

    return {
        "id": contractor.id,
        "business_name": contractor.business_name,
        "contact_person": contractor.contact_person,
        "email": contractor.email,
        "phone": contractor.phone,
        "contractor_type": contractor.contractor_type,
        "specializations": contractor.specializations or [],
        "is_verified": contractor.is_verified,
        "insurance_status": contractor.insurance_status,
        "existing_relationship": {
            "id": existing_rel.id,
            "status": existing_rel.status,
        } if existing_rel else None,
    }


@router.get("/contractors/{contractor_id}")
def get_contractor_detail(
    contractor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get full contractor profile including insurance, biosecurity, verification."""
    if not current_user.has_permission("contractors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    # Verify relationship exists
    rel = db.query(ContractorRelationship).filter(
        ContractorRelationship.contractor_id == contractor_id,
        ContractorRelationship.company_id == current_user.company_id
    ).first()
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found for your company")

    contractor = db.query(Contractor).filter(Contractor.id == contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")

    return {
        "id": contractor.id,
        "business_name": contractor.business_name,
        "business_number": contractor.business_number,
        "contact_person": contractor.contact_person,
        "email": contractor.email,
        "phone": contractor.phone,
        "mobile": contractor.mobile,
        "address": contractor.address,
        "contractor_type": contractor.contractor_type,
        "specializations": contractor.specializations or [],
        "equipment_owned": contractor.equipment_owned or [],
        # Insurance
        "public_liability_insurer": contractor.public_liability_insurer,
        "public_liability_policy_number": contractor.public_liability_policy_number,
        "public_liability_coverage_amount": float(contractor.public_liability_coverage_amount) if contractor.public_liability_coverage_amount else None,
        "public_liability_expiry": str(contractor.public_liability_expiry) if contractor.public_liability_expiry else None,
        "professional_indemnity_insurer": contractor.professional_indemnity_insurer,
        "professional_indemnity_expiry": str(contractor.professional_indemnity_expiry) if contractor.professional_indemnity_expiry else None,
        "workers_comp_required": contractor.workers_comp_required,
        "workers_comp_expiry": str(contractor.workers_comp_expiry) if contractor.workers_comp_expiry else None,
        "insurance_status": contractor.insurance_status,
        # Biosecurity
        "has_cleaning_protocols": contractor.has_cleaning_protocols,
        "cleaning_equipment_owned": contractor.cleaning_equipment_owned or [],
        "uses_approved_disinfectants": contractor.uses_approved_disinfectants,
        "works_multiple_regions": contractor.works_multiple_regions,
        "works_with_high_risk_crops": contractor.works_with_high_risk_crops,
        "biosecurity_risk_level": contractor.biosecurity_risk_level,
        "last_biosecurity_training": str(contractor.last_biosecurity_training) if contractor.last_biosecurity_training else None,
        # Verification
        "verification_level": contractor.verification_level,
        "is_verified": contractor.is_verified,
        "verification_documents": contractor.verification_documents or [],
        # Performance
        "total_jobs_completed": contractor.total_jobs_completed,
        "average_rating": contractor.average_rating,
        "last_active_date": str(contractor.last_active_date) if contractor.last_active_date else None,
        # Relationship details
        "relationship": {
            "id": rel.id,
            "status": rel.status,
            "relationship_type": rel.relationship_type,
            "hourly_rate": float(rel.hourly_rate) if rel.hourly_rate else None,
            "daily_rate": float(rel.daily_rate) if rel.daily_rate else None,
            "contract_start": str(rel.contract_start) if rel.contract_start else None,
            "contract_end": str(rel.contract_end) if rel.contract_end else None,
            "can_create_observations": rel.can_create_observations,
            "can_update_tasks": rel.can_update_tasks,
            "requires_supervision": rel.requires_supervision,
            "jobs_completed_for_company": rel.jobs_completed_for_company,
            "company_rating": float(rel.company_rating) if rel.company_rating else None,
            "total_hours_worked": float(rel.total_hours_worked) if rel.total_hours_worked else None,
            "emergency_contact_name": rel.emergency_contact_name,
            "emergency_contact_phone": rel.emergency_contact_phone,
        },
    }


@router.get("/contractor-relationships")
def list_contractor_relationships(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all contractor relationships for the current user's company."""
    if not current_user.has_permission("contractors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    relationships = db.query(ContractorRelationship).filter(
        ContractorRelationship.company_id == current_user.company_id
    ).all()

    result = []
    for rel in relationships:
        contractor = db.query(Contractor).filter(Contractor.id == rel.contractor_id).first()
        result.append({
            "id": rel.id,
            "contractor_id": rel.contractor_id,
            "contractor_name": contractor.business_name if contractor else "Unknown",
            "contact_person": contractor.contact_person if contractor else None,
            "email": contractor.email if contractor else None,
            "phone": contractor.phone if contractor else None,
            "status": rel.status,
            "relationship_type": rel.relationship_type,
            "contract_start": str(rel.contract_start) if rel.contract_start else None,
            "contract_end": str(rel.contract_end) if rel.contract_end else None,
            "hourly_rate": float(rel.hourly_rate) if rel.hourly_rate else None,
            "daily_rate": float(rel.daily_rate) if rel.daily_rate else None,
            "jobs_completed_for_company": rel.jobs_completed_for_company,
            "last_worked_date": str(rel.last_worked_date) if rel.last_worked_date else None,
            "company_notes": rel.company_notes,
            "created_at": str(rel.created_at) if rel.created_at else None,
        })

    return result


@router.post("/contractor-relationships", status_code=status.HTTP_201_CREATED)
def create_contractor_relationship(
    rel_in: ContractorRelationshipCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create/invite a contractor relationship."""
    if not current_user.has_permission("contractors", "create"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    # Verify contractor exists
    contractor = db.query(Contractor).filter(Contractor.id == rel_in.contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")

    # Block creating a duplicate if a live relationship already exists. Terminated
    # ones are historical and don't block a fresh engagement.
    existing = db.query(ContractorRelationship).filter(
        ContractorRelationship.contractor_id == rel_in.contractor_id,
        ContractorRelationship.company_id == current_user.company_id,
        ContractorRelationship.status.in_(["active", "suspended", "inactive", "pending"])
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"A {existing.status} relationship with this contractor already exists",
        )

    rel_data = rel_in.model_dump()
    rel_data["company_id"] = current_user.company_id
    rel_data["created_by"] = current_user.id
    rel_data["status"] = "active"

    rel = ContractorRelationship(**rel_data)
    db.add(rel)
    db.commit()
    db.refresh(rel)

    logger.info(f"Contractor relationship {rel.id} created by user {current_user.id}")
    return {"id": rel.id, "status": rel.status, "message": "Relationship created"}


@router.patch("/contractor-relationships/{relationship_id}")
def update_contractor_relationship(
    relationship_id: int,
    rel_in: ContractorRelationshipUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update a contractor relationship (approve, suspend, terminate)."""
    if not current_user.has_permission("contractors", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    rel = db.query(ContractorRelationship).filter(
        ContractorRelationship.id == relationship_id,
        ContractorRelationship.company_id == current_user.company_id
    ).first()
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found")

    update_data = rel_in.model_dump(exclude_unset=True)

    # Handle termination
    if update_data.get("status") == "terminated":
        update_data["terminated_by"] = current_user.id
        update_data["termination_date"] = datetime.now(timezone.utc)

    for field, value in update_data.items():
        if hasattr(rel, field):
            setattr(rel, field, value)

    db.commit()
    db.refresh(rel)

    logger.info(f"Contractor relationship {rel.id} updated to status={rel.status} by user {current_user.id}")
    return {"id": rel.id, "status": rel.status, "message": "Relationship updated"}


@router.post("/contractor-relationships/{relationship_id}/verify-insurance")
def verify_contractor_insurance(
    relationship_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark a contractor's insurance as verified."""
    if not current_user.has_permission("contractors", "update"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    rel = db.query(ContractorRelationship).filter(
        ContractorRelationship.id == relationship_id,
        ContractorRelationship.company_id == current_user.company_id
    ).first()
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found")

    contractor = db.query(Contractor).filter(Contractor.id == rel.contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")

    # Update verification level
    contractor.verification_level = "basic" if contractor.verification_level == "none" else contractor.verification_level
    contractor.is_verified = True
    db.commit()

    return {"message": "Insurance verified", "verification_level": contractor.verification_level}


@router.get("/contractors/{contractor_id}/assignments")
def get_contractor_assignments(
    contractor_id: int,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get task assignments for a contractor at the current company."""
    if not current_user.has_permission("contractors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    query = db.query(ContractorAssignment).filter(
        ContractorAssignment.contractor_id == contractor_id,
        ContractorAssignment.company_id == current_user.company_id
    )
    if status_filter:
        query = query.filter(ContractorAssignment.status == status_filter)

    assignments = query.order_by(ContractorAssignment.created_at.desc()).all()

    return [{
        "id": a.id,
        "task_id": a.task_id,
        "assignment_type": a.assignment_type,
        "work_description": a.work_description,
        "status": a.status,
        "priority": a.priority,
        "scheduled_start": str(a.scheduled_start) if a.scheduled_start else None,
        "scheduled_end": str(a.scheduled_end) if a.scheduled_end else None,
        "actual_hours_worked": float(a.actual_hours_worked) if a.actual_hours_worked else None,
        "completion_percentage": a.completion_percentage,
        "quality_rating": float(a.quality_rating) if a.quality_rating else None,
        "created_at": str(a.created_at) if a.created_at else None,
    } for a in assignments]


@router.get("/contractors/{contractor_id}/movements")
def get_contractor_movements(
    contractor_id: int,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get movement/visit history for a contractor at the current company."""
    if not current_user.has_permission("contractors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    movements = db.query(ContractorMovement).filter(
        ContractorMovement.contractor_id == contractor_id,
        ContractorMovement.company_id == current_user.company_id
    ).order_by(ContractorMovement.arrival_datetime.desc()).limit(limit).all()

    return [{
        "id": m.id,
        "arrival_datetime": str(m.arrival_datetime) if m.arrival_datetime else None,
        "departure_datetime": str(m.departure_datetime) if m.departure_datetime else None,
        "purpose": m.purpose,
        "blocks_visited": m.blocks_visited or [],
        "equipment_brought": m.equipment_brought or [],
        "equipment_cleaned": m.equipment_cleaned,
        "biosecurity_risk_level": m.biosecurity_risk_level,
        "status": m.status,
        "hours_worked": float(m.hours_worked) if m.hours_worked else None,
        "vehicle_registration": m.vehicle_registration,
    } for m in movements]


@router.get("/contractors/{contractor_id}/training")
def get_contractor_training(
    contractor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get training status for a contractor at the current company."""
    if not current_user.has_permission("contractors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    training_records = db.query(ContractorTraining).filter(
        ContractorTraining.contractor_id == contractor_id,
        ContractorTraining.assigning_company_id == current_user.company_id
    ).all()

    return [{
        "id": t.id,
        "training_module_id": t.training_module_id,
        "status": t.status,
        "priority": t.priority,
        "due_date": str(t.due_date) if t.due_date else None,
        "score": float(t.score) if t.score else None,
        "passed": t.passed,
        "progress_percentage": t.progress_percentage,
        "valid_until": str(t.valid_until) if t.valid_until else None,
        "is_overdue": t.is_overdue,
        "certificate_issued": t.certificate_issued,
    } for t in training_records]


# ==================== B2: TASK ASSIGNMENT ENDPOINTS ====================

@router.post("/tasks/{task_id}/contractor-assignments", status_code=status.HTTP_201_CREATED)
def assign_contractor_to_task(
    task_id: int,
    assignment_in: ContractorAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Assign a contractor to a task."""
    if not current_user.has_permission("contractors", "assign"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    # Verify contractor has active relationship with company
    rel = db.query(ContractorRelationship).filter(
        ContractorRelationship.contractor_id == assignment_in.contractor_id,
        ContractorRelationship.company_id == current_user.company_id,
        ContractorRelationship.status == "active"
    ).first()
    if not rel:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contractor has no active relationship with your company")

    assignment_data = assignment_in.model_dump()
    assignment_data["task_id"] = task_id
    assignment_data["company_id"] = current_user.company_id
    assignment_data["assigned_by"] = current_user.id
    assignment_data["status"] = "assigned"

    assignment = ContractorAssignment(**assignment_data)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    logger.info(f"Contractor {assignment_in.contractor_id} assigned to task {task_id} by user {current_user.id}")
    return {"id": assignment.id, "status": assignment.status, "message": "Contractor assigned to task"}


@router.get("/tasks/{task_id}/contractor-assignments")
def list_task_contractor_assignments(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List contractor assignments for a task."""
    if not current_user.has_permission("contractors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    assignments = db.query(ContractorAssignment).filter(
        ContractorAssignment.task_id == task_id,
        ContractorAssignment.company_id == current_user.company_id
    ).all()

    result = []
    for a in assignments:
        contractor = db.query(Contractor).filter(Contractor.id == a.contractor_id).first()
        result.append({
            "id": a.id,
            "contractor_id": a.contractor_id,
            "contractor_name": contractor.business_name if contractor else "Unknown",
            "status": a.status,
            "priority": a.priority,
            "scheduled_start": str(a.scheduled_start) if a.scheduled_start else None,
            "scheduled_end": str(a.scheduled_end) if a.scheduled_end else None,
            "completion_percentage": a.completion_percentage,
        })
    return result


@router.patch("/contractor-assignments/{assignment_id}")
def update_contractor_assignment(
    assignment_id: int,
    assignment_in: ContractorAssignmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_contractor),
):
    """Update assignment status (accepted/declined/completed). Accessible by company users and contractors."""
    assignment = db.query(ContractorAssignment).filter(
        ContractorAssignment.id == assignment_id
    ).first()
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assignment not found")

    # Access check: company user or the assigned contractor
    is_company_user = hasattr(current_user, 'company_id') and assignment.company_id == current_user.company_id
    is_assigned_contractor = hasattr(current_user, 'contractor_type') and current_user.id == assignment.contractor_id

    if not is_company_user and not is_assigned_contractor:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    update_data = assignment_in.model_dump(exclude_unset=True)

    # Track completion
    if update_data.get("status") == "completed":
        update_data["actual_end"] = datetime.now(timezone.utc)
        if is_company_user:
            update_data["completed_by"] = current_user.id

    for field, value in update_data.items():
        if hasattr(assignment, field):
            setattr(assignment, field, value)

    db.commit()
    db.refresh(assignment)

    return {"id": assignment.id, "status": assignment.status, "message": "Assignment updated"}


# ==================== B3: BIOSECURITY MOVEMENT ENDPOINTS ====================

@router.post("/contractor-movements/check-in", status_code=status.HTTP_201_CREATED)
def contractor_check_in(
    check_in: ContractorCheckIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_contractor),
):
    """Log contractor arrival with GPS, equipment, biosecurity declaration."""
    # Determine contractor_id and company_id based on who's checking in
    if hasattr(current_user, 'contractor_type'):
        # Contractor checking themselves in
        contractor_id = current_user.id
        company_id = check_in.company_id
        if not company_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="company_id is required for contractor check-in")
    else:
        # Company user checking in a contractor
        contractor_id = check_in.contractor_id
        company_id = current_user.company_id
        if not contractor_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="contractor_id is required")

    movement = ContractorMovement(
        contractor_id=contractor_id,
        company_id=company_id,
        arrival_datetime=datetime.now(timezone.utc),
        purpose=check_in.purpose,
        equipment_brought=check_in.equipment_brought or [],
        previous_location_name=check_in.previous_location_name,
        vehicle_registration=check_in.vehicle_registration,
        check_in_notes=check_in.notes,
        status="in_progress",
        checked_in_by=current_user.id if hasattr(current_user, 'company_id') else None,
        logged_by=current_user.id if hasattr(current_user, 'company_id') else None,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)

    logger.info(f"Contractor {contractor_id} checked in at company {company_id}, movement {movement.id}")
    return {"id": movement.id, "status": movement.status, "arrival_datetime": str(movement.arrival_datetime)}


@router.post("/contractor-movements/{movement_id}/check-out")
def contractor_check_out(
    movement_id: int,
    check_out: ContractorCheckOut,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user_or_contractor),
):
    """Log contractor departure."""
    movement = db.query(ContractorMovement).filter(
        ContractorMovement.id == movement_id
    ).first()
    if not movement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movement not found")

    # Access check
    is_company_user = hasattr(current_user, 'company_id') and movement.company_id == current_user.company_id
    is_contractor = hasattr(current_user, 'contractor_type') and current_user.id == movement.contractor_id
    if not is_company_user and not is_contractor:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    movement.departure_datetime = datetime.now(timezone.utc)
    movement.work_summary = check_out.work_summary
    movement.hours_worked = check_out.hours_worked
    movement.equipment_cleaned = check_out.equipment_cleaned
    movement.check_out_notes = check_out.notes
    movement.status = "completed"
    movement.checked_out_by = current_user.id if is_company_user else None

    db.commit()
    db.refresh(movement)

    logger.info(f"Contractor checked out, movement {movement.id}")
    return {"id": movement.id, "status": movement.status, "departure_datetime": str(movement.departure_datetime)}


@router.get("/contractor-movements")
def list_contractor_movements(
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List contractor movements for the current company."""
    if not current_user.has_permission("contractors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    movements = db.query(ContractorMovement).filter(
        ContractorMovement.company_id == current_user.company_id
    ).order_by(ContractorMovement.arrival_datetime.desc()).limit(limit).all()

    result = []
    for m in movements:
        contractor = db.query(Contractor).filter(Contractor.id == m.contractor_id).first()
        result.append({
            "id": m.id,
            "contractor_id": m.contractor_id,
            "contractor_name": contractor.contact_person if contractor else "Unknown",
            "arrival_datetime": str(m.arrival_datetime) if m.arrival_datetime else None,
            "departure_datetime": str(m.departure_datetime) if m.departure_datetime else None,
            "purpose": m.purpose,
            "status": m.status,
            "biosecurity_risk_level": m.biosecurity_risk_level,
            "equipment_cleaned": m.equipment_cleaned,
            "hours_worked": float(m.hours_worked) if m.hours_worked else None,
        })
    return result


@router.get("/contractor-movements/{movement_id}")
def get_contractor_movement_detail(
    movement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get movement detail."""
    if not current_user.has_permission("contractors", "read"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    movement = db.query(ContractorMovement).filter(
        ContractorMovement.id == movement_id,
        ContractorMovement.company_id == current_user.company_id
    ).first()
    if not movement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movement not found")

    return {
        "id": movement.id,
        "contractor_id": movement.contractor_id,
        "company_id": movement.company_id,
        "arrival_datetime": str(movement.arrival_datetime) if movement.arrival_datetime else None,
        "departure_datetime": str(movement.departure_datetime) if movement.departure_datetime else None,
        "purpose": movement.purpose,
        "blocks_visited": movement.blocks_visited or [],
        "areas_accessed": movement.areas_accessed or [],
        "equipment_brought": movement.equipment_brought or [],
        "equipment_cleaned": movement.equipment_cleaned,
        "cleaning_method": movement.cleaning_method,
        "cleaning_products_used": movement.cleaning_products_used or [],
        "biosecurity_risk_level": movement.biosecurity_risk_level,
        "risk_factors": movement.risk_factors or [],
        "risk_mitigation_measures": movement.risk_mitigation_measures or [],
        "vehicle_registration": movement.vehicle_registration,
        "vehicle_cleaned": movement.vehicle_cleaned,
        "safety_briefing_given": movement.safety_briefing_given,
        "ppe_provided": movement.ppe_provided or [],
        "work_summary": movement.work_summary,
        "hours_worked": float(movement.hours_worked) if movement.hours_worked else None,
        "status": movement.status,
        "check_in_notes": movement.check_in_notes,
        "check_out_notes": movement.check_out_notes,
    }
