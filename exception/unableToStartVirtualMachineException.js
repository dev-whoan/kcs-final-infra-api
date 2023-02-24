class UnableToStartVirtualMachineException extends Error {
  constructor(message) {
    super(message);
    this.name = "UnableToStartVirtualMachineException";
  }
}

export default UnableToStartVirtualMachineException;
