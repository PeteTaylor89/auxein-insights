#/api/v1/observations.py

from __future__ import annotations
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import select, and_, func, cast, Integer

# --- deps & utils (adapt imports to your project layout) ---
from api.deps import get_db, get_current_user

from schemas.observations import (
    ObservationTemplateCreate, ObservationTemplateUpdate, ObservationTemplateOut,
    ObservationPlanCreate, ObservationPlanUpdate, ObservationPlanOut,
    ObservationRunCreate, ObservationRunUpdate, ObservationRunOut,
    ObservationSpotCreate, ObservationSpotUpdate, ObservationSpotOut,
    ObservationTaskLinkCreate, ObservationTaskLinkOut,
)

from schemas.reference_items import (
    ReferenceItemOut, ReferenceItemImageOut, ReferenceItemImageCreate
)

from utils.yield_stats import basic_confidence_summary
from utils.el_scale import EL_PHASES
from sqlalchemy import func, cast, Integer

from db.models.observation_template import ObservationTemplate
from db.models.observation_plan import ObservationPlan, ObservationPlanTarget, ObservationPlanAssignee
from db.models.observation_run import ObservationRun, ObservationSpot
from db.models.observation_link import ObservationTaskLink
from db.models.reference_item import ReferenceItem
from db.models.reference_item_file import ReferenceItemFile
from db.models.file import File

from geoalchemy2.shape import from_shape
from shapely.geometry import Point


router = APIRouter(prefix="/api", tags=["observations"])


# -----------------------------
# Reference catalog (read-only)
# -----------------------------
@router.get("/reference/el-stages", response_model=List[ReferenceItemOut])
def list_el_stages(db: Session = Depends(get_db)):
    from sqlalchemy import func, cast, Integer
    order_num = cast(func.regexp_replace(ReferenceItem.key, '[^0-9]', '', 'g'), Integer)
    rows = db.execute(
        select(ReferenceItem)
        .options(selectinload(ReferenceItem.files_assoc))
        .where(and_(ReferenceItem.category == "el_stage", ReferenceItem.is_active == True))
        .order_by(order_num.asc(), ReferenceItem.key.asc())
    ).scalars().all()
    return rows

@router.get("/reference/catalog/{category}", response_model=List[ReferenceItemOut])
def list_reference_category(category: str, db: Session = Depends(get_db)):
    rows = db.execute(
        select(ReferenceItem)
        .options(selectinload(ReferenceItem.files_assoc))  # eager load images
        .where(and_(ReferenceItem.category == category, ReferenceItem.is_active == True))
        .order_by(ReferenceItem.label.asc())
    ).scalars().all()
    return rows

@router.get("/reference/el-groups")
def list_el_groups(db: Session = Depends(get_db)):
    # get all stages we have in DB
    stages = db.execute(
        select(ReferenceItem)
        .where(and_(ReferenceItem.category == "el_stage", ReferenceItem.is_active == True))
    ).scalars().all()

    # map key -> label for convenience
    stage_map = {s.key: s.label for s in stages}

    out = []
    # EL_PHASES expects shape like {'early': {'name':'Early growth', 'stages':['EL-1','EL-2', ...]}, ...}
    for phase_key, info in EL_PHASES.items():
        stages_in_phase = []
        for k in info.get("stages", []):
            if k in stage_map:
                # include stage if present in DB
                stages_in_phase.append({"key": k, "label": stage_map[k]})
        # numeric sort by EL number
        stages_in_phase.sort(key=lambda x: int(''.join(ch for ch in x["key"] if ch.isdigit())))

        out.append({
            "key": f"EL-PHASE-{phase_key}",
            "label": info.get("name") or phase_key,
            "description": info.get("description"),
            "stages": stages_in_phase
        })
    # optional: sort phases if helper has an "order"
    return out

# -----------------------------
# Reference Images
# -----------------------------
@router.post("/reference/items/{item_id}/images", response_model=ReferenceItemImageOut)
def attach_reference_item_image(item_id: int, payload: ReferenceItemImageCreate, db: Session = Depends(get_db)):
    item = db.get(ReferenceItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="Reference item not found")

    file = db.get(File, payload.file_id)
    if not file:
        raise HTTPException(status_code=404, detail="File not found")

    # if setting primary, unset existing primary
    if payload.is_primary:
        db.execute(
            sa.update(ReferenceItemFile)
            .where(ReferenceItemFile.reference_item_id == item_id, ReferenceItemFile.is_primary == True)
            .values(is_primary=False)
        )

    link = ReferenceItemFile(
        reference_item_id=item_id,
        file_id=payload.file_id,
        caption=payload.caption,
        sort_order=payload.sort_order,
        is_primary=payload.is_primary,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link

@router.delete("/reference/items/{item_id}/images/{link_id}", status_code=204)
def detach_reference_item_image(item_id: int, link_id: int, db: Session = Depends(get_db)):
    link = db.get(ReferenceItemFile, link_id)
    if not link or link.reference_item_id != item_id:
        raise HTTPException(status_code=404, detail="Image link not found")
    db.delete(link)
    db.commit()
    return

# -----------------------------
# Templates
# -----------------------------
@router.get("/observation-templates", response_model=List[ObservationTemplateOut])
def list_templates(
    db: Session = Depends(get_db),
    include_system: bool = Query(True, description="Include system templates (company_id NULL)"),
    company_id: Optional[int] = None,
):
    q = select(ObservationTemplate).where(ObservationTemplate.is_active == True)
    if not include_system:
        q = q.where(ObservationTemplate.company_id.isnot(None))
    if company_id is not None:
        q = q.where(ObservationTemplate.company_id == company_id)
    q = q.order_by(ObservationTemplate.name.asc())
    return db.execute(q).scalars().all()

@router.post("/observation-templates", response_model=ObservationTemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(payload: ObservationTemplateCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    row = ObservationTemplate(
        company_id=payload.company_id,
        name=payload.name,
        type=payload.observation_type,
        version=1,
        is_active=payload.is_active,
        fields_json=[f.dict() for f in payload.field_schema],
        defaults_json={},  # caller can set later
        validations_json={},
        created_by=user.id if getattr(user, "id", None) else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.get("/observation-templates/{template_id}", response_model=ObservationTemplateOut)
def get_template(template_id: int, db: Session = Depends(get_db)):
    row = db.get(ObservationTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    return row

@router.patch("/observation-templates/{template_id}", response_model=ObservationTemplateOut)
def update_template(template_id: int, payload: ObservationTemplateUpdate, db: Session = Depends(get_db)):
    row = db.get(ObservationTemplate, template_id)
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    if payload.name is not None:
        row.name = payload.name
    if payload.observation_type is not None:
        row.type = payload.observation_type
    if payload.field_schema is not None:
        row.fields_json = [f.dict() for f in payload.field_schema]
        row.version = (row.version or 1) + 1  # bump on schema changes
    if payload.is_active is not None:
        row.is_active = payload.is_active
    db.add(row)
    db.commit()
    db.refresh(row)
    return row

@router.delete("/observation-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_template(template_id: int, db: Session = Depends(get_db)):
    row = db.get(ObservationTemplate, template_id)
    if not row:
        return
    row.is_active = False
    db.add(row)
    db.commit()
    return


# -----------------------------
# Plans
# -----------------------------
@router.post("/observation-plans", response_model=ObservationPlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(payload: ObservationPlanCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    plan = ObservationPlan(
        company_id=payload.company_id,
        template_id=payload.template_id,
        template_version=1,  # you can resolve the current version here
        name=payload.name,
        instructions=payload.instructions,
        due_start_at=None,
        due_end_at=None,
        priority="normal",
        status="scheduled",
        created_by=getattr(user, "id", None),
    )
    db.add(plan)
    db.flush()

    # Targets
    for t in payload.targets:
        db.add(ObservationPlanTarget(
            plan_id=plan.id,
            block_id=t.block_id,
            row_labels=[x for x in [t.row_start, t.row_end] if x] if (t.row_start or t.row_end) else [],
            asset_id=None,
            sample_size=t.required_spots,
            notes=(t.extra or {}).get("notes"),
        ))

    # Assignees
    for uid in payload.assignee_user_ids:
        db.add(ObservationPlanAssignee(plan_id=plan.id, user_id=uid))

    db.commit()
    db.refresh(plan)
    # hydrate response
    return plan

@router.get("/observation-plans", response_model=List[ObservationPlanOut])
def list_plans(
    db: Session = Depends(get_db),
    company_id: Optional[int] = None,
    status_in: Optional[List[str]] = Query(None),
    template_id: Optional[int] = None,
):
    q = select(ObservationPlan)
    if company_id:
        q = q.where(ObservationPlan.company_id == company_id)
    if template_id:
        q = q.where(ObservationPlan.template_id == template_id)
    if status_in:
        q = q.where(ObservationPlan.status.in_(status_in))
    q = q.order_by(ObservationPlan.created_at.desc())
    return db.execute(q).scalars().all()

@router.get("/observation-plans/{plan_id}", response_model=ObservationPlanOut)
def get_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.get(ObservationPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan

@router.patch("/observation-plans/{plan_id}", response_model=ObservationPlanOut)
def update_plan(plan_id: int, payload: ObservationPlanUpdate, db: Session = Depends(get_db)):
    plan = db.get(ObservationPlan, plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if payload.name is not None: plan.name = payload.name
    if payload.instructions is not None: plan.instructions = payload.instructions
    if payload.is_active is not None:
        plan.status = "cancelled" if not payload.is_active else plan.status

    # Replace targets if provided
    if payload.targets is not None:
        # delete existing
        for t in list(plan.targets):
            db.delete(t)
        for t in payload.targets:
            db.add(ObservationPlanTarget(
                plan_id=plan.id,
                block_id=t.block_id,
                row_labels=[x for x in [t.row_start, t.row_end] if x] if (t.row_start or t.row_end) else [],
                asset_id=None,
                sample_size=t.required_spots,
                notes=(t.extra or {}).get("notes"),
            ))
    # Replace assignees if provided
    if payload.assignee_user_ids is not None:
        for a in list(plan.assignees):
            db.delete(a)
        for uid in payload.assignee_user_ids:
            db.add(ObservationPlanAssignee(plan_id=plan.id, user_id=uid))

    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan

@router.delete("/observation-plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.get(ObservationPlan, plan_id)
    if not plan:
        return
    db.delete(plan)
    db.commit()
    return


# -----------------------------
# Runs
# -----------------------------
@router.post("/observation-runs", response_model=ObservationRunOut, status_code=status.HTTP_201_CREATED)
def create_run(payload: ObservationRunCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    run = ObservationRun(
        company_id=payload.company_id,
        plan_id=payload.plan_id,
        template_id=payload.template_id,
        template_version=1,
        name=f"Run – template {payload.template_id}",
        observed_at_start=payload.started_at or datetime.utcnow(),
        observed_at_end=None,
        photo_file_ids=[],
        document_file_ids=[],
        tags=[],
        summary_json=payload.summary_stats or {},
        created_by=payload.created_by or (getattr(user, "id", None)),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run

@router.get("/observation-runs", response_model=List[ObservationRunOut])
def list_runs(
    db: Session = Depends(get_db),
    company_id: Optional[int] = None,
    template_id: Optional[int] = None,
    plan_id: Optional[int] = None,
):
    q = select(ObservationRun)
    if company_id: q = q.where(ObservationRun.company_id == company_id)
    if template_id: q = q.where(ObservationRun.template_id == template_id)
    if plan_id: q = q.where(ObservationRun.plan_id == plan_id)
    q = q.order_by(ObservationRun.created_at.desc())
    return db.execute(q).scalars().all()

@router.get("/observation-runs/{run_id}", response_model=ObservationRunOut)
def get_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(ObservationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run

@router.patch("/observation-runs/{run_id}", response_model=ObservationRunOut)
def update_run(run_id: int, payload: ObservationRunUpdate, db: Session = Depends(get_db)):
    run = db.get(ObservationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if payload.status is not None:
        # basic state handling; extend as needed
        if payload.status == "completed":
            run.observed_at_end = run.observed_at_end or datetime.utcnow()
        # store raw status in tags/summary if you want
    if payload.completed_at is not None:
        run.observed_at_end = payload.completed_at
    if payload.summary_stats is not None:
        run.summary_json = payload.summary_stats

    db.add(run)
    db.commit()
    db.refresh(run)
    return run

@router.post("/observation-runs/{run_id}/complete", response_model=ObservationRunOut)
def complete_run(run_id: int, db: Session = Depends(get_db)):
    run = db.get(ObservationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # naive summary: if spots have a numeric 'bunches_per_vine' or 'bunches_total' / 'vines_sampled'
    spots = db.execute(select(ObservationSpot).where(ObservationSpot.run_id == run_id)).scalars().all()
    est_values = []
    for s in spots:
        v = s.data_json or {}
        if "bunches_per_vine" in v and isinstance(v["bunches_per_vine"], (int, float)):
            est_values.append(float(v["bunches_per_vine"]))
        elif "bunches_total" in v and "vines_sampled" in v:
            try:
                est_values.append(float(v["bunches_total"]) / float(v["vines_sampled"]))
            except Exception:
                pass
    summary = basic_confidence_summary(est_values)
    run.summary_json = {**(run.summary_json or {}), "bunches_per_vine_summary": summary}
    run.observed_at_end = run.observed_at_end or datetime.utcnow()

    db.add(run)
    db.commit()
    db.refresh(run)
    return run


# -----------------------------
# Spots
# -----------------------------
@router.get("/observation-runs/{run_id}/spots", response_model=List[ObservationSpotOut])
def list_spots(run_id: int, db: Session = Depends(get_db)):
    rows = db.execute(select(ObservationSpot).where(ObservationSpot.run_id == run_id).order_by(ObservationSpot.created_at.asc())).scalars().all()
    return rows

@router.post("/observation-runs/{run_id}/spots", response_model=ObservationSpotOut, status_code=status.HTTP_201_CREATED)
def add_spot(run_id: int, payload: ObservationSpotCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    run = db.get(ObservationRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    gps_geom = None
    if payload.latitude is not None and payload.longitude is not None:
        # Note: lon, lat order for WGS84
        gps_geom = from_shape(Point(payload.longitude, payload.latitude), srid=4326)

    spot = ObservationSpot(
        company_id=payload.company_id,
        run_id=run_id,
        observed_at=payload.observed_at,
        block_id=payload.block_id,
        row_id=payload.row_id,
        gps=gps_geom,
        data_json=payload.values or {},
        photo_file_ids=payload.photo_file_ids or [],
        document_file_ids=payload.video_file_ids or [],  # if you keep videos separately, adjust model accordingly
        created_by=payload.created_by or (getattr(user, "id", None)),
    )
    db.add(spot)
    db.commit()
    db.refresh(spot)
    return spot

@router.patch("/observation-spots/{spot_id}", response_model=ObservationSpotOut)
def update_spot(spot_id: int, payload: ObservationSpotUpdate, db: Session = Depends(get_db)):
    spot = db.get(ObservationSpot, spot_id)
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")

    if payload.block_id is not None: spot.block_id = payload.block_id
    if payload.row_id is not None: spot.row_id = payload.row_id
    if payload.observed_at is not None: spot.observed_at = payload.observed_at
    if payload.values is not None: spot.data_json = payload.values
    if payload.notes is not None:
        # optional: keep notes inside data_json to avoid new DB column
        spot.data_json = {**(spot.data_json or {}), "_notes": payload.notes}
    if payload.photo_file_ids is not None: spot.photo_file_ids = payload.photo_file_ids

    # gps update
    if (payload.latitude is not None) and (payload.longitude is not None):
        spot.gps = from_shape(Point(payload.longitude, payload.latitude), srid=4326)

    db.add(spot)
    db.commit()
    db.refresh(spot)
    return spot

@router.delete("/observation-spots/{spot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_spot(spot_id: int, db: Session = Depends(get_db)):
    spot = db.get(ObservationSpot, spot_id)
    if not spot:
        return
    db.delete(spot)
    db.commit()
    return


# -----------------------------
# Observation ↔ Task links
# -----------------------------
@router.post("/observation-task-links", response_model=ObservationTaskLinkOut, status_code=status.HTTP_201_CREATED)
def create_obs_task_link(payload: ObservationTaskLinkCreate, db: Session = Depends(get_db)):
    if not payload.run_id and not payload.spot_id:
        raise HTTPException(status_code=400, detail="Provide run_id or spot_id")
    link = ObservationTaskLink(
        company_id=None,  # optional: set from related run/spot if you require tenancy here
        observation_run_id=payload.run_id,
        observation_spot_id=payload.spot_id,
        task_id=payload.task_id,
        link_reason=payload.reason,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link

@router.get("/observation-task-links", response_model=List[ObservationTaskLinkOut])
def list_obs_task_links(
    db: Session = Depends(get_db),
    task_id: Optional[int] = None,
    run_id: Optional[int] = None,
    spot_id: Optional[int] = None,
):
    q = select(ObservationTaskLink)
    if task_id: q = q.where(ObservationTaskLink.task_id == task_id)
    if run_id: q = q.where(ObservationTaskLink.observation_run_id == run_id)
    if spot_id: q = q.where(ObservationTaskLink.observation_spot_id == spot_id)
    q = q.order_by(ObservationTaskLink.created_at.desc())
    return db.execute(q).scalars().all()

@router.delete("/observation-task-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_obs_task_link(link_id: int, db: Session = Depends(get_db)):
    link = db.get(ObservationTaskLink, link_id)
    if not link:
        return
    db.delete(link)
    db.commit()
    return
