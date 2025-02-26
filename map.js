import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken =
    'pk.eyJ1IjoiZTNsYXUiLCJhIjoiY203bDAzbXAzMDZleTJub2MzYWF6bXp6MCJ9.cdMI-K1otFRO2yLYREEZtw';

const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    center: [-71.09415, 42.36027],
    zoom: 12,
    minZoom: 5,
    maxZoom: 20
});

const paintLineStyle = {
    'line-color': 'green',
    'line-width': 3,
    'line-opacity': 0.4
};

let circles = null;
let timeFilter = -1;

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
}

function updatePositions() {
    circles.attr('cx', d => getCoords(d).cx).attr('cy', d => getCoords(d).cy);
}

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
}

map.on('load', () => {
    map.addSource('boston_route', {
        type: 'geojson',
        data:
            'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });
    map.addSource('cambridge_route', {
        type: 'geojson',
        data:
            'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });
    map.addLayer({
        id: 'boston-bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: paintLineStyle
    });
    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: paintLineStyle
    });

    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const svg = d3.select('#map').select('svg');

    d3.json(jsonurl)
        .then(jsonData => {
            stations = jsonData.data.stations;
            circles = svg
                .selectAll('circle')
                .data(stations)
                .enter()
                .append('circle')
                .attr('r', 5)
                .attr('fill', 'steelblue')
                .attr('stroke', 'white')
                .attr('stroke-width', 1)
                .attr('opacity', 0.8)
                .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic));
            updatePositions();
            map.on('move', updatePositions);
            map.on('zoom', updatePositions);
            map.on('resize', updatePositions);
            map.on('moveend', updatePositions);
        })
        .catch(error => {
            console.error('Error loading JSON:', error);
        });

    const tripsURL = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';

    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    var trips = [];
    let stations = [];
    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

    d3.csv(tripsURL)
        .then(data => {
            trips = data.map(trip => ({
                ...trip,
                started_at: new Date(trip.start_time),
                ended_at: new Date(trip.ended_at)
            }));

            const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
            const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

            stations = stations.map(station => {
                let id = station.short_name;
                station.arrivals = arrivals.get(id) ?? 0;
                station.departures = departures.get(id) ?? 0;
                station.totalTraffic = station.arrivals + station.departures;
                return station;
            });

            const radiusScale = d3
                .scaleSqrt()
                .domain([0, d3.max(stations, d => d.totalTraffic)])
                .range([0, 25]);

            circles
                .attr('r', d => radiusScale(d.totalTraffic))
                .each(function (d) {
                    d3.select(this).select('title').remove();
                    d3.select(this)
                        .append('title')
                        .text(
                            `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
                        );
                });

            function updateTimeDisplay() {
                timeFilter = Number(timeSlider.value);
                if (timeFilter === -1) {
                    selectedTime.textContent = '';
                    anyTimeLabel.style.display = 'block';
                } else {
                    selectedTime.textContent = formatTime(timeFilter);
                    anyTimeLabel.style.display = 'none';
                }
                filterTripsbyTime();
            }

            function minutesSinceMidnight(date) {
                return date.getHours() * 60 + date.getMinutes();
            }

            let filteredTrips = [];
            let filteredArrivals = new Map();
            let filteredDepartures = new Map();
            let filteredStations = [];

            function filterTripsbyTime() {
                filteredTrips =
                    timeFilter === -1
                        ? trips
                        : trips.filter(trip => {
                            const startedMinutes = minutesSinceMidnight(trip.started_at);
                            const endedMinutes = minutesSinceMidnight(trip.ended_at);
                            return (
                                Math.abs(startedMinutes - timeFilter) <= 60 ||
                                Math.abs(endedMinutes - timeFilter) <= 60
                            );
                        });
                filteredDepartures = d3.rollup(
                    filteredTrips,
                    v => v.length,
                    d => d.start_station_id
                );
                filteredArrivals = d3.rollup(
                    filteredTrips,
                    v => v.length,
                    d => d.end_station_id
                );
                filteredStations = stations.map(station => {
                    station = { ...station };
                    let id = station.short_name;
                    station.arrivals = filteredArrivals.get(id) ?? 0;
                    station.departures = filteredDepartures.get(id) ?? 0;
                    station.totalTraffic = station.arrivals + station.departures;
                    return station;
                });
                const radiusScale = d3
                    .scaleSqrt()
                    .domain([0, d3.max(filteredStations, d => d.totalTraffic)])
                    .range([0, 25]);
                circles
                    .data(filteredStations)
                    .style('--departure-ratio', d => stationFlow(d.departures / d.totalTraffic))
                    .attr('r', d => radiusScale(d.totalTraffic))
                    .each(function (d) {
                        d3.select(this).select('title').remove();
                        d3.select(this)
                            .append('title')
                            .text(
                                `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`
                            );
                    });
            }

            updateTimeDisplay();
            timeSlider.addEventListener('input', updateTimeDisplay);
        })
        .catch(error => {
            console.error('Error loading CSV:', error);
        });
});
