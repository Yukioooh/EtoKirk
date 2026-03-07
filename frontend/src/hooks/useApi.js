import { useState, useEffect, useCallback } from 'react';

export function useApi(apiCall, params = [], refreshInterval = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const result = await apiCall(...params);
      if (result.success) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || 'Erreur inconnue');
      }
    } catch (err) {
      setError(err.message || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  }, [apiCall, ...params]);

  useEffect(() => {
    fetchData();

    if (refreshInterval) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refresh: fetchData };
}
