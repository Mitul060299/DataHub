import { useState, useCallback } from "react";

const STORAGE_KEY = "datahub_tour_done";

export function useTour() {
  const [tourActive, setTourActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setTourActive(true);
  }, []);

  const nextStep = useCallback((totalSteps: number) => {
    setCurrentStep((prev) => {
      if (prev + 1 >= totalSteps) {
        setTourActive(false);
        localStorage.setItem(STORAGE_KEY, "1");
        return 0;
      }
      return prev + 1;
    });
  }, []);

  const skipTour = useCallback(() => {
    setTourActive(false);
    localStorage.setItem(STORAGE_KEY, "1");
    setCurrentStep(0);
  }, []);

  const isTourDone = () => localStorage.getItem(STORAGE_KEY) === "1";

  return { tourActive, currentStep, startTour, nextStep, skipTour, isTourDone };
}
