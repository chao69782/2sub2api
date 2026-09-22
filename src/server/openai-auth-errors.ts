export class ManualActionRequiredError extends Error {
  constructor(message: string, public readonly code = 'MANUAL_ACTION_REQUIRED') {
    super(message)
    this.name = 'ManualActionRequiredError'
  }
}
