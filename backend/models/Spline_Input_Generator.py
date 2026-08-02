# -*- coding: utf-8 -*-
"""
Created on Mon Dec  4 16:51:21 2023

@author: Peter Taylor
"""

import os
import dask.dataframe as dd
import pandas as pd
import numpy as np
import logging
from datetime import datetime
from tqdm import tqdm

logging.basicConfig(filename='error_log.txt', level=logging.ERROR)

climate_variable = 'STATION_GLOBAL_RAD_DAILY_CLIFLO'
measured_variable = 'Amount(MJ/m2)'

folder_path = f'Z:\\Data\\{climate_variable}'

startyear = 1986
endyear = 2023
start_date = datetime(startyear, 1, 1)
end_date = datetime(endyear + 1, 1, 1)

all_files = os.path.join(folder_path, '*.csv')
use_columns = ['Station', 'Date(NZST)', measured_variable]
dtype = {measured_variable: 'object'}

combined_df = dd.read_csv(all_files, usecols=use_columns, dtype=dtype, assume_missing=True)
combined_df['Date(NZST)'] = dd.to_datetime(combined_df['Date(NZST)'], format='%d/%m/%Y')

combined_df[measured_variable] = combined_df[measured_variable].replace('-', np.nan)
combined_df[measured_variable] = dd.to_numeric(combined_df[measured_variable], errors='coerce')

filtered_df = combined_df[(combined_df['Date(NZST)'] >= start_date) & (combined_df['Date(NZST)'] < end_date)]
filtered_df = filtered_df[
        filtered_df[measured_variable].notnull() & 
        ~filtered_df[measured_variable].isin(['-', ''])
        ]

filtered_df = filtered_df.compute()

output_folder = f'Z:\\Data\\{climate_variable.replace("STATION_", "").replace("_CLIFLO", "")}_{measured_variable}_SPLINE_INPUTS'
if not os.path.exists(output_folder):
    os.makedirs(output_folder)

unique_dates = pd.to_datetime(filtered_df['Date(NZST)'].dt.strftime('%d/%m/%Y').unique())
sorted_unique_dates = sorted(unique_dates)
for date in tqdm(sorted_unique_dates, desc="Saving Files"):
    date_str = date.strftime('%d/%m/%Y')
    date_filtered_df = filtered_df[filtered_df['Date(NZST)'] == date]
    date_filtered_df = date_filtered_df[['Station', measured_variable]]
    date_str_for_filename = date_str.replace('/', '_')
    date_filtered_df['Station'] = date_filtered_df['Station'].astype(str).str.split('.').str[0]
    date_filtered_df.to_csv(os.path.join(output_folder, f'{date_str_for_filename}.csv'), index=False)

summary_df = filtered_df.groupby(filtered_df['Date(NZST)'].dt.strftime('%d/%m/%Y')).size().reset_index(name='Count')
summary_df.columns = ['Date', 'Count']
summary_df['Date'] = pd.to_datetime(summary_df['Date'], format='%d/%m/%Y')
summary_df = summary_df.sort_values(by='Date')

summary_output_folder = 'Z:\\Data\\SPLINE_INPUTS_SUMMARIES'
summary_filename = f'{climate_variable.replace("STATION_", "").replace("_CLIFLO", "")}_{measured_variable}_SUMMARY.csv'
summary_filename = summary_filename.replace('/', '_')
summary_df.to_csv(os.path.join(summary_output_folder, summary_filename), index=False)