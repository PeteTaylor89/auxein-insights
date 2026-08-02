
import re
import os
import pandas as pd
import numpy as np
from scipy.interpolate import Rbf
from sklearn.base import BaseEstimator
from sklearn.model_selection import cross_val_score
import time
from datetime import datetime
import matplotlib.pyplot as plt
import matplotlib.colors as mcolors
from sklearn.metrics import mean_squared_error
from scipy.spatial.distance import squareform, pdist
import networkx as nx

start_time = time.time()
test = False #set to False if production mode

input_variable = 'GLOBAL_RAD_DAILY_SPLINE_INPUTS' #naming convention identical when in test mode 
regional = True # set to false if nationwide
region = 'North_Canterbury_WG'
Vineyard = False


def create_directories(*folders):
    for folder in folders:
        if not os.path.exists(folder):
            os.makedirs(folder)
            
if test:
    # For test mode
        folder_path = f'Z:\\Data\\REGEN SPLINE V1.4\\TEST\\{input_variable}'
        output_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\TEST\\{input_variable.replace("SPLINE_INPUTS", "GRIDDED_OUTPUTS")}'
        station_output_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\TEST\\{input_variable.replace("SPLINE_INPUTS", "STATION_OUTPUTS")}'
        exceptions_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\TEST\\{input_variable.replace("_INPUTS", "_EXCEPTIONS")}'
        testing_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\TEST\\{input_variable.replace("SPLINE_INPUTS", "TESTING_OUTPUTS")}'
        image_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\TEST\\{input_variable.replace("_INPUTS", "_IMAGES")}'
        log_path = 'Z:\\Data\\REGEN SPLINE V1.4\\TEST\\Logs\\SPLINE_Output_Logs'
        create_directories(output_folder, station_output_folder, exceptions_folder, testing_folder, image_folder)

else:
    # For production mode
    if regional:
        folder_path = f'Z:\\Data\\REGEN SPLINE V1.4\\INPUT DATA\\{input_variable}'
        output_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\{region}\\{input_variable.replace("SPLINE_INPUTS", "GRIDDED_OUTPUTS")}'
        station_output_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\{region}\\{input_variable.replace("SPLINE_INPUTS", "STATION_OUTPUTS")}'
        exceptions_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\{region}\\{input_variable.replace("_INPUTS", "_EXCEPTIONS")}'
        testing_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\{region}\\{input_variable.replace("SPLINE_INPUTS", "TESTING_OUTPUTS")}'
        log_path = 'Z:\\Data\\REGEN SPLINE V1.4\\Logs\\SPLINE_Output_Logs'
        create_directories(output_folder, station_output_folder, exceptions_folder, testing_folder) 
    elif Vineyard:
        folder_path = f'Z:\\Data\\REGEN SPLINE V1.4\\INPUT DATA\\{input_variable}'
        output_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\Vineyards\\{input_variable.replace("SPLINE_INPUTS", "GRIDDED_OUTPUTS")}'
        station_output_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\Vineyards\\{input_variable.replace("SPLINE_INPUTS", "STATION_OUTPUTS")}'
        exceptions_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\Vineyards\\{input_variable.replace("_INPUTS", "_EXCEPTIONS")}'
        testing_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\Vineyards\\{input_variable.replace("SPLINE_INPUTS", "TESTING_OUTPUTS")}'
        log_path = 'Z:\\Data\\REGEN SPLINE V1.4\\Logs\\SPLINE_Output_Logs'
        create_directories(output_folder, station_output_folder, exceptions_folder, testing_folder) 
    else:
                    
        folder_path = f'Z:\\Data\\REGEN SPLINE V1.4\\INPUT DATA\\{input_variable}'
        output_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\{input_variable.replace("SPLINE_INPUTS", "GRIDDED_OUTPUTS")}'
        station_output_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\{input_variable.replace("SPLINE_INPUTS", "STATION_OUTPUTS")}'
        exceptions_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\{input_variable.replace("_INPUTS", "_EXCEPTIONS")}'
        testing_folder = f'Z:\\Data\\REGEN SPLINE V1.4\\OUTPUT DATA\\{input_variable.replace("SPLINE_INPUTS", "TESTING_OUTPUTS")}'
        log_path = 'Z:\\Data\\REGEN SPLINE V1.4\\Logs\\SPLINE_Output_Logs'
        create_directories(output_folder, station_output_folder, exceptions_folder, testing_folder)

station_type = 'GLOBAL_RAD_DAILY'

lat_lon_height_file = f'Z:\\Data\\Climate_Station_Data\\New_Zealand\\STATION_INFORMATION_CLIFLO\\CLIFLO_RAW_{station_type}.csv'
Station_Network_file = 'Z:\\Data\\VCDN_500m_Regional\\VCDN_500m_Waipara.csv'
lat_lon_height_df = pd.read_csv(lat_lon_height_file)
statistics_df = pd.DataFrame(columns=['Date', 'Mean_MSE', 'RMSE', 'SNR', 'M_Stations', 'T_Stations', 'T_RMSE'])

problem_stations = [6237, 44557, 12740, 6238, 6174, 7340, 6172, 39523, 6170, 17840, 6191, 6176]

def haversine(lat1, lon1, lat2, lon2):
    R = 6371  # Earth's radius in kilometers
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat / 2) ** 2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2) ** 2
    c = 2 * np.arctan2(np.sqrt(a), np.sqrt(1 - a))
    return R * c

class RbfInterpolator(BaseEstimator):
    def __init__(self, smoothing_factor=0.0001):
        self.smoothing_factor = smoothing_factor

    def fit(self, X, y):
        self.rbf_interpolator = Rbf(X[:, 0], X[:, 1], y, function='thin_plate', smooth=self.smoothing_factor)
        return self

    def predict(self, X):
        return self.rbf_interpolator(X[:, 0], X[:, 1])


class InterpolationPlotter:
    def __init__(self, lon, lat, interpolated_values, merged_df, testing_df, image_folder, climate_variable, dates):
        self.lon = lon
        self.lat = lat
        self.interpolated_values = interpolated_values
        self.merged_df = merged_df
        self.testing_df = testing_df
        self.image_folder = image_folder
        self.climate_variable = climate_variable
        self.dates = dates

    def plot_and_save(self):

        plt.figure(figsize=(10, 8))
        #norm = mcolors.Normalize(vmin=np.nanmin(self.interpolated_values), vmax=np.nanmax(self.interpolated_values))
        norm = mcolors.Normalize(vmin=0, vmax=50)
        cmap = plt.cm.bwr  
        plt.scatter(self.lon, self.lat, c=self.interpolated_values, cmap=cmap, norm=norm, s=10)
        plt.colorbar(label=f'{self.climate_variable} (Interpolated)')

        plt.xlabel('Longitude')
        plt.ylabel('Latitude')
        plt.title(f'2D Interpolated Surface for {self.climate_variable} with Lapse Rate Correction_{self.dates}')
        plt.scatter(self.testing_df['Longitude'], self.testing_df['Latitude'], c='yellow', s=7)
        plt.scatter(self.merged_df['Longitude'], self.merged_df['Latitude'], c='black', s=5)

        plt.legend()
        plt.tight_layout()
        sanitized_climate_variable = re.sub(r'[^\w\-_\. ]', '_', self.climate_variable)  # Replace invalid characters with '_'
        sanitized_dates = self.dates.replace('/', '_')
        plot_file = os.path.join(self.image_folder, f'{sanitized_climate_variable}_interpolation_plot_{sanitized_dates}.png')

        plt.savefig(plot_file)
        plt.show()

for file_name in os.listdir(folder_path):
    if file_name.endswith('.csv'):
        input_file = os.path.join(folder_path, file_name)

        result_df = pd.read_csv(input_file)
        merged_df = pd.merge(result_df, lat_lon_height_df, how='left', left_on='Station', right_on='Agent Number')
        merged_df = merged_df.drop(['Network Number', 'Posn_Precision', 'Observing Authority', 'Name'], axis=1)
        climate_variable = merged_df.columns[1]
        merged_df.replace({"-": np.nan, "-9999": np.nan}, inplace=True)
        merged_df.dropna(subset=['Longitude', 'Latitude', climate_variable], inplace=True)
        merged_df["Height"] = merged_df["Height"].astype(float)
        merged_df[climate_variable] = merged_df[climate_variable].astype(float)
        merged_df = merged_df[~merged_df["Station"].isin(problem_stations)]
        
        
        coords_df = merged_df.copy()
        problematic_stations_coords = coords_df[["Latitude", "Longitude"]].values
        station_ids = coords_df["Station"].values
        
        lat_lon = coords_df[["Latitude", "Longitude"]].values
        dist_matrix = squareform(pdist(lat_lon, lambda u, v: haversine(u[0], u[1], v[0], v[1])))
        
        threshold_km = .5
        adjacency_matrix = dist_matrix <= threshold_km
        G = nx.Graph(adjacency_matrix)
        connected_components = list(nx.connected_components(G))
        # Assign groups to problematic stations
        group_assignments = np.full(len(lat_lon), -1)  # Initialize all as ungrouped
        for group_id, component in enumerate(connected_components):
            if not component:  # Skip empty components
                continue
            for idx in component:
                if 0 <= idx < len(lat_lon):  # Ensure idx is within bounds
                    group_assignments[idx] = group_id

        coords_df["Group"] = group_assignments
        stations_to_keep = []
        stations_to_remove = []
        for group_id in np.unique(group_assignments[group_assignments >= 0]):
            group_indices = np.where(group_assignments == group_id)[0]
            if group_indices.size > 0:
                stations_to_keep.append(coords_df.iloc[group_indices[0]]["Station"])
                for idx in group_indices[1:]:
                    stations_to_remove.append(coords_df.iloc[idx]["Station"])
        testing_df = merged_df[~merged_df["Station"].isin(stations_to_keep)]
        merged_df = merged_df[~merged_df["Station"].isin(stations_to_remove)]

        X = merged_df[['Longitude', 'Latitude']].values.astype(float)  
        y = merged_df[climate_variable].values.astype(float)
        valid_indices = np.logical_and(~np.isnan(X).any(axis=1), ~np.isnan(y))

        X = X[valid_indices]
        y = y[valid_indices]

        if len(X) == 0 or len(y) == 0:
            print(f"Skipping {file_name} due to missing values.")
            continue

        smoothing_factors = np.logspace(-4, 0, 7)  # Example range from 10^-5 to 10^5

        mse_scores = []
        gcv_scores = []  
        for smoothing_factor in smoothing_factors:
            rbf_interpolator = RbfInterpolator(smoothing_factor=smoothing_factor)
            cv_scores = cross_val_score(rbf_interpolator, X, y, cv=5, scoring='neg_mean_squared_error')
            mse_scores.append(-np.mean(cv_scores))

            gcv_scores.append(np.sqrt(-np.mean(cv_scores) / len(X)))

        optimal_smoothing_factor = smoothing_factors[np.argmin(mse_scores)]

        rbf_interpolator = RbfInterpolator(smoothing_factor=optimal_smoothing_factor)
        rbf_interpolator.fit(X, y)
        observed_max = np.max(y)
        observed_min = np.min(y)

        interpolated_temp = rbf_interpolator.predict(X)
        merged_df[f'Interpolated_{climate_variable}'] = interpolated_temp
        rmse = np.sqrt(mean_squared_error(y, interpolated_temp))

        signal = np.mean(y)
        noise = rmse
        snr = signal / noise
        modelled_stations = len(merged_df)
        testing_stations = len(testing_df)
                
        date_str = file_name.split('.')[0]
        exceptions_output_file = os.path.join(exceptions_folder, f'VCSN_interpolated_data_{date_str}.csv')
        station_network = pd.read_csv(Station_Network_file)
        
        #apply interpolator onto grid and testing data
        
        station_network[f"Interpolated_{climate_variable}"] = rbf_interpolator.predict(
            station_network[['Longitude', 'Latitude']].values
        )
        testing_df[f"Interpolated_{climate_variable}"] = rbf_interpolator.predict(
                testing_df[['Longitude', 'Latitude']].values
            )
        
        #clip interpolated data on both grid and testing based on max values
        
        station_network[f"Interpolated_{climate_variable}"] = np.clip(
                station_network[f"Interpolated_{climate_variable}"], observed_min, observed_max
        )
        testing_df[f"Interpolated_{climate_variable}"] = np.clip(
                testing_df[f"Interpolated_{climate_variable}"], observed_min, observed_max
        )
                
        #adjust interpolated data on both grid and testing based on altitude
        
      
        measured = testing_df[f'{climate_variable}']
        predicted = testing_df[f'{climate_variable}']
        t_RMSE = np.sqrt(np.mean((measured - predicted)**2)) 
      
        statistics_df = statistics_df.append({
            'Date': date_str,
            'Mean_MSE': round(mse_scores[np.argmin(mse_scores)], 2),
            'RMSE': round(rmse, 4),
            'SNR': round(snr, 1),
            'M_Stations': modelled_stations, 
            'T_Stations': testing_stations, 
            'T_RMSE': round(t_RMSE, 2)
        }, ignore_index=True)

        print(f"Date: {date_str}, Optimal Smoothing Factor: {optimal_smoothing_factor}, RMSE: {rmse:.4f}, SNR: {snr:.2f}")
        if rmse > 0.75:
   
            for threshold_km in range(2, 11, 2):  # Iterate from 2 km to 10 km in steps of 2 km
                print(f"Processing threshold: {threshold_km} km")
                coords_df = merged_df.copy()
                problematic_stations_coords = coords_df[["Latitude", "Longitude"]].values
                station_ids = coords_df["Station"].values
                lat_lon = coords_df[["Latitude", "Longitude"]].values
                dist_matrix = squareform(pdist(lat_lon, lambda u, v: haversine(u[0], u[1], v[0], v[1])))
                adjacency_matrix = dist_matrix <= threshold_km
                
                G = nx.Graph(adjacency_matrix)
                connected_components = list(nx.connected_components(G))
                
                if not connected_components:
                    print(f"No problematic stations found for threshold {threshold_km} km. Moving on...")
                    continue
                
                # Assign groups to problematic stations
                group_assignments = np.full(len(lat_lon), -1)  # Initialize all as ungrouped
                for group_id, component in enumerate(connected_components):
                    if not component:  # Skip empty components
                        continue
                    for idx in component:
                        if 0 <= idx < len(lat_lon):  # Ensure idx is within bounds
                            group_assignments[idx] = group_id
        
                merged_df["Group"] = group_assignments
        
                # Determine stations to keep and remove
                stations_to_keep = []
                stations_to_remove = []

                for group_id in np.unique(group_assignments[group_assignments >= 0]):
                    group_indices = np.where(group_assignments == group_id)[0]
                    if group_indices.size > 0:
                        stations_to_keep.append(merged_df.iloc[group_indices[0]]["Station"])
                        for idx in group_indices[1:]:
                            stations_to_remove.append(merged_df.iloc[idx]["Station"])

                # Retry interpolation with updated data
                new_testing_df = merged_df[~merged_df["Station"].isin(stations_to_keep)]
                testing_df = pd.concat([testing_df, new_testing_df], ignore_index=True)
                merged_df = merged_df[~merged_df["Station"].isin(stations_to_remove)]
                X = merged_df[['Longitude', 'Latitude']].values.astype(float)
                y = merged_df[f'{climate_variable}'].values.astype(float)
                valid_indices = np.logical_and(~np.isnan(X).any(axis=1), ~np.isnan(y))
                X, y = X[valid_indices], y[valid_indices]
                mse_scores = []
                gcv_scores = [] 
                for smoothing_factor in smoothing_factors:
                    rbf_interpolator = RbfInterpolator(smoothing_factor=smoothing_factor)
                    cv_scores = cross_val_score(rbf_interpolator, X, y, cv=5, scoring='neg_mean_squared_error')
                    mse_scores.append(-np.mean(cv_scores))

                    gcv_scores.append(np.sqrt(-np.mean(cv_scores) / len(X)))

                optimal_smoothing_factor = smoothing_factors[np.argmin(mse_scores)]

                rbf_interpolator = RbfInterpolator(smoothing_factor=optimal_smoothing_factor)
                rbf_interpolator.fit(X, y)
                interpolated_temp = rbf_interpolator.predict(X)
                
                signal = np.mean(y)
                noise = rmse
                snr = signal / noise
                new_rmse = np.sqrt(mean_squared_error(y, interpolated_temp))
                modelled_stations = len(merged_df)
                testing_stations = len(testing_df)
        
                #apply interpolator onto grid and testing data
                
                station_network[f"Interpolated_{climate_variable}"] = rbf_interpolator.predict(
                    station_network[['Longitude', 'Latitude']].values
                )
                testing_df[f"Interpolated_{climate_variable}"] = rbf_interpolator.predict(
                        testing_df[['Longitude', 'Latitude']].values
                )
                
                #clip interpolated data on both grid and testing based on max values
                
                station_network[f"Interpolated_{climate_variable}"] = np.clip(
                        station_network[f"Interpolated_{climate_variable}"], 0, observed_max
                )
                testing_df[f"Interpolated_{climate_variable}"] = np.clip(
                        testing_df[f"Interpolated_{climate_variable}"], 0, observed_max
                )
                        
                measured = testing_df[f'{climate_variable}']
                predicted = testing_df[f'Interpolated_{climate_variable}']
                t_RMSE = np.sqrt(np.mean((measured - predicted)**2))

                if new_rmse < 25:
                        print(f"RMSE < 0.5 achieved with threshold {threshold_km} km. Stopping iteration.")
                        statistics_df.loc[statistics_df['Date'] == date_str, ['Mean_MSE', 'RMSE', 'SNR', 'M_Stations', 'T_Stations', 'T_RMSE']] = [
                                round(mse_scores[np.argmin(mse_scores)], 2),
                                round(new_rmse, 4),
                                round(snr, 2),
                                modelled_stations,
                                testing_stations,
                                round(t_RMSE, 4)
                                ]
                        break  # Stop the iteration if RMSE is below threshold

            if new_rmse > 25:
                print(f"Retry still problematic for {file_name}, RMSE: {new_rmse:.4f}")                            
                merged_df.to_csv(exceptions_output_file, index=False)

    gridded_output_file = os.path.join(output_folder, f'VCSN_gridded_output_{date_str}.csv')
    station_network.to_csv(gridded_output_file, index=False)
    station_output_file = os.path.join(station_output_folder , f'Station_Interpolation_{date_str}.csv')
    merged_df.to_csv(station_output_file, index=False)
    testing_output_file = os.path.join(testing_folder , f'Station_Interpolation_{date_str}.csv')
    testing_df.to_csv(testing_output_file, index=False)
    
    if test:
            plotter = InterpolationPlotter(
                    lon=station_network['Longitude'],
                    lat=station_network['Latitude'],
                    interpolated_values=station_network[f"Interpolated_{climate_variable}"],
                    merged_df=merged_df,
                    testing_df=testing_df,
                    image_folder=image_folder,
                    climate_variable=climate_variable, 
                    dates=date_str
                )
            plotter.plot_and_save()
    
print("\nSummary of Statistics DataFrame:")
print(statistics_df.describe())
today_date = datetime.now().strftime('%d-%m-%Y')
sanitized_climate_variable = re.sub(r'[^\w\-_\. ]', '_', climate_variable)
stats_loc = os.path.join(log_path, f'{sanitized_climate_variable}_Cross_Validation_Summary_{today_date}.csv')
statistics_df.to_csv(stats_loc, index=False)
end_time = time.time()
print(f"Total processing time: {end_time - start_time:.2f} seconds")