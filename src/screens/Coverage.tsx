import { motion } from "framer-motion";
import { Shield, Map as MapIcon, Info, Activity, AlertTriangle, CloudRain, ThermometerSun, ServerCrash, XCircle, Wind, Megaphone, ArrowLeft } from "lucide-react";
import { cn } from "../lib/utils";
import { useState, useEffect } from "react";
import Map, { Source, Layer, FillLayer } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import NotificationBell from "../components/NotificationBell";

const riskLayerStyle: FillLayer = {
  id: 'risk-layer',
  type: 'fill',
  source: 'risk-data',
  paint: {
    'fill-color': [
      'match',
      ['get', 'riskLevel'],
      1, '#10b981', // Emerald 500
      2, '#f59e0b', // Amber 500
      3, '#ef4444', // Destructive
      '#10b981' // Default
    ],
    'fill-opacity': 0.4
  }
};

const generateHexagons = (baseLat: number, baseLng: number) => {
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: 24 }).map((_, i) => {
      const row = Math.floor(i / 6);
      const col = i % 6;
      const lngOffset = col * 0.005 + (row % 2 === 0 ? 0 : 0.0025) - 0.015;
      const latOffset = row * 0.004 - 0.008;
      
      let riskLevel = 1;
      if (i % 5 === 0) riskLevel = 3;
      else if (i % 3 === 0) riskLevel = 2;

      const center = [baseLng + lngOffset, baseLat + latOffset];
      const radius = 0.0025;
      const coordinates = [];
      for (let j = 0; j <= 6; j++) {
        const angle = (j * 60 * Math.PI) / 180;
        coordinates.push([
          center[0] + radius * Math.cos(angle),
          center[1] + radius * Math.sin(angle) * 0.8
        ]);
      }

      return {
        type: 'Feature',
        properties: { riskLevel },
        geometry: {
          type: 'Polygon',
          coordinates: [coordinates]
        }
      };
    })
  };
};

export default function Coverage() {
  const [showDataLayer, setShowDataLayer] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [zoneName, setZoneName] = useState<string>("Locating...");
  const mapboxToken = import.meta.env?.VITE_MAPBOX_TOKEN || process.env.VITE_MAPBOX_TOKEN;

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        console.error("Location error:", error);
        // No hardcoded fallback to Bengaluru
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  useEffect(() => {
    if (!location) return;

    const fetchZoneName = async () => {
      if (mapboxToken && mapboxToken !== 'placeholder_mapbox_token') {
        try {
          const mapboxRes = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${location.lon},${location.lat}.json?access_token=${mapboxToken}&types=neighborhood,locality,place`
          );
          const data = await mapboxRes.json();
          if (data.features && data.features.length > 0) {
            const place = data.features[0];
            setZoneName(place.text || place.place_name.split(',')[0]);
          } else {
            setZoneName("Unknown Zone");
          }
        } catch (err) {
          console.error("Geocoding failed", err);
          setZoneName("Unknown Zone");
        }
      } else {
        setZoneName("Locating...");
      }
    };
    fetchZoneName();
  }, [location, mapboxToken]);

  return (
    <div className="min-h-full bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border/10 sticky top-0 bg-background/95 backdrop-blur-md z-40">
        <h1 className="font-bold tracking-tight text-xl">Coverage Map</h1>
        <div className="flex items-center gap-2">
          <button className="p-2 hover:bg-secondary rounded-full">
            <Info size={20} />
          </button>
          <NotificationBell />
        </div>
      </header>

      <main className="flex-1 p-4 space-y-6">
        {/* Map Visualization */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative h-64 rounded-3xl overflow-hidden border border-border/50 shadow-sm bg-secondary/20"
        >
          {mapboxToken && mapboxToken !== 'placeholder_mapbox_token' && location ? (
            <Map
              mapboxAccessToken={mapboxToken}
              initialViewState={{
                longitude: location.lon,
                latitude: location.lat,
                zoom: 13,
                pitch: 45,
              }}
              mapStyle="mapbox://styles/mapbox/dark-v11"
              attributionControl={false}
            >
              {showDataLayer && (
                <Source id="risk-data" type="geojson" data={generateHexagons(location.lat, location.lon) as any}>
                  <Layer {...riskLayerStyle} />
                </Source>
              )}
            </Map>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-secondary/50 p-4 text-center">
              <MapIcon className="w-12 h-12 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                {!location ? "Locating..." : "Mapbox token not configured."}
              </p>
            </div>
          )}

          <div className="absolute top-4 left-4 pointer-events-none z-10">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground bg-background/80 px-3 py-1 rounded-full backdrop-blur-md border border-border/50">
              H3 Resolution 11
            </span>
          </div>

          <button
            onClick={() => setShowDataLayer(!showDataLayer)}
            className="absolute bottom-4 right-4 bg-background/90 backdrop-blur-md border border-border/50 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider shadow-lg hover:bg-secondary transition-colors z-10"
          >
            {showDataLayer ? "Hide Risk Vectors" : "Show Risk Vectors"}
          </button>
        </motion.div>

        {/* HazardHub Insight */}
        {showDataLayer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-destructive shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="font-bold text-sm text-destructive mb-1">Micro-Topographical Risk Detected</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Elevation-weighted flood velocity vectors indicate a 14% higher risk on your current route. Premium adjusted by +₹0.40.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Policy Details */}
        <div className="space-y-4">
          <h3 className="font-bold text-lg">Active Policy</h3>
          
          <div className="bg-card border border-border/50 rounded-3xl p-5 shadow-sm">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h4 className="font-bold text-xl mb-1">Sovereign Shield</h4>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-bold">Parametric Income Protection</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                <Shield className="w-5 h-5 text-emerald-500" />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center pb-4 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Policy Term</span>
                <span className="font-bold">3 Months</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Payment Cycle</span>
                <span className="font-bold text-primary">Weekly Premium</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-border/50">
                <span className="text-sm text-muted-foreground">Coverage Area</span>
                <span className="font-bold">{zoneName}</span>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <p className="text-xs text-amber-600 font-medium">
                  <span className="font-bold">Lockout Policy:</span> If weekly premium payments are stopped or cancelled before the 3-month term ends, you cannot purchase a new policy until the original 3-month period has elapsed.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Coverage Limits */}
        <div className="space-y-4 mb-6">
          <h3 className="font-bold text-lg">Parametric Coverage Limits</h3>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Card 1 — Heavy Rain / Flood */}
            <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <CloudRain size={16} className="text-blue-500" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Heavy Rain / Flood</span>
              </div>
              <p className="text-lg font-bold">₹159 – ₹364</p>
              <p className="text-[10px] text-muted-foreground font-medium">per event</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Trigger:</span> Rainfall &gt;25mm/hr in your zone</p>
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Duration:</span> Active disruption period</p>
                <p className="text-[10px] text-muted-foreground italic">Based on declared earnings × hours affected</p>
              </div>
            </div>

            {/* Card 2 — Extreme Heat */}
            <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <ThermometerSun size={16} className="text-amber-500" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Extreme Heat</span>
              </div>
              <p className="text-lg font-bold">₹140 – ₹290</p>
              <p className="text-[10px] text-muted-foreground font-medium">per event</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Trigger:</span> Temperature &gt;42°C during shift</p>
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Duration:</span> Active heat advisory period</p>
                <p className="text-[10px] text-muted-foreground italic">Based on declared earnings × hours affected</p>
              </div>
            </div>

            {/* Card 3 — Platform Outage */}
            <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <ServerCrash size={16} className="text-purple-500" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Platform Outage</span>
              </div>
              <p className="text-lg font-bold">₹68 – ₹140</p>
              <p className="text-[10px] text-muted-foreground font-medium">per event</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Trigger:</span> Order rate drop &gt;80% for 45+ min</p>
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Duration:</span> Active outage window</p>
                <p className="text-[10px] text-muted-foreground italic">Based on declared earnings × hours affected</p>
              </div>
            </div>

            {/* Card 4 — Severe Pollution */}
            <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <Wind size={16} className="text-rose-500" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Severe Pollution</span>
              </div>
              <p className="text-lg font-bold">₹180 – ₹380</p>
              <p className="text-[10px] text-muted-foreground font-medium">per event</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Trigger:</span> AQI &gt;300 (Hazardous) in zone</p>
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Duration:</span> Active AQI advisory period</p>
                <p className="text-[10px] text-muted-foreground italic">Based on declared earnings × hours affected</p>
              </div>
            </div>

            {/* Card 5 — Civic Disruption */}
            <div className="bg-card border border-border/50 rounded-2xl p-4 shadow-sm col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <Megaphone size={16} className="text-orange-500" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Civic Disruption</span>
              </div>
              <p className="text-lg font-bold">₹159 – ₹320</p>
              <p className="text-[10px] text-muted-foreground font-medium">per event</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Trigger:</span> Confirmed bandh, curfew, or strike in zone</p>
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Duration:</span> Active disruption window</p>
                <p className="text-[10px] text-muted-foreground italic">Based on declared earnings × hours affected</p>
              </div>
            </div>
          </div>

          <p className="mt-4 text-[11px] text-muted-foreground leading-relaxed italic border-l-2 border-primary/20 pl-3">
            <span className="font-bold text-primary opacity-80 underline underline-offset-4 decoration-primary/30">Actuarial Note:</span> Actual payout calculated by <span className="text-foreground font-medium">Pmax formula</span> based on your declared earnings, disruption duration, and current reserve pool. See your JEP for full calculation breakdown.
          </p>

          <div className="mt-6">
            <h4 className="font-bold text-sm text-destructive mb-3 flex items-center gap-2">
              <XCircle size={16} /> Strict Exclusions
            </h4>
            <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4">
              <p className="text-xs text-muted-foreground leading-relaxed">
                This is a parametric income protection policy. It strictly <strong>excludes</strong> coverage for:
              </p>
              <ul className="list-disc list-inside text-xs text-muted-foreground mt-2 space-y-1">
                <li>Health & Medical Expenses</li>
                <li>Life Insurance / Death Benefits</li>
                <li>Accident & Hospitalization</li>
                <li>Vehicle Repairs & Damage</li>
                <li>War & Terrorism</li>
                <li>Pandemics & Epidemics</li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

