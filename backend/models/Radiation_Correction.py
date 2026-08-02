# -*- coding: utf-8 -*-
"""
Created on Sun Mar 23 12:30:05 2025

@author: Peter Taylor

THIS IS STILL A WORK IN PROGRESS....


"""

import os
import pandas as pd
import numpy as np
import pvlib
from datetime import datetime

# Load topographical data
topo_df = pd.read_csv("G:\\My Drive\\MW\\Research Papers\\Research_Vineyards_Topography_Stats.csv")
topo_dict = topo_df.set_index("Vineyard ID").to_dict(orient="index")

def compute_radiation(row, vineyard_info):
    latitude = vineyard_info["Latitude"]
    longitude = vineyard_info["Longitude"]
    slope = vineyard_info["Angle"]
    aspect = vineyard_info["Aspect"]
    
    # Compute solar position
    date = pd.to_datetime(row["Date"])
    solar_position = pvlib.solarposition.get_solarposition(date, latitude, longitude)
    
    zenith = solar_position["zenith"].values[0]  # Solar zenith angle (degrees)
    azimuth = solar_position["azimuth"].values[0]  # Solar azimuth angle (degrees)

    # Convert angles to radians
    zenith_rad = np.radians(zenith)
    slope_rad = np.radians(slope)
    aspect_rad = np.radians(aspect)
    azimuth_rad = np.radians(azimuth)
    
    # Calculate solar zenith angle cosine for correction
    cos_theta_z = np.cos(zenith_rad)
    
    # Calculate solar incidence angle using slope and aspect
    cos_theta_i = (np.sin(zenith_rad) * np.sin(slope_rad) +
                   np.cos(zenith_rad) * np.cos(slope_rad) * np.cos(azimuth_rad - aspect_rad))

    # Ensure cosine of solar incidence angle is within the valid range [-1, 1]
    cos_theta_i = np.clip(cos_theta_i, -1, 1)
    
    # Apply terrain correction (adjustment based on slope and aspect)
    correction_factor = cos_theta_i / cos_theta_z
    # Adjust measured radiation
    adjusted_radiation = row["Amount(MJm2)"] * correction_factor

    return pd.Series({"Adj_Amount(MJm2)": adjusted_radiation})


# Process each climate file
climate_dir = "G:\\My Drive\\MW\\Research Papers\\Climate Data_Vineyards"
output_dir = "G:\\My Drive\\MW\\Research Papers\\Climate Data_Vineyards_Corrected"
os.makedirs(output_dir, exist_ok=True)

for filename in os.listdir(climate_dir):
    if filename.endswith(".csv"):
        vineyard_id, _ = filename.split("_")  # Extract vineyard ID from filename
        vineyard_id = int(vineyard_id)

        if vineyard_id in topo_dict:
            vineyard_info = topo_dict[vineyard_id]
            climate_df = pd.read_csv(os.path.join(climate_dir, filename))
            
            # Compute adjusted radiation & TOA max radiation
            climate_df[["Adj_Amount(MJm2)"]] = climate_df.apply(compute_radiation, axis=1, vineyard_info=vineyard_info)
            
            # Save modified file
            climate_df.to_csv(os.path.join(output_dir, filename), index=False)
