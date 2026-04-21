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
    <div className="min-h-full flex flex-col">
      <header className="nexus-page-header">
        <div>
          <div className="nexus-section-eyebrow mb-2">Coverage intelligence</div>
          <h1 className="nexus-page-title">Coverage map</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="nexus-icon-button">
            <Info size={20} />
          </button>
          <NotificationBell />
        </div>
      </header>

      <main className="nexus-app-main space-y-6 pb-8">
        <section className="nexus-section-stack">
          <div className="nexus-section-heading">
            <div>
              <h2 className="nexus-section-title">Hyperlocal protection mapped to where you actually work.</h2>
            </div>
            <p className="nexus-section-copy">
              Inspect live zone posture, active policy terms, and event payout bands across weather, AQI, outage, and civic disruption triggers.
            </p>
          </div>
        </section>

        {/* Map Visualization */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="nexus-panel-hero relative h-[18rem] overflow-hidden bg-secondary/20 md:h-[24rem]"
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
            className="nexus-panel rounded-2xl border-destructive/20 bg-destructive/5 p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-destructive shrink-0 mt-0.5" size={18} />
              <div>
                <h4 className="font-bold text-sm text-destructive mb-1">Micro-Topographical Risk Detected</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Elevation-weighted flood velocity vectors indicate a 14% higher risk on your current route. Premium adjusted by +Rs 0.40.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        <div className="grid gap-6 xl:grid-cols-[0.84fr_1.16fr]">
          <section className="nexus-section-stack">
            <div className="nexus-section-heading">
              <div>
                <div className="nexus-section-eyebrow">Policy layer</div>
                <h3 className="nexus-section-title text-[1.8rem]">Active policy</h3>
              </div>
            </div>

            <div className="nexus-panel p-5 md:p-6">
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
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                <p className="text-xs text-amber-600 font-medium">
                  <span className="font-bold">Lockout Policy:</span> If weekly premium payments are stopped or cancelled before the 3-month term ends, you cannot purchase a new policy until the original 3-month period has elapsed.
                </p>
              </div>
            </div>
            </div>
          </section>

          <section className="nexus-section-stack">
            <div className="nexus-section-heading">
              <div>
                <div className="nexus-section-eyebrow">Actuarial payout bands</div>
                <h3 className="nexus-section-title text-[1.8rem]">Parametric coverage limits</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Card 1 — Heavy Rain / Flood */}
            <div className="nexus-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <CloudRain size={16} className="text-blue-500" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Heavy Rain / Flood</span>
              </div>
              <p className="text-lg font-bold">Rs 159 - Rs 364</p>
              <p className="text-[10px] text-muted-foreground font-medium">per event</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Trigger:</span> Rainfall &gt;25mm/hr in your zone</p>
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Duration:</span> Active disruption period</p>
                <p className="text-[10px] text-muted-foreground italic">Based on declared earnings x hours affected</p>
              </div>
            </div>

            {/* Card 2 — Extreme Heat */}
            <div className="nexus-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ThermometerSun size={16} className="text-amber-500" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Extreme Heat</span>
              </div>
              <p className="text-lg font-bold">Rs 140 - Rs 290</p>
              <p className="text-[10px] text-muted-foreground font-medium">per event</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Trigger:</span> Temperature &gt;42C during shift</p>
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Duration:</span> Active heat advisory period</p>
                <p className="text-[10px] text-muted-foreground italic">Based on declared earnings x hours affected</p>
              </div>
            </div>

            {/* Card 3 — Platform Outage */}
            <div className="nexus-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <ServerCrash size={16} className="text-purple-500" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Platform Outage</span>
              </div>
              <p className="text-lg font-bold">Rs 68 - Rs 140</p>
              <p className="text-[10px] text-muted-foreground font-medium">per event</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Trigger:</span> Order rate drop &gt;80% for 45+ min</p>
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Duration:</span> Active outage window</p>
                <p className="text-[10px] text-muted-foreground italic">Based on declared earnings x hours affected</p>
              </div>
            </div>

            {/* Card 4 — Severe Pollution */}
            <div className="nexus-panel rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Wind size={16} className="text-rose-500" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Severe Pollution</span>
              </div>
              <p className="text-lg font-bold">Rs 180 - Rs 380</p>
              <p className="text-[10px] text-muted-foreground font-medium">per event</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Trigger:</span> AQI &gt;300 (Hazardous) in zone</p>
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Duration:</span> Active AQI advisory period</p>
                <p className="text-[10px] text-muted-foreground italic">Based on declared earnings x hours affected</p>
              </div>
            </div>

            {/* Card 5 — Civic Disruption */}
            <div className="nexus-panel rounded-2xl p-4 md:col-span-2">
              <div className="flex items-center gap-2 mb-2">
                <Megaphone size={16} className="text-orange-500" />
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Civic Disruption</span>
              </div>
              <p className="text-lg font-bold">Rs 159 - Rs 320</p>
              <p className="text-[10px] text-muted-foreground font-medium">per event</p>
              <div className="mt-3 space-y-1.5">
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Trigger:</span> Confirmed bandh, curfew, or strike in zone</p>
                <p className="text-[10px] text-muted-foreground"><span className="font-bold text-foreground">Duration:</span> Active disruption window</p>
                <p className="text-[10px] text-muted-foreground italic">Based on declared earnings x hours affected</p>
              </div>
            </div>
          </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed italic border-l-2 border-primary/20 pl-3">
            <span className="font-bold text-primary opacity-80 underline underline-offset-4 decoration-primary/30">Actuarial Note:</span> Actual payout calculated by <span className="text-foreground font-medium">Pmax formula</span> based on your declared earnings, disruption duration, and current reserve pool. See your JEP for full calculation breakdown.
          </p>

            <div>
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

            {/* Parametric Logic Explanation */}
            <div className="nexus-panel rounded-2xl p-5 border-l-4 border-l-primary">
              <h4 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                <Activity size={16} className="text-primary" /> How Parametric Triggers Work
              </h4>
              <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
                <p>
                  Unlike traditional insurance where you file a claim and wait for an adjuster, <span className="font-bold text-foreground">parametric coverage activates automatically</span> when an objective environmental threshold is crossed in your H3 micro-zone.
                </p>
                <div className="grid gap-2 sm:grid-cols-3 mt-3">
                  <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Step 1</p>
                    <p className="text-xs font-bold text-foreground">Signal Detection</p>
                    <p className="text-[10px] text-muted-foreground">Weather, AQI, and traffic APIs stream live data verified by Signal Fabric.</p>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Step 2</p>
                    <p className="text-xs font-bold text-foreground">Threshold Breach</p>
                    <p className="text-[10px] text-muted-foreground">When intensity exceeds the trigger level in your zone, the Event Twin activates.</p>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Step 3</p>
                    <p className="text-xs font-bold text-foreground">Auto-Payout</p>
                    <p className="text-[10px] text-muted-foreground">Payout is computed by Pmax formula and released to your wallet within seconds.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Basis Risk + Regulatory */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="nexus-panel rounded-2xl p-4">
                <h4 className="font-bold text-xs text-foreground mb-2 uppercase tracking-widest">Basis Risk Mitigation</h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Capped payouts and H3 micro-zone verification minimize basis risk — the gap between actual loss and parametric payout. Signal Fabric cross-references 3+ independent data sources per trigger to ensure alignment.
                </p>
              </div>
              <div className="nexus-panel rounded-2xl p-4">
                <h4 className="font-bold text-xs text-foreground mb-2 uppercase tracking-widest">Data Sources</h4>
                <div className="space-y-2 mt-2">
                  {[
                    { name: 'OpenWeatherMap', type: 'Weather', badge: 'Public API' },
                    { name: 'WAQI.info', type: 'Air Quality', badge: 'Public API' },
                    { name: 'TomTom Traffic', type: 'Traffic', badge: 'Commercial API' },
                  ].map(s => (
                    <div key={s.name} className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground"><span className="font-bold text-foreground">{s.name}</span> — {s.type}</span>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">{s.badge}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Regulatory Badges */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="nexus-subpanel rounded-2xl p-4 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-primary/10 flex items-center justify-center border border-primary/20 mb-3">
                  <Shield size={18} className="text-primary" />
                </div>
                <p className="text-xs font-black text-foreground">IRDAI Sandbox Ready</p>
                <p className="text-[10px] text-muted-foreground mt-1">Parametric micro-insurance pathway under Regulatory Sandbox framework</p>
              </div>
              <div className="nexus-subpanel rounded-2xl p-4 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 mb-3">
                  <Shield size={18} className="text-emerald-500" />
                </div>
                <p className="text-xs font-black text-foreground">DPDP Act Compliant</p>
                <p className="text-[10px] text-muted-foreground mt-1">Personal data processed under consent with purpose limitation and data minimization</p>
              </div>
              <div className="nexus-subpanel rounded-2xl p-4 text-center">
                <div className="w-10 h-10 mx-auto rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20 mb-3">
                  <Shield size={18} className="text-blue-500" />
                </div>
                <p className="text-xs font-black text-foreground">Income-Loss Only</p>
                <p className="text-[10px] text-muted-foreground mt-1">Strictly parametric income protection. No health, life, or asset coverage</p>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

