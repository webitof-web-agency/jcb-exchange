export const createSingleFlight = (operation) => {
  let inFlight = null;

  return () => {
    if (!inFlight) {
      inFlight = Promise.resolve().then(operation);
    }

    return inFlight;
  };
};
