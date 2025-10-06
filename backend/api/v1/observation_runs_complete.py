# /api/v1/observation_runs_complete.py
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.deps import get_db
from services.run_completion import complete_run

router = APIRouter(prefix="/api", tags=["observation-runs"])

@router.post("/observation-runs/{run_id}/complete")
def api_complete_observation_run(run_id: int, db: Session = Depends(get_db)):
    """
    Complete an observation run and return the computed summary
    Alternative endpoint that returns summary directly instead of full run object
    """
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
def api_get_observation_run_summary(run_id: int, db: Session = Depends(get_db)):
    """
    Get the summary for an already-completed run
    """
    import sqlalchemy as sa
    
    row = db.execute(sa.text("""
        SELECT summary_json FROM observation_runs WHERE id = :rid
    """), {"rid": run_id}).scalar_one_or_none()
    
    if row is None:
        raise HTTPException(status_code=404, detail="Run not found")
    
    return row or {}