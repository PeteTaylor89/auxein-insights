# api/v1/site.py — Unified "who's on site" endpoint.
#
# Returns one normalised list combining active visitor visits and active
# contractor movements for the current user's company. Lets the mobile UI
# show a single number/list across both storage tables without forcing
# them to merge schemas.
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.user import User
from db.models.visitor import Visitor, VisitorVisit
from db.models.contractor import Contractor
from db.models.contractor_movement import ContractorMovement
from db.models.property import Property


router = APIRouter()


def _duration_mins(start: datetime, end: Optional[datetime] = None) -> Optional[int]:
    if not start:
        return None
    finish = end or datetime.now(timezone.utc)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if finish.tzinfo is None:
        finish = finish.replace(tzinfo=timezone.utc)
    return int((finish - start).total_seconds() / 60)


@router.get("/active")
def list_on_site(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Unified list of everyone currently on site for the user's company.

    Output items share a common shape and discriminate on `type`:
      { type: 'visitor'|'contractor', id, name, signed_in_at, duration_mins,
        purpose, sub_label, vehicle_registration, phone, ...type-specific }
    """
    company_id = current_user.company_id

    # --- Visitors: signed in, not signed out ---
    visit_rows = (
        db.query(VisitorVisit, Visitor)
        .join(Visitor, Visitor.id == VisitorVisit.visitor_id)
        .filter(
            VisitorVisit.company_id == company_id,
            VisitorVisit.signed_in_at.isnot(None),
            VisitorVisit.signed_out_at.is_(None),
        )
        .all()
    )

    items: List[Dict[str, Any]] = []
    for visit, visitor in visit_rows:
        host = (
            db.query(User).filter(User.id == visit.host_user_id).first()
            if visit.host_user_id
            else None
        )
        items.append({
            'type': 'visitor',
            'id': visit.id,
            'visitor_id': visitor.id,
            'name': f"{visitor.first_name} {visitor.last_name}".strip(),
            'sub_label': visitor.company_representing or 'Visitor',
            'purpose': visit.purpose,
            'signed_in_at': visit.signed_in_at.isoformat() if visit.signed_in_at else None,
            'duration_mins': _duration_mins(visit.signed_in_at),
            'phone': visitor.phone,
            'vehicle_registration': visitor.vehicle_registration,
            'host': (
                {
                    'id': host.id,
                    'name': f"{host.first_name} {host.last_name}".strip(),
                }
                if host else None
            ),
            'induction_completed': visit.induction_completed,
            'is_overdue': visit.is_overdue,
        })

    # --- Contractors: active movements (no departure yet) ---
    movement_rows = (
        db.query(ContractorMovement, Contractor, Property)
        .join(Contractor, Contractor.id == ContractorMovement.contractor_id)
        .outerjoin(Property, Property.id == ContractorMovement.property_id)
        .filter(
            ContractorMovement.company_id == company_id,
            ContractorMovement.departure_datetime.is_(None),
            ContractorMovement.status == "in_progress",
        )
        .all()
    )

    for movement, contractor, prop in movement_rows:
        items.append({
            'type': 'contractor',
            'id': movement.id,
            'contractor_id': contractor.id,
            'name': contractor.contact_person or contractor.business_name,
            'sub_label': contractor.business_name,
            'purpose': movement.purpose,
            'signed_in_at': movement.arrival_datetime.isoformat() if movement.arrival_datetime else None,
            'duration_mins': _duration_mins(movement.arrival_datetime),
            'phone': contractor.mobile or contractor.phone,
            'vehicle_registration': movement.vehicle_registration,
            'biosecurity_risk_level': movement.biosecurity_risk_level,
            'equipment_cleaned': movement.equipment_cleaned,
            'self_checked_in': movement.checked_in_by is None,
            'property_id': movement.property_id,
            'property_name': prop.name if prop else None,
        })

    items.sort(key=lambda x: x.get('signed_in_at') or '', reverse=True)

    return {
        'total': len(items),
        'visitors_count': sum(1 for i in items if i['type'] == 'visitor'),
        'contractors_count': sum(1 for i in items if i['type'] == 'contractor'),
        'items': items,
    }
