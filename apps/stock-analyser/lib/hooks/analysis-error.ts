const NO_VERIFIABLE_DATA_PATTERN =
  /grounded research did not contain enough verifiable data for structured output/i

export const ANALYSIS_NO_DATA_MESSAGE =
  "Couldn't find enough reliable market data to analyse this ticker. Check the symbol or try another listed instrument."

export function normaliseAnalysisErrorForDisplay(err: unknown): Error {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error"

  if (NO_VERIFIABLE_DATA_PATTERN.test(message)) {
    const displayError = new Error(ANALYSIS_NO_DATA_MESSAGE)
    if (err instanceof Error) {
      displayError.name = err.name
    }
    return displayError
  }

  return err instanceof Error ? err : new Error(message)
}
