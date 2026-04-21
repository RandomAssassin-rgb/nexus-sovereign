import { useState, useEffect } from 'react';

export interface LocationState {
  lat: number | null;
  lon: number | null;
  zoneName: string;
  isApproximate: boolean;
  provenance: 'GPS' | 'IP' | 'Default';
  permissionState: PermissionState | 'unknown';
  error: string | null;
}

export function useNexusLocation() {
  const [state, setState] = useState<LocationState>({
    lat: null,
    lon: null,
    zoneName: 'Locating...',
    isApproximate: false,
    provenance: 'Default',
    permissionState: 'unknown',
    error: null,
  });

  const requestPreciseLocation = async () => {
    if (!('geolocation' in navigator)) return;
    
    return new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setState({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            zoneName: 'Active GPS Zone',
            isApproximate: false,
            provenance: 'GPS',
            permissionState: 'granted',
            error: null,
          });
          resolve();
        },
        (err) => {
          console.warn('GPS Request Failed:', err.message);
          resolve();
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  };

  useEffect(() => {
    let isMounted = true;

    const checkPermission = async () => {
      if ('permissions' in navigator) {
        try {
          const status = await navigator.permissions.query({ name: 'geolocation' as any });
          if (isMounted) setState(prev => ({ ...prev, permissionState: status.state }));
          status.onchange = () => {
            if (isMounted) setState(prev => ({ ...prev, permissionState: status.state }));
          };
        } catch (e) {}
      }
    };
    
    checkPermission();

    const fetchIPLocation = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        if (isMounted) {
          setState({
            lat: data.latitude,
            lon: data.longitude,
            zoneName: `${data.city}, ${data.region_code} (Approximate)`,
            isApproximate: true,
            provenance: 'IP',
            error: null,
          });
        }
      } catch (e) {
        if (isMounted) {
          setState(prev => ({
            ...prev,
            zoneName: 'Global Monitoring (Default)',
            lat: 12.9249, // Default Tambaram, Chennai
            lon: 80.1275,
            provenance: 'Default',
            error: 'Location services unavailable',
          }));
        }
      }
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (isMounted) {
            setState({
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              zoneName: 'Active GPS Zone',
              isApproximate: false,
              provenance: 'GPS',
              error: null,
            });
            // Try reverse geocoding here if an endpoint exists, 
            // but for now, we'll label it as GPS zone.
          }
        },
        (err) => {
          console.warn('GPS denied or error, falling back to IP:', err.message);
          fetchIPLocation();
        },
        { timeout: 10000 }
      );
    } else {
      fetchIPLocation();
    }

    return () => { isMounted = false; };
  }, []);

  return state;
}
