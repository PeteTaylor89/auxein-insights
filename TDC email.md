Hi Pete,

 

In response to your phone call, find attached documentation around use of council’s hilltop server.

 

As agreed, access is currently available to Council’s Motueka and Richmond Office climate stations, but at this stage use of the Richmond racecourse site is restricted while we continue to establish data sharing agreements with other parties.

 

For Rainfall site in and around Motueka Plains /Moutere/Mapua/Waimea/Wai-iti these are all Council sites and are available for use.

 

In back filling hourly rainfall data for a year or so, please do this on an individual site by site basis so as not to create undue load.

 

And example URL to get hourly rainfall data for a site would be;

 

envdata.tasman.govt.nz/data.hts?Service=Hilltop&Request=GetData&Site=GW 24035 - Mapua&Measurement=Rainfall&Method=Total&TimeInterval=2025-01-01/2026-01-01&Interval=1hour

 

Can also get a list of sites for a particular measurement type and their locations.

 

http://envdata.tasman.govt.nz/data.hts?Service=Hilltop&Request=SiteList&Location=Yes&Collection=TDCRainOnly

 

We do have a facility called ‘collections’ which group sites, using collection name ‘TDCRainOnly’ might be useful for you

 

And you can also do a measurement list which could be helpful at climate stations to understand parameters there, we already collate the 10 minute readings to hourly figures for instance,

 

http://envdata.tasman.govt.nz/data.hts?Service=Hilltop&Request=MeasurementList&Site=HY Richmond Weather at TDC Roof

 

If you could respond to acknowledge understanding of these requirements that would be appreciated, and I’d also be interested in viewing the app to see how the data is being used.

 

Regards

 

Matt

Peter Taylor@DESKTOP-8SP9025 MINGW64 /a/auxein-insights-V0.1 (main)
$  curl "http://envdata.tasman.govt.nz/data.hts?Service=Hilltop&Request=SiteList&Location=Yes&Collection=TDCRainOnly"
<?xml version="1.0" ?>
<HilltopServer>
<Agency>Tasman District Council</Agency>
<Projection>NZTM2000</Projection>
<Site Name="GW 24035 - Mapua">
<Easting>1607997</Easting><Northing>5433420</Northing>
</Site>
<Site Name="GW 8110 - Weka Rd">
<Easting>1602174</Easting><Northing>5440563</Northing>
</Site>
<Site Name="GW 23518 - Richardson">
<Easting>1606405</Easting><Northing>5419063</Northing>
</Site>
<Site Name="HY Buller at Longford">
<Easting>1549176</Easting><Northing>5376265</Northing>
</Site>
<Site Name="HY Matakitaki at Horse Terrace Br">
<Easting>1546742</Easting><Northing>5349060</Northing>
</Site>
<Site Name="HY Anatoki at Happy Sams">
<Easting>1578796</Easting><Northing>5473764</Northing>
</Site>
<Site Name="HY Anatoki at Paradise">
<Easting>1567805</Easting><Northing>5471045</Northing>
</Site>
<Site Name="HY Aorere at Devils Boots">
<Easting>1568566</Easting><Northing>5489392</Northing>
</Site>
<Site Name="HY Aorere at Perry Saddle">
<Easting>1551937</Easting><Northing>5472726</Northing>
</Site>
<Site Name="HY Aorere at Salisbury Br">
<Easting>1560599</Easting><Northing>5483064</Northing>
</Site>
<Site Name="HY Collingwood at Repeater">
<Easting>1573230</Easting><Northing>5496271</Northing>
</Site>
<Site Name="HY Little Devil at Tarn">
<Easting>1571227</Easting><Northing>5463260</Northing>
</Site>
<Site Name="HY Motupipi at Reillys Bridge">
<Easting>1585807</Easting><Northing>5477206</Northing>
</Site>
<Site Name="HY Takaka at Canaan">
<Easting>1592273</Easting><Northing>5467914</Northing>
</Site>
<Site Name="HY Takaka at Harwoods">
<Easting>1583040</Easting><Northing>5457923</Northing>
</Site>
<Site Name="HY Takaka at Kotinga">
<Easting>1583912</Easting><Northing>5475606</Northing>
</Site>
<Site Name="HY Waingaro at Hanging Rock">
<Easting>1579010</Easting><Northing>5467845</Northing>
</Site>
<Site Name="HY Baton at Baton Flats">
<Easting>1576900</Easting><Northing>5425710</Northing>
</Site>
<Site Name="HY Motueka at Gorge">
<Easting>1592792</Easting><Northing>5390969</Northing>
</Site>
<Site Name="HY Motueka at Parker St">
<Easting>1599968</Easting><Northing>5449513</Northing>
</Site>
<Site Name="HY Motueka at Woodmans Bend">
<Easting>1596376</Easting><Northing>5447478</Northing>
</Site>
<Site Name="HY Motueka at Woodstock">
<Easting>1585145</Easting><Northing>5432644</Northing>
</Site>
<Site Name="HY Motupiko at Christies">
<Easting>1583998</Easting><Northing>5392506</Northing>
</Site>
<Site Name="HY Moutere at Kellings Rd">
<Easting>1600515</Easting><Northing>5432654</Northing>
</Site>
<Site Name="HY Riwaka at Takaka Hill">
<Easting>1589671</Easting><Northing>5458266</Northing>
</Site>
<Site Name="HY Riwaka North at Littles">
<Easting>1592261</Easting><Northing>5457199</Northing>
</Site>
<Site Name="HY Riwaka South at Moss Bush">
<Easting>1593094</Easting><Northing>5455401</Northing>
</Site>
<Site Name="HY Tadmor at Mudstone">
<Easting>1577973</Easting><Northing>5411174</Northing>
</Site>
<Site Name="HY Tapawera at WWTP">
<Easting>1584841</Easting><Northing>5418497</Northing>
</Site>
<Site Name="HY Wangapeka at Biggs Tops">
<Easting>1549861</Easting><Northing>5414739</Northing>
</Site>
<Site Name="HY Wangapeka at Dog Face">
<Easting>1559080</Easting><Northing>5404066</Northing>
</Site>
<Site Name="HY Wangapeka at Walter Peak">
<Easting>1580364</Easting><Northing>5423474</Northing>
</Site>
<Site Name="HY Kainui Dam">
<Easting>1596182</Easting><Northing>5404527</Northing>
</Site>
<Site Name="HY Lee at Trig F">
<Easting>1615720</Easting><Northing>5408030</Northing>
</Site>
<Site Name="HY Richmond Weather at Race Course">
<Easting>1615521</Easting><Northing>5424889</Northing>
</Site>
<Site Name="HY Richmond Weather at TDC Roof">
<Easting>1615604</Easting><Northing>5423279</Northing>
</Site>
<Site Name="HY Wai-iti at Belgrove">
<Easting>1596495</Easting><Northing>5410690</Northing>
</Site>
<Site Name="HY Wai-iti at Birds">
<Easting>1605838</Easting><Northing>5414273</Northing>
</Site>
<Site Name="HY Waimea at TDC Nursery">
<Easting>1610566</Easting><Northing>5426413</Northing>
</Site>
<Site Name="HY Wairoa at Haycock Rd">
<Easting>1611105</Easting><Northing>5417724</Northing>
</Site>
<Site Name="HY Wairoa at Little Ben">
<Easting>1607985</Easting><Northing>5409500</Northing>
</Site>
</HilltopServer>


Peter Taylor@DESKTOP-8SP9025 MINGW64 /a/auxein-insights-V0.1 (main)
$ curl "http://envdata.tasman.govt.nz/data.hts?Service=Hilltop&Request=MeasurementList&Site=HY%20Richmond%20Weather%20at%20TDC%20Roof"
<?xml version="1.0" ?>
<HilltopServer>
<Agency>Tasman District Council</Agency>
<DataSource Name="Rainfall" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Incremental</Interpolation>
<ItemFormat>0</ItemFormat>
<From>1995-06-23T14:00:00</From>
<To>2026-04-08T19:20:00</To>
<SensorGroup>Rainfall</SensorGroup>
<Measurement Name="Rainfall">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall</RequestAs>
<Divisor>1000</Divisor>
<Units>mm</Units>
<Format>###.#</Format>
</Measurement>
<Measurement Name="Synthetic Rainfall">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Synthetic Rainfall</RequestAs>
<Units>mm</Units>
<Format>##.#</Format>
<MeasurementGroup>Calculated Data</MeasurementGroup>
<VM>1</VM>
<VMStart>2006-03-24T06:10:00</VMStart>
<VMFinish>2026-04-08T19:00:00</VMFinish>
<Ratset1>2</Ratset1>
<Ratset2>15</Ratset2>
</Measurement>
<Measurement Name="4 hr MovAv">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>4 hr MovAv</RequestAs>
<Format>#.##</Format>
<MeasurementGroup>Calculated Data</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-23T14:00:00</VMStart>
<VMFinish>2026-04-08T19:20:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 12hr Return Period">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 12hr Return Period</RequestAs>
<Units>Years</Units>
<Format>#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-23T20:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 12hr Total">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 12hr Total</RequestAs>
<Units>mm</Units>
<Format>#.#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-23T20:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 1day Return Period">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 1day Return Period</RequestAs>
<Units>Years</Units>
<Format>#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-24T02:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 1day Total">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 1day Total</RequestAs>
<Units>mm</Units>
<Format>#.#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-24T02:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 1hr Return Period">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 1hr Return Period</RequestAs>
<Units>Years</Units>
<Format>#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-23T14:30:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 1hr Total">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 1hr Total</RequestAs>
<Units>mm</Units>
<Format>#.#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-23T14:30:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 2day Return Period">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 2day Return Period</RequestAs>
<Units>Years</Units>
<Format>#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-24T14:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 2day Total">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 2day Total</RequestAs>
<Units>mm</Units>
<Format>#.#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-24T14:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 2hr Return Period">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 2hr Return Period</RequestAs>
<Units>Years</Units>
<Format>#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-23T15:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 2hr Total">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 2hr Total</RequestAs>
<Units>mm</Units>
<Format>#.#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-23T15:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 6hr Return Period">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 6hr Return Period</RequestAs>
<Units>Years</Units>
<Format>#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-23T17:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall 6hr Total">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall 6hr Total</RequestAs>
<Units>mm</Units>
<Format>#.#</Format>
<MeasurementGroup>Rainfall RP</MeasurementGroup>
<VM>1</VM>
<VMStart>1995-06-23T17:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
<Measurement Name="Rainfall NZDT">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Rainfall NZDT</RequestAs>
<Units>mm</Units>
<Format>###.#</Format>
<VM>1</VM>
<VMStart>1995-06-23T14:00:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
</Measurement>
</DataSource>
<DataSource Name="Voltage" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2012-12-21T04:00:00</From>
<To>2026-04-08T19:00:00</To>
<Measurement Name="Voltage">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Voltage</RequestAs>
<Units>Volts</Units>
<Format>##.##</Format>
</Measurement>
</DataSource>
<DataSource Name="Raw Rainfall" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Incremental</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2011-01-06T12:00:00</From>
<To>2026-01-20T13:00:00</To>
<SensorGroup>Rainfall</SensorGroup>
<Measurement Name="Raw Rainfall">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Raw Rainfall</RequestAs>
<Divisor>1000</Divisor>
<Units>mm</Units>
<Format>##.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Checkgauge Rainfall" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Incremental</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2012-01-12T13:00:00</From>
<To>2026-01-20T13:05:00</To>
<SensorGroup>Rainfall</SensorGroup>
<Measurement Name="Checkgauge Rainfall">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Checkgauge Rainfall</RequestAs>
<Divisor>1000</Divisor>
<Units>mm</Units>
<Format>###.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Air Temperature (continuous)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2026-04-08T19:20:00</To>
<Measurement Name="Air Temperature (continuous)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Air Temperature (continuous)</RequestAs>
<Divisor>100</Divisor>
<Units>degC</Units>
<Format>##.##</Format>
</Measurement>
<Measurement Name="Air Temperature (virtual)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Air Temperature (virtual)</RequestAs>
<Format>#.##</Format>
<VM>1</VM>
<VMStart>1995-08-01T00:00:00</VMStart>
<VMFinish>2026-04-01T00:00:00</VMFinish>
<Ratset1>1</Ratset1>
<Ratset2>15</Ratset2>
</Measurement>
</DataSource>
<DataSource Name="Barometric Pressure" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2026-04-08T19:20:00</To>
<Measurement Name="Barometric Pressure">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Barometric Pressure</RequestAs>
<Units>hPa</Units>
<Format>####.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Relative humidity (%)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2026-04-08T19:20:00</To>
<Measurement Name="Relative humidity">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Relative humidity</RequestAs>
<Units>%</Units>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Speed" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2006-05-16T12:30:00</To>
<Measurement Name="Wind Speed">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Wind Speed</RequestAs>
<Units>km/hr</Units>
<Format>###.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Direction" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>WindDirection</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>0</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2006-05-16T12:30:00</To>
<Measurement Name="Wind Direction">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Wind Direction</RequestAs>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Gust" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2006-05-16T12:30:00</To>
<Measurement Name="Wind gust">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Wind gust</RequestAs>
<Units>km/hr</Units>
<Format>###.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Speed (10 min)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2006-03-29T16:10:00</From>
<To>2026-04-08T19:20:00</To>
<Measurement Name="Wind Speed (10 min)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Wind Speed (10 min)</RequestAs>
<Divisor>278</Divisor>
<Units>km/hr</Units>
<Format>####.#</Format>
</Measurement>
<Measurement Name="Wind Speed (10 min) m/s">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Wind Speed (10 min) m/s</RequestAs>
<Units>m/s</Units>
<Format>##.#</Format>
<VM>1</VM>
<VMStart>2006-03-29T16:10:00</VMStart>
<VMFinish>2026-04-08T19:10:00</VMFinish>
<Ratset1>1</Ratset1>
<Ratset2>15</Ratset2>
</Measurement>
</DataSource>
<DataSource Name="Wind Direction (10 min)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2006-03-29T16:10:00</From>
<To>2026-04-08T19:20:00</To>
<Measurement Name="Wind Direction (10 min)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Wind Direction (10 min)</RequestAs>
<Divisor>10</Divisor>
<Units>Deg N</Units>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="SD Wind Direction (10 min)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2006-03-29T16:10:00</From>
<To>2026-04-08T19:20:00</To>
<Measurement Name="SD Wind Direction (10 min)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>SD Wind Direction (10 min)</RequestAs>
<Units>DegN</Units>
<Format>$$$</Format>
</Measurement>
</DataSource>
<DataSource Name="SD Wind Speed (10 min)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2006-03-29T16:10:00</From>
<To>2026-04-08T19:20:00</To>
<Measurement Name="SD Wind Speed (10 min)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>SD Wind Speed (10 min)</RequestAs>
<Divisor>278</Divisor>
<Units>km/hr</Units>
<Format>$$$</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Speed 10 min (hourly)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2006-03-29T17:00:00</From>
<To>2026-04-08T19:00:00</To>
<Measurement Name="Wind Speed 10 min (hourly)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Wind Speed 10 min (hourly)</RequestAs>
<Divisor>278</Divisor>
<Units>km/hr</Units>
<Format>###.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Gust Speed (hourly)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2006-03-29T17:00:00</From>
<To>2026-04-08T19:00:00</To>
<Measurement Name="Gust Speed (hourly)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Gust Speed (hourly)</RequestAs>
<Divisor>278</Divisor>
<Units>km/hr</Units>
<Format>###.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Speed (hourly)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2006-03-29T17:00:00</From>
<To>2026-04-08T19:00:00</To>
<Measurement Name="Wind Speed (hourly)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Wind Speed (hourly)</RequestAs>
<Divisor>278</Divisor>
<Units>km/hr</Units>
<Format>###.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Direction (hourly)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2006-03-29T17:00:00</From>
<To>2026-04-08T19:00:00</To>
<Measurement Name="Wind Direction (hourly)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Wind Direction (hourly)</RequestAs>
<Units>DegN</Units>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="Gust Direction (hourly)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2006-03-29T17:00:00</From>
<To>2026-04-08T19:00:00</To>
<Measurement Name="Gust Direction (hourly)">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Gust Direction (hourly)</RequestAs>
<Units>DegN</Units>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="Form_Rainfall" Site="HY Richmond Weather at TDC Roof" >
<NumItems>0</NumItems>
<TSType>StdSeries</TSType>
<DataType>NameValuePairs</DataType>
<Interpolation>Discrete</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2019-01-24T10:00:00</From>
<To>2026-02-18T12:45:00</To>
<TimeObjects>
<SurveyTime>24-Jan-2019 10:00:00</SurveyTime>
<SurveyTime>22-May-2019 11:15:00</SurveyTime>
<SurveyTime>23-Dec-2019 08:48:00</SurveyTime>
<SurveyTime>12-Jun-2020 11:00:46</SurveyTime>
<SurveyTime>21-Oct-2020 13:15:00</SurveyTime>
<SurveyTime>24-Nov-2020 10:25:00</SurveyTime>
<SurveyTime>26-Mar-2021 10:55:00</SurveyTime>
<SurveyTime> 6-May-2021 11:00:00</SurveyTime>
<SurveyTime>10-Jun-2021 14:15:00</SurveyTime>
<SurveyTime>16-Sep-2021 12:40:00</SurveyTime>
<SurveyTime>19-Nov-2021 09:55:00</SurveyTime>
<SurveyTime>27-May-2022 14:50:00</SurveyTime>
<SurveyTime> 3-Oct-2022 12:50:00</SurveyTime>
<SurveyTime>31-Jan-2023 13:00:00</SurveyTime>
<SurveyTime>24-Apr-2023 14:50:00</SurveyTime>
<SurveyTime> 2-Oct-2023 07:40:00</SurveyTime>
<SurveyTime>11-Jul-2024 15:10:00</SurveyTime>
<SurveyTime>15-Jul-2024 12:15:00</SurveyTime>
<SurveyTime>12-Aug-2024 11:00:00</SurveyTime>
<SurveyTime>22-Oct-2024 12:50:00</SurveyTime>
<SurveyTime>24-Mar-2025 10:19:00</SurveyTime>
<SurveyTime>13-May-2025 15:23:00</SurveyTime>
<SurveyTime>21-Jul-2025 10:00:00</SurveyTime>
<SurveyTime>28-Oct-2025 12:30:00</SurveyTime>
<SurveyTime>31-Oct-2025 11:20:00</SurveyTime>
<SurveyTime>20-Jan-2026 13:05:00</SurveyTime>
<SurveyTime>18-Feb-2026 12:45:00</SurveyTime>
</TimeObjects>
</DataSource>
<DataSource Name="Rainfall" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>1995-06-23T14:00:00</From>
<To>2026-04-08T19:20:00</To>
<SensorGroup>Rainfall</SensorGroup>
</DataSource>
<DataSource Name="Voltage" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2012-12-21T04:00:00</From>
<To>2026-04-08T19:00:00</To>
</DataSource>
<DataSource Name="Raw Rainfall" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2011-01-06T12:00:00</From>
<To>2026-01-20T13:00:00</To>
<SensorGroup>Rainfall</SensorGroup>
</DataSource>
<DataSource Name="Checkgauge Rainfall" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2012-01-12T13:00:00</From>
<To>2026-01-20T13:05:00</To>
<SensorGroup>Rainfall</SensorGroup>
</DataSource>
<DataSource Name="Air Temperature (continuous)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2026-04-08T19:20:00</To>
</DataSource>
<DataSource Name="Barometric Pressure" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2026-04-08T19:20:00</To>
</DataSource>
<DataSource Name="Relative humidity (%)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2026-04-08T19:20:00</To>
</DataSource>
<DataSource Name="Wind Speed" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2006-05-16T12:30:00</To>
</DataSource>
<DataSource Name="Wind Direction" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>WindDirection</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2006-05-16T12:30:00</To>
</DataSource>
<DataSource Name="Wind Gust" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>1995-06-23T14:30:00</From>
<To>2006-05-16T12:30:00</To>
</DataSource>
<DataSource Name="Wind Speed (10 min)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2006-03-29T16:10:00</From>
<To>2026-04-08T19:20:00</To>
</DataSource>
<DataSource Name="Wind Direction (10 min)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2006-03-29T16:10:00</From>
<To>2026-04-08T19:20:00</To>
</DataSource>
<DataSource Name="SD Wind Direction (10 min)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2006-03-29T16:10:00</From>
<To>2026-04-08T19:20:00</To>
</DataSource>
<DataSource Name="SD Wind Speed (10 min)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2006-03-29T16:10:00</From>
<To>2026-04-08T19:20:00</To>
</DataSource>
<DataSource Name="Wind Speed 10 min (hourly)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2006-03-29T17:00:00</From>
<To>2026-04-08T19:00:00</To>
</DataSource>
<DataSource Name="Gust Speed (hourly)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2006-03-29T17:00:00</From>
<To>2026-04-08T19:00:00</To>
</DataSource>
<DataSource Name="Wind Speed (hourly)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2006-03-29T17:00:00</From>
<To>2026-04-08T19:00:00</To>
</DataSource>
<DataSource Name="Wind Direction (hourly)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2006-03-29T17:00:00</From>
<To>2026-04-08T19:00:00</To>
</DataSource>
<DataSource Name="Gust Direction (hourly)" Site="HY Richmond Weather at TDC Roof" >
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2006-03-29T17:00:00</From>
<To>2026-04-08T19:00:00</To>
</DataSource>
<DataSource Name="Rainfall" Site="HY Richmond Weather at TDC Roof" >
<NumItems>3</NumItems>
<TSType>CheckSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Discrete</Interpolation>
<ItemFormat>45</ItemFormat>
<From>2006-11-24T09:00:00</From>
<To>2026-02-18T12:45:00</To>
<SensorGroup>Rainfall</SensorGroup>
<Measurement Name="Check Gauge Total">
<Item>1</Item>
<DefaultMeasurement />
<RequestAs>Check Gauge Total</RequestAs>
<Divisor>1000</Divisor>
<Units>mm</Units>
<Format>####</Format>
</Measurement>
<Measurement Name="Recorder Time">
<Item>2</Item>
<RequestAs>Recorder Time [Rainfall]</RequestAs>
<Format>###</Format>
</Measurement>
<Measurement Name="Comment">
<Item>3</Item>
<RequestAs>Comment [Rainfall]</RequestAs>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="Rainfall" Site="HY Richmond Weather at TDC Roof" >
<NumItems>3</NumItems>
<TSType>CheckQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Discrete</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2012-01-12T13:00:00</From>
<To>2025-07-21T10:00:00</To>
<SensorGroup>Rainfall</SensorGroup>
</DataSource>

This XML file does not appear to have any style information associated with it. The document tree is shown below.
<HilltopServer>
<Agency>Tasman District Council</Agency>
<Version>2512.0.2.87</Version>
<Projection>NZTM2000</Projection>
<Site Name="1591"> </Site>
<Site Name="2322"> </Site>
<Site Name="2323"> </Site>
<Site Name="262902"> </Site>
<Site Name="3818"> </Site>
<Site Name="52903001"> </Site>
<Site Name="52951001"> </Site>
<Site Name="52951002"> </Site>
<Site Name="58101001"> </Site>
<Site Name="AQ Brightwater at Brightwater Central">
<Easting>1608951</Easting>
<Northing>5419562</Northing>
</Site>
<Site Name="AQ Brightwater at Brightwater North">
<Easting>1608936</Easting>
<Northing>5419903</Northing>
</Site>
<Site Name="AQ Brightwater at Brightwater South">
<Easting>1609355</Easting>
<Northing>5419136</Northing>
</Site>
<Site Name="AQ Brightwater at Bryant Rd">
<Easting>1608999</Easting>
<Northing>5419836</Northing>
</Site>
<Site Name="AQ Motueka at Clay St">
<Easting>1601515</Easting>
<Northing>5449157</Northing>
</Site>
<Site Name="AQ Motueka at Goodman Park"> </Site>
<Site Name="AQ Motueka at Ledger Goodman Park">
<Easting>1601453</Easting>
<Northing>5448827</Northing>
</Site>
<Site Name="AQ Motueka at Parklands School">
<Easting>1600842</Easting>
<Northing>5448894</Northing>
</Site>
<Site Name="AQ Motueka at Vosper St">
<Easting>1601255</Easting>
<Northing>5449222</Northing>
</Site>
<Site Name="AQ Murchison at Murchison Central">
<Easting>1544243</Easting>
<Northing>5372056</Northing>
</Site>
<Site Name="AQ Murchison at Murchison North">
<Easting>1544158</Easting>
<Northing>5372285</Northing>
</Site>
<Site Name="AQ Murchison at Murchison South">
<Easting>1543907</Easting>
<Northing>5371654</Northing>
</Site>
<Site Name="AQ Nelson at Blackwood St">
<Easting>1620293</Easting>
<Northing>5428453</Northing>
</Site>
<Site Name="AQ Nelson at St Vincent St">
<Easting>1622907</Easting>
<Northing>5430320</Northing>
</Site>
<Site Name="AQ Richmond Central at Library roof">
<Easting>1615382</Easting>
<Northing>5423694</Northing>
</Site>
<Site Name="AQ Richmond Central at Plunket">
<Easting>1615325</Easting>
<Northing>5423527</Northing>
</Site>
<Site Name="AQ Richmond Central at Plunket 2024"> </Site>
<Site Name="AQ Richmond Central at Plunket Portacom">
<Easting>1615325</Easting>
<Northing>5423527</Northing>
</Site>
<Site Name="AQ Richmond Central at York Pl">
<Easting>1615735</Easting>
<Northing>5423274</Northing>
</Site>
<Site Name="AQ Richmond East at Shetland Pl">
<Easting>1616832</Easting>
<Northing>5423209</Northing>
</Site>
<Site Name="AQ Richmond North at Fauchelle Av">
<Easting>1615887</Easting>
<Northing>5423694</Northing>
</Site>
<Site Name="AQ Richmond South at Cooper Pl">
<Easting>1614863</Easting>
<Northing>5423097</Northing>
</Site>
<Site Name="AQ Riwaka at Brooklyn">
<Easting>1597632</Easting>
<Northing>5450562</Northing>
</Site>
<Site Name="AQ Riwaka at Riwaka Central"> </Site>
<Site Name="AQ Riwaka at Riwaka East">
<Easting>1599997</Easting>
<Northing>5452673</Northing>
</Site>
<Site Name="AQ Riwaka at Riwaka North">
<Easting>1598733</Easting>
<Northing>5453556</Northing>
</Site>
<Site Name="AQ Riwaka at Riwaka West">
<Easting>1598041</Easting>
<Northing>5452611</Northing>
</Site>
<Site Name="AQ Wakefield at Wakefield Central">
<Easting>1604122</Easting>
<Northing>5416395</Northing>
</Site>
<Site Name="AQ Wakefield at Wakefield North">
<Easting>1604433</Easting>
<Northing>5416603</Northing>
</Site>
<Site Name="AQ Wakefield at Wakefield South">
<Easting>1603653</Easting>
<Northing>5416185</Northing>
</Site>
<Site Name="Abel Tasman"> </Site>
<Site Name="Aorere - West Coast"> </Site>
<Site Name="Aorere at Rockville"> </Site>
<Site Name="Baton"> </Site>
<Site Name="Central Plains"> </Site>
<Site Name="DW Aorere/ West Coast"> </Site>
<Site Name="DW Baton"> </Site>
<Site Name="DW Dovedale"> </Site>
<Site Name="DW Glen Rae"> </Site>
<Site Name="DW Motupiko"> </Site>
<Site Name="DW Moutere Eastern Groundwater Zone"> </Site>
<Site Name="DW Moutere Surface Water"> </Site>
<Site Name="DW Rainy"> </Site>
<Site Name="DW Stanely Brook"> </Site>
<Site Name="DW Tadmor"> </Site>
<Site Name="DW Takaka Aquifer - Takaka"> </Site>
<Site Name="DW Takaka Marble Aquifer Recharge Zone"> </Site>
<Site Name="DW Takaka Surface - Takaka"> </Site>
<Site Name="DW Tapawera Plains"> </Site>
<Site Name="DW Wai-iti Dam Service Zone"> </Site>
<Site Name="DW Wai-iti Zone"> </Site>
<Site Name="DW Waimea Delta Zone"> </Site>
<Site Name="DW Waimea Golden Hills Zone"> </Site>
<Site Name="DW Waimea Hope Minor Aquifers"> </Site>
<Site Name="DW Waimea Reservoir Zone"> </Site>
<Site Name="DW Waimea Upper Catchments"> </Site>
<Site Name="DW Waimea Upper Confined Aquifer"> </Site>
<Site Name="DW Waimea West Zone"> </Site>
<Site Name="DW Waimea lower Confined Aquifers"> </Site>
<Site Name="DW Wangapeka"> </Site>
<Site Name="Delta"> </Site>
<Site Name="Dovedale"> </Site>
<Site Name="GW 105 - Rail Reserve">
<Easting>1609864</Easting>
<Northing>5419844</Northing>
</Site>
<Site Name="GW 1069 - McCliskie">
<Easting>1610406</Easting>
<Northing>5427527</Northing>
</Site>
<Site Name="GW 110 - Harford">
<Easting>1611555</Easting>
<Northing>5425003</Northing>
</Site>
<Site Name="GW 1127 - Simpson">
<Easting>1607870</Easting>
<Northing>5420324</Northing>
</Site>
<Site Name="GW 1128 - McKenzie">
<Easting>1607222</Easting>
<Northing>5419681</Northing>
</Site>
<Site Name="GW 1129 - Ferguson">
<Easting>1606681</Easting>
<Northing>5419264</Northing>
</Site>
<Site Name="GW 114 - TDC Roadside">
<Easting>1610324</Easting>
<Northing>5419792</Northing>
</Site>
<Site Name="GW 118 - Buschl">
<Easting>1611722</Easting>
<Northing>5422098</Northing>
</Site>
<Site Name="GW 119 - Chipmill">
<Easting>1614221</Easting>
<Northing>5425528</Northing>
</Site>
<Site Name="GW 14 - Bells Island">
<Easting>1615029</Easting>
<Northing>5428138</Northing>
</Site>
<Site Name="GW 1500 - DW1">
<Easting>1607945</Easting>
<Northing>5421490</Northing>
</Site>
<Site Name="GW 16 - Johnstone">
<Easting>1612672</Easting>
<Northing>5422396</Northing>
</Site>
<Site Name="GW 2003 - Old Wharf Rd">
<Easting>1601263</Easting>
<Northing>5447791</Northing>
</Site>
<Site Name="GW 2033 - Smith">
<Easting>1599341</Easting>
<Northing>5445270</Northing>
</Site>
<Site Name="GW 20864 - Golf Course">
<Easting>1602215</Easting>
<Northing>5448592</Northing>
</Site>
<Site Name="GW 20992 - Marchwood Park">
<Easting>1599123</Easting>
<Northing>5448011</Northing>
</Site>
<Site Name="GW 21 - EW King">
<Easting>1612834</Easting>
<Northing>5423854</Northing>
</Site>
<Site Name="GW 21185 - Inglis">
<Easting>1599114</Easting>
<Northing>5453644</Northing>
</Site>
<Site Name="GW 2135 - Fry">
<Easting>1599664</Easting>
<Northing>5446422</Northing>
</Site>
<Site Name="GW 2164 - River Bed">
<Easting>1599868</Easting>
<Northing>5450272</Northing>
</Site>
<Site Name="GW 2166 - Tui Close">
<Easting>1601246</Easting>
<Northing>5447838</Northing>
</Site>
<Site Name="GW 2176 - Nursery North 2">
<Easting>1599967</Easting>
<Northing>5449677</Northing>
</Site>
<Site Name="GW 2177 - Nursery North 3">
<Easting>1599984</Easting>
<Northing>5449595</Northing>
</Site>
<Site Name="GW 2179 - Nurs Nth">
<Easting>1599953</Easting>
<Northing>5449644</Northing>
</Site>
<Site Name="GW 2181 - Nurs Sth">
<Easting>1599932</Easting>
<Northing>5449561</Northing>
</Site>
<Site Name="GW 2188 - Nursery SE">
<Easting>1600003</Easting>
<Northing>5449484</Northing>
</Site>
<Site Name="GW 22160 - Lwr Queen St">
<Easting>1611825</Easting>
<Northing>5427949</Northing>
</Site>
<Site Name="GW 22460">
<Easting>1585124</Easting>
<Northing>5476905</Northing>
</Site>
<Site Name="GW 22461">
<Easting>1585557</Easting>
<Northing>5476946</Northing>
</Site>
<Site Name="GW 22462">
<Easting>1585592</Easting>
<Northing>5477120</Northing>
</Site>
<Site Name="GW 23195 - Richardson">
<Easting>1606412</Easting>
<Northing>5418983</Northing>
</Site>
<Site Name="GW 23366 - Challies 1">
<Easting>1609990</Easting>
<Northing>5424246</Northing>
</Site>
<Site Name="GW 23367 - Challies 2">
<Easting>1609856</Easting>
<Northing>5424684</Northing>
</Site>
<Site Name="GW 23465 - Challies Wetland">
<Easting>1609878</Easting>
<Northing>5424437</Northing>
</Site>
<Site Name="GW 23479 - Thorp St (BH1)">
<Easting>1601849</Easting>
<Northing>5451208</Northing>
</Site>
<Site Name="GW 23518 - Richardson">
<Easting>1606405</Easting>
<Northing>5419063</Northing>
</Site>
<Site Name="GW 23543 - TDC Prod 1">
<Easting>1606451</Easting>
<Northing>5419004</Northing>
</Site>
<Site Name="GW 23544 - Borlase">
<Easting>1606403</Easting>
<Northing>5419098</Northing>
</Site>
<Site Name="GW 23547 - Anderson Rd">
<Easting>1598402</Easting>
<Northing>5451074</Northing>
</Site>
<Site Name="GW 23548 - Greenwood St">
<Easting>1601369</Easting>
<Northing>5449008</Northing>
</Site>
<Site Name="GW 23579 - Eden">
<Easting>1611015</Easting>
<Northing>5422212</Northing>
</Site>
<Site Name="GW 23631 - TDC Prod 3">
<Easting>1606395</Easting>
<Northing>5419131</Northing>
</Site>
<Site Name="GW 23632 - TDC Prod 4">
<Easting>1606401</Easting>
<Northing>5419085</Northing>
</Site>
<Site Name="GW 23648 - Takaka Fire 2">
<Easting>1583769</Easting>
<Northing>5476632</Northing>
</Site>
<Site Name="GW 23663 - Drummond Rd">
<Easting>1598294</Easting>
<Northing>5439660</Northing>
</Site>
<Site Name="GW 238 - Buschl 2">
<Easting>1611448</Easting>
<Northing>5422081</Northing>
</Site>
<Site Name="GW 23953 - Redwood Rd">
<Easting>1610405</Easting>
<Northing>5429206</Northing>
</Site>
<Site Name="GW 24010 - Frys">
<Easting>1584264</Easting>
<Northing>5409860</Northing>
</Site>
<Site Name="GW 24035 - Mapua">
<Easting>1607997</Easting>
<Northing>5433420</Northing>
</Site>
<Site Name="GW 24040 - OConnor">
<Easting>1608943</Easting>
<Northing>5428077</Northing>
</Site>
<Site Name="GW 24430">
<Easting>1599998</Easting>
<Northing>5449668</Northing>
</Site>
<Site Name="GW 24431 - Swamp Rd">
<Easting>1569522</Easting>
<Northing>5497100</Northing>
</Site>
<Site Name="GW 24432 - Wigzell Rd">
<Easting>1568545</Easting>
<Northing>5494792</Northing>
</Site>
<Site Name="GW 24433 - Kaituna">
<Easting>1567170</Easting>
<Northing>5493664</Northing>
</Site>
<Site Name="GW 24601 - Quayle St">
<Easting>1600718</Easting>
<Northing>5446313</Northing>
</Site>
<Site Name="GW 24621 - Challies Island">
<Easting>1609876</Easting>
<Northing>5423870</Northing>
</Site>
<Site Name="GW 24671 - Golden Hills Rd">
<Easting>1608715</Easting>
<Northing>5424964</Northing>
</Site>
<Site Name="GW 24671 - Golden Hills Road"> </Site>
<Site Name="GW 24672 - Challies Rd">
<Easting>1608816</Easting>
<Northing>5424531</Northing>
</Site>
<Site Name="GW 247 - Hinton">
<Easting>1605872</Easting>
<Northing>5417707</Northing>
</Site>
<Site Name="GW 24701 - Hinehaka Rd">
<Easting>1541462</Easting>
<Northing>5373492</Northing>
</Site>
<Site Name="GW 2547 - Smale">
<Easting>1600004</Easting>
<Northing>5449675</Northing>
</Site>
<Site Name="GW 255 - E Rabbit Island">
<Easting>1615976</Easting>
<Northing>5429311</Northing>
</Site>
<Site Name="GW 2601 - Rossiter">
<Easting>1599607</Easting>
<Northing>5448779</Northing>
</Site>
<Site Name="GW 2602 - Golf Course">
<Easting>1602363</Easting>
<Northing>5449091</Northing>
</Site>
<Site Name="GW 2603 - Wratt">
<Easting>1597692</Easting>
<Northing>5449163</Northing>
</Site>
<Site Name="GW 2607 - Riwaka Hall">
<Easting>1599778</Easting>
<Northing>5451703</Northing>
</Site>
<Site Name="GW 2609 - Horrell">
<Easting>1599469</Easting>
<Northing>5446511</Northing>
</Site>
<Site Name="GW 2614 - Fernwood">
<Easting>1600769</Easting>
<Northing>5446324</Northing>
</Site>
<Site Name="GW 2628 - Staples St">
<Easting>1601516</Easting>
<Northing>5450129</Northing>
</Site>
<Site Name="GW 2629 - Lodder Lane">
<Easting>1600422</Easting>
<Northing>5452335</Northing>
</Site>
<Site Name="GW 33 - Richmond BC">
<Easting>1614283</Easting>
<Northing>5424962</Northing>
</Site>
<Site Name="GW 3316 - Goodall">
<Easting>1600479</Easting>
<Northing>5453577</Northing>
</Site>
<Site Name="GW 3441 - Sewage Ponds">
<Easting>1602123</Easting>
<Northing>5451700</Northing>
</Site>
<Site Name="GW 3453 - Bloomfield">
<Easting>1600234</Easting>
<Northing>5461716</Northing>
</Site>
<Site Name="GW 375 - Halls 2">
<Easting>1608077</Easting>
<Northing>5421649</Northing>
</Site>
<Site Name="GW 417 - Spring Grove">
<Easting>1605969</Easting>
<Northing>5417581</Northing>
</Site>
<Site Name="GW 4614 - Norths Bridge">
<Easting>1586395</Easting>
<Northing>5408265</Northing>
</Site>
<Site Name="GW 4615 - Quinney">
<Easting>1584662</Easting>
<Northing>5410480</Northing>
</Site>
<Site Name="GW 4616 - Crimp">
<Easting>1585754</Easting>
<Northing>5411734</Northing>
</Site>
<Site Name="GW 4617 - Hyatt">
<Easting>1585944</Easting>
<Northing>5415804</Northing>
</Site>
<Site Name="GW 4618 - Campbell">
<Easting>1586449</Easting>
<Northing>5416069</Northing>
</Site>
<Site Name="GW 4619 - Vue Mount">
<Easting>1584103</Easting>
<Northing>5419172</Northing>
</Site>
<Site Name="GW 4620 - Oldham">
<Easting>1583518</Easting>
<Northing>5417254</Northing>
</Site>
<Site Name="GW 4673 - Silcocks">
<Easting>1592244</Easting>
<Northing>5428219</Northing>
</Site>
<Site Name="GW 489 - Wilson">
<Easting>1611397</Easting>
<Northing>5423421</Northing>
</Site>
<Site Name="GW 5 - Rabbit Island">
<Easting>1615407</Easting>
<Northing>5429897</Northing>
</Site>
<Site Name="GW 509 - Halls">
<Easting>1608250</Easting>
<Northing>5421615</Northing>
</Site>
<Site Name="GW 549 - Wright">
<Easting>1608575</Easting>
<Northing>5421270</Northing>
</Site>
<Site Name="GW 6011 - Balls">
<Easting>1580412</Easting>
<Northing>5477719</Northing>
</Site>
<Site Name="GW 6013 - Pupu Main Spring">
<Easting>1580464</Easting>
<Northing>5478079</Northing>
</Site>
<Site Name="GW 6113 - Jadine">
<Easting>1585136</Easting>
<Northing>5480441</Northing>
</Site>
<Site Name="GW 6224 - Grove Orchard">
<Easting>1589608</Easting>
<Northing>5478270</Northing>
</Site>
<Site Name="GW 6339 - TDC Office">
<Easting>1583724</Easting>
<Northing>5476979</Northing>
</Site>
<Site Name="GW 6413 - Motupipi SubStn">
<Easting>1586798</Easting>
<Northing>5476703</Northing>
</Site>
<Site Name="GW 6418 - CSerneys">
<Easting>1586976</Easting>
<Northing>5477261</Northing>
</Site>
<Site Name="GW 6535 - Takaka Firestation">
<Easting>1583791</Easting>
<Northing>5476662</Northing>
</Site>
<Site Name="GW 6710 - Hamama">
<Easting>1582237</Easting>
<Northing>5470509</Northing>
</Site>
<Site Name="GW 6713 - Savages">
<Easting>1582209</Easting>
<Northing>5471053</Northing>
</Site>
<Site Name="GW 6815 - Bennett">
<Easting>1585620</Easting>
<Northing>5467374</Northing>
</Site>
<Site Name="GW 6829 - Jefferson">
<Easting>1584230</Easting>
<Northing>5469263</Northing>
</Site>
<Site Name="GW 6912 - Sowmans">
<Easting>1585228</Easting>
<Northing>5465031</Northing>
</Site>
<Site Name="GW 78 - Hunter No 3">
<Easting>1610159</Easting>
<Northing>5421050</Northing>
</Site>
<Site Name="GW 79 - Lawrence">
<Easting>1610450</Easting>
<Northing>5420933</Northing>
</Site>
<Site Name="GW 8012">
<Easting>1598623</Easting>
<Northing>5441900</Northing>
</Site>
<Site Name="GW 8050 - Wilsons Rd">
<Easting>1599532</Easting>
<Northing>5438806</Northing>
</Site>
<Site Name="GW 8107 - Sarau">
<Easting>1600891</Easting>
<Northing>5431333</Northing>
</Site>
<Site Name="GW 8108 - Redwood Lane">
<Easting>1606551</Easting>
<Northing>5427717</Northing>
</Site>
<Site Name="GW 8109 - Stringer Rd">
<Easting>1606108</Easting>
<Northing>5430426</Northing>
</Site>
<Site Name="GW 8110 - Weka Rd">
<Easting>1602174</Easting>
<Northing>5440563</Northing>
</Site>
<Site Name="GW 82 - Eden 1">
<Easting>1609901</Easting>
<Northing>5423094</Northing>
</Site>
<Site Name="GW 8385 - Kirks 2">
<Easting>1598934</Easting>
<Northing>5442023</Northing>
</Site>
<Site Name="GW 84 - Eden 3">
<Easting>1610259</Easting>
<Northing>5422999</Northing>
</Site>
<Site Name="GW 8404 - Wrattens">
<Easting>1598704</Easting>
<Northing>5442843</Northing>
</Site>
<Site Name="GW 8407 - Williams">
<Easting>1599141</Easting>
<Northing>5439685</Northing>
</Site>
<Site Name="GW 8410 - Van Beek">
<Easting>1606965</Easting>
<Northing>5435827</Northing>
</Site>
<Site Name="GW 8419 - Wratten">
<Easting>1598414</Easting>
<Northing>5444902</Northing>
</Site>
<Site Name="GW 8423 - Kirk">
<Easting>1599420</Easting>
<Northing>5441646</Northing>
</Site>
<Site Name="GW 8435 - Palmer">
<Easting>1598220</Easting>
<Northing>5442942</Northing>
</Site>
<Site Name="GW 86 - Eden 5">
<Easting>1610459</Easting>
<Northing>5422949</Northing>
</Site>
<Site Name="GW 87 - Eden 6">
<Easting>1610759</Easting>
<Northing>5422899</Northing>
</Site>
<Site Name="GW 88 - Challis 2">
<Easting>1610809</Easting>
<Northing>5424829</Northing>
</Site>
<Site Name="GW 8800 - Edwards Rd">
<Easting>1597015</Easting>
<Northing>5441983</Northing>
</Site>
<Site Name="GW 93 - HW2">
<Easting>1608227</Easting>
<Northing>5421573</Northing>
</Site>
<Site Name="GW 94 - EW1">
<Easting>1609459</Easting>
<Northing>5423199</Northing>
</Site>
<Site Name="GW 95 - EW2">
<Easting>1609148</Easting>
<Northing>5423589</Northing>
</Site>
<Site Name="GW 950 - Robinson">
<Easting>1618886</Easting>
<Northing>5425598</Northing>
</Site>
<Site Name="GW 96 - EW3">
<Easting>1608309</Easting>
<Northing>5424069</Northing>
</Site>
<Site Name="GW 98 - CW2">
<Easting>1609506</Easting>
<Northing>5426075</Northing>
</Site>
<Site Name="GW Challies Pond 2"> </Site>
<Site Name="GW Nelson at Trafalgar Park">
<Easting>1623699</Easting>
<Northing>5431469</Northing>
</Site>
<Site Name="Glen Rae"> </Site>
<Site Name="Golden Hills"> </Site>
<Site Name="HY 88 Valley at Smiths">
<Easting>1601911</Easting>
<Northing>5414103</Northing>
</Site>
<Site Name="HY Anatoki at Bencarri">
<Easting>1580790</Easting>
<Northing>5474195</Northing>
</Site>
<Site Name="HY Anatoki at Caesars Knob">
<Easting>1566028</Easting>
<Northing>5471782</Northing>
</Site>
<Site Name="HY Anatoki at Happy Sams">
<Easting>1578796</Easting>
<Northing>5473764</Northing>
</Site>
<Site Name="HY Anatoki at Paradise">
<Easting>1567805</Easting>
<Northing>5471045</Northing>
</Site>
<Site Name="HY Aorere at Devils Boots">
<Easting>1568566</Easting>
<Northing>5489392</Northing>
</Site>
<Site Name="HY Aorere at Ferntown">
<Easting>1569350</Easting>
<Northing>5498120</Northing>
</Site>
<Site Name="HY Aorere at Perry Saddle">
<Easting>1551937</Easting>
<Northing>5472726</Northing>
</Site>
<Site Name="HY Aorere at Perry Saddle Hut">
<Easting>1549634</Easting>
<Northing>5472080</Northing>
</Site>
<Site Name="HY Aorere at Quartz Range">
<Easting>1560031</Easting>
<Northing>5478279</Northing>
</Site>
<Site Name="HY Aorere at Salisbury Br">
<Easting>1560599</Easting>
<Northing>5483064</Northing>
</Site>
<Site Name="HY Aorere at Table Hill">
<Easting>1563629</Easting>
<Northing>5484077</Northing>
</Site>
<Site Name="HY Appleby EWS at Malling Rd">
<Easting>1607960</Easting>
<Northing>5426203</Northing>
</Site>
<Site Name="HY Appleby at DSIR Research Stn">
<Easting>1608310</Easting>
<Northing>5428897</Northing>
</Site>
<Site Name="HY Bainham at Langfords Store">
<Easting>1563138</Easting>
<Northing>5487209</Northing>
</Site>
<Site Name="HY Baton Flats at Old Site"> </Site>
<Site Name="HY Baton at Baton Flats">
<Easting>1576900</Easting>
<Northing>5425710</Northing>
</Site>
<Site Name="HY Baton at Flanagans Hut">
<Easting>1565120</Easting>
<Northing>5431810</Northing>
</Site>
<Site Name="HY Baton at u-s Motueka Confl">
<Easting>1583488</Easting>
<Northing>5430557</Northing>
</Site>
<Site Name="HY Blackbird Valley at Bensemanns">
<Easting>1596902</Easting>
<Northing>5430088</Northing>
</Site>
<Site Name="HY Borck at 400m d-s Queen St">
<Easting>1614737</Easting>
<Northing>5425118</Northing>
</Site>
<Site Name="HY Borck at Lower Queen St">
<Easting>1614369</Easting>
<Northing>5424840</Northing>
</Site>
<Site Name="HY Borcks at Malcolms">
<Easting>1614051</Easting>
<Northing>5423512</Northing>
</Site>
<Site Name="HY Branch at Power Scheme Intake">
<Easting>1615203</Easting>
<Northing>5383512</Northing>
</Site>
<Site Name="HY Brook at Dissipater">
<Easting>1624355</Easting>
<Northing>5429890</Northing>
</Site>
<Site Name="HY Brook at Larges Lane">
<Easting>1624373</Easting>
<Northing>5429678</Northing>
</Site>
<Site Name="HY Brook at Seymour Ave">
<Easting>1624378</Easting>
<Northing>5429835</Northing>
</Site>
<Site Name="HY Brook at Third House">
<Easting>1627183</Easting>
<Northing>5425088</Northing>
</Site>
<Site Name="HY Brooklyn at DSIR">
<Easting>1598014</Easting>
<Northing>5450490</Northing>
</Site>
<Site Name="HY Brooklyn at Jefferies">
<Easting>1595623</Easting>
<Northing>5450334</Northing>
</Site>
<Site Name="HY Brooklyn at Mt Campbell">
<Easting>1588918</Easting>
<Northing>5447992</Northing>
</Site>
<Site Name="HY Brooklyn at West Bank Bridge">
<Easting>1597255</Easting>
<Northing>5450500</Northing>
</Site>
<Site Name="HY Buller at Lake Rotoiti">
<Easting>1585212</Easting>
<Northing>5372220</Northing>
</Site>
<Site Name="HY Buller at Longford">
<Easting>1549176</Easting>
<Northing>5376265</Northing>
</Site>
<Site Name="HY Burmeister at Sherry River Rd">
<Easting>1574900</Easting>
<Northing>5402991</Northing>
</Site>
<Site Name="HY Burton Ale at Coll-Bain Rd">
<Easting>1571401</Easting>
<Northing>5496386</Northing>
</Site>
<Site Name="HY Cobb at Trilobite">
<Easting>1567108</Easting>
<Northing>5446784</Northing>
</Site>
<Site Name="HY Collingwood Combined"> </Site>
<Site Name="HY Collingwood at Ferntown">
<Easting>1570220</Easting>
<Northing>5498790</Northing>
</Site>
<Site Name="HY Collingwood at Repeater">
<Easting>1573230</Easting>
<Northing>5496271</Northing>
</Site>
<Site Name="HY Collins at Blunder Ridge">
<Easting>1645998</Easting>
<Northing>5442392</Northing>
</Site>
<Site Name="HY Collins at Drop Structure">
<Easting>1644611</Easting>
<Northing>5443463</Northing>
</Site>
<Site Name="HY Cutting at Roadside">
<Easting>1591684</Easting>
<Northing>5444867</Northing>
</Site>
<Site Name="HY Dominion at SH">
<Easting>1605991</Easting>
<Northing>5433146</Northing>
</Site>
<Site Name="HY Dove at 514m us Hall Rd">
<Easting>1585744</Easting>
<Northing>5431699</Northing>
</Site>
<Site Name="HY Dove at Motueka Confl">
<Easting>1585039</Easting>
<Northing>5432228</Northing>
</Site>
<Site Name="HY East Takaka Spring at Jeffersons">
<Easting>1584520</Easting>
<Northing>5469483</Northing>
</Site>
<Site Name="HY Farewell Spit (AWS)">
<Easting>1600751</Easting>
<Northing>5511626</Northing>
</Site>
<Site Name="HY Farewell Spit Wind (manual)"> </Site>
<Site Name="HY Field Creek at Harley Rd">
<Easting>1603794</Easting>
<Northing>5440409</Northing>
</Site>
<Site Name="HY Fish Creek Old Site"> </Site>
<Site Name="HY Fish Creek at Pupu Springs">
<Easting>1580615</Easting>
<Northing>5477957</Northing>
</Site>
<Site Name="HY Glenroy at Blicks">
<Easting>1544723</Easting>
<Northing>5343635</Northing>
</Site>
<Site Name="HY Golden Bay Buoy">
<Easting>1593314</Easting>
<Northing>5496200</Northing>
</Site>
<Site Name="HY Golden Bay Cawthron Mohua Buoy">
<Easting>1589312</Easting>
<Northing>5488981</Northing>
</Site>
<Site Name="HY Golden Bay at Tarakohe Wharf">
<Easting>1591454</Easting>
<Northing>5480820</Northing>
</Site>
<Site Name="HY Gouland Downs below Tubman Range">
<Easting>1543838</Easting>
<Northing>5468794</Northing>
</Site>
<Site Name="HY Gowan at Lake Rotoroa">
<Easting>1566319</Easting>
<Northing>5373122</Northing>
</Site>
<Site Name="HY Gowan at Lodge">
<Easting>1566121</Easting>
<Northing>5373102</Northing>
</Site>
<Site Name="HY Graham at Trig JJ">
<Easting>1578725</Easting>
<Northing>5440375</Northing>
</Site>
<Site Name="HY Graham at Weir">
<Easting>1585814</Easting>
<Northing>5387914</Northing>
</Site>
<Site Name="HY Harts at Hill St">
<Easting>1615407</Easting>
<Northing>5421500</Northing>
</Site>
<Site Name="HY Howard at Airstrip">
<Easting>1571440</Easting>
<Northing>5373674</Northing>
</Site>
<Site Name="HY Hunters at Weir">
<Easting>1588813</Easting>
<Northing>5386214</Northing>
</Site>
<Site Name="HY Jimmy Lee at 42 Beach Road">
<Easting>1615558</Easting>
<Northing>5424137</Northing>
</Site>
<Site Name="HY Jimmy Lee at 50m u-s Cushendall Rise">
<Easting>1616002</Easting>
<Northing>5421900</Northing>
</Site>
<Site Name="HY Jimmy Lee at Hill St">
<Easting>1616007</Easting>
<Northing>5422299</Northing>
</Site>
<Site Name="HY Jimmy Lee at Washbourn Gardens">
<Easting>1615576</Easting>
<Northing>5423136</Northing>
</Site>
<Site Name="HY Kainui Dam">
<Easting>1596182</Easting>
<Northing>5404527</Northing>
</Site>
<Site Name="HY Kainui Dam at Outflow">
<Easting>1596085</Easting>
<Northing>5404705</Northing>
</Site>
<Site Name="HY Kaituna at Carters">
<Easting>1563829</Easting>
<Northing>5492972</Northing>
</Site>
<Site Name="HY Karamea at Garibaldi">
<Easting>1550783</Easting>
<Northing>5435029</Northing>
</Site>
<Site Name="HY Karamea at Gorge">
<Easting>1534640</Easting>
<Northing>5432702</Northing>
</Site>
<Site Name="HY Kawatiri at Kawatiri Junction">
<Easting>1566504</Easting>
<Northing>5382998</Northing>
</Site>
<Site Name="HY Kikiwa at Forks">
<Easting>1587613</Easting>
<Northing>5386914</Northing>
</Site>
<Site Name="HY Kikiwa at Suttons">
<Easting>1590912</Easting>
<Northing>5381516</Northing>
</Site>
<Site Name="HY Kikiwa at Weir">
<Easting>1587913</Easting>
<Northing>5388514</Northing>
</Site>
<Site Name="HY Lake Rotoiti at DOC HQ">
<Easting>1586969</Easting>
<Northing>5371927</Northing>
</Site>
<Site Name="HY Lee Dam Downstream">
<Easting>1613537</Easting>
<Northing>5410230</Northing>
</Site>
<Site Name="HY Lee Dam Upstream">
<Easting>1613761</Easting>
<Northing>5407320</Northing>
</Site>
<Site Name="HY Lee Dam Weather Station">
<Easting>1613457</Easting>
<Northing>5408200</Northing>
</Site>
<Site Name="HY Lee at Meads Br">
<Easting>1613334</Easting>
<Northing>5415928</Northing>
</Site>
<Site Name="HY Lee at Proposed Dam Site"> </Site>
<Site Name="HY Lee at Trig F">
<Easting>1615720</Easting>
<Northing>5408030</Northing>
</Site>
<Site Name="HY Lee at Waterfall Ck">
<Easting>1613640</Easting>
<Northing>5408330</Northing>
</Site>
<Site Name="HY Lee at Waterfall Ck DAA">
<Easting>1613621</Easting>
<Northing>5408351</Northing>
</Site>
<Site Name="HY Lee at u-s Anslow Ck">
<Easting>1613279</Easting>
<Northing>5409255</Northing>
</Site>
<Site Name="HY Lee at u-s Lake">
<Easting>1614920</Easting>
<Northing>5406232</Northing>
</Site>
<Site Name="HY Little Devil at Tarn">
<Easting>1571227</Easting>
<Northing>5463260</Northing>
</Site>
<Site Name="HY Little Sydney at Bridge">
<Easting>1597315</Easting>
<Northing>5451790</Northing>
</Site>
<Site Name="HY Little Sydney at Factory Rd">
<Easting>1598699</Easting>
<Northing>5452834</Northing>
</Site>
<Site Name="HY Long Gully at Golden Downs">
<Easting>1586516</Easting>
<Northing>5397828</Northing>
</Site>
<Site Name="HY Maitai Dam Parameters at Control">
<Easting>1629003</Easting>
<Northing>5428496</Northing>
</Site>
<Site Name="HY Maitai Forks Combined"> </Site>
<Site Name="HY Maitai North at u-s Lake">
<Easting>1631877</Easting>
<Northing>5427880</Northing>
</Site>
<Site Name="HY Maitai South Combined"> </Site>
<Site Name="HY Maitai Sth at Above Old Intake">
<Easting>1630884</Easting>
<Northing>5427748</Northing>
</Site>
<Site Name="HY Maitai Sth at New Intake">
<Easting>1630742</Easting>
<Northing>5427917</Northing>
</Site>
<Site Name="HY Maitai Water Supply at Chlorinator">
<Easting>1630802</Easting>
<Northing>5428796</Northing>
</Site>
<Site Name="HY Maitai at Avon Tce">
<Easting>1624471</Easting>
<Northing>5430900</Northing>
</Site>
<Site Name="HY Maitai at Forks">
<Easting>1630980</Easting>
<Northing>5428640</Northing>
</Site>
<Site Name="HY Maitai at Forks Weir (old site)">
<Easting>1630702</Easting>
<Northing>5428796</Northing>
</Site>
<Site Name="HY Maitai at Girlies Hole">
<Easting>1624819</Easting>
<Northing>5430420</Northing>
</Site>
<Site Name="HY Maitai at North Branch">
<Easting>1631202</Easting>
<Northing>5428496</Northing>
</Site>
<Site Name="HY Maitai at Smiths Ford">
<Easting>1629003</Easting>
<Northing>5428496</Northing>
</Site>
<Site Name="HY Maitai at South Branch">
<Easting>1631054</Easting>
<Northing>5427431</Northing>
</Site>
<Site Name="HY Maitai at Williams">
<Easting>1629803</Easting>
<Northing>5429296</Northing>
</Site>
<Site Name="HY Mangles at Gorge">
<Easting>1552623</Easting>
<Northing>5370383</Northing>
</Site>
<Site Name="HY Marahau at 250m u-s Sandy Bay Rd">
<Easting>1600150</Easting>
<Northing>5461682</Northing>
</Site>
<Site Name="HY Marahau at Hollingworth Quarry">
<Easting>1598015</Easting>
<Northing>5462886</Northing>
</Site>
<Site Name="HY Maruia at Falls">
<Easting>1537879</Easting>
<Northing>5365048</Northing>
</Site>
<Site Name="HY Maruia at Rappahannock">
<Easting>1537266</Easting>
<Northing>5340577</Northing>
</Site>
<Site Name="HY Maruia at Shenandoah">
<Easting>1537778</Easting>
<Northing>5365111</Northing>
</Site>
<Site Name="HY Matakitaki at Horse Terrace Br">
<Easting>1546742</Easting>
<Northing>5349060</Northing>
</Site>
<Site Name="HY Matakitaki at Mud Lake">
<Easting>1543227</Easting>
<Northing>5367027</Northing>
</Site>
<Site Name="HY Matakitaki at Wiltons">
<Easting>1543026</Easting>
<Northing>5360929</Northing>
</Site>
<Site Name="HY Matiri at Lake Outlet">
<Easting>1544530</Easting>
<Northing>5387519</Northing>
</Site>
<Site Name="HY Mokihinui at Stoney Ck">
<Easting>1536691</Easting>
<Northing>5396928</Northing>
</Site>
<Site Name="HY Motueka Coastal Spring at M Staples"> </Site>
<Site Name="HY Motueka Gorge Combined"> </Site>
<Site Name="HY Motueka at 300m d-s Motupiko confl">
<Easting>1586126</Easting>
<Northing>5411676</Northing>
</Site>
<Site Name="HY Motueka at 600m u-s Wangapeka confl">
<Easting>1582636</Easting>
<Northing>5424273</Northing>
</Site>
<Site Name="HY Motueka at 800m d-s Tadmor confl">
<Easting>1583379</Easting>
<Northing>5420903</Northing>
</Site>
<Site Name="HY Motueka at Alexander Bluffs">
<Easting>1593327</Easting>
<Northing>5443525</Northing>
</Site>
<Site Name="HY Motueka at Alexander Bluffs 2">
<Easting>1593560</Easting>
<Northing>5443047</Northing>
</Site>
<Site Name="HY Motueka at Bibbys">
<Easting>1601613</Easting>
<Northing>5447691</Northing>
</Site>
<Site Name="HY Motueka at Big Pokororo">
<Easting>1589480</Easting>
<Northing>5440609</Northing>
</Site>
<Site Name="HY Motueka at Blue Glen">
<Easting>1592312</Easting>
<Northing>5391312</Northing>
</Site>
<Site Name="HY Motueka at Blue Gum Corner">
<Easting>1597515</Easting>
<Northing>5449691</Northing>
</Site>
<Site Name="HY Motueka at Carmen Dr">
<Easting>1601769</Easting>
<Northing>5447990</Northing>
</Site>
<Site Name="HY Motueka at DOC Office">
<Easting>1600800</Easting>
<Northing>5447380</Northing>
</Site>
<Site Name="HY Motueka at Dovedale">
<Easting>1600479</Easting>
<Northing>5424058</Northing>
</Site>
<Site Name="HY Motueka at Glenrae">
<Easting>1582926</Easting>
<Northing>5422240</Northing>
</Site>
<Site Name="HY Motueka at Golden Downs">
<Easting>1589362</Easting>
<Northing>5401257</Northing>
</Site>
<Site Name="HY Motueka at Goldpine">
<Easting>1588504</Easting>
<Northing>5404601</Northing>
</Site>
<Site Name="HY Motueka at Gorge">
<Easting>1592792</Easting>
<Northing>5390969</Northing>
</Site>
<Site Name="HY Motueka at Hyatts">
<Easting>1585535</Easting>
<Northing>5415716</Northing>
</Site>
<Site Name="HY Motueka at Mot. Depot">
<Easting>1600913</Easting>
<Northing>5450790</Northing>
</Site>
<Site Name="HY Motueka at Norths Br">
<Easting>1586606</Easting>
<Northing>5408593</Northing>
</Site>
<Site Name="HY Motueka at Old Wharf Rd">
<Easting>1599514</Easting>
<Northing>5449791</Northing>
</Site>
<Site Name="HY Motueka at Parker St">
<Easting>1599968</Easting>
<Northing>5449513</Northing>
</Site>
<Site Name="HY Motueka at Red Hills">
<Easting>1603133</Easting>
<Northing>5383513</Northing>
</Site>
<Site Name="HY Motueka at SH Bridge">
<Easting>1600913</Easting>
<Northing>5451090</Northing>
</Site>
<Site Name="HY Motueka at Sportspark">
<Easting>1600508</Easting>
<Northing>5448665</Northing>
</Site>
<Site Name="HY Motueka at Stanley Brook">
<Easting>1582346</Easting>
<Northing>5425087</Northing>
</Site>
<Site Name="HY Motueka at Tapawera Br">
<Easting>1584573</Easting>
<Northing>5418256</Northing>
</Site>
<Site Name="HY Motueka at Western Boundary">
<Easting>1585623</Easting>
<Northing>5402912</Northing>
</Site>
<Site Name="HY Motueka at Woodmans Bend">
<Easting>1596376</Easting>
<Northing>5447478</Northing>
</Site>
<Site Name="HY Motueka at Woodstock">
<Easting>1585145</Easting>
<Northing>5432644</Northing>
</Site>
<Site Name="HY Motueka at u-s Tadmor confl">
<Easting>1584028</Easting>
<Northing>5419743</Northing>
</Site>
<Site Name="HY Motupiko at 300m d-s Rainy confl">
<Easting>1582684</Easting>
<Northing>5393412</Northing>
</Site>
<Site Name="HY Motupiko at Christies">
<Easting>1583998</Easting>
<Northing>5392506</Northing>
</Site>
<Site Name="HY Motupiko at Korere Br">
<Easting>1583127</Easting>
<Northing>5401321</Northing>
</Site>
<Site Name="HY Motupiko at Old Motupiko Depot">
<Easting>1584317</Easting>
<Northing>5410406</Northing>
</Site>
<Site Name="HY Motupipi at Reillys Bridge">
<Easting>1585807</Easting>
<Northing>5477206</Northing>
</Site>
<Site Name="HY Moutere Inlet at Motueka Wharf">
<Easting>1601913</Easting>
<Northing>5445992</Northing>
</Site>
<Site Name="HY Moutere Trib at Wills Rd">
<Easting>1599413</Easting>
<Northing>5436795</Northing>
</Site>
<Site Name="HY Moutere at Catchment 10">
<Easting>1606710</Easting>
<Northing>5420700</Northing>
</Site>
<Site Name="HY Moutere at Catchment 12">
<Easting>1606210</Easting>
<Northing>5420900</Northing>
</Site>
<Site Name="HY Moutere at Catchment 13">
<Easting>1606310</Easting>
<Northing>5422200</Northing>
</Site>
<Site Name="HY Moutere at Catchment 14">
<Easting>1606110</Easting>
<Northing>5422500</Northing>
</Site>
<Site Name="HY Moutere at Catchment 15">
<Easting>1606010</Easting>
<Northing>5422600</Northing>
</Site>
<Site Name="HY Moutere at Catchment 2">
<Easting>1606910</Easting>
<Northing>5422000</Northing>
</Site>
<Site Name="HY Moutere at Catchment 3">
<Easting>1606610</Easting>
<Northing>5421600</Northing>
</Site>
<Site Name="HY Moutere at Catchment 4">
<Easting>1606510</Easting>
<Northing>5421400</Northing>
</Site>
<Site Name="HY Moutere at Catchment 5">
<Easting>1606536</Easting>
<Northing>5420993</Northing>
</Site>
<Site Name="HY Moutere at Catchment 6">
<Easting>1606210</Easting>
<Northing>5421500</Northing>
</Site>
<Site Name="HY Moutere at Catchment 8">
<Easting>1607110</Easting>
<Northing>5421100</Northing>
</Site>
<Site Name="HY Moutere at Catchment 9">
<Easting>1607010</Easting>
<Northing>5421000</Northing>
</Site>
<Site Name="HY Moutere at Edwards Rd">
<Easting>1599438</Easting>
<Northing>5441797</Northing>
</Site>
<Site Name="HY Moutere at Harakeke">
<Easting>1600813</Easting>
<Northing>5436595</Northing>
</Site>
<Site Name="HY Moutere at Holdaways Rd">
<Easting>1596815</Easting>
<Northing>5440994</Northing>
</Site>
<Site Name="HY Moutere at Jackett Island">
<Easting>1602505</Easting>
<Northing>5444754</Northing>
</Site>
<Site Name="HY Moutere at Kellings Rd">
<Easting>1600515</Easting>
<Northing>5432654</Northing>
</Site>
<Site Name="HY Moutere at Neudorf">
<Easting>1598259</Easting>
<Northing>5432648</Northing>
</Site>
<Site Name="HY Moutere at Old House Rd">
<Easting>1600213</Easting>
<Northing>5435296</Northing>
</Site>
<Site Name="HY Moutere at Riverside Community">
<Easting>1599401</Easting>
<Northing>5443180</Northing>
</Site>
<Site Name="HY Moutere at Smeatons">
<Easting>1597714</Easting>
<Northing>5441694</Northing>
</Site>
<Site Name="HY Moutere at Wilsons Rd">
<Easting>1587071</Easting>
<Northing>5389909</Northing>
</Site>
<Site Name="HY Murchison at Murchison">
<Easting>1543909</Easting>
<Northing>5371671</Northing>
</Site>
<Site Name="HY NZ Co Ditch at Riverside Community">
<Easting>1599414</Easting>
<Northing>5442993</Northing>
</Site>
<Site Name="HY Neimann at 600m u-s Lansdowne Rd">
<Easting>1611928</Easting>
<Northing>5427405</Northing>
</Site>
<Site Name="HY Nelson Weather Combined"> </Site>
<Site Name="HY Nelson at Airport">
<Easting>1618925</Easting>
<Northing>5428049</Northing>
</Site>
<Site Name="HY Nelson at Annesbrook Dr">
<Easting>1620319</Easting>
<Northing>5428006</Northing>
</Site>
<Site Name="HY Nelson at Broads">
<Easting>1622687</Easting>
<Northing>5429583</Northing>
</Site>
<Site Name="HY Nelson at Cathedral">
<Easting>1623805</Easting>
<Northing>5430296</Northing>
</Site>
<Site Name="HY Nelson at Cawthron">
<Easting>1624640</Easting>
<Northing>5431086</Northing>
</Site>
<Site Name="HY Nelson at Founders Park">
<Easting>1624759</Easting>
<Northing>5432152</Northing>
</Site>
<Site Name="HY Nelson at Marybank">
<Easting>1627082</Easting>
<Northing>5435523</Northing>
</Site>
<Site Name="HY Nelson at NNWWTP">
<Easting>1627857</Easting>
<Northing>5438808</Northing>
</Site>
<Site Name="HY Nelson at Princes Dr">
<Easting>1621457</Easting>
<Northing>5429783</Northing>
</Site>
<Site Name="HY Old School at u-s confl">
<Easting>1585784</Easting>
<Northing>5414936</Northing>
</Site>
<Site Name="HY Onekaka at Intake (Weir)">
<Easting>1573624</Easting>
<Northing>5485376</Northing>
</Site>
<Site Name="HY Onekaka at u-s Ironstone Ck">
<Easting>1574363</Easting>
<Northing>5485987</Northing>
</Site>
<Site Name="HY Orphanage at Ngawhatu">
<Easting>1619400</Easting>
<Northing>5425255</Northing>
</Site>
<Site Name="HY Otuwhero Inlet at Bonnells">
<Easting>1599314</Easting>
<Northing>5458387</Northing>
</Site>
<Site Name="HY Otuwhero Inlet at Stanbridges">
<Easting>1599314</Easting>
<Northing>5458387</Northing>
</Site>
<Site Name="HY Pacific Ocean"> </Site>
<Site Name="HY Page Wetland Bottom Outflow">
<Easting>1580402</Easting>
<Northing>5477300</Northing>
</Site>
<Site Name="HY Page Wetland Side Inflow">
<Easting>1580430</Easting>
<Northing>5477194</Northing>
</Site>
<Site Name="HY Page Wetland Top Inflow">
<Easting>1580533</Easting>
<Northing>5477095</Northing>
</Site>
<Site Name="HY Pakawau at McHardies">
<Easting>1573390</Easting>
<Northing>5505610</Northing>
</Site>
<Site Name="HY Parkes at 88 Valley Water Supply">
<Easting>1602296</Easting>
<Northing>5407526</Northing>
</Site>
<Site Name="HY Parkes at Above Intake">
<Easting>1602258</Easting>
<Northing>5407844</Northing>
</Site>
<Site Name="HY Parkes at Ladleys">
<Easting>1600622</Easting>
<Northing>5410243</Northing>
</Site>
<Site Name="HY Pelorus at 1446">
<Easting>1624741</Easting>
<Northing>5407130</Northing>
</Site>
<Site Name="HY Pigeon Nth at Sharpes Rd">
<Easting>1601612</Easting>
<Northing>5421501</Northing>
</Site>
<Site Name="HY Pigeon Sth at Bradleys Rd">
<Easting>1599812</Easting>
<Northing>5419501</Northing>
</Site>
<Site Name="HY Pigeon Valley at Forks">
<Easting>1601911</Easting>
<Northing>5419301</Northing>
</Site>
<Site Name="HY Pitfure at Johnstons">
<Easting>1605510</Easting>
<Northing>5416327</Northing>
</Site>
<Site Name="HY Powell at 40m u-s Motupipi Rv">
<Easting>1585808</Easting>
<Northing>5477180</Northing>
</Site>
<Site Name="HY Powell at u-s McConnon">
<Easting>1585594</Easting>
<Northing>5476355</Northing>
</Site>
<Site Name="HY Quail Valley at Christians">
<Easting>1597212</Easting>
<Northing>5410305</Northing>
</Site>
<Site Name="HY Rabbit Is at Barnicoat Causeway"> </Site>
<Site Name="HY Rabbit Island at Caretakers">
<Easting>1611909</Easting>
<Northing>5430197</Northing>
</Site>
<Site Name="HY Rabbit Island at TDC Forest">
<Easting>1614408</Easting>
<Northing>5430497</Northing>
</Site>
<Site Name="HY Rameka at Pages Ford">
<Easting>1589718</Easting>
<Northing>5470983</Northing>
</Site>
<Site Name="HY Redwood Valley at Flume">
<Easting>1604711</Easting>
<Northing>5427098</Northing>
</Site>
<Site Name="HY Reservoir at Hill St">
<Easting>1616901</Easting>
<Northing>5423099</Northing>
</Site>
<Site Name="HY Reservoir at Kareti Drive">
<Easting>1616962</Easting>
<Northing>5423771</Northing>
</Site>
<Site Name="HY Reservoir at Marlborough Cres">
<Easting>1616945</Easting>
<Northing>5422505</Northing>
</Site>
<Site Name="HY Reservoir at Salisbury Rd">
<Easting>1616840</Easting>
<Northing>5424090</Northing>
</Site>
<Site Name="HY Reservoir at Stillwater Ck">
<Easting>1617001</Easting>
<Northing>5423687</Northing>
</Site>
<Site Name="HY Reservoir at Templemore Dr">
<Easting>1616979</Easting>
<Northing>5423684</Northing>
</Site>
<Site Name="HY Reservoir at Templemore Pond">
<Easting>1616911</Easting>
<Northing>5423854</Northing>
</Site>
<Site Name="HY Richmond Weather at Race Course">
<Easting>1615521</Easting>
<Northing>5424889</Northing>
</Site>
<Site Name="HY Richmond Weather at TDC Office">
<Easting>1615601</Easting>
<Northing>5423277</Northing>
</Site>
<Site Name="HY Richmond Weather at TDC Roof">
<Easting>1615604</Easting>
<Northing>5423279</Northing>
</Site>
<Site Name="HY Richmond at Kingsley Place"> </Site>
<Site Name="HY Richmond at Racecourse (Old Site)">
<Easting>1615423</Easting>
<Northing>5424769</Northing>
</Site>
<Site Name="HY Riwaka North at Kairuru">
<Easting>1592017</Easting>
<Northing>5458787</Northing>
</Site>
<Site Name="HY Riwaka North at Littles">
<Easting>1592261</Easting>
<Northing>5457199</Northing>
</Site>
<Site Name="HY Riwaka North at Old Swing Br">
<Easting>1592317</Easting>
<Northing>5457188</Northing>
</Site>
<Site Name="HY Riwaka South Combined"> </Site>
<Site Name="HY Riwaka South at Moss Bush">
<Easting>1593094</Easting>
<Northing>5455401</Northing>
</Site>
<Site Name="HY Riwaka South at Moss Bush (Old Site)">
<Easting>1593416</Easting>
<Northing>5455489</Northing>
</Site>
<Site Name="HY Riwaka South at Riwaka Valley">
<Easting>1593116</Easting>
<Northing>5455589</Northing>
</Site>
<Site Name="HY Riwaka at DSIR Research Station">
<Easting>1597515</Easting>
<Northing>5450490</Northing>
</Site>
<Site Name="HY Riwaka at Hickmotts">
<Easting>1599118</Easting>
<Northing>5453740</Northing>
</Site>
<Site Name="HY Riwaka at Takaka Hill">
<Easting>1589671</Easting>
<Northing>5458266</Northing>
</Site>
<Site Name="HY Rocky at Old Kiln">
<Easting>1592916</Easting>
<Northing>5444293</Northing>
</Site>
<Site Name="HY Roding Combined"> </Site>
<Site Name="HY Roding at Aniseed Valley">
<Easting>1613350</Easting>
<Northing>5418102</Northing>
</Site>
<Site Name="HY Roding at Caretakers">
<Easting>1621899</Easting>
<Northing>5421608</Northing>
</Site>
<Site Name="HY Roding at Caretakers (Met site)">
<Easting>1621824</Easting>
<Northing>5421588</Northing>
</Site>
<Site Name="HY Roding at Peninsula">
<Easting>1612568</Easting>
<Northing>5417390</Northing>
</Site>
<Site Name="HY Roding at Roding Supply">
<Easting>1622105</Easting>
<Northing>5421699</Northing>
</Site>
<Site Name="HY Roding at Skid Site">
<Easting>1622852</Easting>
<Northing>5421168</Northing>
</Site>
<Site Name="HY Roding at Weir">
<Easting>1622105</Easting>
<Northing>5421699</Northing>
</Site>
<Site Name="HY Roding at u-s Stratford">
<Easting>1619865</Easting>
<Northing>5420082</Northing>
</Site>
<Site Name="HY Roughns at Greens Rd">
<Easting>1587414</Easting>
<Northing>5392012</Northing>
</Site>
<Site Name="HY Roughns at Weir">
<Easting>1588014</Easting>
<Northing>5393812</Northing>
</Site>
<Site Name="HY Rowling at Mariri">
<Easting>1601213</Easting>
<Northing>5444192</Northing>
</Site>
<Site Name="HY Saxtons Stm at NFC Weir">
<Easting>1618406</Easting>
<Northing>5423799</Northing>
</Site>
<Site Name="HY Seaton Vly at d-s Causeway">
<Easting>1608410</Easting>
<Northing>5433196</Northing>
</Site>
<Site Name="HY Seaton Vly at u-s Causeway">
<Easting>1608410</Easting>
<Northing>5433196</Northing>
</Site>
<Site Name="HY Seaton Vly at u-s SH60">
<Easting>1607510</Easting>
<Northing>5434196</Northing>
</Site>
<Site Name="HY Sherry at 1km u-s Blue Rock">
<Easting>1577678</Easting>
<Northing>5418448</Northing>
</Site>
<Site Name="HY Sherry at Blue Rock">
<Easting>1578019</Easting>
<Northing>5419287</Northing>
</Site>
<Site Name="HY Sherry at Matariki Bridge">
<Easting>1577130</Easting>
<Northing>5414887</Northing>
</Site>
<Site Name="HY Sherry at Noddys Rd">
<Easting>1574921</Easting>
<Northing>5403591</Northing>
</Site>
<Site Name="HY Sherry at Slippery Rd Br">
<Easting>1577042</Easting>
<Northing>5412421</Northing>
</Site>
<Site Name="HY Sherry at u-s Cave Ck">
<Easting>1574989</Easting>
<Northing>5407082</Northing>
</Site>
<Site Name="HY Sherry at u-s Granity Ck 2">
<Easting>1575938</Easting>
<Northing>5409759</Northing>
</Site>
<Site Name="HY Sherry at u-s Sailor Ck">
<Easting>1576226</Easting>
<Northing>5411381</Northing>
</Site>
<Site Name="HY Snow at Plateau">
<Easting>1566194</Easting>
<Northing>5471169</Northing>
</Site>
<Site Name="HY Spring Brook at Elm Grove">
<Easting>1583320</Easting>
<Northing>5469483</Northing>
</Site>
<Site Name="HY Stanley Brook at Barkers">
<Easting>1584918</Easting>
<Northing>5426000</Northing>
</Site>
<Site Name="HY Stanley Brook at Malcolms">
<Easting>1585418</Easting>
<Northing>5425600</Northing>
</Site>
<Site Name="HY Stephens Bay at Dornes">
<Easting>1601513</Easting>
<Northing>5455788</Northing>
</Site>
<Site Name="HY Stoke at Saxton Rd">
<Easting>1618077</Easting>
<Northing>5425185</Northing>
</Site>
<Site Name="HY Swamp Gully at Redstone Park">
<Easting>1596167</Easting>
<Northing>5407558</Northing>
</Site>
<Site Name="HY Swamp Gully at Weir">
<Easting>1596412</Easting>
<Northing>5406706</Northing>
</Site>
<Site Name="HY Tadmor at Glenrae Bridge">
<Easting>1583662</Easting>
<Northing>5419846</Northing>
</Site>
<Site Name="HY Tadmor at Hope Diversion">
<Easting>1571547</Easting>
<Northing>5395245</Northing>
</Site>
<Site Name="HY Tadmor at Kaka 1">
<Easting>1573790</Easting>
<Northing>5397933</Northing>
</Site>
<Site Name="HY Tadmor at Kaka 2">
<Easting>1573790</Easting>
<Northing>5397933</Northing>
</Site>
<Site Name="HY Tadmor at Mudstone">
<Easting>1577973</Easting>
<Northing>5411174</Northing>
</Site>
<Site Name="HY Tadmor at Oldhams">
<Easting>1583288</Easting>
<Northing>5417134</Northing>
</Site>
<Site Name="HY Tadmor at Tadmor Bushend">
<Easting>1579321</Easting>
<Northing>5412687</Northing>
</Site>
<Site Name="HY Tadmor at Tui Rd">
<Easting>1576879</Easting>
<Northing>5401502</Northing>
</Site>
<Site Name="HY Tadmor natural est at Mudstone">
<Easting>1577620</Easting>
<Northing>5411106</Northing>
</Site>
<Site Name="HY Takaka Combined"> </Site>
<Site Name="HY Takaka EWS at Info Centre">
<Easting>1583636</Easting>
<Northing>5476530</Northing>
</Site>
<Site Name="HY Takaka HLogger at Harwoods">
<Easting>1583021</Easting>
<Northing>5457788</Northing>
</Site>
<Site Name="HY Takaka Upper Valley"> </Site>
<Site Name="HY Takaka at Aerodrome">
<Easting>1581139</Easting>
<Northing>5481781</Northing>
</Site>
<Site Name="HY Takaka at Baigents">
<Easting>1585620</Easting>
<Northing>5467684</Northing>
</Site>
<Site Name="HY Takaka at Borlases">
<Easting>1585520</Easting>
<Northing>5468684</Northing>
</Site>
<Site Name="HY Takaka at Canaan">
<Easting>1592273</Easting>
<Northing>5467914</Northing>
</Site>
<Site Name="HY Takaka at Gravel Crusher">
<Easting>1582376</Easting>
<Northing>5477603</Northing>
</Site>
<Site Name="HY Takaka at Harwoods">
<Easting>1583040</Easting>
<Northing>5457923</Northing>
</Site>
<Site Name="HY Takaka at Kotinga">
<Easting>1583912</Easting>
<Northing>5475606</Northing>
</Site>
<Site Name="HY Takaka at Motupipi Substation">
<Easting>1587019</Easting>
<Northing>5476880</Northing>
</Site>
<Site Name="HY Takaka at Pages Cut">
<Easting>1582721</Easting>
<Northing>5478879</Northing>
</Site>
<Site Name="HY Takaka at Rameka Gorge">
<Easting>1586319</Easting>
<Northing>5473582</Northing>
</Site>
<Site Name="HY Takaka at Takaka Depot">
<Easting>1583820</Easting>
<Northing>5475781</Northing>
</Site>
<Site Name="HY Takaka at Uruwhenua">
<Easting>1584804</Easting>
<Northing>5462655</Northing>
</Site>
<Site Name="HY Tapawera 2 NIWA">
<Easting>1585699</Easting>
<Northing>5418155</Northing>
</Site>
<Site Name="HY Tapawera Combined"> </Site>
<Site Name="HY Tapawera at WWTP">
<Easting>1584841</Easting>
<Northing>5418497</Northing>
</Site>
<Site Name="HY Tasman Bay Buoy">
<Easting>1607666</Easting>
<Northing>5454816</Northing>
</Site>
<Site Name="HY Tasman Bay at Fairway Beacon"> </Site>
<Site Name="HY Tasman Bay at Little Kaiteri">
<Easting>1601952</Easting>
<Northing>5456262</Northing>
</Site>
<Site Name="HY Tasman Bay at Port Nelson">
<Easting>1622878</Easting>
<Northing>5432169</Northing>
</Site>
<Site Name="HY Tasman Vly Stm at u-s Jesters Hse">
<Easting>1604842</Easting>
<Northing>5439429</Northing>
</Site>
<Site Name="HY Tasman at Hortons Rd">
<Easting>1605211</Easting>
<Northing>5434396</Northing>
</Site>
<Site Name="HY Tasman at Tasman Bluffs">
<Easting>1606911</Easting>
<Northing>5437694</Northing>
</Site>
<Site Name="HY Te Kakau at Spring">
<Easting>1583520</Easting>
<Northing>5478080</Northing>
</Site>
<Site Name="HY Te Kakau at u-s Haldane Rd"> </Site>
<Site Name="HY Temp Site 1"> </Site>
<Site Name="HY Temp Site 2"> </Site>
<Site Name="HY Temp Site 3"> </Site>
<Site Name="HY Temp Site 4"> </Site>
<Site Name="HY Temp Site 5"> </Site>
<Site Name="HY Temp Site 6"> </Site>
<Site Name="HY Temp Site 7"> </Site>
<Site Name="HY Temp Site 8"> </Site>
<Site Name="HY Temp Site 9"> </Site>
<Site Name="HY Thorpe Drain at Old Wharf Road">
<Easting>1601257</Easting>
<Northing>5447383</Northing>
</Site>
<Site Name="HY Tiraumea at Tutaki">
<Easting>1557265</Easting>
<Northing>5367969</Northing>
</Site>
<Site Name="HY Totaranui at Homestead Br">
<Easting>1600014</Easting>
<Northing>5480979</Northing>
</Site>
<Site Name="HY Totaranui at Totaranui">
<Easting>1600450</Easting>
<Northing>5481441</Northing>
</Site>
<Site Name="HY Tuatea Buoy at Tasman Bay">
<Easting>1610841</Easting>
<Northing>5470593</Northing>
</Site>
<Site Name="HY Tuatea at Tasman Bay"> </Site>
<Site Name="HY WEIS Pumpage Moving Mean">
<Easting>1611108</Easting>
<Northing>5417401</Northing>
</Site>
<Site Name="HY WEIS pumpage at Pump Intake">
<Easting>1611041</Easting>
<Northing>5417401</Northing>
</Site>
<Site Name="HY Wai-iti Combined"> </Site>
<Site Name="HY Wai-iti at Baigents">
<Easting>1603371</Easting>
<Northing>5416572</Northing>
</Site>
<Site Name="HY Wai-iti at Baigents Road">
<Easting>1601312</Easting>
<Northing>5416114</Northing>
</Site>
<Site Name="HY Wai-iti at Belgrove">
<Easting>1596495</Easting>
<Northing>5410690</Northing>
</Site>
<Site Name="HY Wai-iti at Birds">
<Easting>1605838</Easting>
<Northing>5414273</Northing>
</Site>
<Site Name="HY Wai-iti at Brightwater Bridge">
<Easting>1608413</Easting>
<Northing>5420612</Northing>
</Site>
<Site Name="HY Wai-iti at Footbridge">
<Easting>1606910</Easting>
<Northing>5419101</Northing>
</Site>
<Site Name="HY Wai-iti at Livingston Rd">
<Easting>1608677</Easting>
<Northing>5421168</Northing>
</Site>
<Site Name="HY Waikoropupu at Bubbling Springs">
<Easting>1580748</Easting>
<Northing>5478693</Northing>
</Site>
<Site Name="HY Waikoropupu at Bubbling Springs (new)">
<Easting>1580719</Easting>
<Northing>5478621</Northing>
</Site>
<Site Name="HY Waikoropupu at Egdirb">
<Easting>1581221</Easting>
<Northing>5478779</Northing>
</Site>
<Site Name="HY Waikoropupu at Main Spring">
<Easting>1580621</Easting>
<Northing>5478080</Northing>
</Site>
<Site Name="HY Waikoropupu at Main Spring (Balls)">
<Easting>1580222</Easting>
<Northing>5468684</Northing>
</Site>
<Site Name="HY Waikoropupu at Springs River">
<Easting>1580676</Easting>
<Northing>5478276</Northing>
</Site>
<Site Name="HY Waimea Dam">
<Easting>1613490</Easting>
<Northing>5408834</Northing>
</Site>
<Site Name="HY Waimea Dam TDC"> </Site>
<Site Name="HY Waimea Inlet at Mapua Wharf">
<Easting>1608410</Easting>
<Northing>5432696</Northing>
</Site>
<Site Name="HY Waimea Inlet at Shags Roost">
<Easting>1615675</Easting>
<Northing>5428274</Northing>
</Site>
<Site Name="HY Waimea at Challies">
<Easting>1610509</Easting>
<Northing>5425498</Northing>
</Site>
<Site Name="HY Waimea at Cooper Place">
<Easting>1614863</Easting>
<Northing>5423097</Northing>
</Site>
<Site Name="HY Waimea at Densems">
<Easting>1612108</Easting>
<Northing>5420300</Northing>
</Site>
<Site Name="HY Waimea at EW2">
<Easting>1609109</Easting>
<Northing>5423599</Northing>
</Site>
<Site Name="HY Waimea at Fenemors">
<Easting>1609808</Easting>
<Northing>5417301</Northing>
</Site>
<Site Name="HY Waimea at Gravel Crusher">
<Easting>1610713</Easting>
<Northing>5426363</Northing>
</Site>
<Site Name="HY Waimea at Pugh Rd">
<Easting>1613108</Easting>
<Northing>5423699</Northing>
</Site>
<Site Name="HY Waimea at TDC Nursery">
<Easting>1610566</Easting>
<Northing>5426413</Northing>
</Site>
<Site Name="HY Waingaro at Hanging Rock">
<Easting>1579010</Easting>
<Northing>5467845</Northing>
</Site>
<Site Name="HY Waingaro at Langfords">
<Easting>1582391</Easting>
<Northing>5472802</Northing>
</Site>
<Site Name="HY Waingaro at Mt Snowden">
<Easting>1566727</Easting>
<Northing>5458388</Northing>
</Site>
<Site Name="HY Waingaro at u-s Takaka Confl">
<Easting>1583788</Easting>
<Northing>5474225</Northing>
</Site>
<Site Name="HY Wairau at Top Valley">
<Easting>1630900</Easting>
<Northing>5398406</Northing>
</Site>
<Site Name="HY Wairoa Combined"> </Site>
<Site Name="HY Wairoa at Brightwater Br">
<Easting>1609986</Easting>
<Northing>5419572</Northing>
</Site>
<Site Name="HY Wairoa at Bryants Lane">
<Easting>1609609</Easting>
<Northing>5420500</Northing>
</Site>
<Site Name="HY Wairoa at Clover Rd">
<Easting>1609446</Easting>
<Northing>5421144</Northing>
</Site>
<Site Name="HY Wairoa at Gorge">
<Easting>1611012</Easting>
<Northing>5417300</Northing>
</Site>
<Site Name="HY Wairoa at Gorge 2">
<Easting>1611034</Easting>
<Northing>5417365</Northing>
</Site>
<Site Name="HY Wairoa at Haycock Rd">
<Easting>1611105</Easting>
<Northing>5417724</Northing>
</Site>
<Site Name="HY Wairoa at Irvines">
<Easting>1610932</Easting>
<Northing>5416466</Northing>
</Site>
<Site Name="HY Wairoa at Irvines Bridge">
<Easting>1609413</Easting>
<Northing>5413218</Northing>
</Site>
<Site Name="HY Wairoa at Little Ben">
<Easting>1607985</Easting>
<Northing>5409500</Northing>
</Site>
<Site Name="HY Wairoa at Maxs Bush">
<Easting>1610862</Easting>
<Northing>5417717</Northing>
</Site>
<Site Name="HY Wairoa at Top Wairoa Hut">
<Easting>1605398</Easting>
<Northing>5394039</Northing>
</Site>
<Site Name="HY Wairoa at u-s Wai-iti confl">
<Easting>1609709</Easting>
<Northing>5422700</Northing>
</Site>
<Site Name="HY Waitapu at Wharf">
<Easting>1583820</Easting>
<Northing>5480878</Northing>
</Site>
<Site Name="HY Waiwhero at Gravel Pit">
<Easting>1594483</Easting>
<Northing>5438385</Northing>
</Site>
<Site Name="HY Waiwhero at Rosedale Poplars Weir">
<Easting>1594315</Easting>
<Northing>5437995</Northing>
</Site>
<Site Name="HY Waiwhero at Rosedale Weir">
<Easting>1594315</Easting>
<Northing>5437995</Northing>
</Site>
<Site Name="HY Wakapuaka Combined"> </Site>
<Site Name="HY Wakapuaka at Fire Station">
<Easting>1633358</Easting>
<Northing>5437517</Northing>
</Site>
<Site Name="HY Wakapuaka at Hira">
<Easting>1633155</Easting>
<Northing>5437229</Northing>
</Site>
<Site Name="HY Wakapuaka at Hira Forest">
<Easting>1628865</Easting>
<Northing>5431385</Northing>
</Site>
<Site Name="HY Wakapuaka at Pah Rd">
<Easting>1637601</Easting>
<Northing>5442492</Northing>
</Site>
<Site Name="HY Wakefield at Pigeon Valley">
<Easting>1602111</Easting>
<Northing>5418801</Northing>
</Site>
<Site Name="HY Wangapeka at Biggs Tops">
<Easting>1549861</Easting>
<Northing>5414739</Northing>
</Site>
<Site Name="HY Wangapeka at Dart Ford">
<Easting>1570698</Easting>
<Northing>5414568</Northing>
</Site>
<Site Name="HY Wangapeka at Dog Face">
<Easting>1559080</Easting>
<Northing>5404066</Northing>
</Site>
<Site Name="HY Wangapeka at Nettletons">
<Easting>1571222</Easting>
<Northing>5414506</Northing>
</Site>
<Site Name="HY Wangapeka at Swimming Hole">
<Easting>1572822</Easting>
<Northing>5415905</Northing>
</Site>
<Site Name="HY Wangapeka at Swingbridge">
<Easting>1571222</Easting>
<Northing>5414806</Northing>
</Site>
<Site Name="HY Wangapeka at Walter Peak">
<Easting>1580364</Easting>
<Northing>5423474</Northing>
</Site>
<Site Name="HY Whanganui Inlet at Temperature Site 1">
<Easting>1565041</Easting>
<Northing>5508091</Northing>
</Site>
<Site Name="HY Whanganui Inlet at Temperature Site 2">
<Easting>1565121</Easting>
<Northing>5507749</Northing>
</Site>
<Site Name="HY Whanganui Inlet at Temperature Site 3">
<Easting>1565179</Easting>
<Northing>5507559</Northing>
</Site>
<Site Name="HY Whanganui Inlet at Temperature Site 4">
<Easting>1565245</Easting>
<Northing>5507309</Northing>
</Site>
<Site Name="HY Whanganui Inlet at Temperature Site 5">
<Easting>1565279</Easting>
<Northing>5507191</Northing>
</Site>
<Site Name="HY Whanganui Inlet at Temperature Site 6">
<Easting>1565313</Easting>
<Northing>5507047</Northing>
</Site>
<Site Name="HY Whanganui Inlet at Temperature Site 7">
<Easting>1566247</Easting>
<Northing>5507141</Northing>
</Site>
<Site Name="HY Whanganui Inlet at Temperature Site 8">
<Easting>1566188</Easting>
<Northing>5507265</Northing>
</Site>
<Site Name="HY Woodlands Drain at Equestrian Lodge">
<Easting>1601264</Easting>
<Northing>5448502</Northing>
</Site>
<Site Name="Hau Plains"> </Site>
<Site Name="Hope Aquifers and Eastern Hills"> </Site>
<Site Name="King Edward"> </Site>
<Site Name="LW Lake Killarney">
<Easting>1583885</Easting>
<Northing>5477650</Northing>
</Site>
<Site Name="Maitai at Avon Tce"> </Site>
<Site Name="Marahau Coastal"> </Site>
<Site Name="Marahau Plains"> </Site>
<Site Name="Middle Motueka"> </Site>
<Site Name="Motupiko"> </Site>
<Site Name="Moutere Coastal Groundwater"> </Site>
<Site Name="Moutere Eastern Groundwater"> </Site>
<Site Name="Moutere Southern Groundwater"> </Site>
<Site Name="Moutere Surface Water"> </Site>
<Site Name="Moutere Waimea Groundwater"> </Site>
<Site Name="Moutere Western Groundwater"> </Site>
<Site Name="RW Berkett @ u-s Powell">
<Easting>1585729</Easting>
<Northing>5476820</Northing>
</Site>
<Site Name="RW Berrydowns at Coll-Bain Rd">
<Easting>1568993</Easting>
<Northing>5491267</Northing>
</Site>
<Site Name="RW Borck @ 400m ds Queen St">
<Easting>1614660</Easting>
<Northing>5425096</Northing>
</Site>
<Site Name="RW Brewerton @ u-s Motupiko">
<Easting>1583445</Easting>
<Northing>5402116</Northing>
</Site>
<Site Name="RW Brooklyn @ 400m u-s Motueka Rv">
<Easting>1599040</Easting>
<Northing>5450385</Northing>
</Site>
<Site Name="RW Brooklyn @ Westbank Rd">
<Easting>1597283</Easting>
<Northing>5450503</Northing>
</Site>
<Site Name="RW Burton Ale @ Collingwd-Bainhm Rd">
<Easting>1571390</Easting>
<Northing>5496391</Northing>
</Site>
<Site Name="RW Burton Ale @ u-s Sewage Dx">
<Easting>1571485</Easting>
<Northing>5496176</Northing>
</Site>
<Site Name="RW Burton Ale Ck @ 5m us Win Ck">
<Easting>1571356</Easting>
<Northing>5494193</Northing>
</Site>
<Site Name="RW Clay @ 550m us Aorere">
<Easting>1565358</Easting>
<Northing>5487515</Northing>
</Site>
<Site Name="RW Dall @ Collingwood-Bainham Rd">
<Easting>1569006</Easting>
<Northing>5494632</Northing>
</Site>
<Site Name="RW Edwards Rd Ck @ Chings Rd">
<Easting>1598181</Easting>
<Northing>5443226</Northing>
</Site>
<Site Name="RW Edwards Rd Ck @ Edwards Rd">
<Easting>1597088</Easting>
<Northing>5442053</Northing>
</Site>
<Site Name="RW Ferrer Ck @ 400m u-s School Rd">
<Easting>1600233</Easting>
<Northing>5452460</Northing>
</Site>
<Site Name="RW Glenrae @ Tap-Baton Rd">
<Easting>1582529</Easting>
<Northing>5422393</Northing>
</Site>
<Site Name="RW Glenrae at Tap-Baton Rd"> </Site>
<Site Name="RW Gordon @ Kerr Hill Rd">
<Easting>1590578</Easting>
<Northing>5398772</Northing>
</Site>
<Site Name="RW Graham @ Kikiwa">
<Easting>1586449</Easting>
<Northing>5388639</Northing>
</Site>
<Site Name="RW Greenhough Ck at Moutere Hwy">
<Easting>1599663</Easting>
<Northing>5439607</Northing>
</Site>
<Site Name="RW Hinehaka Ck at 200m u-s Buller">
<Easting>1539735</Easting>
<Northing>5374331</Northing>
</Site>
<Site Name="RW Hinetai Spring 1">
<Easting>1582975</Easting>
<Northing>5423595</Northing>
</Site>
<Site Name="RW Hinetai Spring 2">
<Easting>1582960</Easting>
<Northing>5423649</Northing>
</Site>
<Site Name="RW Horton Vly Stm @ d-s Preece Wetland">
<Easting>1604802</Easting>
<Northing>5437954</Northing>
</Site>
<Site Name="RW Hunters @ Kikiwa">
<Easting>1588798</Easting>
<Northing>5386169</Northing>
</Site>
<Site Name="RW James Cutting @ Coll-Bainham Rd">
<Easting>1570515</Easting>
<Northing>5495924</Northing>
</Site>
<Site Name="RW Jimmy Lee @ 42 Beach Rd">
<Easting>1615572</Easting>
<Northing>5424328</Northing>
</Site>
<Site Name="RW Jimmy Lee @ 68 Beach Rd">
<Easting>1615755</Easting>
<Northing>5424291</Northing>
</Site>
<Site Name="RW Jimmy Lee @ d-s Hill St">
<Easting>1616005</Easting>
<Northing>5422396</Northing>
</Site>
<Site Name="RW Jimmy Lee @ u-s Hill St">
<Easting>1616085</Easting>
<Northing>5422243</Northing>
</Site>
<Site Name="RW Kayak School at Grey St">
<Easting>1544653</Easting>
<Northing>5372323</Northing>
</Site>
<Site Name="RW Kikiwa @ Kikiwa">
<Easting>1588163</Easting>
<Northing>5388494</Northing>
</Site>
<Site Name="RW Kohatu @ 500m u-s Motueka Rv">
<Easting>1586312</Easting>
<Northing>5413060</Northing>
</Site>
<Site Name="RW Kohatu @ 800m u-s Motueka Rv">
<Easting>1586459</Easting>
<Northing>5412752</Northing>
</Site>
<Site Name="RW Lake Killarney"> </Site>
<Site Name="RW Lee @ DS">
<Easting>1613537</Easting>
<Northing>5410230</Northing>
</Site>
<Site Name="RW Lee @ Meads Br">
<Easting>1613282</Easting>
<Northing>5415973</Northing>
</Site>
<Site Name="RW Lee @ US">
<Easting>1613761</Easting>
<Northing>5407320</Northing>
</Site>
<Site Name="RW Little Sydney @ Factory Rd">
<Easting>1598699</Easting>
<Northing>5452834</Northing>
</Site>
<Site Name="RW Little Sydney @ Little Sydney Bridge"> </Site>
<Site Name="RW Little Sydney @ d-s SH60">
<Easting>1599619</Easting>
<Northing>5452852</Northing>
</Site>
<Site Name="RW Little Sydney @ u-s Johnson Barrier">
<Easting>1596888</Easting>
<Northing>5451790</Northing>
</Site>
<Site Name="RW MacKay @ Coll-Bainham Rd">
<Easting>1567587</Easting>
<Northing>5491178</Northing>
</Site>
<Site Name="RW MacKay @ ford 50m u-s Kaituna">
<Easting>1567347</Easting>
<Northing>5492573</Northing>
</Site>
<Site Name="RW MacKay at d-s Gillies Rd">
<Easting>1567680</Easting>
<Northing>5490568</Northing>
</Site>
<Site Name="RW Marahau @ 250m u-s Sandy Bay Rd">
<Easting>1600150</Easting>
<Northing>5461682</Northing>
</Site>
<Site Name="RW McConnon @ 20m u-s Powell">
<Easting>1585659</Easting>
<Northing>5476655</Northing>
</Site>
<Site Name="RW Moore Vlly Stm @ Harley Rd">
<Easting>1601315</Easting>
<Northing>5437817</Northing>
</Site>
<Site Name="RW Motupiko @ 250m u-s Motueka Rv">
<Easting>1585996</Easting>
<Northing>5411176</Northing>
</Site>
<Site Name="RW Motupiko @ Christies">
<Easting>1583935</Easting>
<Northing>5392543</Northing>
</Site>
<Site Name="RW Motupipi @ 1.2km u-s Abel Tasman Dr">
<Easting>1585817</Easting>
<Northing>5477218</Northing>
</Site>
<Site Name="RW Motupipi @ 20m u-s Watercress">
<Easting>1584460</Easting>
<Northing>5477260</Northing>
</Site>
<Site Name="RW Motupipi @ 500m u-s Reillys Br">
<Easting>1585348</Easting>
<Northing>5477187</Northing>
</Site>
<Site Name="RW Motupipi @ 70m d-s Watercress">
<Easting>1584520</Easting>
<Northing>5477260</Northing>
</Site>
<Site Name="RW Motupipi @ Factory Farm Br">
<Easting>1584785</Easting>
<Northing>5476960</Northing>
</Site>
<Site Name="RW Motupipi Trib @ 310m d-s Factory Br">
<Easting>1585081</Easting>
<Northing>5476903</Northing>
</Site>
<Site Name="RW Motupipi Trib @ u-s Factory Farm Br">
<Easting>1584692</Easting>
<Northing>5477089</Northing>
</Site>
<Site Name="RW Moutere @ Edwards Rd">
<Easting>1599439</Easting>
<Northing>5441818</Northing>
</Site>
<Site Name="RW Moutere @ Kelling Rd">
<Easting>1600340</Easting>
<Northing>5432533</Northing>
</Site>
<Site Name="RW Moutere @ Riverside">
<Easting>1599422</Easting>
<Northing>5443134</Northing>
</Site>
<Site Name="RW Moutere Drain at Wilson Rd">
<Easting>1599844</Easting>
<Northing>5438968</Northing>
</Site>
<Site Name="RW Moutere trib @ d-s Prolam">
<Easting>1596551</Easting>
<Northing>5441059</Northing>
</Site>
<Site Name="RW Murch Ck @ u-s Fairfax St">
<Easting>1544063</Easting>
<Northing>5371873</Northing>
</Site>
<Site Name="RW Murch Ck at Kiwi Park">
<Easting>1543801</Easting>
<Northing>5371142</Northing>
</Site>
<Site Name="RW Murchison Ck @ 20m u-s SH6">
<Easting>1543717</Easting>
<Northing>5372225</Northing>
</Site>
<Site Name="RW Murchison Ck at Kiwi Park"> </Site>
<Site Name="RW Murchison Ck at u-s Fairfax St"> </Site>
<Site Name="RW Neimann Ck @ 100m ds Source">
<Easting>1611831</Easting>
<Northing>5427259</Northing>
</Site>
<Site Name="RW Neimann Ck @ 600m us Lansdowne Rd">
<Easting>1611931</Easting>
<Northing>5427410</Northing>
</Site>
<Site Name="RW Neimann Ck @ Source">
<Easting>1611763</Easting>
<Northing>5427205</Northing>
</Site>
<Site Name="RW Nile Ck at u-s SH60">
<Easting>1605857</Easting>
<Northing>5433031</Northing>
</Site>
<Site Name="RW North Ck @ Gravel Pit Xing">
<Easting>1586896</Easting>
<Northing>5408202</Northing>
</Site>
<Site Name="RW Old House @ Central Rd">
<Easting>1599434</Easting>
<Northing>5436865</Northing>
</Site>
<Site Name="RW Old House at Central Rd"> </Site>
<Site Name="RW Old Moutere @ Ching Rd">
<Easting>1598914</Easting>
<Northing>5443174</Northing>
</Site>
<Site Name="RW Old Moutere @ Edwards Rd">
<Easting>1598513</Easting>
<Northing>5441941</Northing>
</Site>
<Site Name="RW Old Moutere @ Wratten Weir">
<Easting>1598726</Easting>
<Northing>5443593</Northing>
</Site>
<Site Name="RW Old Moutere @ u-s Powley">
<Easting>1598857</Easting>
<Northing>5444538</Northing>
</Site>
<Site Name="RW Old Moutere at Edwards Rd"> </Site>
<Site Name="RW Old Moutere at Wratten Weir"> </Site>
<Site Name="RW Onahau @ Onahau Rd">
<Easting>1580072</Easting>
<Northing>5482663</Northing>
</Site>
<Site Name="RW Onekaka @ Shambala Br">
<Easting>1575153</Easting>
<Northing>5488015</Northing>
</Site>
<Site Name="RW Orinoco @ 200m u-s Motueka Rv">
<Easting>1590640</Easting>
<Northing>5438872</Northing>
</Site>
<Site Name="RW Orinoco @ 800m u-s Motueka Rv">
<Easting>1591222</Easting>
<Northing>5438558</Northing>
</Site>
<Site Name="RW Orphanage @ 60m d-s Saxton Rd East">
<Easting>1618129</Easting>
<Northing>5424942</Northing>
</Site>
<Site Name="RW Pearl Ck @ 200m us tidegate">
<Easting>1610884</Easting>
<Northing>5428577</Northing>
</Site>
<Site Name="RW Powell @ 125m u-s McConnon">
<Easting>1585572</Easting>
<Northing>5476546</Northing>
</Site>
<Site Name="RW Powell @ 40m u-s Motupipi Rv">
<Easting>1585824</Easting>
<Northing>5477180</Northing>
</Site>
<Site Name="RW Powell @ Glenview Rd">
<Easting>1585674</Easting>
<Northing>5474681</Northing>
</Site>
<Site Name="RW Powley @ Starnes Rd">
<Easting>1597489</Easting>
<Northing>5445556</Northing>
</Site>
<Site Name="RW Quail Vly Stm @ 5m u-s Wai-iti">
<Easting>1597854</Easting>
<Northing>5411639</Northing>
</Site>
<Site Name="RW Rainy @ u-s Motupiko Conf">
<Easting>1582731</Easting>
<Northing>5393048</Northing>
</Site>
<Site Name="RW Redwood Vly @ Greenacres Rd">
<Easting>1607910</Easting>
<Northing>5427718</Northing>
</Site>
<Site Name="RW Redwood Vly N @ 200m d-s Redwd Cellar">
<Easting>1606248</Easting>
<Northing>5427508</Northing>
</Site>
<Site Name="RW Redwood Vly N @ 200m u-s Redwd Cellar">
<Easting>1605984</Easting>
<Northing>5427626</Northing>
</Site>
<Site Name="RW Redwood Vly South @ Moutere Highway">
<Easting>1606793</Easting>
<Northing>5427465</Northing>
</Site>
<Site Name="RW Reservoir Ck @ 20m d-s Salisbury Rd">
<Easting>1616813</Easting>
<Northing>5424118</Northing>
</Site>
<Site Name="RW Reservoir Ck @ Marlborough Cr">
<Easting>1616944</Easting>
<Northing>5422531</Northing>
</Site>
<Site Name="RW Riwaka @ Hickmotts">
<Easting>1598697</Easting>
<Northing>5454022</Northing>
</Site>
<Site Name="RW Riwaka @ Northbranch Source">
<Easting>1591675</Easting>
<Northing>5457477</Northing>
</Site>
<Site Name="RW Rosedale @ Old House Rd">
<Easting>1599457</Easting>
<Northing>5435080</Northing>
</Site>
<Site Name="RW Saxton @ 200m u-s Main Rd">
<Easting>1617472</Easting>
<Northing>5424452</Northing>
</Site>
<Site Name="RW Seaton Vly @ Stafford Dr">
<Easting>1607545</Easting>
<Northing>5434181</Northing>
</Site>
<Site Name="RW Seaton Vly Stm @ Andersons">
<Easting>1606136</Easting>
<Northing>5434658</Northing>
</Site>
<Site Name="RW Sherry @ Blue Rock">
<Easting>1577920</Easting>
<Northing>5418928</Northing>
</Site>
<Site Name="RW Sherry @ u-s Cave Ck">
<Easting>1575005</Easting>
<Northing>5407098</Northing>
</Site>
<Site Name="RW Stanley Brk @ Barkers">
<Easting>1584943</Easting>
<Northing>5426190</Northing>
</Site>
<Site Name="RW Tasman @ u-s Jesters Hse">
<Easting>1604842</Easting>
<Northing>5439429</Northing>
</Site>
<Site Name="RW Te Kakau @ Haldane Rd">
<Easting>1583310</Easting>
<Northing>5478360</Northing>
</Site>
<Site Name="RW Te Kakau Stm @ Feary Cr">
<Easting>1583510</Easting>
<Northing>5477950</Northing>
</Site>
<Site Name="RW Thorpe at 300m u-s Old Wharf Rd">
<Easting>1601540</Easting>
<Northing>5447725</Northing>
</Site>
<Site Name="RW Unnamed Ck at Chings Rd">
<Easting>1598122</Easting>
<Northing>5443221</Northing>
</Site>
<Site Name="RW Wai-iti @ 20m u-s Quail Vly Stm">
<Easting>1547832</Easting>
<Northing>5411651</Northing>
</Site>
<Site Name="RW Wai-iti @ Livingston Rd">
<Easting>1608691</Easting>
<Northing>5421166</Northing>
</Site>
<Site Name="RW Waimea @ 1.5km us SH60">
<Easting>1610587</Easting>
<Northing>5425180</Northing>
</Site>
<Site Name="RW Wairoa @ Bryant Rd">
<Easting>1609410</Easting>
<Northing>5420245</Northing>
</Site>
<Site Name="RW Waiwhero @ Cemetery">
<Easting>1594171</Easting>
<Northing>5440379</Northing>
</Site>
<Site Name="RW Waiwhero @ Motueka Vlly Hwy">
<Easting>1593326</Easting>
<Northing>5442235</Northing>
</Site>
<Site Name="RW Waiwhero @ Paratiho Bridge">
<Easting>1594209</Easting>
<Northing>5438704</Northing>
</Site>
<Site Name="RW Waiwhero Trib @ 50m u-s Borrow Pit">
<Easting>1594479</Easting>
<Northing>5438359</Northing>
</Site>
<Site Name="RW Waiwhero Trib @ McEwen">
<Easting>1594124</Easting>
<Northing>5440951</Northing>
</Site>
<Site Name="RW Waiwhero Trib @ McLeod">
<Easting>1594626</Easting>
<Northing>5440370</Northing>
</Site>
<Site Name="RW Waiwhero Trib @ OConner">
<Easting>1595107</Easting>
<Northing>5440607</Northing>
</Site>
<Site Name="RW Waiwhero Trib @ Paddock 40">
<Easting>1594317</Easting>
<Northing>5438823</Northing>
</Site>
<Site Name="RW Win Ck @ 5m us Burton Ale Ck">
<Easting>1571350</Easting>
<Northing>5494186</Northing>
</Site>
<Site Name="Rainy"> </Site>
<Site Name="Red Hills"> </Site>
<Site Name="Reservoir"> </Site>
<Site Name="Riwaka"> </Site>
<Site Name="Stanley Brook"> </Site>
<Site Name="Swamp"> </Site>
<Site Name="Tadmor"> </Site>
<Site Name="Takaka"> </Site>
<Site Name="Tapawera Plains"> </Site>
<Site Name="Te Matu"> </Site>
<Site Name="Umukuri"> </Site>
<Site Name="Upper Buller"> </Site>
<Site Name="Upper Catchment"> </Site>
<Site Name="Wai-iti"> </Site>
<Site Name="Wai-iti Dam Service"> </Site>
<Site Name="Waikoropupu at Bubbling Spring (new)"> </Site>
<Site Name="Waimea Island"> </Site>
<Site Name="Waimea Lower Confined Aquifer"> </Site>
<Site Name="Waimea Upper Confined Aquifer"> </Site>
<Site Name="Waimea West"> </Site>
<Site Name="Wangapeka"> </Site>
<CRC>59962</CRC>
</HilltopServer>



This XML file does not appear to have any style information associated with it. The document tree is shown below.
<HilltopServer>
<Agency>Tasman District Council</Agency>
<DataSource Name="Voltage" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2022-01-01T00:00:00</From>
<To>2026-04-09T10:00:00</To>
<Measurement Name="Voltage">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Voltage</RequestAs>
<Units>Volts</Units>
<Format>##.##</Format>
</Measurement>
</DataSource>
<DataSource Name="Air Temperature (continuous)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
<Measurement Name="Air Temperature (continuous)">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Air Temperature (continuous)</RequestAs>
<Divisor>100</Divisor>
<Units>degC</Units>
<Format>##.##</Format>
</Measurement>
</DataSource>
<DataSource Name="Barometric Pressure" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
<Measurement Name="Barometric Pressure">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Barometric Pressure</RequestAs>
<Units>hPa</Units>
<Format>####.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Relative humidity (%)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
<Measurement Name="Relative humidity">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Relative humidity</RequestAs>
<Units>%</Units>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="Solar Radiation" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
<Measurement Name="Solar Radiation">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Solar Radiation</RequestAs>
<Divisor>10</Divisor>
<Units>W/m2</Units>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Speed (10 min)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
<Measurement Name="Wind Speed (10 min)">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Wind Speed (10 min)</RequestAs>
<Divisor>278</Divisor>
<Units>km/hr</Units>
<Format>####.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Direction (10 min)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
<Measurement Name="Wind Direction (10 min)">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Wind Direction (10 min)</RequestAs>
<Divisor>10</Divisor>
<Units>Deg N</Units>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="SD Wind Direction (10 min)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
<Measurement Name="SD Wind Direction (10 min)">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>SD Wind Direction (10 min)</RequestAs>
<Units>DegN</Units>
<Format>$$$</Format>
</Measurement>
</DataSource>
<DataSource Name="SD Wind Speed (10 min)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
<Measurement Name="SD Wind Speed (10 min)">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>SD Wind Speed (10 min)</RequestAs>
<Divisor>278</Divisor>
<Units>km/hr</Units>
<Format>$$$</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Speed 10 min (hourly)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:00:00</To>
<Measurement Name="Wind Speed 10 min (hourly)">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Wind Speed 10 min (hourly)</RequestAs>
<Divisor>278</Divisor>
<Units>km/hr</Units>
<Format>###.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Gust Speed (hourly)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:00:00</To>
<Measurement Name="Gust Speed (hourly)">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Gust Speed (hourly)</RequestAs>
<Divisor>278</Divisor>
<Units>km/hr</Units>
<Format>###.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Speed (hourly)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:00:00</To>
<Measurement Name="Wind Speed (hourly)">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Wind Speed (hourly)</RequestAs>
<Divisor>278</Divisor>
<Units>km/hr</Units>
<Format>###.#</Format>
</Measurement>
</DataSource>
<DataSource Name="Wind Direction (hourly)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:00:00</To>
<Measurement Name="Wind Direction (hourly)">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Wind Direction (hourly)</RequestAs>
<Units>DegN</Units>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="Gust Direction (hourly)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Instant</Interpolation>
<ItemFormat>1</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:00:00</To>
<Measurement Name="Gust Direction (hourly)">
<Item>1</Item>
<DefaultMeasurement/>
<RequestAs>Gust Direction (hourly)</RequestAs>
<Units>DegN</Units>
<Format>###</Format>
</Measurement>
</DataSource>
<DataSource Name="Voltage" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2022-01-01T00:00:00</From>
<To>2026-04-09T10:00:00</To>
</DataSource>
<DataSource Name="Air Temperature (continuous)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
</DataSource>
<DataSource Name="Barometric Pressure" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
</DataSource>
<DataSource Name="Relative humidity (%)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
</DataSource>
<DataSource Name="Solar Radiation" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
</DataSource>
<DataSource Name="Wind Speed (10 min)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
</DataSource>
<DataSource Name="Wind Direction (10 min)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
</DataSource>
<DataSource Name="SD Wind Direction (10 min)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
</DataSource>
<DataSource Name="SD Wind Speed (10 min)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:30:00</To>
</DataSource>
<DataSource Name="Wind Speed 10 min (hourly)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:00:00</To>
</DataSource>
<DataSource Name="Gust Speed (hourly)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:00:00</To>
</DataSource>
<DataSource Name="Wind Speed (hourly)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:00:00</To>
</DataSource>
<DataSource Name="Wind Direction (hourly)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:00:00</To>
</DataSource>
<DataSource Name="Gust Direction (hourly)" Site="HY Motueka at Sportspark">
<NumItems>1</NumItems>
<TSType>StdQualSeries</TSType>
<DataType>SimpleTimeSeries</DataType>
<Interpolation>Event</Interpolation>
<ItemFormat>0</ItemFormat>
<From>2017-08-23T16:00:00</From>
<To>2026-04-09T10:00:00</To>
</DataSource>
</HilltopServer>