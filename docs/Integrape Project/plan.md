for claude code

plan:

provide a specification for tables/schemas for 'my site' pro users in insights as per the following list: 

Region-level overview (sub regional overviews also available)
Vineyard-specific historical (interpolated) climate data - would you be after a baseline or an actual interpolated record (daily data record). 
Integration with private weather stations (e.g. Harvest) - we have an ingestion pipeline built, this will require schemas and data sharing agreements with each user
Disease pressure and forecasting, alongside current-season phenology analysis
Practically, you'd be getting the climate histories plus current-season analysis including phenology and disease, delivered by API to a schema your end consumes.

Note any gaps, whether a specific bespoke API should be created, and what the risks are if we keep creating APIs for various new clients. 