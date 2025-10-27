TO USE THE CLIMATE DATA IMPORTER:

cd /a/auxein-insights-v0.1

source venv/scripts/activate

cd backend/scripts/data_import

python import_climate_csvs.py --csv-dir "Z:\Data\NZ_Climate_History\Vineyards\Merged" --block-ids [BLOCKS]

WHERE: BLOCKS are the block IDs that have .csv files in the Z:\Data\NZ_Climate_History\Vineyards\Merged directory

FOR blocks that are not listed, follow the Auxein Climate Model in GIT