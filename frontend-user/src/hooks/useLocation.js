import { useState, useEffect } from 'react';

const useLocation = () => {
  const [location, setLocation] = useState(null);
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocation({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLoading(false);
      },
      err => {
        // Default to Mumbai if permission denied
        setLocation({ lat: 19.0760, lon: 72.8777, accuracy: 1000 });
        setError('Location access denied — using default');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );

    // Watch position for live updates
    const watchId = navigator.geolocation.watchPosition(
      pos => setLocation({
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 10000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return { location, error, loading };
};

export default useLocation;