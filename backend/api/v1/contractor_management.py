# api/v1/contractor_management.py - Contractor management endpoints (Phase B, Grow V1)
import logging
import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File as FastAPIFile, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from db.session import get_db
from db.models.user import User
from db.models.contractor import Contractor
from db.models.contractor_relationship import ContractorRelationship
from db.models.contractor_assignment import ContractorAssignment
from db.models.contractor_movement import ContractorMovement
from db.models.contractor_training import ContractorTraining
from db.models.company import Company
from db.models.task import Task
from db.models.block import VineyardBlock
from db.models.property import Property
from db.models.incident import Incident
from db.models.observation_template import ObservationTemplate
from db.models.observation_run import ObservationRun, ObservationSpot
from api.deps import get_current_user, get_current_user_or_contractor, get_current_contractor
from core.security.password import get_password_hash, verify_password, is_password_strong
from services import file_storage
from schemas.contractor import (
    ContractorRelationshipCreate, ContractorRelationshipUpdate,
    ContractorAssignmentCreate, ContractorAssignmentUpdate,
    ContractorCheckIn, ContractorCheckOut,
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ---- Self-service payload schemas (inline — only used by /me/* endpoints) ----

class ContractorProfileUpdate(BaseModel):
    business_name: Optional[str] = Field(None, max_length=200)
    business_number: Optional[str] = Field(None, max_length=50)
    contact_person: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    mobile: Optional[str] = Field(None, max_length=20)
    address: Optional[str] = None
    contractor_type: Optional[str] = Field(None, max_length=50)
    specializations: Optional[List[str]] = None
    equipment_owned: Optional[List[str]] = None
    has_cleaning_protocols: Optional[bool] = None
    cleaning_equipment_owned: Optional[List[str]] = None
    uses_approved_disinfectants: Optional[bool] = None


class ContractorInsuranceUpdate(BaseModel):
    public_liability_insurer: Optional[str] = Field(None, max_length=100)
    public_liability_policy_number: Optional[str] = Field(None, max_length=100)
    public_liability_coverage_amount: Optional[float] = None
    public_liability_expiry: Optional[date] = None
    professional_indemnity_insurer: Optional[str] = Field(None, max_length=100)
    professional_indemnity_policy_number: Optional[str] = Field(None, max_length=100)
    professional_indemnity_coverage_amount: Optional[float] = None
    professional_indemnity_expiry: Optional[date] = None
    workers_comp_required: Optional[bool] = None
    workers_comp_insurer: Optional[str] = Field(None, max_length=100)
    workers_comp_policy_number: Optional[str] = Field(None, max_length=100)
    workers_comp_expiry: Optional[date] = None
    equipment_insurance_insurer: Optional[str] = Field(None, max_length=100)
    equipment_insurance_coverage_amount: Optional[float] = None
    equipment_insurance_expiry: Optional[date] = None
    vehicle_insurance_insurer: Optional[str] = Field(None, max_length=100)
    vehicle_insurance_policy_number: Optional[str] = Field(None, max_length=100)
    vehicle_insurance_expiry: Optional[date] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


POLICY_TYPES = {
    "public_liability",
    "professional_indemnity",
    "workers_comp",
    "equipment_insurance",
    "vehicle_insurance",
    "other",
}


def _contractor_profile_dict(c: Contractor) -> Dict[str, Any]:
    """Full contractor profile payload used by /me/profile GET + write responses."""
    return {
        "id": c.id,
        "business_name": c.business_name,
        "business_number": c.business_number,
        "contact_person": c.contact_person,
        "email": c.email,
        "phone": c.phone,
        "mobile": c.mobile,
        "address": c.address,
        "contractor_type": c.contractor_type,
        "specializations": c.specializations or [],
        "equipment_owned": c.equipment_owned or [],
        # Insurance — all five policies surfaced flat
        "public_liability_insurer": c.public_liability_insurer,
        "public_liability_policy_number": c.public_liability_policy_number,
        "public_liability_coverage_amount": float(c.public_liability_coverage_amount) if c.public_liability_coverage_amount else None,
        "public_liability_expiry": str(c.public_liability_expiry) if c.public_liability_expiry else None,
        "professional_indemnity_insurer": c.professional_indemnity_insurer,
        "professional_indemnity_policy_number": c.professional_indemnity_policy_number,
        "professional_indemnity_coverage_amount": float(c.professional_indemnity_coverage_amount) if c.professional_indemnity_coverage_amount else None,
        "professional_indemnity_expiry": str(c.professional_indemnity_expiry) if c.professional_indemnity_expiry else None,
        "workers_comp_required": c.workers_comp_required,
        "workers_comp_insurer": c.workers_comp_insurer,
        "workers_comp_policy_number": c.workers_comp_policy_number,
        "workers_comp_expiry": str(c.workers_comp_expiry) if c.workers_comp_expiry else None,
        "equipment_insurance_insurer": c.equipment_insurance_insurer,
        "equipment_insurance_coverage_amount": float(c.equipment_insurance_coverage_amount) if c.equipment_insurance_coverage_amount else None,
        "equipment_insurance_expiry": str(c.equipment_insurance_expiry) if c.equipment_insurance_expiry else None,
        "vehicle_insurance_insurer": c.vehicle_insurance_insurer,
        "vehicle_insurance_policy_number": c.vehicle_insurance_policy_number,
        "vehicle_insurance_expiry": str(c.vehicle_insurance_expiry) if c.vehicle_insurance_expiry else None,
        "insurance_status": c.insurance_status,
        # Biosecurity
        "has_cleaning_protocols": c.has_cleaning_protocols,
        "cleaning_equipment_owned": c.cleaning_equipment_owned or [],
        "uses_approved_disinfectants": c.uses_approved_disinfectants,
        "biosecurity_risk_level": c.biosecurity_risk_level,
        # Verification + status
        "is_active": c.is_active,
        "is_verified": c.is_verified,
        "verification_level": c.verification_level,
        "registration_status": c.registration_status,
        "total_jobs_completed": c.total_jobs_completed,
        "average_rating": float(c.average_rating) if c.average_rating else 0.0,
    }


def _make_contractor_doc_s3_key(contractor_id: int, stored_filename: str, on_date: Optional[date] = None) -> str:
    """Contractor-scoped S3 key — NOT under a company prefix because contractor
    insurance docs belong to the contractor, not any single company they work for."""
    today = on_date or date.today()
    return f"contractors/{contractor_id}/insurance/{today.year}/{today.month:02d}/{stored_filename}"


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


# ==================== CONTRACTOR SELF-SERVICE ====================
# Endpoints a contractor calls against THEIR OWN data, across all companies they
# have relationships with. Gated on get_current_contractor (rejects user tokens).

@router.get("/me/relationships")
def list_my_relationships(
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
):
    """Return every contractor relationship for the authenticated contractor,
    joined with company name. Used by mobile Contracts tab."""
    rows = (
        db.query(ContractorRelationship, Company)
        .join(Company, Company.id == ContractorRelationship.company_id)
        .filter(ContractorRelationship.contractor_id == current_contractor.id)
        .order_by(
            # preferred contractors first, then active before everything else,
            # then most-recently-worked
            (ContractorRelationship.relationship_type == "preferred_contractor").desc(),
            (ContractorRelationship.status == "active").desc(),
            ContractorRelationship.last_worked_date.desc().nulls_last(),
        )
        .all()
    )

    return [{
        "id": rel.id,
        "company_id": company.id,
        "company_name": company.name,
        "status": rel.status,
        "relationship_type": rel.relationship_type,
        "is_preferred": rel.relationship_type == "preferred_contractor",
        "hourly_rate": float(rel.hourly_rate) if rel.hourly_rate else None,
        "daily_rate": float(rel.daily_rate) if rel.daily_rate else None,
        "currency": rel.currency,
        "contract_start": str(rel.contract_start) if rel.contract_start else None,
        "contract_end": str(rel.contract_end) if rel.contract_end else None,
        "contract_status": rel.contract_status,
        "last_worked_date": str(rel.last_worked_date) if rel.last_worked_date else None,
        "jobs_completed_for_company": rel.jobs_completed_for_company,
        "total_hours_worked": float(rel.total_hours_worked or 0),
        "blocks_access": rel.blocks_access or [],
        "required_training_modules": rel.required_training_modules or [],
        "completed_training_modules": rel.completed_training_modules or [],
        "has_required_training": rel.has_required_training(),
        "contractor_notes": rel.contractor_notes,
        "can_work_today": rel.can_work_today,
    } for rel, company in rows]


@router.get("/me/relationships/{relationship_id}")
def get_my_relationship(
    relationship_id: int,
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
):
    """Detail view for a single relationship the authenticated contractor owns."""
    rel = db.query(ContractorRelationship).filter(
        ContractorRelationship.id == relationship_id,
        ContractorRelationship.contractor_id == current_contractor.id,
    ).first()
    if not rel:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Relationship not found")

    company = db.query(Company).filter(Company.id == rel.company_id).first()

    return {
        "id": rel.id,
        "company_id": rel.company_id,
        "company_name": company.name if company else "Unknown",
        "status": rel.status,
        "relationship_type": rel.relationship_type,
        "is_preferred": rel.relationship_type == "preferred_contractor",
        "hourly_rate": float(rel.hourly_rate) if rel.hourly_rate else None,
        "daily_rate": float(rel.daily_rate) if rel.daily_rate else None,
        "currency": rel.currency,
        "preferred_payment_terms": rel.preferred_payment_terms,
        "contract_start": str(rel.contract_start) if rel.contract_start else None,
        "contract_end": str(rel.contract_end) if rel.contract_end else None,
        "contract_status": rel.contract_status,
        "days_until_contract_end": rel.days_until_contract_end,
        "last_worked_date": str(rel.last_worked_date) if rel.last_worked_date else None,
        "jobs_completed_for_company": rel.jobs_completed_for_company,
        "total_hours_worked": float(rel.total_hours_worked or 0),
        "total_amount_paid": float(rel.total_amount_paid or 0),
        "company_rating": float(rel.company_rating or 0),
        "blocks_access": rel.blocks_access or [],
        "areas_restricted": rel.areas_restricted or [],
        "preferred_work_types": rel.preferred_work_types or [],
        "work_restrictions": rel.work_restrictions or [],
        "required_training_modules": rel.required_training_modules or [],
        "completed_training_modules": rel.completed_training_modules or [],
        "missing_training": rel.get_missing_training(),
        "has_required_training": rel.has_required_training(),
        "requires_supervision": rel.requires_supervision,
        "can_create_observations": rel.can_create_observations,
        "can_update_tasks": rel.can_update_tasks,
        "contractor_notes": rel.contractor_notes,
        "emergency_contact_name": rel.emergency_contact_name,
        "emergency_contact_phone": rel.emergency_contact_phone,
        "can_work_today": rel.can_work_today,
    }


# ---- Profile (self) ----

@router.get("/me/profile")
def get_my_profile(
    current_contractor: Contractor = Depends(get_current_contractor),
) -> Dict[str, Any]:
    """Full contractor profile + insurance + biosecurity. Used by mobile Profile tab."""
    return _contractor_profile_dict(current_contractor)


@router.patch("/me/profile")
def update_my_profile(
    payload: ContractorProfileUpdate,
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> Dict[str, Any]:
    """Update editable profile fields. Email is intentionally not editable here —
    it's the login identifier and would need a separate verification flow.

    Re-queries `contractor` via this request's `db` because the instance
    returned by `get_current_contractor` is attached to a different session
    in some setups (FastAPI dep caching subtleties around yielded deps).
    Mutating the re-queried object guarantees commit + refresh work."""
    contractor = db.query(Contractor).filter(Contractor.id == current_contractor.id).first()
    if not contractor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(contractor, field, value)
    db.commit()
    db.refresh(contractor)
    return _contractor_profile_dict(contractor)


@router.patch("/me/insurance")
def update_my_insurance(
    payload: ContractorInsuranceUpdate,
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> Dict[str, Any]:
    """Update insurance policy fields. PATCH so the mobile can submit one
    policy section at a time without clobbering the others."""
    contractor = db.query(Contractor).filter(Contractor.id == current_contractor.id).first()
    if not contractor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(contractor, field, value)
    db.commit()
    db.refresh(contractor)
    return _contractor_profile_dict(contractor)


@router.post("/me/password")
def change_my_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> Dict[str, str]:
    """Change password. Requires current password to authorise."""
    contractor = db.query(Contractor).filter(Contractor.id == current_contractor.id).first()
    if not contractor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")

    if not verify_password(payload.current_password, contractor.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    strong, issues = is_password_strong(payload.new_password)
    if not strong:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="; ".join(issues))

    contractor.hashed_password = get_password_hash(payload.new_password)
    db.commit()
    return {"message": "Password updated"}


# ---- Movements (recent check-ins) ----

@router.get("/me/movements")
def list_my_movements(
    limit: int = Query(10, le=50),
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> List[Dict[str, Any]]:
    """Recent ContractorMovement records (any company) — for the Profile timeline."""
    rows = (
        db.query(ContractorMovement, Company, Property)
        .join(Company, Company.id == ContractorMovement.company_id)
        .outerjoin(Property, Property.id == ContractorMovement.property_id)
        .filter(ContractorMovement.contractor_id == current_contractor.id)
        .order_by(ContractorMovement.arrival_datetime.desc())
        .limit(limit)
        .all()
    )
    return [{
        "id": m.id,
        "company_id": m.company_id,
        "company_name": company.name,
        "property_id": m.property_id,
        "property_name": prop.name if prop else None,
        "arrival_datetime": str(m.arrival_datetime) if m.arrival_datetime else None,
        "departure_datetime": str(m.departure_datetime) if m.departure_datetime else None,
        "purpose": m.purpose,
        "blocks_visited_count": len(m.blocks_visited or []),
        "biosecurity_risk_level": m.biosecurity_risk_level,
        "equipment_cleaned": m.equipment_cleaned,
    } for m, company, prop in rows]


# ---- Assignments (work the contractor is scheduled to do) ----

_ACTIVE_ASSIGNMENT_STATUSES = ("assigned", "accepted", "in_progress", "paused")


@router.get("/me/assignments")
def list_my_assignments(
    include_completed: bool = Query(False, description="Include completed/cancelled/rejected"),
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> List[Dict[str, Any]]:
    """All ContractorAssignments for the authenticated contractor across every
    company they have a relationship with. Used by the mobile Tasks tab.

    Joins to Company (always) and optionally to Task → Block → Property when
    the assignment is tied to a specific task. General-work assignments
    (`task_id IS NULL`) won't have block/property context — that's fine, the
    work_description is the title in that case."""
    query = (
        db.query(ContractorAssignment, Company, Task, VineyardBlock, Property)
        .join(Company, Company.id == ContractorAssignment.company_id)
        .outerjoin(Task, Task.id == ContractorAssignment.task_id)
        .outerjoin(VineyardBlock, VineyardBlock.id == Task.block_id)
        .outerjoin(Property, Property.id == VineyardBlock.property_id)
        .filter(ContractorAssignment.contractor_id == current_contractor.id)
    )
    if not include_completed:
        query = query.filter(ContractorAssignment.status.in_(_ACTIVE_ASSIGNMENT_STATUSES))

    # Active first, then by soonest scheduled start (nulls last)
    rows = query.order_by(
        ContractorAssignment.status.in_(_ACTIVE_ASSIGNMENT_STATUSES).desc(),
        ContractorAssignment.scheduled_start.asc().nulls_last(),
        ContractorAssignment.created_at.desc(),
    ).all()

    return [{
        "id": a.id,
        "task_id": a.task_id,
        "title": task.title if task else (a.work_description[:80] if a.work_description else 'Untitled work'),
        "work_description": a.work_description,
        "assignment_type": a.assignment_type,
        "status": a.status,
        "priority": a.priority,
        "is_overdue": a.is_overdue,
        "days_overdue": a.days_overdue,
        "completion_percentage": a.completion_percentage,
        "scheduled_start": str(a.scheduled_start) if a.scheduled_start else None,
        "scheduled_end": str(a.scheduled_end) if a.scheduled_end else None,
        "estimated_hours": float(a.estimated_hours) if a.estimated_hours else None,
        "actual_hours_worked": float(a.actual_hours_worked) if a.actual_hours_worked else None,
        # Context badges for the mobile row
        "company_id": company.id,
        "company_name": company.name,
        "block_id": block.id if block else None,
        "block_name": block.block_name if block else None,
        "property_id": prop.id if prop else None,
        "property_name": prop.name if prop else None,
        # Useful for the warning-chip case: assigned task on a different property
        # than the contractor is currently checked into (Sprint 3 wires this).
        "blocks_involved_count": len(a.blocks_involved or []),
    } for a, company, task, block, prop in rows]


# ---- Scope pickers (companies / properties / blocks) ----
# Surface only the slice of company-side data the contractor can legitimately
# touch. Used by mobile create-pickers (Task FAB, Incident FAB, Visit FAB).

def _contractor_active_company_ids(db: Session, contractor_id: int) -> List[int]:
    """List of company_ids the contractor has an active relationship with."""
    return [
        r.company_id for r in db.query(ContractorRelationship).filter(
            ContractorRelationship.contractor_id == contractor_id,
            ContractorRelationship.status == "active",
        ).all()
    ]


def _ensure_contractor_can_use_company(db: Session, contractor: Contractor, company_id: int) -> None:
    """403 if the contractor has no active relationship with the given company."""
    if company_id not in _contractor_active_company_ids(db, contractor.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active relationship with this company",
        )


@router.get("/me/companies")
def list_my_companies(
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> List[Dict[str, Any]]:
    """Lightweight company list for mobile pickers (Task/Incident/Visit FABs).
    Only active relationships."""
    rows = (
        db.query(ContractorRelationship, Company)
        .join(Company, Company.id == ContractorRelationship.company_id)
        .filter(
            ContractorRelationship.contractor_id == current_contractor.id,
            ContractorRelationship.status == "active",
        )
        .order_by(
            (ContractorRelationship.relationship_type == "preferred_contractor").desc(),
            Company.name.asc(),
        )
        .all()
    )
    return [{
        "id": company.id,
        "name": company.name,
        "is_preferred": rel.relationship_type == "preferred_contractor",
        "blocks_access": rel.blocks_access or [],
    } for rel, company in rows]


@router.get("/me/properties")
def list_my_properties(
    company_id: Optional[int] = Query(None, description="Restrict to this company's properties"),
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> List[Dict[str, Any]]:
    """Properties the contractor can access. Defaults to all properties across
    every active relationship; pass company_id to scope to a single company."""
    active_company_ids = _contractor_active_company_ids(db, current_contractor.id)
    if not active_company_ids:
        return []

    if company_id is not None:
        if company_id not in active_company_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No active relationship with this company",
            )
        target_company_ids = [company_id]
    else:
        target_company_ids = active_company_ids

    properties = (
        db.query(Property)
        .filter(Property.owner_company_id.in_(target_company_ids))
        .order_by(Property.name.asc())
        .all()
    )
    return [{
        "id": p.id,
        "name": p.name,
        "owner_company_id": p.owner_company_id,
        "region": p.region,
        "total_area_ha": float(p.total_area_ha) if p.total_area_ha is not None else None,
    } for p in properties]


@router.get("/me/blocks")
def list_my_blocks(
    property_id: int = Query(..., description="Property to list blocks for"),
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> List[Dict[str, Any]]:
    """Blocks within a property the contractor can access. Validates the
    property's owner is one of the contractor's active companies."""
    prop = db.query(Property).filter(Property.id == property_id).first()
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    if prop.owner_company_id not in _contractor_active_company_ids(db, current_contractor.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No active relationship with this property's owner",
        )

    blocks = (
        db.query(VineyardBlock)
        .filter(VineyardBlock.property_id == property_id)
        .order_by(VineyardBlock.block_name.asc())
        .all()
    )
    return [{
        "id": b.id,
        "block_name": b.block_name,
        "property_id": b.property_id,
    } for b in blocks]


# ---- Self-create: assignment (Task FAB) and incident (Incident FAB) ----

class ContractorAssignmentSelfCreate(BaseModel):
    company_id: int
    work_description: str = Field(min_length=1, max_length=2000)
    block_id: Optional[int] = None
    priority: Optional[str] = Field(None, max_length=20)
    estimated_hours: Optional[float] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    assignment_type: Optional[str] = Field("general_work", max_length=30)


@router.post("/me/assignments", status_code=status.HTTP_201_CREATED)
def create_my_assignment(
    payload: ContractorAssignmentSelfCreate,
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> Dict[str, Any]:
    """Contractor self-logs work they're doing for a company. Creates a
    ContractorAssignment with task_id=NULL — work_description is the title."""
    _ensure_contractor_can_use_company(db, current_contractor, payload.company_id)

    # The blocks_involved JSON list scopes the assignment to specific blocks.
    blocks_involved = [payload.block_id] if payload.block_id is not None else []

    # assigned_by is required on the model (FK to users.id). For self-logged work
    # there is no company user assigner — but we can't use 0/NULL because of FK
    # constraints. Use the first active manager/admin from that company as a
    # synthetic assigner so the audit trail still resolves.
    assigner = (
        db.query(User)
        .filter(
            User.company_id == payload.company_id,
            User.is_active == True,
            User.user_type.in_(["company_admin", "company_manager"]),
        )
        .order_by(User.id.asc())
        .first()
    )
    if not assigner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company has no active admin or manager to record this assignment against",
        )

    assignment = ContractorAssignment(
        contractor_id=current_contractor.id,
        company_id=payload.company_id,
        task_id=None,
        assignment_type=payload.assignment_type or "general_work",
        work_description=payload.work_description,
        priority=payload.priority or "medium",
        estimated_hours=payload.estimated_hours,
        scheduled_start=payload.scheduled_start,
        scheduled_end=payload.scheduled_end,
        blocks_involved=blocks_involved,
        status="in_progress" if payload.scheduled_start is None else "assigned",
        assigned_by=assigner.id,
    )
    if payload.scheduled_start is None:
        # Self-log of work happening now
        assignment.actual_start = datetime.now(timezone.utc)
    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return {
        "id": assignment.id,
        "status": assignment.status,
        "company_id": assignment.company_id,
        "work_description": assignment.work_description,
    }


class ContractorIncidentSelfCreate(BaseModel):
    company_id: int
    property_id: Optional[int] = None
    incident_title: str = Field(min_length=1, max_length=200)
    incident_description: str = Field(min_length=1)
    incident_type: str = Field(max_length=50)
    severity: str = Field(max_length=30)
    category: str = Field(max_length=50)
    incident_date: datetime
    location_description: str = Field(min_length=1, max_length=500)
    location: Optional[Dict[str, Any]] = None  # GeoJSON Point
    injured_person_name: Optional[str] = None
    injured_person_role: Optional[str] = None
    witness_details: Optional[str] = None
    immediate_actions_taken: Optional[str] = None
    is_notifiable: bool = False


@router.post("/me/incidents", status_code=status.HTTP_201_CREATED)
def create_my_incident(
    payload: ContractorIncidentSelfCreate,
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> Dict[str, Any]:
    """Contractor files an incident at a company they have a relationship with."""
    _ensure_contractor_can_use_company(db, current_contractor, payload.company_id)

    # Validate the property (if supplied) belongs to that company
    if payload.property_id is not None:
        prop = db.query(Property).filter(Property.id == payload.property_id).first()
        if not prop or prop.owner_company_id != payload.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Property does not belong to the selected company",
            )

    # Generate incident number using the same year-sequence pattern as
    # backend/api/v1/risk_management.py::create_incident.
    current_year = datetime.now().year
    last_in_year = (
        db.query(Incident)
        .filter(Incident.incident_number.like(f"INC-{current_year}-%"))
        .order_by(Incident.id.desc())
        .first()
    )
    if last_in_year and last_in_year.incident_number:
        try:
            last_seq = int(last_in_year.incident_number.split("-")[-1])
        except (ValueError, IndexError):
            last_seq = 0
    else:
        last_seq = 0
    incident_number = f"INC-{current_year}-{last_seq + 1:04d}"

    # GeoJSON Point → PostGIS WKT
    location_wkt = None
    if payload.location and payload.location.get("type") == "Point":
        coords = payload.location.get("coordinates") or []
        if len(coords) >= 2:
            location_wkt = f"SRID=4326;POINT({coords[0]} {coords[1]})"

    incident = Incident(
        company_id=payload.company_id,
        property_id=payload.property_id,
        incident_number=incident_number,
        incident_title=payload.incident_title,
        incident_description=payload.incident_description,
        incident_type=payload.incident_type,
        severity=payload.severity,
        category=payload.category,
        incident_date=payload.incident_date,
        location_description=payload.location_description,
        location=location_wkt,
        injured_person_name=payload.injured_person_name,
        injured_person_role=payload.injured_person_role,
        injured_person_company=current_contractor.business_name,
        witness_details=payload.witness_details,
        immediate_actions_taken=payload.immediate_actions_taken,
        is_notifiable=payload.is_notifiable,
        reported_by=None,
        reported_by_contractor_id=current_contractor.id,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)

    return {
        "id": incident.id,
        "incident_number": incident.incident_number,
        "company_id": incident.company_id,
        "status": incident.status,
    }


# ---- Self-create: ad-hoc observation (Observation FAB) ----
# Contractors don't run multi-spot observation runs; the FAB is a one-shot
# "I noticed something" record. We back it with the same ObservationRun + Spot
# model the company-user flow uses, but auto-attach to a per-company ad-hoc
# template so the schema stays consistent.

_ADHOC_OBSERVATION_TEMPLATE_TYPE = "adhoc"


def _get_or_create_adhoc_template(db: Session, company_id: int) -> ObservationTemplate:
    """Find or create the per-company ad-hoc observation template.

    Single notes field — runs/spots created this way carry the contractor's
    free-text in `data_json.notes`. The template never appears in the company's
    template list (filtered by type) but is a real row so the FK lights up.
    """
    template = db.query(ObservationTemplate).filter(
        ObservationTemplate.company_id == company_id,
        ObservationTemplate.type == _ADHOC_OBSERVATION_TEMPLATE_TYPE,
        ObservationTemplate.is_active == True,
    ).first()
    if template:
        return template

    template = ObservationTemplate(
        company_id=company_id,
        name="Ad-hoc observation",
        type=_ADHOC_OBSERVATION_TEMPLATE_TYPE,
        version=1,
        is_active=True,
        fields_json=[
            {"key": "title", "label": "Title", "type": "string", "required": True},
            {"key": "notes", "label": "Notes", "type": "text", "required": False},
        ],
        defaults_json={},
        validations_json={},
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


class ContractorObservationSelfCreate(BaseModel):
    company_id: int
    block_id: Optional[int] = None
    property_id: Optional[int] = None
    title: str = Field(min_length=1, max_length=160)
    notes: Optional[str] = Field(None, max_length=4000)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    photo_file_ids: List[str] = Field(default_factory=list)
    observed_at: Optional[datetime] = None


@router.post("/me/observations", status_code=status.HTTP_201_CREATED)
def create_my_observation(
    payload: ContractorObservationSelfCreate,
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> Dict[str, Any]:
    """Contractor logs a single ad-hoc observation. Creates an ObservationRun
    (one-spot) tied to a per-company ad-hoc template + an ObservationSpot
    holding the free-text title/notes + GPS + photos."""
    _ensure_contractor_can_use_company(db, current_contractor, payload.company_id)

    # Validate property + block belong to the company before any writes
    if payload.property_id is not None:
        prop = db.query(Property).filter(Property.id == payload.property_id).first()
        if not prop or prop.owner_company_id != payload.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Property does not belong to the selected company",
            )
    if payload.block_id is not None:
        block = db.query(VineyardBlock).filter(VineyardBlock.id == payload.block_id).first()
        if not block or block.company_id != payload.company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Block does not belong to the selected company",
            )

    template = _get_or_create_adhoc_template(db, payload.company_id)
    observed_at = payload.observed_at or datetime.now(timezone.utc)

    run = ObservationRun(
        company_id=payload.company_id,
        plan_id=None,
        template_id=template.id,
        template_version=template.version,
        block_id=payload.block_id,
        name=payload.title[:160],
        observed_at_start=observed_at,
        observed_at_end=observed_at,
        photo_file_ids=payload.photo_file_ids or [],
        document_file_ids=[],
        tags=[],
        summary_json={"adhoc": True, "contractor_id": current_contractor.id},
        created_by=None,  # No User actor for contractor-authored ad-hoc obs
    )
    db.add(run)
    db.flush()

    gps_wkt = None
    if payload.latitude is not None and payload.longitude is not None:
        gps_wkt = f"SRID=4326;POINT({payload.longitude} {payload.latitude})"

    spot = ObservationSpot(
        company_id=payload.company_id,
        run_id=run.id,
        observed_at=observed_at,
        block_id=payload.block_id,
        row_id=None,
        gps=gps_wkt,
        data_json={
            "title": payload.title,
            "notes": payload.notes,
            "contractor_id": current_contractor.id,
        },
        photo_file_ids=payload.photo_file_ids or [],
        video_file_ids=[],
        document_file_ids=[],
        created_by=None,
    )
    db.add(spot)
    db.commit()
    db.refresh(run)
    db.refresh(spot)

    return {
        "id": run.id,
        "run_id": run.id,
        "spot_id": spot.id,
        "company_id": payload.company_id,
        "block_id": payload.block_id,
        "title": payload.title,
        "observed_at": observed_at.isoformat(),
    }


# Stored in Contractor.verification_documents JSON column. Binary content lives
# in S3 under contractors/{id}/insurance/... (see _make_contractor_doc_s3_key).

@router.post("/me/insurance/docs")
async def upload_my_insurance_doc(
    policy_type: str = Form(...),
    expires_at: Optional[date] = Form(None),
    file: UploadFile = FastAPIFile(...),
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
) -> Dict[str, Any]:
    """Upload an insurance certificate. Writes to S3 + appends to JSON column."""
    if policy_type not in POLICY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"policy_type must be one of {sorted(POLICY_TYPES)}",
        )
    if not file_storage.is_enabled():
        # Local dev hasn't been wired for contractor uploads (no UPLOAD_DIR
        # equivalent for /contractors/... path). Fail loudly rather than silently
        # losing the file.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File storage is not configured on this environment",
        )

    file_ext = ""
    if file.filename and "." in file.filename:
        file_ext = "." + file.filename.split(".")[-1].lower()
    doc_id = str(uuid.uuid4())
    stored_filename = f"{policy_type}_{doc_id[:8]}{file_ext}"
    s3_key = _make_contractor_doc_s3_key(current_contractor.id, stored_filename)

    try:
        file_storage.upload_fileobj(file.file, s3_key, content_type=file.content_type)
    except Exception:
        logger.exception("Contractor insurance doc S3 upload failed for contractor.id=%s", current_contractor.id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed")

    doc = {
        "id": doc_id,
        "type": "insurance_certificate",
        "policy_type": policy_type,
        "s3_key": s3_key,
        "original_filename": file.filename,
        "file_size": file.size,
        "mime_type": file.content_type,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": str(expires_at) if expires_at else None,
        "verified_by": None,
        "verified_at": None,
        "status": "pending",
    }

    # Re-query so the mutation happens on an instance attached to this request's
    # db session (mirrors the pattern in /me/profile + /me/insurance above).
    contractor = db.query(Contractor).filter(Contractor.id == current_contractor.id).first()
    if not contractor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")
    if contractor.verification_documents is None:
        contractor.verification_documents = []
    contractor.verification_documents.append(doc)
    # JSON columns need an explicit dirty flag — in-place list mutation isn't tracked
    flag_modified(contractor, "verification_documents")
    db.commit()
    return doc


@router.get("/me/insurance/docs")
def list_my_insurance_docs(
    current_contractor: Contractor = Depends(get_current_contractor),
) -> List[Dict[str, Any]]:
    """List all insurance docs for the contractor. Soft-deleted entries (status='deleted')
    are filtered out. s3_key is omitted from the response (clients hit /download instead)."""
    docs = current_contractor.verification_documents or []
    out = []
    for d in docs:
        if d.get("status") == "deleted":
            continue
        out.append({k: v for k, v in d.items() if k != "s3_key"})
    return out


@router.delete("/me/insurance/docs/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_insurance_doc(
    doc_id: str,
    db: Session = Depends(get_db),
    current_contractor: Contractor = Depends(get_current_contractor),
):
    """Soft-delete (status='deleted') + best-effort S3 delete. Soft delete preserves
    history for audit even after the binary is gone."""
    contractor = db.query(Contractor).filter(Contractor.id == current_contractor.id).first()
    if not contractor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contractor not found")
    docs = contractor.verification_documents or []
    target = next((d for d in docs if d.get("id") == doc_id), None)
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    s3_key = target.get("s3_key")
    if s3_key and file_storage.is_enabled():
        try:
            file_storage.delete_object(s3_key)
        except Exception:
            # Don't block the soft-delete on S3 failure — log and continue.
            logger.warning("S3 delete failed for contractor doc s3_key=%s", s3_key)

    target["status"] = "deleted"
    target["deleted_at"] = datetime.now(timezone.utc).isoformat()
    flag_modified(contractor, "verification_documents")
    db.commit()


@router.get("/me/insurance/docs/{doc_id}/download")
def download_my_insurance_doc(
    doc_id: str,
    current_contractor: Contractor = Depends(get_current_contractor),
):
    """Stream the binary back. Bucket is private so we go through the backend."""
    docs = current_contractor.verification_documents or []
    target = next((d for d in docs if d.get("id") == doc_id and d.get("status") != "deleted"), None)
    if not target or not target.get("s3_key"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    if not file_storage.is_enabled():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="File storage is not configured")

    return StreamingResponse(
        file_storage.stream_object(target["s3_key"]),
        media_type=target.get("mime_type") or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{target.get("original_filename", "document")}"',
        },
    )


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

    is_contractor_actor = hasattr(current_user, 'contractor_type')

    # Validate property_id when supplied: must exist and belong to the company
    # the contractor is checking in to. Reject mismatched IDs rather than
    # silently dropping the field — pinning to the wrong property would break
    # downstream map scoping.
    property_id = check_in.property_id
    if property_id is not None:
        prop = db.query(Property).filter(Property.id == property_id).first()
        if not prop or prop.owner_company_id != company_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="property_id does not belong to the selected company",
            )

    movement = ContractorMovement(
        contractor_id=contractor_id,
        company_id=company_id,
        property_id=property_id,
        arrival_datetime=datetime.now(timezone.utc),
        purpose=check_in.purpose,
        equipment_brought=check_in.equipment_brought or [],
        previous_location_name=check_in.previous_location_name,
        vehicle_registration=check_in.vehicle_registration,
        check_in_notes=check_in.notes,
        status="in_progress",
        checked_in_by=None if is_contractor_actor else current_user.id,
        logged_by=None if is_contractor_actor else current_user.id,
        checked_in_by_contractor_id=current_user.id if is_contractor_actor else None,
        logged_by_contractor_id=current_user.id if is_contractor_actor else None,
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
    if is_company_user:
        movement.checked_out_by = current_user.id
    elif is_contractor:
        movement.checked_out_by_contractor_id = current_user.id

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
