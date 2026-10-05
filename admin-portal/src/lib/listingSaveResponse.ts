/** The PUT response contains the complete listing; availability sync only changes status. */
export const getListingSaveResponse = <T>(updateResponse: T, availabilityResponse?: unknown) => {
  void availabilityResponse;
  return updateResponse;
};
