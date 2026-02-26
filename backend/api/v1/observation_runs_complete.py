# /api/v1/observation_runs_complete.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.user import User
from db.models.observation_run import ObservationRun
from services.run_completion import complete_run

router = APIRouter(prefix="/api", tags=["observation-runs"])


def _verify_run_ownership(db: Session, run_id: int, user: User) -> ObservationRun:
    """Verify the run belongs to the user's company"""
    run = db.query(ObservationRun).filter(
        ObservationRun.id == run_id,
        ObservationRun.company_id == user.company_id
    ).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.post("/observation-runs/{run_id}/complete")
def api_complete_observation_run(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Complete an observation run and return the computed summary
    Alternative endpoint that returns summary directly instead of full run object
    """
    _verify_run_ownership(db, run_id, current_user)
    try:
        summary = complete_run(db, run_id)
        return {"run_id": run_id, "summary": summary, "status": "completed"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"ERROR completing run {run_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to complete run: {str(e)}"
        )

@router.get("/observation-runs/{run_id}/summary")
def api_get_observation_run_summary(
    run_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get the summary for an already-completed run
    """
    run = _verify_run_ownership(db, run_id, current_user)
    return run.summary_json or {}