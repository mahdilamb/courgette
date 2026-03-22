import { useState, useEffect, useRef } from "react";
import { validateStep } from "../api";
import type { ValidationResult } from "../types";

/**
 * Hook that validates a step input against the backend.
 * Debounces validation requests to avoid flooding the API.
 */
export function useValidation(keyword: string, text: string) {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!text.trim()) {
      setResult(null);
      return;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const data = await validateStep(`${keyword} ${text}`);
        setResult(data);
      } catch {
        setResult(null);
      }
    }, 200);

    return () => clearTimeout(timerRef.current);
  }, [keyword, text]);

  return result;
}
