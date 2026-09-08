import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  checkCachedAppUpdate,
  checkForAppUpdate,
  type AppUpdateResult,
} from '@/services/app-update-service';

const FOREGROUND_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export interface AppUpdateState extends AppUpdateResult {
  checking: boolean;
  refresh: (options?: { force?: boolean }) => Promise<AppUpdateResult>;
}

const initialState: AppUpdateResult & { checking: boolean } = {
  checked: false,
  checking: true,
  supported: false,
  required: false,
  updateAvailable: false,
  reason: 'initializing',
};

export function useAppUpdate(): AppUpdateState {
  const [state, setState] = useState(initialState);
  const latestStateRef = useRef(initialState);
  const mountedRef = useRef(true);
  const inFlightRef = useRef<Promise<AppUpdateResult> | null>(null);
  const lastCheckAtRef = useRef(0);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (!force && Date.now() - lastCheckAtRef.current < FOREGROUND_CHECK_INTERVAL_MS) {
      return inFlightRef.current ?? latestStateRef.current;
    }
    if (inFlightRef.current) return inFlightRef.current;

    if (mountedRef.current) {
      setState((current) => ({ ...current, checking: true }));
    }

    const request = checkForAppUpdate()
      .then((result) => {
        lastCheckAtRef.current = Date.now();
        if (mountedRef.current) {
          const nextState = { ...result, checking: false };
          latestStateRef.current = nextState;
          setState(nextState);
        }
        return result;
      })
      .catch(() => {
        const result: AppUpdateResult = {
          checked: true,
          supported: false,
          required: false,
          updateAvailable: false,
          reason: 'unavailable',
        };
        if (mountedRef.current) {
          const nextState = { ...result, checking: false };
          latestStateRef.current = nextState;
          setState(nextState);
        }
        return result;
      })
      .finally(() => {
        inFlightRef.current = null;
      });

    inFlightRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const initialize = async () => {
      try {
        const cachedResult = await checkCachedAppUpdate();
        if (mountedRef.current) {
          const nextState = { ...cachedResult, checking: true };
          latestStateRef.current = nextState;
          setState(nextState);
        }
      } catch {
        if (mountedRef.current) {
          const nextState = {
            checked: true,
            checking: true,
            supported: false,
            required: false,
            updateAvailable: false,
            reason: 'unavailable',
          };
          latestStateRef.current = nextState;
          setState(nextState);
        }
      }
      await refresh({ force: true });
    };

    void initialize();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') void refresh();
    });

    return () => {
      mountedRef.current = false;
      subscription.remove();
    };
  }, [refresh]);

  return { ...state, refresh };
}
