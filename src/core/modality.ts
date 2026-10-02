/**
 * Modality guard to enforce strict modality boundaries in PuterVision Pentad.
 * Throws a WRONG_MODALITY error if a non-visual state or record is processed in visual pipelines.
 */
export function assertVisualModality(state: any, stateId: string): void {
  if (!state) return;

  let modality = state.modality;
  if (!modality && state.structured_data) {
    try {
      const parsed =
        typeof state.structured_data === 'string'
          ? JSON.parse(state.structured_data)
          : state.structured_data;
      if (parsed && parsed.modality) {
        modality = parsed.modality;
      }
    } catch {}
  }

  if (modality && modality !== 'visual') {
    const error: any = new Error(
      `WRONG_MODALITY: Target state "${stateId}" has non-visual modality "${modality}". Expected "visual".`
    );
    error.code = 'WRONG_MODALITY';
    throw error;
  }
}
