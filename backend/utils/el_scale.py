# utils/el_scale.py
"""
EL Scale (Eichhorn-Lorenz) reference data for grape phenology observations
Based on the modified E-L system for identifying major and intermediate grapevine growth stages
"""

# Complete EL Scale stages with descriptions
EL_STAGES = {
    # Dormant Phase
    "EL-1": {
        "name": "Winter bud",
        "description": "Dormant winter bud",
        "phase": "dormant",
        "phase_order": 1,
        "is_major_stage": False
    },
    
    # Shoot Development Phase
    "EL-2": {
        "name": "Bud scales opening",
        "description": "Bud scales opening",
        "phase": "shoot_development",
        "phase_order": 2,
        "is_major_stage": False
    },
    "EL-3": {
        "name": "Wooly bud + green showing",
        "description": "Wooly bud with green showing",
        "phase": "shoot_development",
        "phase_order": 3,
        "is_major_stage": False
    },
    "EL-4": {
        "name": "Budburst",
        "description": "Budburst; leaf tips visible",
        "phase": "shoot_development",
        "phase_order": 4,
        "is_major_stage": True
    },
    "EL-7": {
        "name": "First leaf separated from shoot tip",
        "description": "First leaf separated from shoot tip",
        "phase": "shoot_development",
        "phase_order": 7,
        "is_major_stage": False
    },
    "EL-9": {
        "name": "2 to 3 leaves separated; shoots 2-4 cm long",
        "description": "2 to 3 leaves separated; shoots 2-4 cm long",
        "phase": "shoot_development",
        "phase_order": 9,
        "is_major_stage": False
    },
    "EL-11": {
        "name": "4 leaves separated",
        "description": "4 leaves separated",
        "phase": "shoot_development",
        "phase_order": 11,
        "is_major_stage": False
    },
    "EL-12": {
        "name": "Shoots 10 cm",
        "description": "5 leaves separated; shoots about 10 cm long; inflorescence clear",
        "phase": "shoot_development",
        "phase_order": 12,
        "is_major_stage": True
    },
    "EL-13": {
        "name": "6 leaves separated",
        "description": "6 leaves separated",
        "phase": "shoot_development",
        "phase_order": 13,
        "is_major_stage": False
    },
    "EL-14": {
        "name": "7 leaves separated",
        "description": "7 leaves separated",
        "phase": "shoot_development",
        "phase_order": 14,
        "is_major_stage": False
    },
    "EL-15": {
        "name": "8 leaves separated, shoot elongating rapidly",
        "description": "8 leaves separated, shoot elongating rapidly; single flowers in compact groups",
        "phase": "shoot_development",
        "phase_order": 15,
        "is_major_stage": False
    },
    "EL-16": {
        "name": "10 leaves separated",
        "description": "10 leaves separated",
        "phase": "shoot_development",
        "phase_order": 16,
        "is_major_stage": False
    },
    "EL-17": {
        "name": "12 leaves separated; inflorescence well developed",
        "description": "12 leaves separated; inflorescence well developed, single flowers separated",
        "phase": "shoot_development",
        "phase_order": 17,
        "is_major_stage": False
    },
    "EL-18": {
        "name": "14 leaves separated",
        "description": "14 leaves separated; flower caps still in place, but cap colour fading from green",
        "phase": "shoot_development",
        "phase_order": 18,
        "is_major_stage": False
    },
    
    # Flowering Phase
    "EL-19": {
        "name": "Flowering begins",
        "description": "About 16 leaves separated; beginning of flowering (first flower caps loosening)",
        "phase": "flowering",
        "phase_order": 19,
        "is_major_stage": True
    },
    "EL-20": {
        "name": "10% caps off",
        "description": "10% caps off",
        "phase": "flowering",
        "phase_order": 20,
        "is_major_stage": False
    },
    "EL-21": {
        "name": "30% caps off",
        "description": "30% caps off",
        "phase": "flowering",
        "phase_order": 21,
        "is_major_stage": False
    },
    "EL-23": {
        "name": "Flowering",
        "description": "17-20 leaves separated; 50% caps off (= flowering)",
        "phase": "flowering",
        "phase_order": 23,
        "is_major_stage": True
    },
    "EL-25": {
        "name": "80% caps off",
        "description": "80% caps off",
        "phase": "flowering",
        "phase_order": 25,
        "is_major_stage": False
    },
    "EL-26": {
        "name": "Cap-fall complete",
        "description": "Cap-fall complete",
        "phase": "flowering",
        "phase_order": 26,
        "is_major_stage": False
    },
    
    # Berry Development Phase
    "EL-27": {
        "name": "Setting",
        "description": "Setting; young berries enlarging (>2 mm diam.), bunch at right angles to stem",
        "phase": "berry_development",
        "phase_order": 27,
        "is_major_stage": True
    },
    "EL-29": {
        "name": "Berries pepper-corn size",
        "description": "Berries pepper-corn size (4 mm diam.); bunches tending downwards",
        "phase": "berry_development",
        "phase_order": 29,
        "is_major_stage": False
    },
    "EL-31": {
        "name": "Berries pea-size",
        "description": "Berries pea-size (7 mm diam.)",
        "phase": "berry_development",
        "phase_order": 31,
        "is_major_stage": True
    },
    "EL-32": {
        "name": "Beginning of bunch closure",
        "description": "Beginning of bunch closure, berries touching (if bunches are tight)",
        "phase": "berry_development",
        "phase_order": 32,
        "is_major_stage": False
    },
    "EL-33": {
        "name": "Berries still hard and green",
        "description": "Berries still hard and green",
        "phase": "berry_development",
        "phase_order": 33,
        "is_major_stage": False
    },
    "EL-34": {
        "name": "Berries begin to soften",
        "description": "Berries begin to soften; Sugar starts increasing",
        "phase": "berry_development",
        "phase_order": 34,
        "is_major_stage": False
    },
    
    # Berry Ripening Phase
    "EL-35": {
        "name": "Veraison",
        "description": "Berries begin to colour and enlarge",
        "phase": "berry_ripening",
        "phase_order": 35,
        "is_major_stage": True
    },
    "EL-36": {
        "name": "Berries with intermediate sugar values",
        "description": "Berries with intermediate sugar values",
        "phase": "berry_ripening",
        "phase_order": 36,
        "is_major_stage": False
    },
    "EL-37": {
        "name": "Berries not quite ripe",
        "description": "Berries not quite ripe",
        "phase": "berry_ripening",
        "phase_order": 37,
        "is_major_stage": False
    },
    "EL-38": {
        "name": "Harvest",
        "description": "Berries harvest-ripe",
        "phase": "berry_ripening",
        "phase_order": 38,
        "is_major_stage": True
    },
    "EL-39": {
        "name": "Berries over-ripe",
        "description": "Berries over-ripe",
        "phase": "berry_ripening",
        "phase_order": 39,
        "is_major_stage": False
    },
    "EL-41": {
        "name": "After harvest; cane maturation complete",
        "description": "After harvest; cane maturation complete",
        "phase": "berry_ripening",
        "phase_order": 41,
        "is_major_stage": False
    },
    
    # Senescence Phase
    "EL-43": {
        "name": "Beginning of leaf fall",
        "description": "Beginning of leaf fall",
        "phase": "senescence",
        "phase_order": 43,
        "is_major_stage": False
    },
    "EL-47": {
        "name": "End of leaf fall",
        "description": "End of leaf fall",
        "phase": "senescence",
        "phase_order": 47,
        "is_major_stage": False
    }
}

# Phase definitions with descriptions
EL_PHASES = {
    "dormant": {
        "name": "Dormant",
        "description": "Winter dormancy period",
        "stages": ["EL-1"],
        "typical_months": ["Jun", "Jul", "Aug"],  # Southern hemisphere
        "order": 1
    },
    "shoot_development": {
        "name": "Shoot and Inflorescence Development",
        "description": "Bud break through shoot and leaf development",
        "stages": ["EL-2", "EL-3", "EL-4", "EL-7", "EL-9", "EL-11", "EL-12", 
                   "EL-13", "EL-14", "EL-15", "EL-16", "EL-17", "EL-18"],
        "typical_months": ["Sep", "Oct", "Nov"],
        "order": 2
    },
    "flowering": {
        "name": "Flowering",
        "description": "Flower cap fall and pollination period",
        "stages": ["EL-19", "EL-20", "EL-21", "EL-23", "EL-25", "EL-26"],
        "typical_months": ["Nov", "Dec"],
        "order": 3
    },
    "berry_development": {
        "name": "Berry Development",
        "description": "Fruit set through berry growth",
        "stages": ["EL-27", "EL-29", "EL-31", "EL-32", "EL-33", "EL-34"],
        "typical_months": ["Dec", "Jan"],
        "order": 4
    },
    "berry_ripening": {
        "name": "Berry Ripening",
        "description": "Veraison through harvest and post-harvest",
        "stages": ["EL-35", "EL-36", "EL-37", "EL-38", "EL-39", "EL-41"],
        "typical_months": ["Feb", "Mar", "Apr", "May"],
        "order": 5
    },
    "senescence": {
        "name": "Senescence",
        "description": "Leaf fall and return to dormancy",
        "stages": ["EL-43", "EL-47"],
        "typical_months": ["May", "Jun"],
        "order": 6
    }
}

# Major stages for quick reference and validation
MAJOR_STAGES = ["EL-4", "EL-12", "EL-19", "EL-23", "EL-27", "EL-31", "EL-35", "EL-38"]

def get_el_stage_info(stage_code: str) -> dict:
    """Get complete information about an EL stage"""
    return EL_STAGES.get(stage_code)

def get_stages_by_phase(phase: str) -> list:
    """Get all EL stages for a specific phase"""
    phase_info = EL_PHASES.get(phase)
    return phase_info["stages"] if phase_info else []

def get_major_stages() -> list:
    """Get list of major EL stages"""
    return MAJOR_STAGES

def get_next_stage(current_stage: str) -> str:
    """Get the next logical EL stage in progression"""
    current_order = EL_STAGES.get(current_stage, {}).get("phase_order")
    if not current_order:
        return None
    
    # Find next stage with higher phase_order
    next_stages = [
        stage for stage, info in EL_STAGES.items() 
        if info["phase_order"] > current_order
    ]
    
    if next_stages:
        # Return the stage with the smallest phase_order that's still greater
        return min(next_stages, key=lambda x: EL_STAGES[x]["phase_order"])
    
    return None

def get_previous_stage(current_stage: str) -> str:
    """Get the previous logical EL stage in progression"""
    current_order = EL_STAGES.get(current_stage, {}).get("phase_order")
    if not current_order:
        return None
    
    # Find previous stage with lower phase_order
    previous_stages = [
        stage for stage, info in EL_STAGES.items() 
        if info["phase_order"] < current_order
    ]
    
    if previous_stages:
        # Return the stage with the largest phase_order that's still smaller
        return max(previous_stages, key=lambda x: EL_STAGES[x]["phase_order"])
    
    return None

def validate_el_stage(stage_code: str) -> bool:
    """Validate if an EL stage code is valid"""
    return stage_code in EL_STAGES

def get_phases_for_dropdown() -> list:
    """Get formatted phase data for UI dropdowns"""
    return [
        {
            "value": phase_key,
            "label": phase_info["name"],
            "description": phase_info["description"],
            "typical_months": phase_info["typical_months"],
            "order": phase_info["order"]
        }
        for phase_key, phase_info in sorted(EL_PHASES.items(), key=lambda x: x[1]["order"])
    ]

def get_stages_for_dropdown(phase: str = None) -> list:
    """Get formatted stage data for UI dropdowns, optionally filtered by phase"""
    stages_to_include = EL_STAGES.keys()
    
    if phase and phase in EL_PHASES:
        stages_to_include = EL_PHASES[phase]["stages"]
    
    return [
        {
            "value": stage_code,
            "label": f"{stage_code}: {stage_info['name']}",
            "description": stage_info["description"],
            "phase": stage_info["phase"],
            "is_major": stage_info["is_major_stage"],
            "order": stage_info["phase_order"]
        }
        for stage_code, stage_info in EL_STAGES.items()
        if stage_code in stages_to_include
    ]

def suggest_current_stages_by_month(month: int) -> list:
    """Suggest likely EL stages based on current month (Southern Hemisphere)"""
    month_names = [
        "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ]
    
    if month < 1 or month > 12:
        return []
    
    current_month = month_names[month]
    
    suggested_phases = [
        phase_key for phase_key, phase_info in EL_PHASES.items()
        if current_month in phase_info["typical_months"]
    ]
    
    suggested_stages = []
    for phase in suggested_phases:
        suggested_stages.extend(EL_PHASES[phase]["stages"])
    
    return suggested_stages