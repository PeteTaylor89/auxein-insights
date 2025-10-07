# backend/services/run_completion.py
from __future__ import annotations
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
import json

import sqlalchemy as sa
from sqlalchemy.orm import Session

from utils.observation_helpers import mean, stdev, ci95
from utils.observation_helpers import yield_t_per_ha, vines_per_ha, adjust_for_missing
from utils.observation_helpers import flowers_per_shoot, fruit_set_percent
from utils.observation_helpers import confidence_score

# ---- configurable table/column names ----
T_RUNS = "observation_runs"
T_SPOTS = "observation_spots"
T_TPL = "observation_templates"
T_BLOCKS = "vineyard_blocks"

DATA_COL = "data_json"

def _fetch_run_meta(db: Session, run_id: int) -> Optional[Dict[str, Any]]:
    """Fetch run metadata including template config"""
    sql = sa.text(f"""
        SELECT r.id, r.company_id, r.template_id, r.block_id,
               r.observed_at_start, r.observed_at_end, r.summary_json,
               t.type as type_key,
               t.name as template_name,
               t.validations_json
        FROM {T_RUNS} r
        JOIN {T_TPL} t ON t.id = r.template_id
        WHERE r.id = :rid
    """)
    row = db.execute(sql, {"rid": run_id}).mappings().first()
    return dict(row) if row else None

def _fetch_spots(db: Session, run_id: int) -> List[Dict[str, Any]]:
    """Fetch all spots for a run with their data"""
    sql = sa.text(f"""
        SELECT id, run_id, block_id, row_id, 
               observed_at,
               {DATA_COL} as data
        FROM {T_SPOTS}
        WHERE run_id = :rid
        ORDER BY observed_at ASC, id ASC
    """)
    rows = db.execute(sql, {"rid": run_id}).mappings().all()
    
    spots = []
    for r in rows:
        spot = dict(r)
        # Parse JSON data if it's a string
        if isinstance(spot.get('data'), str):
            try:
                spot['data'] = json.loads(spot['data'])
            except:
                spot['data'] = {}
        spots.append(spot)
    
    return spots

def _fetch_block_info(db: Session, block_id: int) -> Optional[Dict[str, Any]]:
    """Fetch block metadata including area"""
    if not block_id:
        return None
    
    sql = sa.text(f"""
        SELECT id, block_name, 
               area as area_ha,  -- ← Changed from area_ha to area
               row_spacing as row_spacing_m,  -- ← Changed from row_spacing_m
               vine_spacing as vine_spacing_m,  -- ← Changed from vine_spacing_m
               NULL as vines_per_ha  -- ← This column doesn't exist in your model
        FROM {T_BLOCKS}
        WHERE id = :bid
    """)
    row = db.execute(sql, {"bid": block_id}).mappings().first()
    
    if not row:
        return None
    
    result = dict(row)
    
    # Calculate vines_per_ha if spacing is available
    if result.get('row_spacing_m') and result.get('vine_spacing_m'):
        try:
            result['vines_per_ha'] = vines_per_ha(
                result['row_spacing_m'],
                result['vine_spacing_m']
            )
        except:
            result['vines_per_ha'] = None
    
    return result

def _extract_notes_digest(spots: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Extract notes from spots that have them"""
    digest = []
    for spot in spots:
        data = spot.get('data') or {}
        notes = data.get('notes', '').strip()
        if notes:
            digest.append({
                "spot_id": spot['id'],
                "text": notes
            })
    return digest

def _calculate_confidence(
    n_spots: int,
    block_area_ha: Optional[float],
    target_spots_per_ha: float,
    statistical_component: Optional[float] = None
) -> Dict[str, Any]:
    """
    Calculate confidence score based on spatial coverage and optionally statistics
    
    Args:
        n_spots: Number of spots recorded
        block_area_ha: Block area in hectares (None if not set)
        target_spots_per_ha: Target sampling density from template config
        statistical_component: Optional 0-1 score from CV/CI width (for calculated mode)
    """
    if block_area_ha and block_area_ha > 0:
        spots_per_ha = n_spots / block_area_ha
        coverage_ratio = spots_per_ha / target_spots_per_ha
        coverage_score = min(1.0, coverage_ratio)
        method = "spatial_coverage"
    else:
        # Fallback: assume ~2ha average block, rough coverage
        assumed_area = 2.0
        spots_per_ha = n_spots / assumed_area
        coverage_ratio = spots_per_ha / target_spots_per_ha
        coverage_score = min(1.0, coverage_ratio)
        method = "spot_count_fallback"
    
    # Combine with statistical component if provided (calculated mode)
    if statistical_component is not None:
        overall_score = 0.6 * coverage_score + 0.4 * statistical_component
        method = "combined"
    else:
        overall_score = coverage_score
        method = method + "_only"
    
    # Interpretation
    if overall_score >= 0.8:
        interpretation = "High confidence"
    elif overall_score >= 0.6:
        interpretation = "Good confidence"
    elif overall_score >= 0.3:
        interpretation = "Moderate confidence"
    else:
        interpretation = "Low confidence - limited coverage"
    
    result = {
        "score": round(overall_score, 2),
        "interpretation": interpretation,
        "details": {
            "spots_recorded": n_spots,
            "target_spots_per_ha": target_spots_per_ha,
            "method": method
        }
    }
    
    if block_area_ha and block_area_ha > 0:
        result["details"]["block_area_ha"] = block_area_ha
        result["details"]["spots_per_ha"] = round(spots_per_ha, 2)
        result["details"]["coverage_ratio"] = round(coverage_ratio, 3)
    else:
        result["details"]["note"] = "Block area not set, using fallback estimation"
    
    if statistical_component is not None:
        result["details"]["statistical_score"] = round(statistical_component, 2)
        result["details"]["coverage_score"] = round(coverage_score, 2)
    
    return result

# ---- Main dispatcher ----
def complete_run(db: Session, run_id: int) -> Dict[str, Any]:
    """
    Compute summary for a completed observation run based on template configuration
    """
    # Fetch metadata
    meta = _fetch_run_meta(db, run_id)
    if not meta:
        raise ValueError("Run not found")
    
    # Fetch spots
    spots = _fetch_spots(db, run_id)
    if not spots:
        # No spots - minimal summary
        summary = {
            "summary_mode": "none",
            "n_spots": 0,
            "message": "No observation spots recorded"
        }
        _store_summary(db, run_id, summary)
        return summary
    
    # Parse template config
    validations_json = meta.get('validations_json') or {}
    if isinstance(validations_json, str):
        try:
            validations_json = json.loads(validations_json)
        except:
            validations_json = {}
    
    # Determine summary mode
    summary_mode = validations_json.get('summary_mode', 'observational')
    
    # Fetch block info
    block_info = _fetch_block_info(db, meta['block_id']) if meta.get('block_id') else None
    
    # Route to appropriate processor
    if summary_mode == 'calculated':
        summary = _process_calculated_summary(spots, validations_json, block_info, db)
    else:
        summary = _process_observational_summary(spots, validations_json, block_info)
    
    # Add common metadata
    summary['_meta'] = {
        'template_type': meta['type_key'],
        'template_name': meta['template_name'],
        'run_id': run_id,
        'completed_at': datetime.now(timezone.utc).isoformat()
    }
    
    # Store and mark complete
    _store_summary(db, run_id, summary)
    
    return summary

def _store_summary(db: Session, run_id: int, summary: Dict[str, Any]):
    """Store summary in run and mark as completed"""
    from db.models.observation_run import ObservationRun
    from datetime import datetime
    
    run = db.get(ObservationRun, run_id)
    if run:
        run.summary_json = summary
        if not run.observed_at_end:
            run.observed_at_end = datetime.now(timezone.utc)
        db.add(run)
        db.commit()

def _process_calculated_summary(
    spots: List[Dict[str, Any]],
    config: Dict[str, Any],
    block_info: Optional[Dict[str, Any]],
    db: Session
) -> Dict[str, Any]:
    """
    Process summary for calculated mode templates with statistical aggregation
    """
    n_spots = len(spots)
    
    # Extract date range
    observed_times = [s.get('observed_at') for s in spots if s.get('observed_at')]
    date_range = {
        "first": min(observed_times).isoformat() if observed_times else None,
        "last": max(observed_times).isoformat() if observed_times else None
    }
    
    # Build block info section
    block_section = None
    if block_info:
        block_section = {
            "block_id": block_info['id'],
            "block_name": block_info.get('block_name'),
            "area_ha": block_info.get('area_ha')
        }
    
    # Initialize summary structure
    summary = {
        "summary_mode": "calculated",
        "n_spots": n_spots,
        "date_range": date_range,
        "block_info": block_section
    }
    
    # Process numeric fields
    numeric_fields = config.get('numeric_fields', [])
    if numeric_fields:
        summary['statistics'] = _aggregate_numeric_fields(spots, numeric_fields)
    
    # Process categorical fields
    categorical_fields = config.get('categorical_fields', [])
    if categorical_fields:
        summary['categorical_distribution'] = _aggregate_categorical_fields(
            spots, categorical_fields, config
        )
    
    # Calculate derived metrics
    derived_metrics = config.get('derived_metrics', [])
    if derived_metrics:
        summary['derived_metrics'] = _calculate_derived_metrics(
            spots, derived_metrics, summary.get('statistics', {}), block_info
        )
    
    # Calculate confidence with statistical component
    statistical_score = _calculate_statistical_confidence(summary.get('statistics', {}))
    target_spots_per_ha = config.get('target_spots_per_ha', 5.0)
    block_area = block_info.get('area_ha') if block_info else None
    
    summary['confidence'] = _calculate_confidence(
        n_spots=n_spots,
        block_area_ha=block_area,
        target_spots_per_ha=target_spots_per_ha,
        statistical_component=statistical_score
    )
    
    # Add notes digest
    notes = _extract_notes_digest(spots)
    if notes:
        summary['notes_digest'] = notes
    
    return summary


def _aggregate_numeric_fields(
    spots: List[Dict[str, Any]], 
    field_names: List[str]
) -> Dict[str, Dict[str, Any]]:
    """
    Aggregate numeric fields with mean, stdev, min, max, ci95
    """
    stats = {}
    
    for field_name in field_names:
        values = []
        
        for spot in spots:
            data = spot.get('data') or {}
            value = data.get(field_name)
            
            if value is not None:
                try:
                    values.append(float(value))
                except (ValueError, TypeError):
                    continue
        
        if values:
            n = len(values)
            field_stats = {
                "n": n,
                "mean": round(mean(values), 2),
                "min": round(min(values), 2),
                "max": round(max(values), 2)
            }
            
            if n > 1:
                field_stats["stdev"] = round(stdev(values), 2)
                ci_low, ci_high = ci95(values)
                field_stats["ci95"] = [round(ci_low, 2), round(ci_high, 2)]
            else:
                field_stats["stdev"] = 0.0
                field_stats["ci95"] = None
            
            stats[field_name] = field_stats
    
    return stats


def _aggregate_categorical_fields(
    spots: List[Dict[str, Any]], 
    field_names: List[str],
    config: Dict[str, Any]
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Aggregate categorical fields with distribution and percentages
    """
    distributions = {}
    
    for field_name in field_names:
        counts = {}
        labels_map = {}
        
        for spot in spots:
            data = spot.get('data') or {}
            value = data.get(field_name)
            
            if value:
                value_str = str(value)
                counts[value_str] = counts.get(value_str, 0) + 1
                
                # Try to get label if value is from a select field
                # This would require access to template fields_json to map values to labels
                # For now, use the value as label
                if value_str not in labels_map:
                    labels_map[value_str] = value_str
        
        if counts:
            total = sum(counts.values())
            distribution = []
            
            for value, count in sorted(counts.items(), key=lambda x: x[1], reverse=True):
                distribution.append({
                    "value": value,
                    "label": labels_map.get(value, value),
                    "count": count,
                    "percent": round((count / total) * 100, 1)
                })
            
            distributions[field_name] = distribution
            
            # Add uniformity score for phenology
            if config.get('uniformity_calculation') and distribution:
                max_percent = distribution[0]['percent']
                distributions[field_name + '_uniformity'] = {
                    "score": round(max_percent / 100, 3),
                    "dominant": distribution[0]['value'],
                    "dominant_percent": max_percent
                }
    
    return distributions


def _calculate_derived_metrics(
    spots: List[Dict[str, Any]],
    derived_configs: List[Dict[str, Any]],
    statistics: Dict[str, Dict[str, Any]],
    block_info: Optional[Dict[str, Any]]
) -> Dict[str, Dict[str, Any]]:
    """
    Calculate derived metrics like yield_t_per_ha, flowers_per_shoot, etc.
    """
    metrics = {}
    
    for config in derived_configs:
        metric_name = config.get('name')
        calculator = config.get('calculator')
        required_fields = config.get('requires_fields', [])
        required_block_data = config.get('requires_block_data', [])
        
        # Check if we have all required data
        inputs = {}
        
        # Get field values from statistics
        for field in required_fields:
            if field in statistics and 'mean' in statistics[field]:
                inputs[field] = statistics[field]['mean']
            else:
                # Missing required field - skip this metric
                break
        else:
            # Get block data if required
            if required_block_data and block_info:
                for block_field in required_block_data:
                    if block_field in block_info and block_info[block_field]:
                        inputs[block_field] = block_info[block_field]
                    else:
                        # Try to calculate vines_per_ha if needed
                        if block_field == 'vines_per_ha':
                            if block_info.get('row_spacing_m') and block_info.get('vine_spacing_m'):
                                try:
                                    inputs['vines_per_ha'] = vines_per_ha(
                                        block_info['row_spacing_m'],
                                        block_info['vine_spacing_m']
                                    )
                                except:
                                    break
                            else:
                                break
                        else:
                            break
            
            # Execute calculator
            try:
                result = _execute_calculator(calculator, inputs)
                if result is not None:
                    metrics[metric_name] = {
                        "value": round(result, 2),
                        "inputs": {k: round(v, 2) for k, v in inputs.items()}
                    }
            except Exception as e:
                # Log error but continue
                print(f"Failed to calculate {metric_name}: {e}")
    
    return metrics


def _execute_calculator(calculator_name: str, inputs: Dict[str, float]) -> Optional[float]:
    """
    Execute a named calculator function with given inputs
    """
    if calculator_name == 'yield_t_per_ha':
        # bunches_per_vine × bunch_weight_g × vines_per_ha / 1,000,000
        return yield_t_per_ha(
            inputs['bunches_per_vine'],
            inputs['bunch_weight_g'],
            inputs['vines_per_ha']
        )
    
    elif calculator_name == 'flowers_per_shoot':
        return flowers_per_shoot(
            inputs['inflorescences_per_shoot'],
            inputs['flowers_per_inflorescence']
        )
    
    elif calculator_name == 'divide':
        # Generic division (e.g., bunches_total / vines_sampled)
        field_keys = list(inputs.keys())
        if len(field_keys) == 2:
            numerator = inputs[field_keys[0]]
            denominator = inputs[field_keys[1]]
            if denominator > 0:
                return numerator / denominator
        return None
    
    elif calculator_name == 'divide_by_100':
        # For berry_weight_100g → berry_weight_g
        field_key = list(inputs.keys())[0]
        return inputs[field_key] / 100.0
    
    elif calculator_name == 'subtract':
        # For delta to target (e.g., buds_per_vine - target_buds_per_vine)
        field_keys = list(inputs.keys())
        if len(field_keys) == 2:
            return inputs[field_keys[0]] - inputs[field_keys[1]]
        return None
    
    else:
        return None


def _calculate_statistical_confidence(statistics: Dict[str, Dict[str, Any]]) -> Optional[float]:
    """
    Calculate a statistical confidence score (0-1) based on sample size and variability
    Returns None if no statistics available (for observational mode)
    """
    if not statistics:
        return None
    
    # Find the field with the most samples (primary measurement)
    max_n = 0
    cv_values = []
    
    for field_name, stats in statistics.items():
        n = stats.get('n', 0)
        mean_val = stats.get('mean', 0)
        stdev_val = stats.get('stdev', 0)
        
        if n > max_n:
            max_n = n
        
        # Calculate coefficient of variation (CV = stdev / mean)
        if mean_val > 0 and stdev_val >= 0:
            cv = stdev_val / abs(mean_val)
            cv_values.append(cv)
    
    # Sample size component (diminishing returns after n=20)
    if max_n == 0:
        return None
    
    n_score = min(1.0, max_n / 20.0)
    
    # Variability component (lower CV = higher confidence)
    # CV < 0.1 = excellent, 0.1-0.3 = good, 0.3-0.5 = moderate, >0.5 = poor
    if cv_values:
        avg_cv = sum(cv_values) / len(cv_values)
        if avg_cv < 0.1:
            cv_score = 1.0
        elif avg_cv < 0.3:
            cv_score = 0.8
        elif avg_cv < 0.5:
            cv_score = 0.6
        else:
            cv_score = 0.4
    else:
        cv_score = 0.7  # Default if we can't calculate CV
    
    # Combined: 60% sample size, 40% variability
    return 0.6 * n_score + 0.4 * cv_score

def _process_observational_summary(
    spots: List[Dict[str, Any]],
    config: Dict[str, Any],
    block_info: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Process summary for observational mode templates with counts and flags
    """
    n_spots = len(spots)
    
    # Extract date range
    observed_times = [s.get('observed_at') for s in spots if s.get('observed_at')]
    date_range = {
        "first": min(observed_times).isoformat() if observed_times else None,
        "last": max(observed_times).isoformat() if observed_times else None
    }
    
    # Build block info section
    block_section = None
    if block_info:
        block_section = {
            "block_id": block_info['id'],
            "block_name": block_info.get('block_name'),
            "area_ha": block_info.get('area_ha')
        }
    
    # Initialize summary structure
    summary = {
        "summary_mode": "observational",
        "n_spots": n_spots,
        "date_range": date_range,
        "block_info": block_section
    }
    
    # Process boolean flags
    count_flags = config.get('count_flags', [])
    if count_flags:
        summary['flag_summary'] = _count_boolean_flags(spots, count_flags, n_spots)
    
    # Process severity if configured
    if config.get('aggregate_severity'):
        severity_fields = _find_severity_fields(config.get('numeric_fields', []))
        if severity_fields:
            summary['severity_summary'] = _aggregate_severity(spots, severity_fields)
    
    # Process categorical fields (e.g., pest_or_disease, issue_type)
    categorical_fields = config.get('categorical_fields', [])
    if categorical_fields:
        summary['categorical_distribution'] = _aggregate_categorical_fields_observational(
            spots, categorical_fields
        )
    
    # Process numeric fields if any (some observational templates have them)
    numeric_fields = config.get('numeric_fields', [])
    if numeric_fields:
        # Filter out severity fields (already handled)
        severity_field_names = _find_severity_fields(numeric_fields)
        other_numeric = [f for f in numeric_fields if f not in severity_field_names]
        
        if other_numeric:
            summary['numeric_summary'] = _aggregate_numeric_fields_simple(spots, other_numeric)
    
    # Check for biosecurity alerts
    if config.get('biosecurity_alert_check'):
        summary['biosecurity_alerts'] = _check_biosecurity_alerts(spots)
    
    # Calculate confidence (spatial coverage only)
    target_spots_per_ha = config.get('target_spots_per_ha', 2.0)
    block_area = block_info.get('area_ha') if block_info else None
    
    summary['confidence'] = _calculate_confidence(
        n_spots=n_spots,
        block_area_ha=block_area,
        target_spots_per_ha=target_spots_per_ha,
        statistical_component=None  # No statistical component for observational
    )
    
    # Add notes digest
    notes = _extract_notes_digest(spots)
    if notes:
        summary['notes_digest'] = notes
    
    return summary


def _count_boolean_flags(
    spots: List[Dict[str, Any]], 
    flag_names: List[str],
    total_spots: int
) -> Dict[str, str]:
    """
    Count boolean flags and return as 'X of Y spots' format
    """
    flag_counts = {flag: 0 for flag in flag_names}
    
    for spot in spots:
        data = spot.get('data') or {}
        for flag_name in flag_names:
            value = data.get(flag_name)
            # Count as true if: True, 'true', 1, 'yes', etc.
            if value in [True, 'true', 'True', 1, '1', 'yes', 'Yes']:
                flag_counts[flag_name] += 1
    
    # Format as "X of Y spots"
    result = {}
    for flag_name, count in flag_counts.items():
        result[flag_name] = f"{count} of {total_spots} spots"
    
    return result


def _find_severity_fields(field_names: List[str]) -> List[str]:
    """
    Identify severity fields by naming convention
    """
    return [f for f in field_names if 'severity' in f.lower()]


def _aggregate_severity(
    spots: List[Dict[str, Any]], 
    severity_fields: List[str]
) -> Dict[str, Any]:
    """
    Aggregate severity scores (mean and max)
    """
    if not severity_fields:
        return {}
    
    # Use first severity field found (most templates have only one)
    field_name = severity_fields[0]
    values = []
    
    for spot in spots:
        data = spot.get('data') or {}
        value = data.get(field_name)
        if value is not None:
            try:
                values.append(float(value))
            except (ValueError, TypeError):
                continue
    
    if not values:
        return {}
    
    return {
        "mean": round(mean(values), 1),
        "max": round(max(values), 1),
        "n": len(values)
    }


def _aggregate_categorical_fields_observational(
    spots: List[Dict[str, Any]], 
    field_names: List[str]
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Aggregate categorical fields for observational templates
    Similar to calculated mode but extracts labels from field options if available
    """
    distributions = {}
    
    for field_name in field_names:
        counts = {}
        
        for spot in spots:
            data = spot.get('data') or {}
            value = data.get(field_name)
            
            if value:
                value_str = str(value)
                counts[value_str] = counts.get(value_str, 0) + 1
        
        if counts:
            total = sum(counts.values())
            distribution = []
            
            for value, count in sorted(counts.items(), key=lambda x: x[1], reverse=True):
                distribution.append({
                    "value": value,
                    "label": _get_label_for_value(value, field_name),
                    "count": count,
                    "percent": round((count / total) * 100, 1)
                })
            
            distributions[field_name] = distribution
    
    return distributions


def _get_label_for_value(value: str, field_name: str) -> str:
    """
    Try to get a human-readable label for a categorical value
    This is a basic implementation - could be enhanced by storing field options
    """
    # Common transformations
    label = value.replace('_', ' ').title()
    
    # Special cases for known values
    label_map = {
        'el-1': 'EL-1: Dormant bud',
        'el-5': 'EL-5: Bud swell',
        'el-12': 'EL-12: 2 leaves separated',
        'el-15': 'EL-15: 5 leaves separated',
        'el-17': 'EL-17: 12 leaves separated',
        'el-19': 'EL-19: Beginning of flowering',
        'el-23': 'EL-23: Cap-fall complete',
        'el-27': 'EL-27: Fruit set',
        'el-31': 'EL-31: Pea-size berries',
        'el-33': 'EL-33: Berries begin to touch',
        'el-35': 'EL-35: Veraison',
        'el-38': 'EL-38: Berries harvest-ripe',
    }
    
    return label_map.get(value.lower(), label)


def _aggregate_numeric_fields_simple(
    spots: List[Dict[str, Any]], 
    field_names: List[str]
) -> Dict[str, Dict[str, Any]]:
    """
    Simple numeric aggregation for observational templates (mean, min, max only)
    """
    stats = {}
    
    for field_name in field_names:
        values = []
        
        for spot in spots:
            data = spot.get('data') or {}
            value = data.get(field_name)
            
            if value is not None:
                try:
                    values.append(float(value))
                except (ValueError, TypeError):
                    continue
        
        if values:
            stats[field_name] = {
                "n": len(values),
                "mean": round(mean(values), 1),
                "min": round(min(values), 1),
                "max": round(max(values), 1)
            }
    
    return stats


def _check_biosecurity_alerts(spots: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Check for biosecurity alert species in pest/disease observations
    """
    alert_species = []
    alert_spots = set()
    
    # Known biosecurity alert values (from your template)
    biosecurity_values = [
        'bmsb_alert',
        'vine_mealybug_alert', 
        'egvm_alert',
        'slf_alert',
        'swd_alert',
        'pierces_gwss_alert',
        'fd_alert'
    ]
    
    # Labels for alerts
    alert_labels = {
        'bmsb_alert': 'Brown marmorated stink bug (BMSB)',
        'vine_mealybug_alert': 'Vine mealybug (Planococcus ficus)',
        'egvm_alert': 'European grapevine moth (Lobesia botrana)',
        'slf_alert': 'Spotted lanternfly (Lycorma delicatula)',
        'swd_alert': 'Spotted wing drosophila (Drosophila suzukii)',
        'pierces_gwss_alert': "Pierce's disease / GWSS vector",
        'fd_alert': 'Flavescence dorée (phytoplasma)'
    }
    
    for spot in spots:
        data = spot.get('data') or {}
        pest_or_disease = data.get('pest_or_disease')
        
        if pest_or_disease in biosecurity_values:
            severity = data.get('severity_0_5')
            
            # Find existing entry or create new
            existing = next((a for a in alert_species if a['value'] == pest_or_disease), None)
            if existing:
                existing['spots'].append(spot['id'])
                if severity is not None:
                    existing['severity_max'] = max(existing['severity_max'], float(severity))
            else:
                alert_species.append({
                    "value": pest_or_disease,
                    "label": alert_labels.get(pest_or_disease, pest_or_disease),
                    "spots": [spot['id']],
                    "severity_max": float(severity) if severity is not None else None
                })
            
            alert_spots.add(spot['id'])
    
    return {
        "detected": len(alert_species) > 0,
        "species": alert_species,
        "requires_immediate_report": len(alert_species) > 0
    }