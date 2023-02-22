class UnableToReadVirtualMachineException extends Error {
  constructor(message) {
    super(message);
    this.name = "UnableToReadVirtualMachineException";
  }
}

export default UnableToReadVirtualMachineException;
